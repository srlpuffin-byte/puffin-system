import { pgTable, serial, text, integer, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentosTable = pgTable("documentos", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  tipo: text("tipo").notNull(),
  descripcion: text("descripcion"),
  entidad_tipo: text("entidad_tipo"),
  entidad_id: integer("entidad_id"),
  fecha_vencimiento: date("fecha_vencimiento").notNull(),
  archivo_url: text("archivo_url"),
  estado_doc: text("estado_doc").notNull().default("vigente"),
  activo: boolean("activo").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDocumentoSchema = createInsertSchema(documentosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumento = z.infer<typeof insertDocumentoSchema>;
export type Documento = typeof documentosTable.$inferSelect;
