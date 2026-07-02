import { Router } from "express";
import { db } from "@workspace/db";
import {
  empleadosTable,
  maquinasTable,
  alertasTable,
  documentosTable,
  combustibleTable,
  jornadasTable,
  incidentesTable,
} from "@workspace/db";
import { eq, gte, lte, and, desc } from "drizzle-orm";

const router = Router();

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function mesActual(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
}

router.post("/consulta", async (req, res) => {
  try {
    const { pregunta } = req.body;
    if (!pregunta) return res.status(400).json({ error: "pregunta es requerida" });

    const p = pregunta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    let respuesta = "";

    if ((p.includes("alerta") || p.includes("alertas")) && (p.includes("empleado") || p.includes("operario"))) {
      const alertas = await db
        .select()
        .from(alertasTable)
        .where(and(eq(alertasTable.entidad_tipo, "empleado"), eq(alertasTable.empresa_id, 1)));
      const conteo: Record<number, { nombre: string; count: number }> = {};
      for (const a of alertas) {
        if (!a.entidad_id) continue;
        if (!conteo[a.entidad_id]) {
          conteo[a.entidad_id] = { nombre: a.entidad_nombre || `Empleado ${a.entidad_id}`, count: 0 };
        }
        conteo[a.entidad_id].count++;
      }
      const sorted = Object.values(conteo).sort((a, b) => b.count - a.count);
      if (sorted.length === 0) {
        respuesta = "No hay alertas registradas para operarios en el sistema.";
      } else {
        const top = sorted[0];
        respuesta = `El operario con más alertas es ${top.nombre} con ${top.count} alerta${top.count !== 1 ? "s" : ""}.`;
        if (sorted.length > 1) {
          respuesta += ` Le sigue ${sorted[1].nombre} con ${sorted[1].count} alertas.`;
        }
      }
    } else if ((p.includes("combustible") || p.includes("consume") || p.includes("consumio") || p.includes("consumio")) && p.includes("maquina")) {
      const combData = await db
        .select()
        .from(combustibleTable)
        .where(and(eq(combustibleTable.empresa_id, 1), gte(combustibleTable.fecha, mesActual())));
      const maquinas = await db.select().from(maquinasTable).where(eq(maquinasTable.empresa_id, 1));
      const conteo: Record<number, { nombre: string; litros: number }> = {};
      for (const c of combData) {
        if (!conteo[c.maquina_id]) {
          const maq = maquinas.find((m) => m.id === c.maquina_id);
          conteo[c.maquina_id] = { nombre: maq?.nombre || `Máquina ${c.maquina_id}`, litros: 0 };
        }
        conteo[c.maquina_id].litros += Number(c.litros);
      }
      const sorted = Object.values(conteo).sort((a, b) => b.litros - a.litros);
      if (sorted.length === 0) {
        respuesta = "No hay registros de combustible este mes.";
      } else {
        const top = sorted[0];
        respuesta = `Este mes la máquina que más combustible consumió es ${top.nombre} con ${top.litros.toFixed(1)} litros.`;
      }
    } else if (p.includes("vencimiento") || p.includes("vence") || p.includes("proximos") || p.includes("prox")) {
      const docs = await db
        .select()
        .from(documentosTable)
        .where(and(
          eq(documentosTable.empresa_id, 1),
          gte(documentosTable.fecha_vencimiento, today()),
          lte(documentosTable.fecha_vencimiento, addDays(30))
        ))
        .orderBy(documentosTable.fecha_vencimiento);
      if (docs.length === 0) {
        respuesta = "No hay documentos próximos a vencer en los próximos 30 días.";
      } else {
        respuesta = `Tenés ${docs.length} documento${docs.length !== 1 ? "s" : ""} próximos a vencer en los próximos 30 días:\n`;
        docs.slice(0, 5).forEach((d) => {
          const dias = Math.ceil((new Date(d.fecha_vencimiento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          respuesta += `• ${d.tipo} — ${d.descripcion || "Sin descripción"} (vence en ${dias} días)\n`;
        });
        if (docs.length > 5) respuesta += `...y ${docs.length - 5} más.`;
      }
    } else if ((p.includes("detenida") || p.includes("detenido") || p.includes("parada") || p.includes("inactiva")) && p.includes("maquina")) {
      const maquinas = await db
        .select()
        .from(maquinasTable)
        .where(and(eq(maquinasTable.empresa_id, 1), eq(maquinasTable.estado, "detenida")));
      if (maquinas.length === 0) {
        respuesta = "No hay máquinas detenidas actualmente.";
      } else {
        respuesta = `Actualmente hay ${maquinas.length} máquina${maquinas.length !== 1 ? "s" : ""} detenida${maquinas.length !== 1 ? "s" : ""}: ${maquinas.map((m) => m.nombre).join(", ")}.`;
      }
    } else if (p.includes("horas") && (p.includes("empleado") || p.includes("operario") || p.includes("trabaj"))) {
      const jornadas = await db
        .select()
        .from(jornadasTable)
        .where(and(eq(jornadasTable.empresa_id, 1), gte(jornadasTable.fecha, mesActual())));
      const empleados = await db.select().from(empleadosTable).where(eq(empleadosTable.empresa_id, 1));
      const conteo: Record<number, { nombre: string; horas: number }> = {};
      for (const j of jornadas) {
        if (!j.horometro_inicio || !j.horometro_fin) continue;
        const horas = Number(j.horometro_fin) - Number(j.horometro_inicio);
        if (!conteo[j.empleado_id]) {
          const emp = empleados.find((e) => e.id === j.empleado_id);
          conteo[j.empleado_id] = {
            nombre: emp ? `${emp.nombre} ${emp.apellido}` : `Empleado ${j.empleado_id}`,
            horas: 0,
          };
        }
        conteo[j.empleado_id].horas += horas;
      }
      const sorted = Object.values(conteo).sort((a, b) => b.horas - a.horas);
      if (sorted.length === 0) {
        respuesta = "No hay registros de horas trabajadas este mes.";
      } else {
        const top = sorted[0];
        respuesta = `Este mes el operario con más horas trabajadas es ${top.nombre} con ${top.horas.toFixed(1)} horas de horómetro.`;
      }
    } else if (p.includes("incidente") || p.includes("accidente") || p.includes("rotura")) {
      const incidentes = await db
        .select()
        .from(incidentesTable)
        .where(and(eq(incidentesTable.empresa_id, 1), gte(incidentesTable.fecha, mesActual())))
        .orderBy(desc(incidentesTable.fecha));
      if (incidentes.length === 0) {
        respuesta = "No hay incidentes registrados este mes.";
      } else {
        respuesta = `Este mes se registraron ${incidentes.length} incidente${incidentes.length !== 1 ? "s" : ""}.`;
      }
    } else if (p.includes("alerta") || p.includes("alertas")) {
      const alertas = await db
        .select()
        .from(alertasTable)
        .where(and(eq(alertasTable.empresa_id, 1), eq(alertasTable.estado, "activa")));
      const rojas = alertas.filter((a) => a.prioridad === "roja").length;
      const amarillas = alertas.filter((a) => a.prioridad === "amarilla").length;
      respuesta = `Actualmente hay ${alertas.length} alerta${alertas.length !== 1 ? "s" : ""} activas: ${rojas} roja${rojas !== 1 ? "s" : ""} y ${amarillas} amarilla${amarillas !== 1 ? "s" : ""}.`;
    } else if (p.includes("maquina") || p.includes("maquinas") || p.includes("flota")) {
      const maquinas = await db.select().from(maquinasTable).where(eq(maquinasTable.empresa_id, 1));
      const activas = maquinas.filter((m) => m.estado === "activa").length;
      const detenidas = maquinas.filter((m) => m.estado === "detenida").length;
      const mantenimiento = maquinas.filter((m) => m.estado === "mantenimiento").length;
      respuesta = `La flota tiene ${maquinas.length} máquinas en total: ${activas} activas, ${detenidas} detenidas y ${mantenimiento} en mantenimiento.`;
    } else {
      respuesta = "Puedo responder consultas sobre: alertas de operarios, consumo de combustible por máquina, vencimientos de documentos, horas trabajadas, máquinas detenidas, incidentes y estado de la flota. ¿Qué querés saber?";
    }

    return res.json({ respuesta, pregunta });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al procesar consulta" });
  }
});

export default router;
