import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { db } from "@workspace/db";
import { maquinasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SatcomClient } from "../services/satcom";

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
    
    await db.update(maquinasTable).set({ satcom_id }).where(eq(maquinasTable.id, maquina_id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to link" });
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
      estado: position.attributes?.ignition ? "encendido" : "apagado",
      horas_motor_acumuladas: position.attributes?.hours ? position.attributes.hours / 3600000 : 0,
      kilometraje_acumulado: position.attributes?.distance ? position.attributes.distance / 1000 : 0,
      ultima_actualizacion: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch telemetry" });
  }
});
