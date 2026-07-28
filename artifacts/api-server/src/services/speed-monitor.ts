import { db } from "@workspace/db";
import { maquinasTable } from "@workspace/db";
import { isNotNull } from "drizzle-orm";
import { SatcomClient } from "./satcom.js";
import { sendWhatsAppMessage } from "./whatsapp.js";

const SPEED_LIMIT_KMH = 125;
const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const ADMIN_PHONE = "5493572665637"; // Pía Gelso
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes between alerts for the same vehicle

// Track last alert time per vehicle to avoid spam
const lastAlertMap = new Map<number, number>();

async function checkSpeeds() {
  try {
    const maquinas = await db
      .select()
      .from(maquinasTable)
      .where(isNotNull(maquinasTable.satcom_id));

    if (maquinas.length === 0) return;

    const devices = await SatcomClient.getDevices();
    if (devices.length === 0) return;

    const positionIds = maquinas
      .map((m) => devices.find((d) => d.id === m.satcom_id)?.positionId)
      .filter((id): id is number => !!id);

    if (positionIds.length === 0) return;

    const positions = await SatcomClient.getPositionsBulk(positionIds);
    const positionsMap = new Map(positions.map((p) => [p.id, p]));

    const now = Date.now();

    for (const maq of maquinas) {
      const device = devices.find((d) => d.id === maq.satcom_id);
      if (!device) continue;

      const position = positionsMap.get(device.positionId);
      if (!position) continue;

      const velocidadKmh = Math.round(position.speed * 1.852);

      if (velocidadKmh > SPEED_LIMIT_KMH) {
        // Check cooldown
        const lastAlert = lastAlertMap.get(maq.id) || 0;
        if (now - lastAlert < COOLDOWN_MS) continue;

        lastAlertMap.set(maq.id, now);

        const gmapsLink = `https://maps.google.com/?q=${position.latitude},${position.longitude}`;
        const mensaje =
          `⚠️ *ALERTA DE VELOCIDAD*\n\n` +
          `El vehículo *${maq.nombre}* (${maq.tipo}) está circulando a *${velocidadKmh} km/h*, superando el límite de ${SPEED_LIMIT_KMH} km/h.\n\n` +
          `📍 Ubicación: ${gmapsLink}\n` +
          `🕐 Hora: ${new Date().toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`;

        try {
          await sendWhatsAppMessage(ADMIN_PHONE, mensaje);
          console.log(`[SPEED ALERT] ${maq.nombre} a ${velocidadKmh} km/h — notificación enviada.`);
        } catch (e) {
          console.error(`[SPEED ALERT] Error enviando alerta para ${maq.nombre}:`, e);
        }
      }
    }
  } catch (e) {
    console.error("[SPEED MONITOR] Error en chequeo de velocidades:", e);
  }
}

export function startSpeedMonitor() {
  console.log(`[SPEED MONITOR] Iniciado — revisando cada ${CHECK_INTERVAL_MS / 1000}s, límite: ${SPEED_LIMIT_KMH} km/h`);
  // First check after 30 seconds (let server warm up)
  setTimeout(() => {
    checkSpeeds();
    setInterval(checkSpeeds, CHECK_INTERVAL_MS);
  }, 30_000);
}
