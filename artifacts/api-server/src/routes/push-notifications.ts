import { Router } from "express";
import {
  VAPID_PUBLIC_KEY,
  savePushSubscription,
  removePushSubscription,
  sendPushNotificationToAll,
  getRecentNotifications,
} from "../services/push-notifications.js";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Clave pública VAPID para que el frontend pueda suscribirse con el navegador
router.get("/public-key", (req, res) => {
  return res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Guardar o actualizar la suscripción Web Push del dispositivo
router.post("/subscribe", requireAuth, async (req: any, res) => {
  try {
    const { subscription, userAgent } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(400).json({ error: "Datos de suscripción inválidos o incompletos." });
    }

    const userId = req.user?.id;
    const usuario = req.user?.usuario || req.user?.nombre || "usuario";

    await savePushSubscription({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId,
      usuario,
      userAgent: userAgent || req.headers["user-agent"],
    });

    return res.json({ success: true, message: "Dispositivo registrado para recibir notificaciones." });
  } catch (err: any) {
    logger.error({ err }, "[Push Route] Error al registrar suscripción");
    return res.status(500).json({ error: "Error al registrar dispositivo para notificaciones." });
  }
});

// Desuscribir dispositivo
router.post("/unsubscribe", async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: "Endpoint requerido." });
    }
    await removePushSubscription(endpoint);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Error al desuscribir." });
  }
});

// Enviar notificación de prueba a todos los dispositivos registrados
router.post("/test", requireAuth, async (req: any, res) => {
  try {
    const usuario = req.user?.nombre || "Administrador";
    const result = await sendPushNotificationToAll({
      title: "🔔 PUFFIN SRL - Notificación de Prueba",
      body: `¡Hola ${usuario}! Las notificaciones en tu iPhone y navegador están funcionando correctamente.`,
      url: "/whatsapp",
      tag: "test-notification",
    });

    return res.json({
      success: true,
      message: `Prueba enviada: ${result.sent} entregadas exitosamente.`,
      details: result,
    });
  } catch (err: any) {
    logger.error({ err }, "[Push Route] Error enviando notificación de prueba");
    return res.status(500).json({ error: "Error al enviar notificación de prueba." });
  }
});

// Consultar notificaciones recientes para la campana y panel web
router.get("/recent", requireAuth, (req, res) => {
  const notifs = getRecentNotifications();
  return res.json({ notifications: notifs });
});

export default router;
