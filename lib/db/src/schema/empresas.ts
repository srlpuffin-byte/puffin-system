import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const empresasTable = pgTable("empresas", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  logo_url: text("logo_url"),
  activa: boolean("activa").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmpresaSchema = createInsertSchema(empresasTable).omit({ id: true, createdAt: true });
export type InsertEmpresa = z.infer<typeof insertEmpresaSchema>;
export type Empresa = typeof empresasTable.$inferSelect;
