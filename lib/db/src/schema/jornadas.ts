import { pgTable, serial, text, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jornadasTable = pgTable("jornadas", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  empleado_id: integer("empleado_id").notNull(),
  maquina_id: integer("maquina_id").notNull(),
  fecha: date("fecha").notNull(),
  ubicacion: text("ubicacion"),
  tipo_trabajo: text("tipo_trabajo"),
  hora_inicio: text("hora_inicio"),
  hora_fin: text("hora_fin"),
  km_inicio: numeric("km_inicio", { precision: 10, scale: 1 }),
  km_fin: numeric("km_fin", { precision: 10, scale: 1 }),
  horometro_inicio: numeric("horometro_inicio", { precision: 10, scale: 1 }),
  horometro_fin: numeric("horometro_fin", { precision: 10, scale: 1 }),
  checklist_previo: text("checklist_previo"), // JSON stringified for checklist items
  checklist_ok: text("checklist_ok"), // boolean flag for quick filtering if everything was OK
  estado_equipo_inicio: text("estado_equipo_inicio"), // apto, apto_observaciones, no_apto
  estado_equipo_fin: text("estado_equipo_fin"), // sin_novedades, con_observaciones, requiere_mantenimiento, fuera_de_servicio
  foto_tablero_inicio: text("foto_tablero_inicio"),
  foto_tablero_fin: text("foto_tablero_fin"),
  observaciones: text("observaciones"),
  problemas: text("problemas"),
  estado: text("estado").notNull().default("en_curso"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertJornadaSchema = createInsertSchema(jornadasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJornada = z.infer<typeof insertJornadaSchema>;
export type Jornada = typeof jornadasTable.$inferSelect;
