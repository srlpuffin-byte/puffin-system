import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usuariosTable = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  nombre: text("nombre").notNull(),
  apellido: text("apellido").notNull(),
  usuario: text("usuario").notNull().unique(),
  pin_hash: text("pin_hash").notNull(),
  rol: text("rol").notNull().default("empleado"),
  activo: boolean("activo").default(true),
  intentos_fallidos: integer("intentos_fallidos").default(0),
  bloqueado: boolean("bloqueado").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUsuarioSchema = createInsertSchema(usuariosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuariosTable.$inferSelect;
