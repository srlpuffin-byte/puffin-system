import { Router } from "express";
import {
  getNotificacionesConfig,
  updateNotificacionesConfig,
} from "../services/notificaciones-config.js";
import { checkJornadasExcedidas } from "../services/jornadas-monitor.js";
import { sendPushNotificationToAll } from "../services/push-notifications.js";
import { logger } from "../lib/logger.js";

const router = Router();

// GET: Obtener configuración de notificaciones
router.get("/", async (req, res) => {
  try {
    const config = await getNotificacionesConfig();
    return res.json(config);
  } catch (err: any) {
    logger.error({ err }, "[Notificaciones Config Route] Error obteniendo config");
    return res.status(500).json({ error: "Error al obtener configuración de notificaciones" });
  }
});

// PUT: Actualizar configuración
router.put("/", async (req, res) => {
  try {
    const allowedKeys = [
      "whatsapp_activo",
      "jornadas_12h_activo",
      "jornadas_horas_limite",
      "satcom_velocidad_activo",
      "combustible_mantenimiento_activo",
      "documentacion_activo",
      "incidentes_activo",
      "notificar_empleado_whatsapp",
      "notificar_empleado_push",
      "notificar_admin_push",
    ];

    const patch: any = {};
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        patch[key] = req.body[key];
      }
    }

    if (patch.jornadas_horas_limite !== undefined) {
      patch.jornadas_horas_limite = Number(patch.jornadas_horas_limite) || 12;
    }

    const updated = await updateNotificacionesConfig(patch);
    return res.json({
      success: true,
      message: "Configuración de notificaciones actualizada correctamente",
      config: updated,
    });
  } catch (err: any) {
    logger.error({ err }, "[Notificaciones Config Route] Error actualizando config");
    return res.status(500).json({ error: "Error al actualizar configuración de notificaciones" });
  }
});

// POST: Ejecutar chequeo manual de jornadas excedidas (+12h o límite configurado)
router.post("/test-jornadas", async (req, res) => {
  try {
    logger.info("[Notificaciones Config Route] Ejecutando chequeo manual forzado de jornadas...");
    const result = await checkJornadasExcedidas(true);
    return res.json({
      success: true,
      message: `Chequeo completado: ${result.totalActivas} jornadas en curso analizadas, ${result.excedidas} excedidas, ${result.enviadas} avisos enviados.`,
      result,
    });
  } catch (err: any) {
    logger.error({ err }, "[Notificaciones Config Route] Error en test de jornadas");
    return res.status(500).json({ error: err.message || "Error al verificar jornadas" });
  }
});

// POST: Enviar push de prueba general
router.post("/test-push", async (req, res) => {
  try {
    const { title, body } = req.body;
    const result = await sendPushNotificationToAll({
      title: title || "🔔 Prueba de Notificación PUFFIN",
      body: body || "Esta es una notificación de prueba del sistema de administración.",
      url: "/admin-notificaciones",
      tag: "test-admin-push",
    });
    return res.json({ success: true, result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Error al enviar push" });
  }
});

export default router;
