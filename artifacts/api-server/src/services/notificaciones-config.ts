import { db } from "@workspace/db";
import { notificacionesConfigTable, NotificacionesConfig } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const DEFAULT_CONFIG: Omit<NotificacionesConfig, "id" | "updated_at"> = {
  empresa_id: 1,
  whatsapp_activo: true,
  jornadas_12h_activo: true,
  jornadas_horas_limite: 12,
  satcom_velocidad_activo: true,
  combustible_mantenimiento_activo: true,
  documentacion_activo: true,
  incidentes_activo: true,
  notificar_empleado_whatsapp: true,
  notificar_empleado_push: true,
  notificar_admin_push: true,
};

let cachedConfig: NotificacionesConfig | null = null;

export async function ensureNotificacionesConfigTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notificaciones_config (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL DEFAULT 1,
        whatsapp_activo BOOLEAN NOT NULL DEFAULT TRUE,
        jornadas_12h_activo BOOLEAN NOT NULL DEFAULT TRUE,
        jornadas_horas_limite INTEGER NOT NULL DEFAULT 12,
        satcom_velocidad_activo BOOLEAN NOT NULL DEFAULT TRUE,
        combustible_mantenimiento_activo BOOLEAN NOT NULL DEFAULT TRUE,
        documentacion_activo BOOLEAN NOT NULL DEFAULT TRUE,
        incidentes_activo BOOLEAN NOT NULL DEFAULT TRUE,
        notificar_empleado_whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
        notificar_empleado_push BOOLEAN NOT NULL DEFAULT TRUE,
        notificar_admin_push BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Asegurar que exista al menos una fila
    const [row] = await db
      .select()
      .from(notificacionesConfigTable)
      .where(eq(notificacionesConfigTable.empresa_id, 1))
      .limit(1);

    if (!row) {
      const [inserted] = await db
        .insert(notificacionesConfigTable)
        .values(DEFAULT_CONFIG)
        .returning();
      cachedConfig = inserted;
    } else {
      cachedConfig = row;
    }
  } catch (err) {
    logger.warn({ err }, "[Notificaciones Config] Advertencia verificando tabla");
  }
}

export async function getNotificacionesConfig(): Promise<NotificacionesConfig> {
  if (cachedConfig) return cachedConfig;
  await ensureNotificacionesConfigTable();

  try {
    const [row] = await db
      .select()
      .from(notificacionesConfigTable)
      .where(eq(notificacionesConfigTable.empresa_id, 1))
      .limit(1);

    if (row) {
      cachedConfig = row;
      return row;
    }
  } catch (e) {
    logger.warn({ e }, "[Notificaciones Config] Error leyendo config, usando defaults");
  }

  return {
    id: 1,
    ...DEFAULT_CONFIG,
    updated_at: new Date(),
  };
}

export async function updateNotificacionesConfig(
  patch: Partial<Omit<NotificacionesConfig, "id" | "empresa_id" | "updated_at">>
): Promise<NotificacionesConfig> {
  await ensureNotificacionesConfigTable();

  try {
    const [updated] = await db
      .update(notificacionesConfigTable)
      .set({
        ...patch,
        updated_at: new Date(),
      })
      .where(eq(notificacionesConfigTable.empresa_id, 1))
      .returning();

    if (updated) {
      cachedConfig = updated;
      logger.info({ updated }, "[Notificaciones Config] Reglas de notificación actualizadas");
      return updated;
    }
  } catch (err) {
    logger.error({ err }, "[Notificaciones Config] Error actualizando reglas");
    throw err;
  }

  return getNotificacionesConfig();
}

export async function isNotificationEnabled(
  type:
    | "whatsapp"
    | "jornadas_12h"
    | "satcom_velocidad"
    | "combustible_mantenimiento"
    | "documentacion"
    | "incidentes"
): Promise<boolean> {
  const config = await getNotificacionesConfig();
  switch (type) {
    case "whatsapp":
      return config.whatsapp_activo;
    case "jornadas_12h":
      return config.jornadas_12h_activo;
    case "satcom_velocidad":
      return config.satcom_velocidad_activo;
    case "combustible_mantenimiento":
      return config.combustible_mantenimiento_activo;
    case "documentacion":
      return config.documentacion_activo;
    case "incidentes":
      return config.incidentes_activo;
    default:
      return true;
  }
}
