import { Router } from "express";
import { requireAuth } from "../middleware/auth";

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
// MOCK: Xpert Satcom
// ==========================================
integrationsRouter.get("/xpert/telemetria", requireAuth, (req, res) => {
  const { maquina_id } = req.query;
  
  // Simulamos datos en tiempo real del GPS y motor
  res.json({
    maquina_id: maquina_id ? parseInt(maquina_id as string) : null,
    posicion: { lat: -34.6037, lng: -58.3816 },
    velocidad_kmh: 45.5,
    estado: "encendido", // encendido, apagado, ralenti
    horas_motor_acumuladas: 1540.2,
    kilometraje_acumulado: 8500.5,
    ultima_actualizacion: new Date().toISOString()
  });
});
