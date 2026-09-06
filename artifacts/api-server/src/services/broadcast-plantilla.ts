import { db } from "@workspace/db";
import { empleadosTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendWhatsAppTemplate, sendWhatsAppMessage } from "./whatsapp.js";

// Teléfonos de administración para reportar el resultado del envío masivo
const ADMIN_PHONES = ["3472629600", "5493472629600"];

let hasExecuted = false;

/**
 * Envía la plantilla 'sistema_uso' a todos los empleados activos con teléfono cargado.
 */
export async function enviarPlantillaSistemaUsoAEmpleados(): Promise<{
  success: boolean;
  total: number;
  exitosos: number;
  fallidos: number;
  resultados: { empleado: string; telefono: string; estado: "ok" | "error"; error?: string }[];
  fecha_envio: string;
}> {
  const TEMPLATE_NAME = "sistema_uso";
  const DELAY_MS = 1200; // 1.2 segundos entre cada mensaje para respetar los límites de Meta

  try {
    const empleados = await db
      .select({
        id: empleadosTable.id,
        nombre: empleadosTable.nombre,
        apellido: empleadosTable.apellido,
        dni: empleadosTable.dni,
        telefono: empleadosTable.telefono,
        telefono_whatsapp: empleadosTable.telefono_whatsapp,
      })
      .from(empleadosTable)
      .where(eq(empleadosTable.estado, "activo"));

    const getNumero = (e: { telefono_whatsapp?: string | null; telefono?: string | null }) =>
      (e.telefono_whatsapp && e.telefono_whatsapp.trim()) || (e.telefono && e.telefono.trim()) || null;

    const destinatarios = empleados
      .map((e) => ({
        id: e.id,
        nombre: `${e.nombre} ${e.apellido}`.trim(),
        dni: e.dni,
        telefono: getNumero(e),
      }))
      .filter((e) => e.telefono && e.telefono.replace(/\D/g, "").length >= 7);

    console.log(`[Broadcast Plantilla] Iniciando envío de "${TEMPLATE_NAME}" a ${destinatarios.length} empleados activos...`);

    const resultados: { empleado: string; telefono: string; estado: "ok" | "error"; error?: string }[] = [];

    for (const dest of destinatarios) {
      let enviado = false;
      let errorMsg = "";

      // 1. Intentar con es_AR (Spanish ARG)
      try {
        await sendWhatsAppTemplate(dest.telefono!, TEMPLATE_NAME, "es_AR", []);
        enviado = true;
      } catch (err: any) {
        errorMsg = err.message || String(err);
        // Fallback a 'es' en caso de que Meta la haya registrado con código 'es'
        try {
          await sendWhatsAppTemplate(dest.telefono!, TEMPLATE_NAME, "es", []);
          enviado = true;
        } catch (err2: any) {
          errorMsg = `${errorMsg} | Fallback (es): ${err2.message || String(err2)}`;
        }
      }

      if (enviado) {
        resultados.push({ empleado: dest.nombre, telefono: dest.telefono!, estado: "ok" });
        console.log(`[Broadcast Plantilla] ✅ Enviado a ${dest.nombre} (${dest.telefono})`);
      } else {
        resultados.push({ empleado: dest.nombre, telefono: dest.telefono!, estado: "error", error: errorMsg });
        console.error(`[Broadcast Plantilla] ❌ Error con ${dest.nombre} (${dest.telefono}):`, errorMsg);
      }

      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }

    const exitosos = resultados.filter((r) => r.estado === "ok").length;
    const fallidos = resultados.filter((r) => r.estado === "error").length;

    // Notificar al administrador por WhatsApp sobre el resultado
    const resumenAdmin = `📢 *Reporte de Envío de Plantilla "${TEMPLATE_NAME}"*\n\n` +
      `👥 Total empleados con teléfono: ${destinatarios.length}\n` +
      `✅ Enviados con éxito: ${exitosos}\n` +
      `❌ Fallidos: ${fallidos}\n\n` +
      (fallidos > 0 ? `Detalle de fallas:\n${resultados.filter(r => r.estado === 'error').map(r => `• ${r.empleado}: ${r.error?.slice(0, 80)}`).join('\n')}` : `Todos los empleados recibieron el mensaje correctamente.`);

    for (const adminPhone of ADMIN_PHONES) {
      try {
        await sendWhatsAppMessage(adminPhone, resumenAdmin);
      } catch (_) {}
    }

    return {
      success: true,
      total: destinatarios.length,
      exitosos,
      fallidos,
      resultados,
      fecha_envio: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error("[Broadcast Plantilla] Error general en el proceso de envío:", error);
    throw error;
  }
}

/**
 * Inicia el temporizador programado para enviar la plantilla el 07/09/2026 a las 12:00 PM (hora Argentina, UTC-3).
 * Equivalente a 2026-09-07T15:00:00.000Z.
 */
export function startScheduledBroadcastSistemaUso() {
  // 12:00:00 Hora Argentina (UTC-3) del 7 de Septiembre de 2026
  const TARGET_TIME_MS = new Date("2026-09-07T15:00:00.000Z").getTime();

  console.log(`[Programador] Programador de plantilla 'sistema_uso' iniciado. Objetivo: 07/09/2026 12:00 (Arg) / ${new Date(TARGET_TIME_MS).toISOString()}`);

  const intervalId = setInterval(async () => {
    const now = Date.now();
    if (now >= TARGET_TIME_MS && !hasExecuted) {
      hasExecuted = true;
      clearInterval(intervalId);
      console.log(`[Programador] ⏰ Llegó la hora programada (12:00 PM). Disparando envío masivo de la plantilla 'sistema_uso'...`);
      try {
        await enviarPlantillaSistemaUsoAEmpleados();
      } catch (err) {
        console.error("[Programador] Error al ejecutar el envío programado:", err);
      }
    }
  }, 30_000); // Chequea cada 30 segundos
}
