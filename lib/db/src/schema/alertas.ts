import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertasTable = pgTable("alertas", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  tipo: text("tipo").notNull(),
  prioridad: text("prioridad").notNull().default("azul"),
  descripcion: text("descripcion").notNull(),
  estado: text("estado").notNull().default("activa"),
  entidad_tipo: text("entidad_tipo"),
  entidad_id: integer("entidad_id"),
  entidad_nombre: text("entidad_nombre"),
  fecha: timestamp("fecha").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAlertaSchema = createInsertSchema(alertasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAlerta = z.infer<typeof insertAlertaSchema>;
export type Alerta = typeof alertasTable.$inferSelect;
