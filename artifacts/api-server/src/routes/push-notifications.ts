import { Router, Request } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { alertasTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  VAPID_PUBLIC_KEY,
  savePushSubscription,
  removePushSubscription,
  sendPushNotificationToAll,
  getRecentNotifications,
  deleteRecentNotification,
  clearRecentNotifications,
  markAllNotificationsAsRead,
} from "../services/push-notifications.js";
import { logger } from "../lib/logger.js";

const router = Router();
const JWT_SECRET = process.env.SESSION_SECRET || "puffin-srl-secret-2024";

// Extraer usuario opcionalmente sin bloquear con 401
function extractOptionalUser(req: Request): { id?: number; usuario?: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return {
      id: payload.userId,
      usuario: payload.usuario || payload.nombre || "usuario",
    };
  } catch {
    return null;
  }
}

// Clave pública VAPID para que el frontend pueda suscribirse con el navegador
router.get("/public-key", (req, res) => {
  return res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Guardar o actualizar la suscripción Web Push del dispositivo (autenticación flexible para evitar 401)
router.post("/subscribe", async (req: any, res) => {
  try {
    const rawSub = req.body.subscription || req.body;
    if (!rawSub) {
      return res.status(400).json({ error: "Datos de suscripción vacíos o ausentes." });
    }

    const endpoint = rawSub.endpoint;
    const p256dh =
      rawSub.keys?.p256dh ||
      (rawSub.getKey ? Buffer.from(rawSub.getKey("p256dh")).toString("base64") : "");
    const auth =
      rawSub.keys?.auth ||
      (rawSub.getKey ? Buffer.from(rawSub.getKey("auth")).toString("base64") : "");

    if (!endpoint || !p256dh || !auth) {
      logger.warn({ body: req.body }, "[Push Route] Datos de suscripción incompletos");
      return res.status(400).json({
        error: "Datos de suscripción incompletos",
        details: { hasEndpoint: !!endpoint, hasP256dh: !!p256dh, hasAuth: !!auth },
      });
    }

    const optUser = extractOptionalUser(req);
    const userId = optUser?.id || req.user?.id || null;
    const usuario = optUser?.usuario || req.user?.usuario || req.user?.nombre || "carlos";

    await savePushSubscription({
      endpoint,
      p256dh,
      auth,
      userId,
      usuario,
      userAgent: req.body.userAgent || req.headers["user-agent"],
    });

    logger.info({ usuario, endpoint: endpoint.slice(0, 40) }, "[Push Route] Dispositivo registrado con éxito");
    return res.json({ success: true, message: "Dispositivo registrado para recibir notificaciones." });
  } catch (err: any) {
    logger.error({ err }, "[Push Route] Error al registrar suscripción");
    return res.status(500).json({ error: "Error al registrar dispositivo para notificaciones: " + (err?.message || "") });
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
router.post("/test", async (req: any, res) => {
  try {
    const optUser = extractOptionalUser(req);
    const usuario = optUser?.usuario || req.user?.nombre || "Carlos";

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

// Consultar notificaciones recientes para la campana y panel web (combinando memoria y alertas activas)
router.get("/recent", async (req, res) => {
  try {
    const memNotifs = getRecentNotifications();
    const dbAlertas = await db
      .select()
      .from(alertasTable)
      .where(eq(alertasTable.estado, "activa"))
      .orderBy(desc(alertasTable.fecha))
      .limit(20);

    const dbItems = dbAlertas.map((a) => ({
      id: `alerta-${a.id}`,
      tipo: "alerta" as const,
      titulo: `Alerta: ${a.tipo?.toUpperCase() || "SISTEMA"}`,
      mensaje: a.descripcion,
      url: "/alertas",
      fecha: a.fecha ? a.fecha.toISOString() : new Date().toISOString(),
      leido: false,
    }));

    const combined = [...memNotifs];
    for (const item of dbItems) {
      if (!combined.some((c) => c.id === item.id)) {
        combined.push(item);
      }
    }

    return res.json({ notifications: combined });
  } catch (err: any) {
    const memNotifs = getRecentNotifications();
    return res.json({ notifications: memNotifs });
  }
});

// Eliminar una notificación individual
router.delete("/recent/:id", async (req, res) => {
  const { id } = req.params;
  deleteRecentNotification(id);
  if (id.startsWith("alerta-")) {
    const aId = parseInt(id.replace("alerta-", ""), 10);
    if (!isNaN(aId)) {
      try {
        await db.update(alertasTable).set({ estado: "resuelta" }).where(eq(alertasTable.id, aId));
      } catch {}
    }
  }
  return res.json({ success: true });
});

// Vaciar todas las notificaciones
router.delete("/recent", async (req, res) => {
  clearRecentNotifications();
  try {
    await db.update(alertasTable).set({ estado: "resuelta" }).where(eq(alertasTable.estado, "activa"));
  } catch {}
  return res.json({ success: true });
});

// Marcar todas las notificaciones como leídas
router.post("/recent/read-all", async (req, res) => {
  markAllNotificationsAsRead();
  try {
    await db.update(alertasTable).set({ estado: "resuelta" }).where(eq(alertasTable.estado, "activa"));
  } catch {}
  return res.json({ success: true });
});

export default router;
