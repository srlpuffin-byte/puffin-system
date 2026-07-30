import { Router } from "express";
import { db } from "@workspace/db";
import { empleadosTable, maquinasTable, alertasTable } from "@workspace/db/schema";
import { eq, or, and, isNotNull, sql } from "drizzle-orm";
import { sendWhatsAppMessage, sendWhatsAppTemplate } from "../services/whatsapp.js";

export const cronRouter = Router();

// Endpoint para el CRON diario (idealmente llamado a la mañana)
// Este endpoint debe estar protegido por un token de cron
const CRON_SECRET = process.env.CRON_SECRET || "puffin_cron_secret";

cronRouter.get("/alertas-diarias", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;

  if (token !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized cron execution" });
  }

  try {
    const today = new Date();
    // Fechas límites para alertas
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    const fifteenDaysFromNow = new Date(today);
    fifteenDaysFromNow.setDate(today.getDate() + 15);
    const zeroDaysFromNow = new Date(today); // Hoy

    const formatForQuery = (d: Date) => d.toISOString().split("T")[0];
    const todayStr = formatForQuery(today);
    const thirtyStr = formatForQuery(thirtyDaysFromNow);
    const fifteenStr = formatForQuery(fifteenDaysFromNow);

    const logMessages = [];

    // 1. Alertas de Carnet de Operarios
    const operarios = await db.select().from(empleadosTable).where(
      and(
        eq(empleadosTable.estado, "activo"),
        isNotNull(empleadosTable.vencimiento_carnet)
      )
    );

    for (const op of operarios) {
      if (!op.vencimiento_carnet) continue;
      
      const vto = new Date(op.vencimiento_carnet);
      let mensaje = "";

      if (op.vencimiento_carnet < todayStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir está VENCIDO desde el ${op.vencimiento_carnet}. Por favor regularizalo.`;
      } else if (op.vencimiento_carnet === todayStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir vence HOY.`;
      } else if (op.vencimiento_carnet === fifteenStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir vence en 15 días (${op.vencimiento_carnet}).`;
      } else if (op.vencimiento_carnet === thirtyStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir vence en 30 días (${op.vencimiento_carnet}).`;
      }

      if (mensaje) {
        logMessages.push(`Empleado ${op.id} (${op.nombre}): ${mensaje}`);
        // Registrar la alerta en la DB (opcional, el usuario lo puede ver en el panel)
        await db.insert(alertasTable).values({
          empresa_id: op.empresa_id,
          tipo: "vencimiento",
          prioridad: op.vencimiento_carnet <= todayStr ? "rojo" : "amarillo",
          descripcion: `Carnet de conducir vence/venció: ${op.vencimiento_carnet}`,
          estado: "activa",
          entidad_tipo: "empleado",
          entidad_id: op.id,
          entidad_nombre: `${op.nombre} ${op.apellido}`
        });

        // Si el operario tiene whatsapp y aceptó recibir alertas, enviar!
        if (op.telefono_whatsapp && op.recibir_alertas_whatsapp) {
          try {
            await sendWhatsAppMessage(op.telefono_whatsapp, mensaje);
          } catch (e) {
            console.error(`Error enviando whatsapp a ${op.telefono_whatsapp}`, e);
          }
        }
      }
    }

    // 2. Alertas de Máquinas (Seguro y VTV)
    const maquinas = await db.select().from(maquinasTable).where(
      and(
        or(eq(maquinasTable.estado, "activa"), eq(maquinasTable.estado, "mantenimiento")),
        or(isNotNull(maquinasTable.vencimiento_seguro), isNotNull(maquinasTable.vencimiento_vtv))
      )
    );

    // Aquí notificamos a un administrador o grupo.
    // Vamos a buscar un empleado administrador que reciba alertas (o a un nro fijo).
    // Opcionalmente: un número de grupo.
    const admins = await db.select().from(empleadosTable).where(
      and(
        eq(empleadosTable.cargo, "Administrativo"),
        eq(empleadosTable.recibir_alertas_whatsapp, true),
        isNotNull(empleadosTable.telefono_whatsapp)
      )
    );

    for (const maq of maquinas) {
      let mensajesMaq: string[] = [];

      // VTV
      if (maq.vencimiento_vtv) {
        if (maq.vencimiento_vtv < todayStr) mensajesMaq.push(`VTV VENCIDA (${maq.vencimiento_vtv})`);
        else if (maq.vencimiento_vtv === fifteenStr) mensajesMaq.push(`VTV Vence en 15 días (${maq.vencimiento_vtv})`);
        else if (maq.vencimiento_vtv === thirtyStr) mensajesMaq.push(`VTV Vence en 30 días (${maq.vencimiento_vtv})`);
      }

      // Seguro
      if (maq.vencimiento_seguro) {
        if (maq.vencimiento_seguro < todayStr) mensajesMaq.push(`Seguro VENCIDO (${maq.vencimiento_seguro})`);
        else if (maq.vencimiento_seguro === fifteenStr) mensajesMaq.push(`Seguro Vence en 15 días (${maq.vencimiento_seguro})`);
        else if (maq.vencimiento_seguro === thirtyStr) mensajesMaq.push(`Seguro Vence en 30 días (${maq.vencimiento_seguro})`);
      }

      if (mensajesMaq.length > 0) {
        const fullMsg = `Alerta Máquina ${maq.nombre} (${maq.codigo || maq.patente || ''}):\n- ${mensajesMaq.join('\n- ')}`;
        logMessages.push(fullMsg);
        
        await db.insert(alertasTable).values({
          empresa_id: maq.empresa_id,
          tipo: "vencimiento",
          prioridad: fullMsg.includes("VENCID") ? "rojo" : "amarillo",
          descripcion: fullMsg,
          estado: "activa",
          entidad_tipo: "maquina",
          entidad_id: maq.id,
          entidad_nombre: maq.nombre
        });

        // Enviar WhatsApp a admins
        for (const admin of admins) {
          if (admin.telefono_whatsapp) {
            try {
              await sendWhatsAppMessage(admin.telefono_whatsapp, fullMsg);
            } catch (e) {
              console.error(`Error enviando whatsapp a admin ${admin.telefono_whatsapp}`, e);
            }
          }
        }
      }
    }

    return res.json({ success: true, notificaciones_generadas: logMessages.length, logs: logMessages });
  } catch (error: any) {
    console.error("Error en cron diarias:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// CRON: Jornadas sin finalizar después de 9 horas
// Llamar cada hora desde Railway Cron / cron externo
// GET /api/cron/jornadas-sin-finalizar?token=TU_TOKEN
// ──────────────────────────────────────────────────────────────────────────────
import { jornadasTable } from "@workspace/db/schema";
import { lte } from "drizzle-orm";

cronRouter.get("/jornadas-sin-finalizar", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (token !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized cron execution" });
  }

  try {
    const ahora = new Date();
    // Threshold: jornadas iniciadas hace más de 9 horas
    const threshold = new Date(ahora.getTime() - 9 * 60 * 60 * 1000);
    const thresholdHora = threshold.toTimeString().slice(0, 5); // "HH:MM"
    const thresholdFecha = threshold.toISOString().split("T")[0];    // "YYYY-MM-DD"

    // Buscamos jornadas en_curso cuya fecha+hora_inicio sea anterior al threshold
    const jornadasAbiertas = await db
      .select({
        id: jornadasTable.id,
        empleado_id: jornadasTable.empleado_id,
        maquina_id: jornadasTable.maquina_id,
        fecha: jornadasTable.fecha,
        hora_inicio: jornadasTable.hora_inicio,
      })
      .from(jornadasTable)
      .where(
        and(
          eq(jornadasTable.estado, "en_curso"),
          // fecha anterior, o misma fecha con hora anterior al threshold
          or(
            lte(jornadasTable.fecha, thresholdFecha),
          )
        )
      );

    // Filtrar más precisamente: combinando fecha + hora_inicio
    const vencidas = jornadasAbiertas.filter(j => {
      if (!j.fecha || !j.hora_inicio) return false;
      const inicioDt = new Date(`${j.fecha}T${j.hora_inicio}:00`);
      const diffHoras = (ahora.getTime() - inicioDt.getTime()) / (1000 * 60 * 60);
      return diffHoras >= 9;
    });

    const logs: string[] = [];

    for (const jornada of vencidas) {
      // Obtener datos del empleado
      const [empleado] = await db
        .select()
        .from(empleadosTable)
        .where(eq(empleadosTable.id, jornada.empleado_id))
        .limit(1);

      // Obtener nombre de la máquina
      const [maquina] = await db
        .select({ nombre: maquinasTable.nombre })
        .from(maquinasTable)
        .where(eq(maquinasTable.id, jornada.maquina_id))
        .limit(1);

      if (!empleado) continue;

      const horasTranscurridas = Math.floor(
        (ahora.getTime() - new Date(`${jornada.fecha}T${jornada.hora_inicio}:00`).getTime()) / (1000 * 60 * 60)
      );

      const mensaje =
        `⚠️ PUFFIN SRL - Recordatorio\n\n` +
        `Hola ${empleado.nombre}, llevas *${horasTranscurridas} horas* con la jornada abierta` +
        (maquina ? ` (${maquina.nombre})` : "") +
        ` iniciada a las *${jornada.hora_inicio}*.\n\n` +
        `Por favor finalizá tu jornada en el sistema: https://puffinsrl.site\n\n` +
        `_Si ya terminaste de trabajar, ingresá al sistema → Jornadas → Finalizar Jornada._`;

      logs.push(`Notificando a ${empleado.nombre} ${empleado.apellido} (jornada ${jornada.id}, ${horasTranscurridas}h abierta)`);

      // Crear alerta en el sistema
      await db.insert(alertasTable).values({
        empresa_id: empleado.empresa_id,
        tipo: "operacion",
        prioridad: horasTranscurridas >= 12 ? "rojo" : "amarillo",
        descripcion: `Jornada sin finalizar: ${empleado.nombre} ${empleado.apellido} lleva ${horasTranscurridas}h con la jornada abierta${maquina ? ` en ${maquina.nombre}` : ""}`,
        estado: "activa",
        entidad_tipo: "empleado",
        entidad_id: empleado.id,
        entidad_nombre: `${empleado.nombre} ${empleado.apellido}`,
      });

      // Enviar WhatsApp si el empleado tiene número y aceptó alertas
      if (empleado.telefono_whatsapp && empleado.recibir_alertas_whatsapp) {
        try {
          await sendWhatsAppMessage(empleado.telefono_whatsapp, mensaje);
          logs.push(`  ✅ WhatsApp enviado a ${empleado.telefono_whatsapp}`);
        } catch (e) {
          logs.push(`  ❌ Error WhatsApp: ${e}`);
        }
      } else {
        logs.push(`  ℹ️ Sin WhatsApp configurado para este empleado`);
      }
    }

    return res.json({
      success: true,
      jornadas_vencidas: vencidas.length,
      notificaciones: logs,
      ejecutado_a: ahora.toISOString(),
    });
  } catch (error: any) {
    console.error("Error en cron jornadas-sin-finalizar:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// CRON / ACCIÓN MANUAL: Comunicado de accesos — envío masivo de plantilla
// Plantilla: comunicado_accesos_bot  |  Idioma: es_AR
//
// POST /api/cron/comunicado-accesos?token=TU_TOKEN
//
// Envía la plantilla aprobada "comunicado_accesos_bot" a los números fijos
// definidos en DESTINATARIOS_COMUNICADO_ACCESOS.
// ──────────────────────────────────────────────────────────────────────────────

const DESTINATARIOS_COMUNICADO_ACCESOS: string[] = [
  "54 9 3731 64-0096",
  "3644-809238",
  "54 9 3825 57-6185",
  "54 9 3731 66-9317",
  "54 9 3731 66-0415",
  "54 9 3731 62-8275",
  "5493846446198",
  "54 9 364 428-6331",
  "5493731658349",
  "5493572408227",
  "3873107479",
  "3873107479",
  "3472629600",
  "3525 64-8277",
  "3572665637",
  "3572400877",
  "3572538345",
];

cronRouter.post("/comunicado-accesos", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;

  if (token !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const TEMPLATE_NAME = "comunicado_accesos_bot";
  const LANGUAGE_CODE = "es_AR";
  const DELAY_MS = 1000; // 1 segundo entre envíos para respetar rate-limits de Meta

  const resultados: { numero: string; estado: "ok" | "error"; detalle?: string }[] = [];

  for (const numero of DESTINATARIOS_COMUNICADO_ACCESOS) {
    try {
      await sendWhatsAppTemplate(numero, TEMPLATE_NAME, LANGUAGE_CODE);
      resultados.push({ numero, estado: "ok" });
      console.log(`[Comunicado] ✅ Enviado a ${numero}`);
    } catch (e: any) {
      const detalle = e?.message || String(e);
      resultados.push({ numero, estado: "error", detalle });
      console.error(`[Comunicado] ❌ Error enviando a ${numero}:`, detalle);
    }

    // Delay entre envíos para no saturar la API de Meta
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  const exitosos = resultados.filter((r) => r.estado === "ok").length;
  const fallidos = resultados.filter((r) => r.estado === "error").length;

  return res.json({
    success: true,
    template: TEMPLATE_NAME,
    total: resultados.length,
    exitosos,
    fallidos,
    resultados,
    ejecutado_a: new Date().toISOString(),
  });
});
