import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const proyectosTable = pgTable("proyectos", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  lugar: text("lugar").notNull(),
  hectareas: numeric("hectareas", { precision: 10, scale: 2 }).notNull(),
  precio_hectarea: numeric("precio_hectarea", { precision: 10, scale: 2 }).notNull(),
  ganancia_estimada: numeric("ganancia_estimada", { precision: 12, scale: 2 }),
  empleados_asignados: integer("empleados_asignados").array(),
  maquinas_asignadas: integer("maquinas_asignadas").array(),
  estado: text("estado").notNull().default("activo"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProyectoSchema = createInsertSchema(proyectosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProyecto = z.infer<typeof insertProyectoSchema>;
export type Proyecto = typeof proyectosTable.$inferSelect;
