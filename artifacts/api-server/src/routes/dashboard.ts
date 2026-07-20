import { Router } from "express";
import { db } from "@workspace/db";
import {
  maquinasTable,
  empleadosTable,
  alertasTable,
  combustibleTable,
  jornadasTable,
  mantenimientosTable,
  documentosTable,
} from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { getEmpleadoIdForUser } from "../lib/auth-helpers";
import { actividadTable } from "@workspace/db";

const router = Router();

router.get("/update-actividades-temp", async (req, res) => {
  const actividades = await db.select().from(actividadTable);
  const maquinas = await db.select().from(maquinasTable);
  const maquinaMap = new Map(maquinas.map(m => [m.id, m.nombre]));

  let count = 0;
  for (const act of actividades) {
    const desc = act.descripcion || "";
    if (desc.includes("en máquina ID ")) {
      const parts = desc.split("en máquina ID ");
      const idStr = parts[1].split(" ")[0];
      const id = parseInt(idStr);
      if (!isNaN(id)) {
        const nombre = maquinaMap.get(id);
        if (nombre) {
          const newDesc = desc.replace(`en máquina ID ${id}`, `en la máquina ${nombre}`);
          await db.update(actividadTable).set({ descripcion: newDesc }).where(eq(actividadTable.id, act.id));
          count++;
        }
      }
    }
  }
  return res.json({ updated: count });
});

router.get("/resumen", async (req, res) => {
  const [maquinasActivas] = await db
    .select({ count: sql<number>`count(*)` })
    .from(maquinasTable)
    .where(and(eq(maquinasTable.estado, "activa"), sql`(categoria IS NULL OR categoria != 'inventario')`));

  const [maquinasDetenidas] = await db
    .select({ count: sql<number>`count(*)` })
    .from(maquinasTable)
    .where(and(eq(maquinasTable.estado, "detenida"), sql`(categoria IS NULL OR categoria != 'inventario')`));

  const [maquinasMantenimiento] = await db
    .select({ count: sql<number>`count(*)` })
    .from(maquinasTable)
    .where(and(eq(maquinasTable.estado, "mantenimiento"), sql`(categoria IS NULL OR categoria != 'inventario')`));

  const [inventarioActivo] = await db
    .select({ count: sql<number>`count(*)` })
    .from(maquinasTable)
    .where(and(eq(maquinasTable.categoria, "inventario"), eq(maquinasTable.estado, "activa")));

  const [inventarioTotal] = await db
    .select({ count: sql<number>`count(*)` })
    .from(maquinasTable)
    .where(eq(maquinasTable.categoria, "inventario"));

  const [empleadosActivos] = await db
    .select({ count: sql<number>`count(*)` })
    .from(empleadosTable)
    .where(eq(empleadosTable.estado, "activo"));

  const [alertasActivas] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertasTable)
    .where(eq(alertasTable.estado, "activa"));

  const [alertasRojas] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertasTable)
    .where(and(eq(alertasTable.estado, "activa"), eq(alertasTable.prioridad, "roja")));

  const [alertasAmarillas] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertasTable)
    .where(and(eq(alertasTable.estado, "activa"), eq(alertasTable.prioridad, "amarilla")));

  const isEmpleado = req.user?.rol?.toLowerCase() === "empleado";
  let userEmpleadoId = -1;
  if (isEmpleado && req.user) {
    userEmpleadoId = await getEmpleadoIdForUser(req.user.id);
  }

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

  const [combustibleMes] = await db
    .select({ total: sql<number>`coalesce(sum(litros::numeric), 0)` })
    .from(combustibleTable)
    .where(
      isEmpleado 
      ? and(gte(combustibleTable.fecha, firstDayOfMonth), eq(combustibleTable.empleado_id, userEmpleadoId))
      : gte(combustibleTable.fecha, firstDayOfMonth)
    );

  const jornadasMes = await db
    .select({ horometro_inicio: jornadasTable.horometro_inicio, horometro_fin: jornadasTable.horometro_fin })
    .from(jornadasTable)
    .where(
      isEmpleado
      ? and(gte(jornadasTable.fecha, firstDayOfMonth), eq(jornadasTable.estado, "finalizada"), eq(jornadasTable.empleado_id, userEmpleadoId))
      : and(gte(jornadasTable.fecha, firstDayOfMonth), eq(jornadasTable.estado, "finalizada"))
    );

  const horasMes = jornadasMes.reduce((acc, j) => {
    if (j.horometro_inicio && j.horometro_fin) {
      return acc + (Number(j.horometro_fin) - Number(j.horometro_inicio));
    }
    return acc;
  }, 0);

  const [mantenimientosMes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mantenimientosTable)
    .where(gte(mantenimientosTable.fecha, firstDayOfMonth));

  const totalMaquinas = Number(maquinasActivas.count) + Number(maquinasDetenidas.count) + Number(maquinasMantenimiento.count);
  const disponibilidad = totalMaquinas > 0
    ? Math.round((Number(maquinasActivas.count) / totalMaquinas) * 100)
    : 0;

  const docsQuery = db.select().from(documentosTable);
  if (isEmpleado) {
    docsQuery.where(and(eq(documentosTable.entidad_tipo, "empleado"), eq(documentosTable.entidad_id, userEmpleadoId)));
  }
  const docs = await docsQuery;
  const proximos_vencimientos = docs
    .map(d => {
      const venc = new Date(d.fecha_vencimiento);
      const diff = Math.ceil((venc.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      let prioridad = "azul";
      if (diff < 0) prioridad = "roja";
      else if (diff <= 15) prioridad = "amarilla";
      return { tipo: d.tipo, descripcion: d.descripcion || d.tipo, fecha_vencimiento: d.fecha_vencimiento, dias_restantes: diff, prioridad };
    })
    .filter(d => d.dias_restantes <= 60)
    .sort((a, b) => a.dias_restantes - b.dias_restantes)
    .slice(0, 5);

  const maquinas = await db
    .select()
    .from(maquinasTable)
    .where(sql`(categoria IS NULL OR categoria != 'inventario')`)
    .limit(10);
  const maquinas_resumen = maquinas.map(m => ({
    id: m.id,
    nombre: m.nombre,
    tipo: m.tipo,
    estado: m.estado,
    horometro: Number(m.horometro),
    kilometros: Number(m.kilometros),
  }));

  return res.json({
    maquinas_activas: Number(maquinasActivas.count),
    maquinas_detenidas: Number(maquinasDetenidas.count),
    maquinas_mantenimiento: Number(maquinasMantenimiento.count),
    inventario_activo: Number(inventarioActivo.count),
    inventario_total: Number(inventarioTotal.count),
    empleados_activos: Number(empleadosActivos.count),
    alertas_activas: Number(alertasActivas.count),
    alertas_rojas: Number(alertasRojas.count),
    alertas_amarillas: Number(alertasAmarillas.count),
    litros_mes: Number(combustibleMes.total),
    horas_mes: Math.round(horasMes * 10) / 10,
    mantenimientos_mes: Number(mantenimientosMes.count),
    disponibilidad,
    proximos_vencimientos,
    maquinas_resumen,
  });
});

export default router;
