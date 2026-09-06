import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { db } from "@workspace/db";
import { maquinasTable, fotografiasTable, proyectosTable } from "@workspace/db";
import { eq, isNotNull, and, inArray, not } from "drizzle-orm";
import { SatcomClient, isPositionEngineOn } from "../services/satcom.js";

export const integrationsRouter = Router();

// ==========================================
// MOCK: AmericanGIS
// ==========================================
integrationsRouter.get("/americangis/campos", requireAuth, (req, res) => {
  res.json([
    { id: 1, nombre: "Campo Norte", hectareas: 500, zona: "Zona A" },
    { id: 2, nombre: "Lote Sur", hectareas: 1200, zona: "Zona B" }
  ]);
});

integrationsRouter.get("/americangis/geocercas", requireAuth, (req, res) => {
  res.json([
    { id: 101, campo_id: 1, nombre: "Zona Permitida 1", coordinates: [[-34.6, -58.4], [-34.61, -58.4], [-34.61, -58.41], [-34.6, -58.41]], tipo: "permitida" },
    { id: 102, campo_id: 2, nombre: "Zona Prohibida Río", coordinates: [[-34.65, -58.5], [-34.66, -58.5], [-34.66, -58.51], [-34.65, -58.51]], tipo: "prohibida" }
  ]);
});

// ==========================================
// Xpert Satcom
// ==========================================
integrationsRouter.get("/xpert/devices", requireAuth, async (req, res) => {
  try {
    const devices = await SatcomClient.getDevices();
    res.json(devices);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

integrationsRouter.post("/xpert/link", requireAuth, async (req, res) => {
  try {
    const { maquina_id, satcom_id } = req.body;
    if (!maquina_id || !satcom_id) {
      res.status(400).json({ error: "Missing ids" });
      return;
    }
    // First: remove this satcom_id from any other machine that holds it (reasignment)
    await db.update(maquinasTable)
      .set({ satcom_id: null })
      .where(eq(maquinasTable.satcom_id, satcom_id));
    // Then: assign to the new machine
    await db.update(maquinasTable).set({ satcom_id }).where(eq(maquinasTable.id, maquina_id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to link" });
  }
});


// Auto-link: match machines and Satcom devices by name similarity
integrationsRouter.post("/xpert/auto-link", requireAuth, async (req, res) => {
  try {
    const devices = await SatcomClient.getDevices();
    const maquinas = await db.select().from(maquinasTable);

    const normalize = (s: string) =>
      s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/[^a-z0-9\s]/g, "")
        .trim();

    const linked: { maquina: string; device: string }[] = [];
    const skipped: { maquina: string; reason: string }[] = [];

    for (const maq of maquinas) {
      // Skip if already linked
      if (maq.satcom_id) {
        skipped.push({ maquina: maq.nombre, reason: "Ya vinculada" });
        continue;
      }

      const normMaq = normalize(maq.nombre);
      // Also try patente/dominio
      const normPatente = maq.patente ? normalize(maq.patente) : null;
      const normDominio = maq.dominio ? normalize(maq.dominio) : null;

      // Find best matching device
      const match = devices.find(d => {
        const normDev = normalize(d.name);
        return (
          normDev.includes(normMaq) ||
          normMaq.includes(normDev) ||
          (normPatente && normDev.includes(normPatente)) ||
          (normDominio && normDev.includes(normDominio))
        );
      });

      if (match) {
        await db.update(maquinasTable).set({ satcom_id: match.id }).where(eq(maquinasTable.id, maq.id));
        linked.push({ maquina: maq.nombre, device: match.name });
      } else {
        skipped.push({ maquina: maq.nombre, reason: "Sin coincidencia" });
      }
    }

    res.json({ linked, skipped, total_linked: linked.length });
  } catch (e) {
    res.status(500).json({ error: "Failed to auto-link" });
  }
});


// Endpoint del mapa: devuelve todas las máquinas vinculadas con su posición actual, y los GPS sin vincular
integrationsRouter.get("/xpert/mapa", requireAuth, async (req, res) => {
  try {
    const maquinas = await db
      .select()
      .from(maquinasTable)
      .where(
        and(
          isNotNull(maquinasTable.satcom_id),
          not(eq(maquinasTable.estado, "baja"))
        )
      );

    const maquinasIds = maquinas.map(m => m.id);
    const fotografias = maquinasIds.length > 0 ? await db
      .select()
      .from(fotografiasTable)
      .where(and(eq(fotografiasTable.entidad_tipo, "maquina"), inArray(fotografiasTable.entidad_id, maquinasIds))) : [];

    const fotografiasMap = new Map();
    fotografias.forEach(f => {
      if (!fotografiasMap.has(f.entidad_id)) {
        fotografiasMap.set(f.entidad_id, f.url);
      }
    });

    const proyectos = await db.select({ 
      id: proyectosTable.id, 
      lugar: proyectosTable.lugar, 
      maquinas_asignadas: proyectosTable.maquinas_asignadas 
    }).from(proyectosTable);

    const maquinasProyectoMap = new Map();
    proyectos.forEach(p => {
      if (p.maquinas_asignadas && Array.isArray(p.maquinas_asignadas)) {
        p.maquinas_asignadas.forEach((mId: any) => {
          maquinasProyectoMap.set(Number(mId), p.lugar);
        });
      }
    });

    const devices = await SatcomClient.getDevices();

    // Identificar dispositivos vinculados (normalizando IDs a número)
    const linkedDeviceIds = new Set(
      maquinas
        .map(m => Number(m.satcom_id))
        .filter((id): id is number => !isNaN(id) && id > 0)
    );
    
    // Dispositivos sin vincular
    const unlinkedDevices = devices.filter(d => !linkedDeviceIds.has(Number(d.id)));

    // Obtener posiciones para todos los dispositivos conocidos
    const positionIdsToFetch = Array.from(new Set([
      ...maquinas.map(m => devices.find(d => Number(d.id) === Number(m.satcom_id))?.positionId),
      ...devices.map(d => d.positionId)
    ])).filter((id): id is number => typeof id === "number" && id > 0);

    const positions = await SatcomClient.getPositionsBulk(positionIdsToFetch);
    const positionsMap = new Map(positions.map(p => [p.id, p]));

    // Fallback individual si alguna posición de un dispositivo no vino en el bulk
    for (const d of devices) {
      if (d.positionId && !positionsMap.has(d.positionId)) {
        try {
          const fallbackPos = await SatcomClient.getPosition(d.positionId);
          if (fallbackPos) {
            positionsMap.set(fallbackPos.id, fallbackPos);
          }
        } catch {
          // Continuar con los demás
        }
      }
    }

    const result = [];

    // 1. Agregar máquinas vinculadas
    for (const m of maquinas) {
      const device = devices.find(d => Number(d.id) === Number(m.satcom_id));
      const position = device && device.positionId ? positionsMap.get(device.positionId) : null;
      const rawEstadoSatcom = device?.status || "unknown";
      const fixTime = position?.fixTime || position?.deviceTime || device?.lastUpdate || null;
      const isStale = fixTime ? (Date.now() - new Date(fixTime).getTime()) > 15 * 60 * 1000 : true;
      const isDeviceOffline = rawEstadoSatcom === "offline" || (rawEstadoSatcom !== "online" && isStale) || isStale;
      const estadoSatcom = isDeviceOffline ? "offline" : (rawEstadoSatcom === "online" ? "online" : "unknown");
      const rawSpeedKmh = position && typeof position.speed === "number" ? Math.round(position.speed * 1.852) : null;
      const velocidadActual = isDeviceOffline ? 0 : rawSpeedKmh;

      const rawLat = position?.latitude !== undefined && position?.latitude !== null ? Number(position.latitude) : null;
      const rawLng = position?.longitude !== undefined && position?.longitude !== null ? Number(position.longitude) : null;
      const validLat = rawLat !== null && !isNaN(rawLat) ? rawLat : null;
      const validLng = rawLng !== null && !isNaN(rawLng) ? rawLng : null;

      result.push({
        maquina_id: m.id,
        device_id: device?.id || null,
        nombre: m.nombre,
        tipo: m.tipo,
        estado_satcom: estadoSatcom,
        lat: validLat,
        lng: validLng,
        velocidad_kmh: velocidadActual,
        ultima_velocidad_reportada: rawSpeedKmh,
        rumbo: position && typeof position.course === "number" ? Math.round(position.course) : null,
        horometro_horas: position?.attributes?.hours ? Math.round((position.attributes.hours / 3600000) * 10) / 10 : null,
        odometro_km: position?.attributes?.totalDistance ? Math.round((position.attributes.totalDistance / 1000) * 10) / 10 : null,
        motion: isDeviceOffline ? false : (position?.attributes?.motion ?? (velocidadActual !== null && velocidadActual > 1)),
        encendido: isDeviceOffline ? false : isPositionEngineOn(position, estadoSatcom, true),
        is_unlinked: false,
        imagen_url: fotografiasMap.get(m.id) || null,
        proyecto_lugar: maquinasProyectoMap.get(m.id) || null,
        fix_time: fixTime,
        last_update: device?.lastUpdate || null,
      });
    }

    // 2. Agregar dispositivos sin vincular (asegura que ningún vehículo de Satcom falte)
    for (const d of unlinkedDevices) {
      const position = d.positionId ? positionsMap.get(d.positionId) : null;
      const rawEstadoSatcom = d.status || "unknown";
      const fixTime = position?.fixTime || position?.deviceTime || d.lastUpdate || null;
      const isStale = fixTime ? (Date.now() - new Date(fixTime).getTime()) > 15 * 60 * 1000 : true;
      const isDeviceOffline = rawEstadoSatcom === "offline" || (rawEstadoSatcom !== "online" && isStale) || isStale;
      const estadoSatcom = isDeviceOffline ? "offline" : (rawEstadoSatcom === "online" ? "online" : "unknown");
      const rawSpeedKmh = position && typeof position.speed === "number" ? Math.round(position.speed * 1.852) : null;
      const velocidadActual = isDeviceOffline ? 0 : rawSpeedKmh;

      const rawLat = position?.latitude !== undefined && position?.latitude !== null ? Number(position.latitude) : null;
      const rawLng = position?.longitude !== undefined && position?.longitude !== null ? Number(position.longitude) : null;
      const validLat = rawLat !== null && !isNaN(rawLat) ? rawLat : null;
      const validLng = rawLng !== null && !isNaN(rawLng) ? rawLng : null;

      result.push({
        maquina_id: null,
        device_id: d.id,
        nombre: d.name,
        tipo: "GPS Satelital",
        estado_satcom: estadoSatcom,
        lat: validLat,
        lng: validLng,
        velocidad_kmh: velocidadActual,
        ultima_velocidad_reportada: rawSpeedKmh,
        rumbo: position && typeof position.course === "number" ? Math.round(position.course) : null,
        horometro_horas: position?.attributes?.hours ? Math.round((position.attributes.hours / 3600000) * 10) / 10 : null,
        odometro_km: position?.attributes?.totalDistance ? Math.round((position.attributes.totalDistance / 1000) * 10) / 10 : null,
        motion: isDeviceOffline ? false : (position?.attributes?.motion ?? (velocidadActual !== null && velocidadActual > 1)),
        encendido: isDeviceOffline ? false : isPositionEngineOn(position, estadoSatcom, true),
        is_unlinked: true,
        proyecto_lugar: null,
        fix_time: fixTime,
        last_update: d.lastUpdate || null,
      });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch map data" });
  }
});

// Endpoint de Auditoría de Trayectoria (Track Histórico y Estadísticas de Recorrido)
integrationsRouter.get("/xpert/track", requireAuth, async (req, res) => {
  try {
    const { device_id, maquina_id, horas = "12" } = req.query;

    let targetDeviceId: number | null = null;
    let nombreEquipo = "Equipo Xpert Satcom";
    let tipoEquipo = "Maquinaria";

    let dev: any = null;

    if (device_id) {
      targetDeviceId = parseInt(device_id as string, 10);
      dev = (await SatcomClient.getDevices()).find(d => Number(d.id) === targetDeviceId);
      if (dev) nombreEquipo = dev.name;
    } else if (maquina_id) {
      const maquina = await db
        .select()
        .from(maquinasTable)
        .where(eq(maquinasTable.id, parseInt(maquina_id as string, 10)))
        .limit(1);
      if (maquina.length && maquina[0].satcom_id) {
        targetDeviceId = Number(maquina[0].satcom_id);
        dev = (await SatcomClient.getDevices()).find(d => Number(d.id) === targetDeviceId);
        nombreEquipo = maquina[0].nombre;
        tipoEquipo = maquina[0].tipo || "Maquinaria";
      }
    }

    if (!targetDeviceId) {
      res.status(400).json({ error: "Debe especificar un device_id o maquina_id vinculado" });
      return;
    }

    const horasNum = Math.min(Math.max(parseFloat(horas as string) || 24, 1), 72);
    const toDate = new Date().toISOString();
    const fromDate = new Date(Date.now() - horasNum * 3600 * 1000).toISOString();

    let positions = await SatcomClient.getDeviceTrack(targetDeviceId, fromDate, toDate);
    let periodoActividad = `Últimas ${horasNum} horas`;

    // Si no hubo posiciones en las últimas horas (ej. máquina inactiva o fuera de línea),
    // consultar automáticamente la última jornada con reporte según lastUpdate del hardware
    if ((!positions || positions.length === 0) && dev?.lastUpdate) {
      const lastUpdateTime = new Date(dev.lastUpdate).getTime();
      if (!isNaN(lastUpdateTime)) {
        const toLast = new Date(lastUpdateTime + 10 * 60 * 1000).toISOString();
        const fromLast = new Date(lastUpdateTime - horasNum * 3600 * 1000).toISOString();
        const pastPositions = await SatcomClient.getDeviceTrack(targetDeviceId, fromLast, toLast);
        if (pastPositions && pastPositions.length > 0) {
          positions = pastPositions;
          const fechaStr = new Date(lastUpdateTime).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
          periodoActividad = `Última jornada reportada (${fechaStr})`;
        }
      }
    }

    if (!positions || positions.length === 0) {
      res.json({
        deviceId: targetDeviceId,
        nombre: nombreEquipo,
        tipo: tipoEquipo,
        puntos: [],
        estadisticas: {
          horas_marcha: 0,
          km_recorridos: 0,
          velocidad_maxima: 0,
          velocidad_promedio: 0,
          horometro_actual: null,
          odometro_actual: null,
          actividad_actual: "Sin registros satelitales en el período",
          ultima_posicion: null,
        },
      });
      return;
    }

    // Ordenar cronológicamente
    positions.sort((a, b) => new Date(a.fixTime || a.deviceTime || 0).getTime() - new Date(b.fixTime || b.deviceTime || 0).getTime());

    // 1. Filtrar deriva de GPS (Jitter) mientras la máquina está estacionada / motor apagado
    // Elimina micro-desplazamientos de antena que generan falsos zig-zags en el mapa
    const cleanPositions: typeof positions = [];
    let lastCleanPos: (typeof positions)[0] | null = null;
    let totalMovingDistMeters = 0;

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const isEngine = isPositionEngineOn(p);
      const spdKmh = (p.speed || 0) * 1.852;

      if (!lastCleanPos) {
        cleanPositions.push(p);
        lastCleanPos = p;
        continue;
      }

      const dLat = (p.latitude - lastCleanPos.latitude) * Math.PI / 180;
      const dLng = (p.longitude - lastCleanPos.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lastCleanPos.latitude * Math.PI / 180) * Math.cos(p.latitude * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distMeters = 6371000 * c;

      // Si el motor está apagado, la velocidad es nula y la distancia es menor a 25 metros, es jitter estático
      if (!isEngine && spdKmh < 0.5 && distMeters < 25) {
        continue;
      }

      if (distMeters > 5 && (isEngine || spdKmh > 0.8 || distMeters > 25)) {
        totalMovingDistMeters += distMeters;
      }

      cleanPositions.push(p);
      lastCleanPos = p;
    }

    // Asegurar que la última posición absoluta del reporte siempre esté incluida
    const absoluteLastPos = positions[positions.length - 1];
    if (cleanPositions.length > 0 && cleanPositions[cleanPositions.length - 1].id !== absoluteLastPos.id) {
      cleanPositions.push(absoluteLastPos);
    }

    const filteredPositions = cleanPositions.length >= 2 ? cleanPositions : positions;

    // 2. Delimitar la jornada operativa: Si la máquina estuvo estacionada durante horas previas y luego
    // arrancó, el Punto de Inicio debe coincidir con el comienzo de su actividad real (evitando horas nocturnas ociosas)
    const activeIndices: number[] = [];
    for (let i = 0; i < filteredPositions.length; i++) {
      if (isPositionEngineOn(filteredPositions[i]) || (filteredPositions[i].speed || 0) > 0.5) {
        activeIndices.push(i);
      }
    }

    let displayPositions = filteredPositions;
    if (activeIndices.length > 0) {
      const firstActiveIdx = Math.max(0, activeIndices[0] - 1);
      displayPositions = filteredPositions.slice(firstActiveIdx);
    }

    // Mapear puntos limpios listos para el mapa
    const puntos = displayPositions.map(p => {
      const spdKmh = typeof p.speed === "number" ? Math.round(p.speed * 1.852 * 10) / 10 : 0;
      return {
        lat: p.latitude,
        lng: p.longitude,
        speed_kmh: spdKmh,
        rumbo: typeof p.course === "number" ? Math.round(p.course) : 0,
        fixTime: p.fixTime || p.deviceTime || null,
        encendido: isPositionEngineOn(p),
      };
    });

    // Calcular estadísticas precisas de la jornada
    let maxSpeed = 0;
    let sumSpeedMoving = 0;
    let countMoving = 0;
    let totalEngineMs = 0;

    for (let i = 0; i < displayPositions.length; i++) {
      const p = displayPositions[i];
      const spdKmh = (p.speed || 0) * 1.852;
      if (spdKmh > maxSpeed) maxSpeed = spdKmh;
      if (spdKmh > 1.5) {
        sumSpeedMoving += spdKmh;
        countMoving++;
      }

      if (i > 0) {
        const prev = displayPositions[i - 1];
        const tPrev = new Date(prev.fixTime || prev.deviceTime || 0).getTime();
        const tCurr = new Date(p.fixTime || p.deviceTime || 0).getTime();
        const dt = tCurr - tPrev;
        if (dt > 0 && dt < 30 * 60 * 1000 && isPositionEngineOn(p)) {
          totalEngineMs += dt;
        }
      }
    }

    // Horas de marcha: delta de horómetro Satcom como primera prioridad
    let horasMarcha = 0;
    const pStart = displayPositions[0];
    const pEnd = displayPositions[displayPositions.length - 1];

    if (pStart?.attributes?.hours !== undefined && pEnd?.attributes?.hours !== undefined) {
      const deltaH = (pEnd.attributes.hours - pStart.attributes.hours) / 3600000;
      if (deltaH >= 0 && deltaH <= 24) {
        horasMarcha = Math.round(deltaH * 10) / 10;
      }
    }
    if (horasMarcha === 0 && totalEngineMs > 0) {
      horasMarcha = Math.round((totalEngineMs / 3600000) * 10) / 10;
    }

    // Kilómetros recorridos: delta de odómetro Satcom como primera prioridad
    let kmRecorridos = 0;
    if (pStart?.attributes?.totalDistance !== undefined && pEnd?.attributes?.totalDistance !== undefined) {
      const deltaKm = (pEnd.attributes.totalDistance - pStart.attributes.totalDistance) / 1000;
      if (deltaKm >= 0 && deltaKm <= 2000) {
        kmRecorridos = Math.round(deltaKm * 10) / 10;
      }
    }
    if (kmRecorridos === 0 && totalMovingDistMeters > 0) {
      kmRecorridos = Math.round((totalMovingDistMeters / 1000) * 10) / 10;
    }

    const lastPos = positions[positions.length - 1];
    // Horómetro actual total del equipo
    const lastWithHours = [...positions].reverse().find(p => p.attributes?.hours !== undefined && p.attributes.hours > 0);
    const horometroActual = lastWithHours?.attributes?.hours 
      ? Math.round((lastWithHours.attributes.hours / 3600000) * 10) / 10 
      : (lastPos?.attributes?.hours ? Math.round((lastPos.attributes.hours / 3600000) * 10) / 10 : null);

    // Odómetro actual total del equipo
    const lastWithOdo = [...positions].reverse().find(p => p.attributes?.totalDistance !== undefined && p.attributes.totalDistance > 0);
    const odometroActual = lastWithOdo?.attributes?.totalDistance 
      ? Math.round((lastWithOdo.attributes.totalDistance / 1000) * 10) / 10 
      : (lastPos?.attributes?.totalDistance ? Math.round((lastPos.attributes.totalDistance / 1000) * 10) / 10 : null);

    const currentSpeedKmh = lastPos && typeof lastPos.speed === "number" ? Math.round(lastPos.speed * 1.852) : 0;
    const isEngineRunning = isPositionEngineOn(lastPos, undefined, true);

    let actividadActual = "Apagado / Estacionado";
    if (currentSpeedKmh > 40) {
      actividadActual = `En tránsito rápido por ruta (${currentSpeedKmh} km/h)`;
    } else if (currentSpeedKmh > 18) {
      actividadActual = `En traslado por camino (${currentSpeedKmh} km/h)`;
    } else if (currentSpeedKmh >= 3) {
      actividadActual = `Laborando en terreno (${currentSpeedKmh} km/h)`;
    } else if (isEngineRunning) {
      actividadActual = "Detenido en ralentí / Cabecera";
    }

    res.json({
      deviceId: targetDeviceId,
      nombre: nombreEquipo,
      tipo: tipoEquipo,
      puntos,
      estadisticas: {
        horas_marcha: horasMarcha,
        km_recorridos: kmRecorridos,
        velocidad_maxima: Math.round(maxSpeed * 10) / 10,
        velocidad_promedio: countMoving > 0 ? Math.round((sumSpeedMoving / countMoving) * 10) / 10 : 0,
        horometro_actual: horometroActual,
        odometro_actual: odometroActual,
        actividad_actual: actividadActual,
        ultima_posicion: {
          lat: lastPos.latitude,
          lng: lastPos.longitude,
          velocidad_kmh: currentSpeedKmh,
          rumbo: typeof lastPos.course === "number" ? Math.round(lastPos.course) : 0,
          fixTime: lastPos.fixTime || lastPos.deviceTime || null,
        }
      },
    });
  } catch (e) {
    console.error("Error fetching satcom track:", e);
    res.status(500).json({ error: "Failed to fetch device track" });
  }
});

integrationsRouter.get("/xpert/telemetria", requireAuth, async (req, res) => {
  try {
    const { maquina_id } = req.query;
    if (!maquina_id) {
      res.status(400).json({ error: "Missing maquina_id" });
      return;
    }

    const maquina = await db.select().from(maquinasTable).where(eq(maquinasTable.id, parseInt(maquina_id as string))).limit(1);

    if (!maquina.length || !maquina[0].satcom_id) {
      res.status(404).json({ error: "Maquina not linked to Satcom" });
      return;
    }

    const satcom_id = maquina[0].satcom_id;
    const devices = await SatcomClient.getDevices();
    const device = devices.find(d => d.id === satcom_id);

    if (!device) {
      res.status(404).json({ error: "Device not found in Satcom API" });
      return;
    }

    const position = await SatcomClient.getPosition(device.positionId);

    if (!position) {
      res.status(404).json({ error: "No position data available" });
      return;
    }

    res.json({
      maquina_id: parseInt(maquina_id as string),
      posicion: { lat: position.latitude, lng: position.longitude },
      velocidad_kmh: position.speed * 1.852,
      rumbo: typeof position.course === "number" ? Math.round(position.course) : 0,
      estado: isPositionEngineOn(position, device.status, true) ? "encendido" : "apagado",
      horas_motor_acumuladas: position.attributes?.hours ? position.attributes.hours / 3600000 : 0,
      kilometraje_acumulado: position.attributes?.distance ? position.attributes.distance / 1000 : 0,
      ultima_actualizacion: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch telemetry" });
  }
});
