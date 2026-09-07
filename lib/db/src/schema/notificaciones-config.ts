import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const notificacionesConfigTable = pgTable("notificaciones_config", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  whatsapp_activo: boolean("whatsapp_activo").notNull().default(true),
  jornadas_12h_activo: boolean("jornadas_12h_activo").notNull().default(true),
  jornadas_horas_limite: integer("jornadas_horas_limite").notNull().default(12),
  satcom_velocidad_activo: boolean("satcom_velocidad_activo").notNull().default(true),
  combustible_mantenimiento_activo: boolean("combustible_mantenimiento_activo").notNull().default(true),
  documentacion_activo: boolean("documentacion_activo").notNull().default(true),
  incidentes_activo: boolean("incidentes_activo").notNull().default(true),
  notificar_empleado_whatsapp: boolean("notificar_empleado_whatsapp").notNull().default(true),
  notificar_empleado_push: boolean("notificar_empleado_push").notNull().default(true),
  notificar_admin_push: boolean("notificar_admin_push").notNull().default(true),
  updated_at: timestamp("updated_at").defaultNow(),
});

export type NotificacionesConfig = typeof notificacionesConfigTable.$inferSelect;
