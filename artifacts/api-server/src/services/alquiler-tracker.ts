import { db } from "@workspace/db";
import { maquinasTable, alquileresTable, empleadosTable, alertasTable } from "@workspace/db/schema";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { sendWhatsAppMessage } from "./whatsapp.js";

/**
 * Obtiene la lista de teléfonos de administradores a los que enviar alertas de telemetría.
 * Incluye a los directivos principales y a los empleados configurados con rol administrativo.
 */
export async function getAdminPhones(): Promise<string[]> {
  const phoneSet = new Set<string>();

  // Teléfonos principales de administradores / directivos
  phoneSet.add("5493572665637"); // Pía Gelso
  phoneSet.add("5493572400877"); // Marcelo Gelso

  try {
    const empleados = await db
      .select({
        telefono: empleadosTable.telefono_whatsapp,
        recibir: empleadosTable.recibir_alertas_whatsapp,
        cargo: empleadosTable.cargo,
      })
      .from(empleadosTable)
      .where(isNotNull(empleadosTable.telefono_whatsapp));

    for (const emp of empleados) {
      if (!emp.telefono) continue;
      const cargoNorm = (emp.cargo || "").toLowerCase();
      if (
        emp.recibir === true ||
        cargoNorm.includes("admin") ||
        cargoNorm.includes("geren") ||
        cargoNorm.includes("dueñ") ||
        cargoNorm.includes("socio") ||
        cargoNorm.includes("director")
      ) {
        phoneSet.add(emp.telefono.trim());
      }
    }
  } catch (err) {
    console.error("[ALQUILER-TRACKER] Error obteniendo teléfonos de administradores:", err);
  }

  return Array.from(phoneSet);
}

interface TelemetriaEventParams {
  maquina: {
    id: number;
    nombre: string;
    tipo?: string | null;
    empresa_id?: number | null;
  };
  nuevoEstado: "encendido" | "apagado";
  horometro: string;
  latitude: number | string;
  longitude: number | string;
  ubicacionTexto?: string;
  ultimoEventoFechaHora?: Date | string | null;
}

/**
 * Realiza el seguimiento exhaustivo del alquiler y envía notificaciones por WhatsApp
 * a los administradores cada vez que la excavadora (o máquina en alquiler) se enciende o apaga.
 */
export async function procesarEventoTelemetriaAlquiler(params: TelemetriaEventParams): Promise<void> {
  const { maquina, nuevoEstado, horometro, latitude, longitude, ubicacionTexto, ultimoEventoFechaHora } = params;

  // Verificamos si es la excavadora o una máquina que tenga seguimiento
  const nombreNorm = (maquina.nombre || "").toLowerCase();
  const tipoNorm = (maquina.tipo || "").toLowerCase();
  const esExcavadora = maquina.id === 159 || nombreNorm.includes("excavadora") || tipoNorm.includes("excavadora");

  // Buscar si tiene un alquiler activo (en_curso)
  let alquilerActivo: any = null;
  try {
    const [alquiler] = await db
      .select()
      .from(alquileresTable)
      .where(and(eq(alquileresTable.maquina_id, maquina.id), eq(alquileresTable.estado, "en_curso")))
      .orderBy(desc(alquileresTable.id))
      .limit(1);
    alquilerActivo = alquiler || null;
  } catch (err) {
    console.error(`[ALQUILER-TRACKER] Error buscando alquiler para máquina ${maquina.id}:`, err);
  }

  // Si no es excavadora y no tiene alquiler activo, no requiere alerta prioritaria a administradores
  if (!esExcavadora && !alquilerActivo) {
    return;
  }

  const gmapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
  const now = new Date();
  const horaStr = now.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  });
  const fechaStr = now.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const adminPhones = await getAdminPhones();

  if (nuevoEstado === "encendido") {
    // 1. Mensaje de ENCENDIDO
    let alquilerTexto = "📋 *Alquiler:* Sin alquiler activo registrado (Máquina en flota propia).";
    if (alquilerActivo) {
      const hInicio = parseFloat(alquilerActivo.horometro_inicio || "0");
      const hActual = parseFloat(horometro || "0");
      const horasConsumidas = Math.max(0, hActual - hInicio);

      alquilerTexto =
        `📋 *SEGUIMIENTO DE ALQUILER EN CURSO:*\n` +
        `• *Cliente / Destino:* ${alquilerActivo.cliente}\n` +
        `• *Fecha de Inicio:* ${alquilerActivo.fecha_inicio}\n` +
        `• *Horómetro Inicial:* ${alquilerActivo.horometro_inicio} hs\n` +
        `• *Horas Consumidas:* *${horasConsumidas.toFixed(1)} hs*\n` +
        `• *Proyecto Imputación:* RMG e hijas`;
    }

    const mensajeWhatsApp =
      `🚜 *ALERTA TELEMETRÍA: EXCAVADORA ENCENDIDA*\n\n` +
      `La máquina *${maquina.nombre}* acaba de ser *ENCENDIDA*.\n\n` +
      `⏱️ *Horómetro actual:* *${horometro} hs*\n` +
      `🕐 *Hora:* ${horaStr} hs (${fechaStr})\n` +
      `📍 *Ubicación GPS:* ${gmapsLink}\n\n` +
      `${alquilerTexto}\n\n` +
      `_Notificación automática del Asistente Satelital Puffin SRL_`;

    console.log(`[ALQUILER-TRACKER] Enviando alerta de encendido a ${adminPhones.length} administradores...`);
    for (const phone of adminPhones) {
      try {
        await sendWhatsAppMessage(phone, mensajeWhatsApp);
      } catch (e) {
        console.error(`[ALQUILER-TRACKER] Error enviando WhatsApp a ${phone}:`, e);
      }
    }

    // Registrar alerta en el sistema Puffin
    try {
      await db.insert(alertasTable).values({
        empresa_id: maquina.empresa_id || 1,
        tipo: "aviso_encendido",
        prioridad: "azul",
        descripcion: `Excavadora ${maquina.nombre} encendida a las ${horaStr}. Horómetro: ${horometro} hs.`,
        entidad_tipo: "maquina",
        entidad_id: maquina.id,
        entidad_nombre: maquina.nombre,
      });
    } catch (e) {
      console.error("[ALQUILER-TRACKER] Error insertando alerta en BD:", e);
    }
  } else if (nuevoEstado === "apagado") {
    // 2. Mensaje de APAGADO con balance de horas
    let duracionSesionStr = "";
    let diffHoursNum = 0;
    if (ultimoEventoFechaHora) {
      const diffMs = Math.max(0, now.getTime() - new Date(ultimoEventoFechaHora).getTime());
      diffHoursNum = Number((diffMs / (1000 * 60 * 60)).toFixed(1));
      duracionSesionStr = `⏳ *Tiempo de trabajo en esta sesión:* *+${diffHoursNum} hs*\n`;
    }

    let alquilerTextoFin = "";
    if (alquilerActivo) {
      const hInicio = parseFloat(alquilerActivo.horometro_inicio || "0");
      const hActual = parseFloat(horometro || "0");
      const horasTotalesAlquiler = Math.max(0, hActual - hInicio);

      // Actualizar automáticamente en base de datos las horas acumuladas del alquiler
      try {
        await db
          .update(alquileresTable)
          .set({ horas_trabajadas: horasTotalesAlquiler.toFixed(1) })
          .where(eq(alquileresTable.id, alquilerActivo.id));
      } catch (uErr) {
        console.error("[ALQUILER-TRACKER] Error actualizando horas_trabajadas del alquiler:", uErr);
      }

      alquilerTextoFin =
        `📋 *Balance de Alquiler:*\n` +
        `• *Cliente:* ${alquilerActivo.cliente}\n` +
        `• *Horas Acumuladas en Alquiler:* *${horasTotalesAlquiler.toFixed(1)} hs*\n` +
        `• *Rango Horómetro:* ${alquilerActivo.horometro_inicio} hs → *${horometro} hs*\n\n`;
    }

    const mensajeWhatsApp =
      `🛑 *TELEMETRÍA: EXCAVADORA APAGADA*\n\n` +
      `La máquina *${maquina.nombre}* ha sido *APAGADA*.\n\n` +
      `⏱️ *Horómetro final:* *${horometro} hs*\n` +
      `${duracionSesionStr}` +
      `🕐 *Hora:* ${horaStr} hs (${fechaStr})\n` +
      `📍 *Ubicación:* ${gmapsLink}\n\n` +
      `${alquilerTextoFin}` +
      `_Seguimiento de alquiler actualizado automáticamente_`;

    console.log(`[ALQUILER-TRACKER] Enviando balance de apagado a ${adminPhones.length} administradores...`);
    for (const phone of adminPhones) {
      try {
        await sendWhatsAppMessage(phone, mensajeWhatsApp);
      } catch (e) {
        console.error(`[ALQUILER-TRACKER] Error enviando WhatsApp a ${phone}:`, e);
      }
    }

    // Registrar alerta en el sistema Puffin
    try {
      await db.insert(alertasTable).values({
        empresa_id: maquina.empresa_id || 1,
        tipo: "aviso_apagado",
        prioridad: "azul",
        descripcion: `Excavadora ${maquina.nombre} apagada a las ${horaStr}. Horómetro: ${horometro} hs (+${diffHoursNum} hs sesión).`,
        entidad_tipo: "maquina",
        entidad_id: maquina.id,
        entidad_nombre: maquina.nombre,
      });
    } catch (e) {
      console.error("[ALQUILER-TRACKER] Error insertando alerta en BD:", e);
    }
  }
}
