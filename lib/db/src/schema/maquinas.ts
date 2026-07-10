import { pgTable, serial, text, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const maquinasTable = pgTable("maquinas", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().default(1),
  codigo: text("codigo"),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(),
  marca: text("marca"),
  modelo: text("modelo"),
  anio: integer("anio"),
  patente: text("patente"),
  dominio: text("dominio"),
  chasis: text("chasis"),
  motor: text("motor"),
  horometro: numeric("horometro", { precision: 10, scale: 1 }).default("0"),
  kilometros: numeric("kilometros", { precision: 10, scale: 1 }).default("0"),
  estado: text("estado").notNull().default("activa"),
  ultimo_service: text("ultimo_service"),
  proximo_service: text("proximo_service"),
  filtro_tipo: text("filtro_tipo"),
  filtro_codigo: text("filtro_codigo"),
  filtro_fecha_cambio: date("filtro_fecha_cambio"),
  filtro_proximo_cambio: date("filtro_proximo_cambio"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMaquinaSchema = createInsertSchema(maquinasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMaquina = z.infer<typeof insertMaquinaSchema>;
export type Maquina = typeof maquinasTable.$inferSelect;

