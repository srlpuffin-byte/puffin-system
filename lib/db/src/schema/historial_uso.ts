import { pgTable, serial, text, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const historialUsoTable = pgTable("historial_uso", {
  id: serial("id").primaryKey(),
  maquina_id: integer("maquina_id").notNull(),
  evento: text("evento").notNull(), // 'encendido', 'apagado', 'actualizacion'
  horometro: numeric("horometro", { precision: 10, scale: 1 }).notNull(),
  ubicacion_lat: numeric("ubicacion_lat", { precision: 10, scale: 7 }),
  ubicacion_lng: numeric("ubicacion_lng", { precision: 10, scale: 7 }),
  ubicacion_texto: text("ubicacion_texto"),
  fecha_hora: timestamp("fecha_hora").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  maquinaIdx: index("historial_maquina_idx").on(table.maquina_id),
}));

export const insertHistorialUsoSchema = createInsertSchema(historialUsoTable).omit({ id: true, createdAt: true });
export type InsertHistorialUso = z.infer<typeof insertHistorialUsoSchema>;
export type HistorialUso = typeof historialUsoTable.$inferSelect;
