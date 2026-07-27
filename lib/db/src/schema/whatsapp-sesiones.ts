import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const whatsappSesionesTable = pgTable("whatsapp_sesiones", {
  phone: text("phone").primaryKey(),
  messages: jsonb("messages").notNull().default([]),
  estado: text("estado").notNull().default("idle"),
  datos_pendientes: jsonb("datos_pendientes"),
  updated_at: timestamp("updated_at").defaultNow(),
});

export type WhatsappSesion = typeof whatsappSesionesTable.$inferSelect;
