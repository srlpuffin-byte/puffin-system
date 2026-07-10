import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const empleadosTable = pgTable("empleados", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  nombre: text("nombre").notNull(),
  apellido: text("apellido").notNull(),
  dni: text("dni").notNull(),
  telefono: text("telefono"),
  contacto_familiar_nombre: text("contacto_familiar_nombre"),
  contacto_familiar_telefono: text("contacto_familiar_telefono"),
  cargo: text("cargo"),
  estado: text("estado").notNull().default("activo"),
  fecha_ingreso: date("fecha_ingreso"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmpleadoSchema = createInsertSchema(empleadosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmpleado = z.infer<typeof insertEmpleadoSchema>;
export type Empleado = typeof empleadosTable.$inferSelect;
