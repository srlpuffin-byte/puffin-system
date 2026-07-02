import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const incidentesTable = pgTable("incidentes", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  empleado_id: integer("empleado_id"),
  maquina_id: integer("maquina_id"),
  tipo: text("tipo").notNull().default("otro"),
  descripcion: text("descripcion").notNull(),
  foto_url: text("foto_url"),
  fecha: date("fecha").notNull(),
  estado: text("estado").notNull().default("activo"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertIncidenteSchema = createInsertSchema(incidentesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIncidente = z.infer<typeof insertIncidenteSchema>;
export type Incidente = typeof incidentesTable.$inferSelect;
