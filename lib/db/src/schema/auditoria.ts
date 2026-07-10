import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditoriaTable = pgTable("auditoria", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  usuario_id: integer("usuario_id"), // Puede ser null si fue acción del sistema
  accion: text("accion").notNull(), // Ej: "CREACION", "MODIFICACION", "ELIMINACION_LOGICA", "LOGIN"
  entidad: text("entidad").notNull(), // Ej: "maquinas", "jornadas", "usuarios"
  entidad_id: integer("entidad_id"),
  valor_anterior: jsonb("valor_anterior"),
  valor_nuevo: jsonb("valor_nuevo"),
  ip: text("ip"),
  dispositivo: text("dispositivo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditoriaSchema = createInsertSchema(auditoriaTable).omit({ id: true, createdAt: true });
export type InsertAuditoria = z.infer<typeof insertAuditoriaSchema>;
export type Auditoria = typeof auditoriaTable.$inferSelect;
