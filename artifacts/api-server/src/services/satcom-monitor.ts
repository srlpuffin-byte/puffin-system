import { db } from "@workspace/db";
import { maquinasTable, historialUsoTable } from "@workspace/db/schema";
import { isNotNull, eq, desc } from "drizzle-orm";
import { SatcomClient } from "./satcom.js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

async function syncSatcomHistory() {
  try {
    const maquinas = await db.select().from(maquinasTable).where(isNotNull(maquinasTable.satcom_id));
    if (maquinas.length === 0) return;

    const devices = await SatcomClient.getDevices();
    const linkedDeviceIds = new Set(maquinas.map(m => m.satcom_id));
    const linkedDevices = devices.filter(d => linkedDeviceIds.has(d.id));
    
    const positionIdsToFetch = linkedDevices.map(d => d.positionId).filter((id): id is number => !!id);
    if (positionIdsToFetch.length === 0) return;

    const positions = await SatcomClient.getPositionsBulk(positionIdsToFetch);
    const positionsMap = new Map(positions.map(p => [p.id, p]));

    for (const maq of maquinas) {
      const device = linkedDevices.find(d => d.id === maq.satcom_id);
      if (!device) continue;

      const position = positionsMap.get(device.positionId);
      if (!position) continue;

      const currentIgnition = !!position.attributes?.ignition;
      const currentHorometro = position.attributes?.hours ? (position.attributes.hours / 3600000).toFixed(1) : "0";

      const [ultimoEvento] = await db
        .select()
        .from(historialUsoTable)
        .where(eq(historialUsoTable.maquina_id, maq.id))
        .orderBy(desc(historialUsoTable.fecha_hora))
        .limit(1);

      let lastIgnition = null;
      if (ultimoEvento) {
        lastIgnition = ultimoEvento.evento === "encendido";
      }

      if (lastIgnition !== currentIgnition) {
        const nuevoEstado = currentIgnition ? "encendido" : "apagado";
        
        await db.insert(historialUsoTable).values({
          maquina_id: maq.id,
          evento: nuevoEstado,
          horometro: currentHorometro,
          ubicacion_lat: position.latitude.toString(),
          ubicacion_lng: position.longitude.toString(),
          ubicacion_texto: "Base de Operaciones (Satcom)"
        });

        console.log(`[SATCOM MONITOR] ${maq.nombre}: Cambio a ${nuevoEstado} (Horometro: ${currentHorometro})`);
      }
    }
  } catch (e) {
    console.error("[SATCOM MONITOR] Error sincronizando el historial:", e);
  }
}

export function startSatcomMonitor() {
  console.log(`[SATCOM MONITOR] Iniciado - revisando estado de motores cada ${CHECK_INTERVAL_MS / 60000} minutos.`);
  // Primera revision a los 10 segundos
  setTimeout(() => {
    syncSatcomHistory();
    setInterval(syncSatcomHistory, CHECK_INTERVAL_MS);
  }, 10_000);
}
