import { pgTable, serial, text, integer, numeric, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const egresosTable = pgTable("egresos", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  fecha: date("fecha").notNull(),
  categoria: text("categoria").notNull(),
  concepto: text("concepto").notNull(),
  proveedor: text("proveedor"),
  monto: numeric("monto", { precision: 12, scale: 2 }).notNull(),
  metodo_pago: text("metodo_pago"),
  comprobante: boolean("comprobante").default(false),
  centro_costos: text("centro_costos"),
  observaciones: text("observaciones"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEgresoSchema = createInsertSchema(egresosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEgreso = z.infer<typeof insertEgresoSchema>;
export type Egreso = typeof egresosTable.$inferSelect;
