import { db } from "@workspace/db";
import { maquinasTable, historialUsoTable } from "@workspace/db/schema";
import { isNotNull, eq, desc } from "drizzle-orm";
import { SatcomClient, isPositionEngineOn } from "./satcom.js";

const CHECK_INTERVAL_MS = 30 * 1000; // 30 segundos para respuesta inmediata al encendido

function getUbicacionLabel(lat: number, lng: number): string {
  if (lat <= -31.95 && lng >= -60.45) return "Entre Ríos (Obra Francisco)";
  if (lat >= -31.45 && lng <= -60.70) return "Base Santa Fe / Recreo";
  if (lat < -31.5 && lat > -31.85 && lng < -60.45 && lng > -60.75) return "En Traslado (Ruta Santa Fe - Paraná)";
  return "Ubicación Satelital (Satcom)";
}

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
        const ubicacionTexto = getUbicacionLabel(position.latitude, position.longitude);

        await db.insert(historialUsoTable).values({
          maquina_id: maq.id,
          evento: nuevoEstado,
          horometro: newHorometroStr,
          ubicacion_lat: position.latitude.toString(),
          ubicacion_lng: position.longitude.toString(),
          ubicacion_texto: ubicacionTexto
        });

        // Actualizar el horómetro maestro de la máquina
        await db.update(maquinasTable)
          .set({ horometro: newHorometroStr })
          .where(eq(maquinasTable.id, maq.id));

        console.log(`[SATCOM MONITOR] ${maq.nombre}: Cambio a ${nuevoEstado} (Horometro: ${newHorometroStr}) en ${ubicacionTexto}`);

        // Notificar a administradores y hacer seguimiento exhaustivo del alquiler si es excavadora o alquilada
        const { procesarEventoTelemetriaAlquiler } = await import("./alquiler-tracker.js");
        procesarEventoTelemetriaAlquiler({
          maquina: maq,
          nuevoEstado,
          horometro: newHorometroStr,
          latitude: position.latitude,
          longitude: position.longitude,
          ubicacionTexto,
          ultimoEventoFechaHora: ultimoEvento?.fecha_hora,
        }).catch(err => console.error("[SATCOM MONITOR] Error en telemetría alquiler:", err));
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
