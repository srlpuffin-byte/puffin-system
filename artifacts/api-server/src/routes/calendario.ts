import { Router } from "express";
import { db } from "@workspace/db";
import { documentosTable, mantenimientosTable, maquinasTable, empleadosTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/eventos", async (req, res) => {
  const { mes, anio } = req.query as Record<string, string>;
  const now = new Date();
  const targetMes = mes ? parseInt(mes) : now.getMonth() + 1;
  const targetAnio = anio ? parseInt(anio) : now.getFullYear();

  const eventos: Array<{
    id: number;
    tipo: string;
    titulo: string;
    descripcion: string | null;
    fecha: string;
    prioridad: string;
    entidad_nombre: string | null;
  }> = [];

  const docs = await db.select().from(documentosTable);
  for (const doc of docs) {
    if (!doc.fecha_vencimiento) continue;
    const venc = new Date(doc.fecha_vencimiento);
    if (venc.getMonth() + 1 === targetMes && venc.getFullYear() === targetAnio) {
      const diffDias = Math.ceil((venc.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const prioridad = diffDias < 0 ? "rojo" : diffDias <= 15 ? "amarillo" : "verde";
      
      let entidad_nombre = null;
      if (doc.entidad_tipo === "maquina") {
        const [maq] = await db.select({ nombre: maquinasTable.nombre }).from(maquinasTable).where(eq(maquinasTable.id, doc.entidad_id)).limit(1);
        if (maq) entidad_nombre = maq.nombre;
      } else if (doc.entidad_tipo === "empleado") {
        const [emp] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido }).from(empleadosTable).where(eq(empleadosTable.id, doc.entidad_id)).limit(1);
        if (emp) entidad_nombre = `${emp.nombre} ${emp.apellido}`;
      }

      eventos.push({
        id: doc.id,
        tipo: "vencimiento",
        titulo: `Vencimiento: ${doc.tipo}`,
        descripcion: doc.descripcion,
        fecha: doc.fecha_vencimiento,
        prioridad,
        entidad_nombre,
      });
    }
  }

  const mantenimientos = await db.select().from(mantenimientosTable);
  for (const m of mantenimientos) {
    if (m.proximo_service) {
      const fecha = new Date(m.proximo_service);
      if (fecha.getMonth() + 1 === targetMes && fecha.getFullYear() === targetAnio) {
        const [maq] = await db
          .select({ nombre: maquinasTable.nombre })
          .from(maquinasTable)
          .where(eq(maquinasTable.id, m.maquina_id))
          .limit(1);
        eventos.push({
          id: m.id + 10000,
          tipo: "service",
          titulo: `Service programado`,
          descripcion: m.descripcion,
          fecha: m.proximo_service,
          prioridad: "amarillo",
          entidad_nombre: maq?.nombre || null,
        });
      }
    }
  }

  eventos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  return res.json(eventos);
});

export default router;
