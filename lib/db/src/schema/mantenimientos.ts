import { pgTable, serial, text, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mantenimientosTable = pgTable("mantenimientos", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  maquina_id: integer("maquina_id").notNull(),
  fecha: date("fecha").notNull(),
  horas: numeric("horas", { precision: 10, scale: 1 }),
  tipo: text("tipo").notNull(),
  descripcion: text("descripcion"),
  proximo_service: text("proximo_service"),
  estado: text("estado").notNull().default("realizado"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMantenimientoSchema = createInsertSchema(mantenimientosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMantenimiento = z.infer<typeof insertMantenimientoSchema>;
export type Mantenimiento = typeof mantenimientosTable.$inferSelect;
