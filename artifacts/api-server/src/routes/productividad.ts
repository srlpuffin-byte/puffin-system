import { Router } from "express";
import { db } from "@workspace/db";
import {
  empleadosTable,
  maquinasTable,
  jornadasTable,
  incidentesTable,
  alertasTable,
  combustibleTable,
} from "@workspace/db";
import { gte, eq } from "drizzle-orm";

const router = Router();

function getPeriodStart(periodo: string): string {
  const now = new Date();
  let d: Date;
  switch (periodo) {
    case "semana":
      d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      break;
    case "trimestre":
      d = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      break;
    case "mes":
    default:
      d = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return d.toISOString().split("T")[0];
}

router.get("/", async (req, res) => {
  try {
    const periodo = String(req.query.periodo || "mes");
    const periodStart = getPeriodStart(periodo);

    const [empleados, maquinas, jornadas, incidentes, alertas, combustible] = await Promise.all([
      db.select().from(empleadosTable).where(eq(empleadosTable.empresa_id, 1)),
      db.select().from(maquinasTable).where(eq(maquinasTable.empresa_id, 1)),
      db.select().from(jornadasTable).where(gte(jornadasTable.fecha, periodStart)),
      db.select().from(incidentesTable).where(gte(incidentesTable.fecha, periodStart)),
      db.select().from(alertasTable),
      db.select().from(combustibleTable).where(gte(combustibleTable.fecha, periodStart)),
    ]);

    const operariosMetrics = empleados
      .filter((e) => e.estado === "activo")
      .map((emp) => {
        const empJornadas = jornadas.filter((j) => j.empleado_id === emp.id);
        const empIncidentes = incidentes.filter((i) => i.empleado_id === emp.id);
        const empAlertas = alertas.filter(
          (a) => a.entidad_tipo === "empleado" && a.entidad_id === emp.id
        );

        const horas = empJornadas
          .filter((j) => j.horometro_inicio != null && j.horometro_fin != null)
          .reduce(
            (acc, j) => acc + (Number(j.horometro_fin) - Number(j.horometro_inicio)),
            0
          );

        let score = 100;
        score -= empIncidentes.length * 10;
        score -= empAlertas.filter((a) => a.prioridad === "roja").length * 8;
        score -= empAlertas.filter((a) => a.prioridad === "amarilla").length * 3;
        score = Math.max(0, Math.min(100, score));

        let calificacion = "Excelente";
        if (score < 60) calificacion = "Requiere seguimiento";
        else if (score < 75) calificacion = "Regular";
        else if (score < 90) calificacion = "Bueno";

        return {
          id: emp.id,
          nombre: `${emp.nombre} ${emp.apellido}`,
          cargo: emp.cargo || "",
          estado: emp.estado,
          jornadas: empJornadas.length,
          horas: Math.round(horas * 10) / 10,
          incidentes: empIncidentes.length,
          alertas: empAlertas.length,
          score,
          calificacion,
        };
      })
      .sort((a, b) => b.score - a.score);

    const maquinasMetrics = maquinas.map((maq) => {
      const maqJornadas = jornadas.filter((j) => j.maquina_id === maq.id);
      const maqCombustible = combustible.filter((c) => c.maquina_id === maq.id);
      const maqIncidentes = incidentes.filter((i) => i.maquina_id === maq.id);

      const horas = maqJornadas
        .filter((j) => j.horometro_inicio != null && j.horometro_fin != null)
        .reduce(
          (acc, j) => acc + (Number(j.horometro_fin) - Number(j.horometro_inicio)),
          0
        );

      const consumo = maqCombustible.reduce((acc, c) => acc + Number(c.litros), 0);
      const costo = maqCombustible.reduce((acc, c) => acc + Number(c.importe || 0), 0);

      let disponibilidad = 0;
      if (maq.estado === "activa") disponibilidad = 100;
      else if (maq.estado === "mantenimiento") disponibilidad = 50;

      return {
        id: maq.id,
        nombre: maq.nombre,
        tipo: maq.tipo,
        estado: maq.estado,
        horas: Math.round(horas * 10) / 10,
        kilometros: Number(maq.kilometros || 0),
        consumo: Math.round(consumo * 10) / 10,
        costo: Math.round(costo * 100) / 100,
        fallas: maqIncidentes.length,
        disponibilidad,
      };
    });

    return res.json({ periodo, operarios: operariosMetrics, maquinas: maquinasMetrics });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al calcular productividad" });
  }
});

export default router;
