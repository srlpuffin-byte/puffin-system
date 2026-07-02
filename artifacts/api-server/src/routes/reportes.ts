import { Router } from "express";
import { db } from "@workspace/db";
import {
  maquinasTable,
  empleadosTable,
  jornadasTable,
  combustibleTable,
  mantenimientosTable,
  incidentesTable,
} from "@workspace/db";
import { eq, sql, gte, lte, and } from "drizzle-orm";

const router = Router();

router.get("/resumen", async (req, res) => {
  const { periodo = "mes" } = req.query as { periodo?: string };
  const now = new Date();

  let fechaDesde: string;
  if (periodo === "semana") {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    fechaDesde = start.toISOString().split("T")[0];
  } else if (periodo === "trimestre") {
    const start = new Date(now);
    start.setMonth(now.getMonth() - 3);
    fechaDesde = start.toISOString().split("T")[0];
  } else {
    fechaDesde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  }

  const maquinas = await db.select().from(maquinasTable);
  const jornadas = await db.select().from(jornadasTable).where(
    and(gte(jornadasTable.fecha, fechaDesde), eq(jornadasTable.estado, "finalizada"))
  );
  const combustible = await db.select().from(combustibleTable).where(gte(combustibleTable.fecha, fechaDesde));
  const mantenimientos = await db.select().from(mantenimientosTable).where(gte(mantenimientosTable.fecha, fechaDesde));

  const maquinaria = maquinas.map(m => {
    const jornadasMaq = jornadas.filter(j => j.maquina_id === m.id);
    const horas = jornadasMaq.reduce((acc, j) => {
      if (j.horometro_inicio && j.horometro_fin) return acc + (Number(j.horometro_fin) - Number(j.horometro_inicio));
      return acc;
    }, 0);
    const kmTotal = jornadasMaq.reduce((acc, j) => {
      if (j.km_inicio && j.km_fin) return acc + (Number(j.km_fin) - Number(j.km_inicio));
      return acc;
    }, 0);
    const consumo = combustible.filter(c => c.maquina_id === m.id).reduce((acc, c) => acc + Number(c.litros), 0);
    return {
      id: m.id,
      nombre: m.nombre,
      horas: Math.round(horas * 10) / 10,
      kilometros: Math.round(kmTotal * 10) / 10,
      consumo: Math.round(consumo * 10) / 10,
      disponibilidad: m.estado === "activa" ? 100 : 0,
    };
  });

  const empleados = await db.select().from(empleadosTable);
  const incidentes = await db.select().from(incidentesTable).where(gte(incidentesTable.fecha, fechaDesde));

  const operarios = empleados.map(e => {
    const jornadasEmp = jornadas.filter(j => j.empleado_id === e.id);
    const horas = jornadasEmp.reduce((acc, j) => {
      if (j.horometro_inicio && j.horometro_fin) return acc + (Number(j.horometro_fin) - Number(j.horometro_inicio));
      return acc;
    }, 0);
    const incidentesEmp = incidentes.filter(i => i.empleado_id === e.id).length;
    const puntaje = Math.max(0, 100 - incidentesEmp * 10);
    return {
      id: e.id,
      nombre: `${e.nombre} ${e.apellido}`,
      horas: Math.round(horas * 10) / 10,
      jornadas: jornadasEmp.length,
      incidentes: incidentesEmp,
      puntaje,
    };
  });

  const combustible_total = combustible.reduce((acc, c) => acc + Number(c.litros), 0);
  const costo_total = combustible.reduce((acc, c) => acc + Number(c.importe || 0), 0);

  return res.json({
    periodo,
    maquinaria,
    operarios,
    combustible_total: Math.round(combustible_total * 10) / 10,
    costo_total: Math.round(costo_total * 100) / 100,
    mantenimientos: mantenimientos.length,
  });
});

export default router;
