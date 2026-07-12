import { Router } from "express";
import { db } from "@workspace/db";
import { documentosTable, empleadosTable, maquinasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

function calcEstado(fechaVenc: string): { estado: string; dias_restantes: number } {
  const hoy = new Date();
  const venc = new Date(fechaVenc);
  const diff = Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  let estado = "vigente";
  if (diff < 0) estado = "vencido";
  else if (diff <= 30) estado = "proximo_vencimiento";
  return { estado, dias_restantes: diff };
}

router.get("/", async (req, res) => {
  try {
    const { tipo, entidad_id, entidad_tipo } = req.query as Record<string, string>;
    let query = db.select().from(documentosTable).$dynamic();
    
    const conditions = [];
    if (tipo) conditions.push(eq(documentosTable.tipo, tipo));
    if (entidad_id) conditions.push(eq(documentosTable.entidad_id, parseInt(entidad_id)));
    if (entidad_tipo) conditions.push(eq(documentosTable.entidad_tipo, entidad_tipo));
    if (conditions.length) query = query.where(and(...conditions));

    const docs = await query.orderBy(documentosTable.fecha_vencimiento);

    const enriched = await Promise.all(docs.map(async d => {
      let entidad_nombre: string | null = null;
      if (d.entidad_tipo === "empleado" && d.entidad_id) {
        const [e] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
          .from(empleadosTable).where(eq(empleadosTable.id, d.entidad_id)).limit(1);
        if (e) entidad_nombre = `${e.nombre} ${e.apellido}`;
      } else if (d.entidad_tipo === "maquina" && d.entidad_id) {
        const [m] = await db.select({ nombre: maquinasTable.nombre })
          .from(maquinasTable).where(eq(maquinasTable.id, d.entidad_id)).limit(1);
        if (m) entidad_nombre = m.nombre;
      }
      const { estado, dias_restantes } = calcEstado(d.fecha_vencimiento);
      return { ...d, entidad_nombre, estado, dias_restantes };
    }));

    return res.json(enriched);
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al obtener documentos: " + (err?.message || "Error interno") });
  }
});

router.post("/", async (req, res) => {
  const { tipo, descripcion, entidad_tipo, entidad_id, fecha_vencimiento } = req.body;
  if (!tipo || !fecha_vencimiento) return res.status(400).json({ error: "Tipo y fecha de vencimiento son requeridos" });

  const [doc] = await db.insert(documentosTable).values({
    tipo, descripcion, entidad_tipo, entidad_id, fecha_vencimiento, estado_doc: "vigente"
  }).returning();

  const { estado, dias_restantes } = calcEstado(doc.fecha_vencimiento);
  return res.status(201).json({ ...doc, entidad_nombre: null, estado, dias_restantes });
});

export default router;
