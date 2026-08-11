import { pgTable, serial, text, integer, numeric, timestamp, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const combustibleTable = pgTable("combustible", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  empleado_id: integer("empleado_id").notNull(),
  maquina_id: integer("maquina_id").notNull(),
  fecha: date("fecha").notNull(),
  litros: numeric("litros", { precision: 10, scale: 2 }).notNull(),
  precio: numeric("precio", { precision: 10, scale: 2 }),
  importe: numeric("importe", { precision: 10, scale: 2 }),
  estacion: text("estacion"),
  ubicacion: text("ubicacion"),
  kilometraje: numeric("kilometraje", { precision: 10, scale: 1 }),
  foto_ticket: text("foto_ticket"),
  foto_surtidor: text("foto_surtidor"),
  estado: text("estado").notNull().default("activo"), // activo, anulado
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  fechaIdx: index("combustible_fecha_idx").on(table.fecha),
  empleadoIdx: index("combustible_empleado_idx").on(table.empleado_id),
  maquinaIdx: index("combustible_maquina_idx").on(table.maquina_id),
}));

export const insertCombustibleSchema = createInsertSchema(combustibleTable).omit({ id: true, createdAt: true });
export type InsertCombustible = z.infer<typeof insertCombustibleSchema>;
export type Combustible = typeof combustibleTable.$inferSelect;
