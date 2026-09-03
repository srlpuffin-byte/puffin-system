import { db } from "@workspace/db";
import { maquinasTable, historialUsoTable } from "@workspace/db/schema";
import { isNotNull, eq, desc } from "drizzle-orm";
import { SatcomClient, isPositionEngineOn } from "./satcom.js";

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

      const currentIgnition = isPositionEngineOn(position);
      const satcomHorometroRaw = position.attributes?.hours ? (position.attributes.hours / 3600000) : 0;

      const [ultimoEvento] = await db
        .select()
        .from(historialUsoTable)
        .where(eq(historialUsoTable.maquina_id, maq.id))
        .orderBy(desc(historialUsoTable.fecha_hora))
        .limit(1);

      let lastIgnition = null;
      let lastHorometro = parseFloat(maq.horometro || "0");
      if (ultimoEvento) {
        lastIgnition = ultimoEvento.evento === "encendido";
        const ultimoH = parseFloat(ultimoEvento.horometro || "0");
        if (ultimoH > lastHorometro) {
          lastHorometro = ultimoH;
        }
      }

      if (lastIgnition !== currentIgnition) {
        const nuevoEstado = currentIgnition ? "encendido" : "apagado";
        
        let newHorometro = lastHorometro;
        // Si el motor estaba encendido y ahora se apaga, sumar el tiempo transcurrido
        if (lastIgnition === true && !currentIgnition && ultimoEvento?.fecha_hora) {
          const diffMs = Math.max(0, Date.now() - new Date(ultimoEvento.fecha_hora).getTime());
          const diffHours = diffMs / (1000 * 60 * 60);
          newHorometro = Number((lastHorometro + diffHours).toFixed(1));
        } else if (satcomHorometroRaw > lastHorometro) {
          newHorometro = Number(satcomHorometroRaw.toFixed(1));
        }

        const newHorometroStr = newHorometro.toFixed(1);

        await db.insert(historialUsoTable).values({
          maquina_id: maq.id,
          evento: nuevoEstado,
          horometro: newHorometroStr,
          ubicacion_lat: position.latitude.toString(),
          ubicacion_lng: position.longitude.toString(),
          ubicacion_texto: "Base de Operaciones (Satcom)"
        });

        // Actualizar el horómetro maestro de la máquina
        await db.update(maquinasTable)
          .set({ horometro: newHorometroStr })
          .where(eq(maquinasTable.id, maq.id));

        console.log(`[SATCOM MONITOR] ${maq.nombre}: Cambio a ${nuevoEstado} (Horometro: ${newHorometroStr})`);
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
