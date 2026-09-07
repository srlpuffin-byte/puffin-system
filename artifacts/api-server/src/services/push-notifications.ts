import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { eq, sql, inArray, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BCFq1eJKksZFpmC_mHeNzVG5LYJHGvJpVCx-eomvAtfk1d9hFzr99COeENnJjB3MnEBEz81d2UIykbHsjNfiFJY";

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "pgpeEEwN8Q6l6JbjXKZJW_O3L4oF1RkWdnnlzgu67oQ";

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:soporte@puffinsrl.com";

let isVapidConfigured = false;

export function configureWebPush() {
  if (isVapidConfigured) return;
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    isVapidConfigured = true;
    logger.info("[Push Notifications] VAPID configurado correctamente");
  } catch (err) {
    logger.error({ err }, "[Push Notifications] Error configurando VAPID");
  }
}

// Asegurar que la tabla exista en la base de datos de manera transparente
export async function ensurePushSubscriptionsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        usuario TEXT,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    logger.warn({ err }, "[Push Notifications] Advertencia al verificar tabla push_subscriptions");
  }
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, any>;
}

// Historial en memoria de las últimas 30 notificaciones para alimentar el centro de notificaciones web
export interface RecentNotificationItem {
  id: string;
  tipo: "whatsapp" | "alerta" | "sistema";
  titulo: string;
  mensaje: string;
  url?: string;
  fecha: string;
  leido?: boolean;
}

const recentNotifications: RecentNotificationItem[] = [];

export function addRecentNotification(item: Omit<RecentNotificationItem, "id" | "fecha">) {
  const newItem: RecentNotificationItem = {
    ...item,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fecha: new Date().toISOString(),
    leido: false,
  };
  recentNotifications.unshift(newItem);
  if (recentNotifications.length > 50) {
    recentNotifications.pop();
  }
  return newItem;
}

export function getRecentNotifications() {
  return recentNotifications;
}

export function deleteRecentNotification(id: string) {
  const index = recentNotifications.findIndex((n) => n.id === id);
  if (index !== -1) {
    recentNotifications.splice(index, 1);
    return true;
  }
  return false;
}

export function clearRecentNotifications() {
  recentNotifications.length = 0;
  return true;
}

export function markAllNotificationsAsRead() {
  recentNotifications.forEach((n) => {
    n.leido = true;
  });
  return true;
}

export async function savePushSubscription(params: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userId?: number;
  usuario?: string;
  userAgent?: string;
}) {
  configureWebPush();
  await ensurePushSubscriptionsTable();

  const { endpoint, p256dh, auth, userId, usuario, userAgent } = params;

  try {
    const [existing] = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, endpoint))
      .limit(1);

    if (existing) {
      await db
        .update(pushSubscriptionsTable)
        .set({
          p256dh,
          auth,
          user_id: userId ?? existing.user_id,
          usuario: usuario ?? existing.usuario,
          user_agent: userAgent ?? existing.user_agent,
          updated_at: new Date(),
        })
        .where(eq(pushSubscriptionsTable.endpoint, endpoint));
      return { success: true, updated: true };
    } else {
      await db.insert(pushSubscriptionsTable).values({
        endpoint,
        p256dh,
        auth,
        user_id: userId,
        usuario,
        user_agent: userAgent,
      });
      return { success: true, created: true };
    }
  } catch (err) {
    logger.error({ err }, "[Push Notifications] Error guardando suscripción");
    throw err;
  }
}

export async function removePushSubscription(endpoint: string) {
  try {
    await db
      .delete(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, endpoint));
    return { success: true };
  } catch (err) {
    logger.warn({ err }, "[Push Notifications] Error removiendo suscripción");
    return { success: false };
  }
}

export async function sendPushNotificationToAll(payload: PushNotificationPayload) {
  configureWebPush();
  await ensurePushSubscriptionsTable();

  // Registrar en el historial reciente
  addRecentNotification({
    tipo: payload.tag?.startsWith("wa") ? "whatsapp" : "alerta",
    titulo: payload.title,
    mensaje: payload.body,
    url: payload.url,
  });

  try {
    const subscriptions = await db.select().from(pushSubscriptionsTable);
    if (!subscriptions || subscriptions.length === 0) {
      logger.info("[Push Notifications] No hay dispositivos suscriptos para enviar push");
      return { total: 0, sent: 0, failed: 0 };
    }

    const jsonPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/favicon.png",
      badge: payload.badge || "/favicon.png",
      tag: payload.tag || "puffin-alert",
      data: {
        url: payload.url || "/panel",
        ...(payload.data || {}),
      },
    });

    let sent = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            jsonPayload,
            {
              TTL: 60 * 60 * 24, // 24 horas
              urgency: "high",
            }
          );
          sent++;
        } catch (err: any) {
          failed++;
          const statusCode = err?.statusCode;
          // 404 o 410 indican suscripción expirada o revocada en Apple/Google
          if (statusCode === 404 || statusCode === 410) {
            logger.info(
              `[Push Notifications] Removiendo suscripción caducada (${statusCode}): ${sub.endpoint.slice(0, 30)}...`
            );
            await removePushSubscription(sub.endpoint);
          } else {
            logger.warn(
              { statusCode, msg: err?.message },
              `[Push Notifications] Falló envío a endpoint`
            );
          }
        }
      })
    );

    logger.info(
      `[Push Notifications] Despacho completado: ${sent} enviados, ${failed} fallidos de ${subscriptions.length} dispositivos`
    );
    return { total: subscriptions.length, sent, failed };
  } catch (err) {
    logger.error({ err }, "[Push Notifications] Error al despachar notificaciones masivas");
    return { total: 0, sent: 0, failed: 0 };
  }
}

export async function sendPushNotificationToUser(
  target: { userId?: number; usuario?: string; userIds?: number[]; usuarios?: string[] },
  payload: PushNotificationPayload
) {
  configureWebPush();
  await ensurePushSubscriptionsTable();

  // Siempre registrar en el historial reciente para que aparezca en el centro de notificaciones (la campanita)
  addRecentNotification({
    tipo: "alerta",
    titulo: payload.title,
    mensaje: payload.body,
    url: payload.url,
  });

  try {
    const userIds = [
      ...(target.userId ? [target.userId] : []),
      ...(target.userIds || []),
    ];
    const rawUsernames = [
      ...(target.usuario ? [target.usuario] : []),
      ...(target.usuarios || []),
    ];

    const conditions: any[] = [];
    if (userIds.length > 0) {
      conditions.push(inArray(pushSubscriptionsTable.user_id, userIds));
    }
    if (rawUsernames.length > 0) {
      conditions.push(inArray(pushSubscriptionsTable.usuario, rawUsernames));
      for (const u of rawUsernames) {
        conditions.push(sql`LOWER(${pushSubscriptionsTable.usuario}) = LOWER(${u})`);
      }
    }

    if (conditions.length === 0) {
      logger.info("[Push Notifications] No se especificó usuario para enviar push");
      return { total: 0, sent: 0, failed: 0 };
    }

    const subscriptions = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(or(...conditions));

    if (!subscriptions || subscriptions.length === 0) {
      logger.info(
        { target },
        "[Push Notifications] El usuario no tiene dispositivos suscritos a Push actualmente"
      );
      return { total: 0, sent: 0, failed: 0 };
    }

    const jsonPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/favicon.png",
      badge: payload.badge || "/favicon.png",
      tag: payload.tag || "puffin-user-alert",
      data: {
        url: payload.url || "/jornadas",
        ...(payload.data || {}),
      },
    });

    let sent = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            jsonPayload,
            {
              TTL: 60 * 60 * 24, // 24 horas
              urgency: "high",
            }
          );
          sent++;
        } catch (err: any) {
          failed++;
          const statusCode = err?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await removePushSubscription(sub.endpoint);
          }
        }
      })
    );

    logger.info(
      `[Push Notifications] Push enviado al usuario: ${sent} exitosos de ${subscriptions.length} dispositivos`
    );
    return { total: subscriptions.length, sent, failed };
  } catch (err) {
    logger.error({ err }, "[Push Notifications] Error enviando push a usuario");
    return { total: 0, sent: 0, failed: 0 };
  }
}

