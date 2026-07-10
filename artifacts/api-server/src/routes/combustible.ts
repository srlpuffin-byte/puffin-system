import { Router } from "express";
import { db } from "@workspace/db";
import { combustibleTable, empleadosTable, maquinasTable, actividadTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { appendToSheet } from "../services/sheets.js";

const router = Router();

router.get("/", async (req, res) => {
  const { maquina_id, empleado_id } = req.query as Record<string, string>;
  let query = db.select().from(combustibleTable).$dynamic();
  const conditions = [];
  if (maquina_id) conditions.push(eq(combustibleTable.maquina_id, parseInt(maquina_id)));
  if (empleado_id) conditions.push(eq(combustibleTable.empleado_id, parseInt(empleado_id)));
  if (conditions.length) query = query.where(and(...conditions));

  const registros = await query.orderBy(combustibleTable.fecha);
  const enriched = await Promise.all(registros.map(async r => {
    const [empleado] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
      .from(empleadosTable).where(eq(empleadosTable.id, r.empleado_id)).limit(1);
    const [maquina] = await db.select({ nombre: maquinasTable.nombre })
      .from(maquinasTable).where(eq(maquinasTable.id, r.maquina_id)).limit(1);
    return {
      ...r,
      empleado_nombre: empleado ? `${empleado.nombre} ${empleado.apellido}` : "Desconocido",
      maquina_nombre: maquina?.nombre || "Desconocida",
      litros: Number(r.litros),
      precio: r.precio ? Number(r.precio) : null,
      importe: r.importe ? Number(r.importe) : null,
      kilometraje: r.kilometraje ? Number(r.kilometraje) : null,
    };
  }));
  return res.json(enriched.reverse());
});

router.post("/", async (req, res) => {
  const { maquina_id, empleado_id, litros, precio, importe, estacion, kilometraje, ubicacion } = req.body;
  if (!maquina_id || !empleado_id || litros === undefined) {
    return res.status(400).json({ error: "Campos requeridos faltantes" });
  }

  const today = new Date().toISOString().split("T")[0];

  const [registro] = await db.insert(combustibleTable).values({
    maquina_id, empleado_id,
    fecha: today,
    litros: litros.toString(),
    precio: precio?.toString(),
    importe: importe?.toString(),
    estacion, ubicacion,
    kilometraje: kilometraje?.toString(),
  }).returning();

  await db.insert(actividadTable).values({
    tipo: "combustible",
    descripcion: `Carga de combustible: ${litros}L en máquina ID ${maquina_id}`,
    entidad_tipo: "combustible",
    entidad_id: registro.id,
  });

  const [maquina] = await db.select({ nombre: maquinasTable.nombre }).from(maquinasTable).where(eq(maquinasTable.id, maquina_id)).limit(1);
  const [empleado] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido }).from(empleadosTable).where(eq(empleadosTable.id, empleado_id)).limit(1);

  // Async append to Google Sheets
  appendToSheet("Combustible", [
    today,
    new Date().toLocaleTimeString("es-AR"),
    maquina?.nombre || maquina_id,
    `${empleado?.nombre} ${empleado?.apellido}`,
    litros,
    precio || "",
    importe || "",
    estacion || "",
    ubicacion || "",
    kilometraje || "",
  ]);

  return res.status(201).json({ ...registro, litros: Number(registro.litros) });
});

export default router;
