import { pgTable, serial, text, integer, numeric, timestamp, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alquileresTable = pgTable("alquileres", {
  id: serial("id").primaryKey(),
  maquina_id: integer("maquina_id").notNull(),
  cliente: text("cliente").notNull(),
  fecha_inicio: date("fecha_inicio").notNull(),
  horometro_inicio: numeric("horometro_inicio", { precision: 10, scale: 1 }).notNull(),
  fecha_fin: date("fecha_fin"),
  horometro_fin: numeric("horometro_fin", { precision: 10, scale: 1 }),
  horas_trabajadas: numeric("horas_trabajadas", { precision: 10, scale: 1 }),
  estado: text("estado").notNull().default("en_curso"), // 'en_curso', 'finalizado'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  maquinaIdx: index("alquiler_maquina_idx").on(table.maquina_id),
}));

export const insertAlquilerSchema = createInsertSchema(alquileresTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAlquiler = z.infer<typeof insertAlquilerSchema>;
export type Alquiler = typeof alquileresTable.$inferSelect;
