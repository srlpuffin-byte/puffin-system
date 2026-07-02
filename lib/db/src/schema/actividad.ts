import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const actividadTable = pgTable("actividad", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  tipo: text("tipo").notNull(),
  descripcion: text("descripcion").notNull(),
  usuario_id: integer("usuario_id"),
  usuario_nombre: text("usuario_nombre"),
  entidad_tipo: text("entidad_tipo"),
  entidad_id: integer("entidad_id"),
  entidad_nombre: text("entidad_nombre"),
  fecha: timestamp("fecha").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActividadSchema = createInsertSchema(actividadTable).omit({ id: true, createdAt: true });
export type InsertActividad = z.infer<typeof insertActividadSchema>;
export type Actividad = typeof actividadTable.$inferSelect;
