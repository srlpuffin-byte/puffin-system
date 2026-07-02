import { Router } from "express";
import { db } from "@workspace/db";
import { maquinasTable } from "@workspace/db";
import { eq, and, or, ilike } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { estado, search } = req.query as { estado?: string; search?: string };

  let query = db.select().from(maquinasTable).$dynamic();
  const conditions = [];
  if (estado) conditions.push(eq(maquinasTable.estado, estado));
  if (search) conditions.push(or(
    ilike(maquinasTable.nombre, `%${search}%`),
    ilike(maquinasTable.codigo, `%${search}%`),
    ilike(maquinasTable.tipo, `%${search}%`),
    ilike(maquinasTable.patente, `%${search}%`)
  ));
  if (conditions.length) query = query.where(and(...conditions));

  const maquinas = await query.orderBy(maquinasTable.nombre);
  return res.json(maquinas.map(m => ({ ...m, horometro: Number(m.horometro), kilometros: Number(m.kilometros) })));
});

router.post("/", async (req, res) => {
  const { codigo, nombre, tipo, marca, modelo, anio, patente, dominio, chasis, motor, horometro, kilometros } = req.body;
  if (!nombre || !tipo) return res.status(400).json({ error: "Nombre y tipo son requeridos" });
  const [maquina] = await db.insert(maquinasTable).values({
    codigo, nombre, tipo, marca, modelo, anio, patente, dominio, chasis, motor,
    horometro: horometro?.toString() || "0",
    kilometros: kilometros?.toString() || "0",
    estado: "activa"
  }).returning();
  return res.status(201).json({ ...maquina, horometro: Number(maquina.horometro), kilometros: Number(maquina.kilometros) });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [maquina] = await db.select().from(maquinasTable).where(eq(maquinasTable.id, id)).limit(1);
  if (!maquina) return res.status(404).json({ error: "Maquinaria no encontrada" });
  return res.json({ ...maquina, horometro: Number(maquina.horometro), kilometros: Number(maquina.kilometros) });
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { nombre, estado, horometro, kilometros, proximo_service } = req.body;
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (nombre !== undefined) updateData.nombre = nombre;
  if (estado !== undefined) updateData.estado = estado;
  if (horometro !== undefined) updateData.horometro = horometro.toString();
  if (kilometros !== undefined) updateData.kilometros = kilometros.toString();
  if (proximo_service !== undefined) updateData.proximo_service = proximo_service;

  const [maquina] = await db.update(maquinasTable).set(updateData).where(eq(maquinasTable.id, id)).returning();
  if (!maquina) return res.status(404).json({ error: "Maquinaria no encontrada" });
  return res.json({ ...maquina, horometro: Number(maquina.horometro), kilometros: Number(maquina.kilometros) });
});

export default router;
