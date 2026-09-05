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

    // Identificar dispositivos vinculados
    const linkedDeviceIds = new Set(maquinas.map(m => m.satcom_id));
    
    // Dispositivos sin vincular
    const unlinkedDevices = devices.filter(d => !linkedDeviceIds.has(d.id));

    // Obtener posiciones para todos (vinculados y no vinculados)
    const positionIdsToFetch = [
      ...maquinas.map(m => devices.find(d => d.id === m.satcom_id)?.positionId),
      ...unlinkedDevices.map(d => d.positionId)
    ].filter((id): id is number => !!id);

    const positions = await SatcomClient.getPositionsBulk(positionIdsToFetch);
    const positionsMap = new Map(positions.map(p => [p.id, p]));

    const result = [];

    // 1. Agregar máquinas vinculadas
    for (const m of maquinas) {
      const device = devices.find(d => d.id === m.satcom_id);
      const position = device ? positionsMap.get(device.positionId) : null;
      const estadoSatcom = device?.status || "unknown";
      const fixTime = position?.fixTime || position?.deviceTime || device?.lastUpdate || null;
      const isDeviceOffline = estadoSatcom === "offline";
      const isStale = fixTime ? (Date.now() - new Date(fixTime).getTime()) > 15 * 60 * 1000 : false;
      const rawSpeedKmh = position && typeof position.speed === "number" ? Math.round(position.speed * 1.852) : null;
      const velocidadActual = (isDeviceOffline || isStale) ? 0 : rawSpeedKmh;

      result.push({
        maquina_id: m.id,
        device_id: device?.id || null,
        nombre: m.nombre,
        tipo: m.tipo,
        estado_satcom: estadoSatcom,
        lat: position?.latitude || null,
        lng: position?.longitude || null,
        velocidad_kmh: velocidadActual,
        ultima_velocidad_reportada: rawSpeedKmh,
        encendido: isPositionEngineOn(position, estadoSatcom),
        is_unlinked: false,
        imagen_url: fotografiasMap.get(m.id) || null,
        proyecto_lugar: maquinasProyectoMap.get(m.id) || null,
        fix_time: fixTime,
        last_update: device?.lastUpdate || null,
      });
    }

    // 2. Agregar dispositivos sin vincular
    for (const d of unlinkedDevices) {
      const position = positionsMap.get(d.positionId);
      const estadoSatcom = d.status || "unknown";
      const fixTime = position?.fixTime || position?.deviceTime || d.lastUpdate || null;
      const isDeviceOffline = estadoSatcom === "offline";
      const isStale = fixTime ? (Date.now() - new Date(fixTime).getTime()) > 15 * 60 * 1000 : false;
      const rawSpeedKmh = position && typeof position.speed === "number" ? Math.round(position.speed * 1.852) : null;
      const velocidadActual = (isDeviceOffline || isStale) ? 0 : rawSpeedKmh;

      result.push({
        maquina_id: null,
        device_id: d.id,
        nombre: d.name,
        tipo: "GPS sin asignar",
        estado_satcom: estadoSatcom,
        lat: position?.latitude || null,
        lng: position?.longitude || null,
        velocidad_kmh: velocidadActual,
        ultima_velocidad_reportada: rawSpeedKmh,
        encendido: isPositionEngineOn(position, estadoSatcom),
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
      estado: isPositionEngineOn(position) ? "encendido" : "apagado",
      horas_motor_acumuladas: position.attributes?.hours ? position.attributes.hours / 3600000 : 0,
      kilometraje_acumulado: position.attributes?.distance ? position.attributes.distance / 1000 : 0,
      ultima_actualizacion: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch telemetry" });
  }
});
