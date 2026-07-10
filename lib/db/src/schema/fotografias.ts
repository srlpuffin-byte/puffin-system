import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fotografiasTable = pgTable("fotografias", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  entidad_tipo: text("entidad_tipo").notNull(), // ej: 'jornada_inicio', 'jornada_fin', 'incidente', etc.
  entidad_id: integer("entidad_id").notNull(),
  url: text("url").notNull(),
  descripcion: text("descripcion"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFotografiaSchema = createInsertSchema(fotografiasTable).omit({ id: true, createdAt: true });
export type InsertFotografia = z.infer<typeof insertFotografiaSchema>;
export type Fotografia = typeof fotografiasTable.$inferSelect;
