import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const backupsTable = pgTable("backups", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  tipo: text("tipo").notNull(), // "automatico", "manual"
  frecuencia: text("frecuencia"), // "diario", "semanal"
  archivo_url: text("archivo_url").notNull(), // URL en Supabase/Storage
  tamano_bytes: integer("tamano_bytes"),
  creado_por: integer("creado_por"), // null si fue automático
  exitoso: boolean("exitoso").default(true),
  error_mensaje: text("error_mensaje"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBackupSchema = createInsertSchema(backupsTable).omit({ id: true, createdAt: true });
export type InsertBackup = z.infer<typeof insertBackupSchema>;
export type Backup = typeof backupsTable.$inferSelect;
