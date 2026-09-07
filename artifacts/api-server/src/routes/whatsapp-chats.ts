import { Router } from "express";
import { db } from "@workspace/db";
import { whatsappSesionesTable, empleadosTable, fotografiasTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { sendWhatsAppMessage } from "../services/whatsapp.js";
import { isAuthorizedAdmin, ADMIN_PHONES } from "../services/assistant.js";

const router = Router();

// Normalizar últimos 10 dígitos para cruzar teléfonos argentinos
function getLast10(phone?: string | null): string {
  if (!phone) return "";
  return phone.replace(/[^0-9]/g, "").slice(-10);
}

// 1. Listar todas las conversaciones activas
router.get("/", async (req, res) => {
  try {
    const sesiones = await db
      .select()
      .from(whatsappSesionesTable)
      .orderBy(desc(whatsappSesionesTable.updated_at));

    const empleados = await db
      .select({
        id: empleadosTable.id,
        nombre: empleadosTable.nombre,
        apellido: empleadosTable.apellido,
        cargo: empleadosTable.cargo,
        telefono: empleadosTable.telefono,
        telefono_whatsapp: empleadosTable.telefono_whatsapp,
        estado: empleadosTable.estado,
      })
      .from(empleadosTable);

    const fotos = await db
      .select({
        id: fotografiasTable.id,
        entidad_tipo: fotografiasTable.entidad_tipo,
        entidad_id: fotografiasTable.entidad_id,
        url: fotografiasTable.url,
        descripcion: fotografiasTable.descripcion,
      })
      .from(fotografiasTable)
      .where(eq(fotografiasTable.entidad_tipo, "empleado"));

    const getFotoPerfil = (empId?: number | null): string | null => {
      if (!empId) return null;
      const empFotos = fotos.filter((f) => f.entidad_id === empId);
      if (empFotos.length === 0) return null;
      const foto = empFotos.find((f) => f.descripcion?.toLowerCase().includes("perfil")) || empFotos[0];
      if (!foto?.url) return null;
      return foto.url.startsWith("data:") ? `/api/fotografias/${foto.id}/raw` : foto.url;
    };

    const chats = sesiones.map((s) => {
      const phoneClean = s.phone.replace(/[^0-9]/g, "");
      const last10 = getLast10(phoneClean);

      // Buscar empleado asociado
      const emp = empleados.find((e) => {
        const t1 = getLast10(e.telefono_whatsapp);
        const t2 = getLast10(e.telefono);
        return (t1 && t1 === last10) || (t2 && t2 === last10);
      });

      const messages = (s.messages as any[]) || [];
      const lastMsgObj = messages.length > 0 ? messages[messages.length - 1] : null;
      let lastMsgText = "";
      if (lastMsgObj) {
        if (typeof lastMsgObj.content === "string") {
          lastMsgText = lastMsgObj.content;
        } else if (Array.isArray(lastMsgObj.content)) {
          const textPart = lastMsgObj.content.find((c: any) => c.type === "text")?.text;
          lastMsgText = textPart || "[Archivo adjunto/Foto]";
        }
      }

      const datosPendientes = (typeof s.datos_pendientes === "object" && s.datos_pendientes) ? s.datos_pendientes : {};
      let botPaused = Boolean((datosPendientes as any).bot_paused);
      const pausedUntil = (datosPendientes as any).bot_paused_until || null;
      let remainingMinutes: number | null = null;
      if (botPaused && pausedUntil) {
        const msLeft = new Date(pausedUntil).getTime() - Date.now();
        if (msLeft <= 0) {
          botPaused = false;
        } else {
          remainingMinutes = Math.ceil(msLeft / 60000);
        }
      }
      const esAdmin = ADMIN_PHONES.some((a) => last10 === getLast10(a)) || (emp?.cargo || "").toLowerCase().includes("admin");

      return {
        phone: s.phone,
        nombre: emp ? `${emp.nombre} ${emp.apellido}`.trim() : (s.phone.length > 10 ? `+${s.phone}` : s.phone),
        cargo: emp?.cargo || (esAdmin ? "Administrador" : "Contacto externo"),
        empleado_id: emp?.id || null,
        foto_perfil: getFotoPerfil(emp?.id),
        ultimoMensaje: lastMsgText || "Sin mensajes",
        ultimaFecha: s.updated_at || new Date(),
        totalMensajes: messages.length,
        botPausado: botPaused,
        botPausedUntil: pausedUntil,
        botPauseRemainingMinutes: remainingMinutes,
        esAdmin,
      };
    });

    return res.json(chats);
  } catch (err: any) {
    req.log?.error?.(err);
    return res.status(500).json({ error: "Error al obtener lista de chats", details: err.message });
  }
});

// 2. Lista de empleados disponibles para iniciar un chat nuevo
router.get("/contactos-disponibles", async (req, res) => {
  try {
    const empleados = await db
      .select({
        id: empleadosTable.id,
        nombre: empleadosTable.nombre,
        apellido: empleadosTable.apellido,
        cargo: empleadosTable.cargo,
        telefono: empleadosTable.telefono,
        telefono_whatsapp: empleadosTable.telefono_whatsapp,
      })
      .from(empleadosTable)
      .where(eq(empleadosTable.estado, "activo"));

    const contactos = empleados
      .map((e) => {
        const tel = (e.telefono_whatsapp && e.telefono_whatsapp.trim()) || (e.telefono && e.telefono.trim()) || null;
        return {
          id: e.id,
          nombre: `${e.nombre} ${e.apellido}`.trim(),
          cargo: e.cargo || "Operario",
          telefono: tel,
        };
      })
      .filter((c) => c.telefono && c.telefono.replace(/\D/g, "").length >= 7);

    return res.json(contactos);
  } catch (err: any) {
    return res.status(500).json({ error: "Error al obtener contactos", details: err.message });
  }
});

// 3. Obtener el historial completo de un chat
router.get("/:phone", async (req, res) => {
  try {
    const rawPhone = req.params.phone;
    const phoneClean = rawPhone.replace(/[^0-9]/g, "");
    const last10 = getLast10(phoneClean);

    // Buscar sesión por exact match o por terminación
    const sesiones = await db.select().from(whatsappSesionesTable);
    const sesion = sesiones.find(
      (s) => s.phone === rawPhone || s.phone.replace(/[^0-9]/g, "") === phoneClean || getLast10(s.phone) === last10
    );

    // Buscar datos del empleado
    const empleados = await db.select().from(empleadosTable);
    const emp = empleados.find((e) => {
      const t1 = getLast10(e.telefono_whatsapp);
      const t2 = getLast10(e.telefono);
      return (t1 && t1 === last10) || (t2 && t2 === last10);
    });

    const esAdmin = ADMIN_PHONES.some((a) => last10 === getLast10(a)) || (emp?.cargo || "").toLowerCase().includes("admin");

    let fotoPerfil: string | null = null;
    if (emp?.id) {
      const empFotos = await db
        .select({
          id: fotografiasTable.id,
          url: fotografiasTable.url,
          descripcion: fotografiasTable.descripcion,
        })
        .from(fotografiasTable)
        .where(eq(fotografiasTable.entidad_tipo, "empleado"));

      const foto = empFotos.find((f) => f.descripcion?.toLowerCase().includes("perfil")) || empFotos[0];
      if (foto?.url) {
        fotoPerfil = foto.url.startsWith("data:") ? `/api/fotografias/${foto.id}/raw` : foto.url;
      }
    }

    const datosPendientes = (typeof sesion?.datos_pendientes === "object" && sesion?.datos_pendientes) ? sesion.datos_pendientes : {};
    let botPaused = Boolean((datosPendientes as any).bot_paused);
    const pausedUntil = (datosPendientes as any).bot_paused_until || null;
    let remainingMinutes: number | null = null;
    if (botPaused && pausedUntil) {
      const msLeft = new Date(pausedUntil).getTime() - Date.now();
      if (msLeft <= 0) {
        botPaused = false;
      } else {
        remainingMinutes = Math.ceil(msLeft / 60000);
      }
    }

    const messages = ((sesion?.messages as any[]) || []).map((m: any) => ({
      ...m,
      created_at: m.created_at || sesion?.updated_at || new Date().toISOString(),
    }));

    return res.json({
      phone: sesion?.phone || rawPhone,
      nombre: emp ? `${emp.nombre} ${emp.apellido}`.trim() : rawPhone,
      cargo: emp?.cargo || (esAdmin ? "Administrador" : "Contacto externo"),
      empleado_id: emp?.id || null,
      foto_perfil: fotoPerfil,
      messages,
      botPausado: botPaused,
      botPausedUntil: pausedUntil,
      botPauseRemainingMinutes: remainingMinutes,
      esAdmin,
      updated_at: sesion?.updated_at || new Date(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Error al obtener chat", details: err.message });
  }
});

// 4. Enviar un mensaje manual desde la web a ese teléfono
router.post("/:phone/send", async (req, res) => {
  try {
    const rawPhone = req.params.phone;
    const { text, pauseDurationMinutes } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "El mensaje no puede estar vacío" });
    }

    const cleanPhone = rawPhone.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 8) {
      return res.status(400).json({ error: "Número de teléfono no válido" });
    }

    // 1. Enviar mensaje por WhatsApp
    await sendWhatsAppMessage(cleanPhone, text.trim());

    // 2. Obtener o crear sesión para registrar el mensaje en el historial
    let [sesion] = await db
      .select()
      .from(whatsappSesionesTable)
      .where(eq(whatsappSesionesTable.phone, cleanPhone))
      .limit(1);

    if (!sesion) {
      const [nueva] = await db
        .insert(whatsappSesionesTable)
        .values({
          phone: cleanPhone,
          messages: [],
          estado: "idle",
          datos_pendientes: {},
        })
        .returning();
      sesion = nueva;
    }

    const historial = (sesion.messages as any[]) || [];
    const nuevoMsg = {
      role: "assistant",
      content: text.trim(),
      created_at: new Date().toISOString(),
      manual: true,
      admin_user: req.user?.rol || "admin",
    };
    historial.push(nuevoMsg);

    const datosPendientes = sesion.datos_pendientes && typeof sesion.datos_pendientes === "object" ? { ...sesion.datos_pendientes } : {};
    (datosPendientes as any).last_manual_reply_at = new Date().toISOString();

    // Si se especificó pausar temporalmente al enviar (ej: 30 min)
    if (pauseDurationMinutes !== undefined && Number(pauseDurationMinutes) > 0) {
      (datosPendientes as any).bot_paused = true;
      (datosPendientes as any).bot_paused_until = new Date(Date.now() + Number(pauseDurationMinutes) * 60 * 1000).toISOString();
    }

    await db
      .update(whatsappSesionesTable)
      .set({
        messages: historial,
        datos_pendientes: datosPendientes,
        updated_at: new Date(),
      })
      .where(eq(whatsappSesionesTable.phone, sesion.phone));

    return res.json({
      success: true,
      message: nuevoMsg,
    });
  } catch (err: any) {
    req.log?.error?.(err);
    return res.status(500).json({ error: "Error enviando mensaje manual", details: err.message });
  }
});

// 5. Conmutar pausa del bot para un chat específico (Modo Manual vs Modo Automático)
router.post("/:phone/toggle-bot", async (req, res) => {
  try {
    const rawPhone = req.params.phone;
    const cleanPhone = rawPhone.replace(/[^0-9]/g, "");

    let [sesion] = await db
      .select()
      .from(whatsappSesionesTable)
      .where(eq(whatsappSesionesTable.phone, cleanPhone))
      .limit(1);

    if (!sesion) {
      const [nueva] = await db
        .insert(whatsappSesionesTable)
        .values({
          phone: cleanPhone,
          messages: [],
          estado: "idle",
          datos_pendientes: {},
        })
        .returning();
      sesion = nueva;
    }

    const datosPendientes = sesion.datos_pendientes && typeof sesion.datos_pendientes === "object" ? { ...sesion.datos_pendientes } : {};
    const currentState = Boolean((datosPendientes as any).bot_paused);
    const newState = req.body.bot_paused !== undefined ? Boolean(req.body.bot_paused) : !currentState;

    (datosPendientes as any).bot_paused = newState;

    if (newState) {
      const durationMinutes = req.body.durationMinutes !== undefined ? Number(req.body.durationMinutes) : 30;
      if (durationMinutes > 0) {
        (datosPendientes as any).bot_paused_until = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
      } else {
        (datosPendientes as any).bot_paused_until = null; // Permanente
      }
      (datosPendientes as any).last_manual_reply_at = new Date().toISOString();
    } else {
      (datosPendientes as any).bot_paused_until = null;
    }

    await db
      .update(whatsappSesionesTable)
      .set({
        datos_pendientes: datosPendientes,
        updated_at: new Date(),
      })
      .where(eq(whatsappSesionesTable.phone, sesion.phone));

    const remaining = (datosPendientes as any).bot_paused_until
      ? Math.max(1, Math.ceil((new Date((datosPendientes as any).bot_paused_until).getTime() - Date.now()) / 60000))
      : null;

    return res.json({
      success: true,
      botPausado: newState,
      botPausedUntil: (datosPendientes as any).bot_paused_until || null,
      botPauseRemainingMinutes: remaining,
      phone: sesion.phone,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Error al cambiar estado del bot", details: err.message });
  }
});

export default router;
