import { Router } from "express";
import { logger } from "../lib/logger.js";
import { syncAllSheets } from "../services/sync-sheets.js";
import { db } from "@workspace/db";
import { jornadasTable, empleadosTable, maquinasTable, actividadTable, alertasTable, combustibleTable, incidentesTable, proyectosTable, fotografiasTable } from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { appendToSheet } from "../services/sheets.js";
import { sendWhatsAppMessage } from "../services/whatsapp.js";

const router = Router();

async function enrichJornada(j: typeof jornadasTable.$inferSelect) {
  const [empleado] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
    .from(empleadosTable).where(eq(empleadosTable.id, j.empleado_id)).limit(1);
  const [maquina] = await db.select({ nombre: maquinasTable.nombre })
    .from(maquinasTable).where(eq(maquinasTable.id, j.maquina_id)).limit(1);

  const hrInicio = j.horometro_inicio ? Number(j.horometro_inicio) : null;
  const hrFin = j.horometro_fin ? Number(j.horometro_fin) : null;
  const horasDiff = hrInicio !== null && hrFin !== null ? hrFin - hrInicio : null;
  // Si el diff es negativo (datos incorrectos), no mostrar nada
  const horas = horasDiff !== null && horasDiff >= 0 ? Number(horasDiff.toFixed(2)) : null;

  const [proyecto] = await db.select({ lugar: proyectosTable.lugar })
    .from(proyectosTable)
    .where(sql`${j.maquina_id} = ANY(${proyectosTable.maquinas_asignadas})`)
    .limit(1);

  let horasReloj = null;
  if (j.hora_inicio && j.hora_fin) {
    const [hI, mI] = j.hora_inicio.split(':').map(Number);
    const [hF, mF] = j.hora_fin.split(':').map(Number);
    if (!isNaN(hI) && !isNaN(mI) && !isNaN(hF) && !isNaN(mF)) {
      let diff = (hF * 60 + mF) - (hI * 60 + mI);
      if (diff < 0) diff += 24 * 60; // Cruzó la medianoche
      horasReloj = Number((diff / 60).toFixed(2));
    }
  }

  return {
    ...j,
    empleado_nombre: empleado ? `${empleado.nombre} ${empleado.apellido}` : "Desconocido",
    maquina_nombre: maquina?.nombre || "Desconocida",
    maquina_asignada_en: proyecto?.lugar || null,
    km_inicio: j.km_inicio ? Number(j.km_inicio) : null,
    km_fin: j.km_fin ? Number(j.km_fin) : null,
    horometro_inicio: hrInicio,
    horometro_fin: hrFin,
    horas_trabajadas: horas,
    horas_reloj: horasReloj,
  };
}

import { getEmpleadoIdForUser } from "../lib/auth-helpers";

router.get("/", async (req, res) => {
  const { empleado_id, maquina_id, estado } = req.query as Record<string, string>;
  let query = db.select().from(jornadasTable).$dynamic();
  const conditions = [];
  
  if (empleado_id) conditions.push(eq(jornadasTable.empleado_id, parseInt(empleado_id)));
  if (maquina_id) conditions.push(eq(jornadasTable.maquina_id, parseInt(maquina_id)));
  if (estado) conditions.push(eq(jornadasTable.estado, estado));

  // Role-Based Access Control: Empleados solo ven sus propias jornadas
  if (req.user?.rol?.toLowerCase() === "empleado") {
    const userEmpleadoId = await getEmpleadoIdForUser(req.user.id);
    conditions.push(eq(jornadasTable.empleado_id, userEmpleadoId));
  }

  if (conditions.length) query = query.where(and(...conditions));

  const jornadas = await query.orderBy(desc(jornadasTable.fecha), desc(jornadasTable.id)).limit(300);

  // Bulk-load para evitar N+1 (una query por nombre antes era O(N*2) calls)
  const empIds = [...new Set(jornadas.map(j => j.empleado_id).filter((id): id is number => !!id))];
  const maqIds = [...new Set(jornadas.map(j => j.maquina_id).filter((id): id is number => !!id))];

  const [empleadosList, maquinasList, proyectos, fotografias] = await Promise.all([
    empIds.length > 0
      ? db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
          .from(empleadosTable).where(inArray(empleadosTable.id, empIds))
      : [],
    maqIds.length > 0
      ? db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre, descripcion: maquinasTable.descripcion })
          .from(maquinasTable).where(inArray(maquinasTable.id, maqIds))
      : [],
    db.select({ id: proyectosTable.id, lugar: proyectosTable.lugar, maquinas_asignadas: proyectosTable.maquinas_asignadas }).from(proyectosTable),
    db.select({ id: fotografiasTable.id, entidad_tipo: fotografiasTable.entidad_tipo, entidad_id: fotografiasTable.entidad_id, descripcion: fotografiasTable.descripcion })
      .from(fotografiasTable)
      .where(inArray(fotografiasTable.entidad_tipo, ["empleado", "maquina"]))
  ]);

  const empMap = new Map(empleadosList.map(e => [e.id, `${e.nombre} ${e.apellido}`]));
  const maqMap = new Map(maquinasList.map(m => [m.id, { nombre: m.nombre, descripcion: m.descripcion }]));

  const maquinasProyectoMap = new Map<number, string>();
  proyectos.forEach(p => {
    if (p.maquinas_asignadas && Array.isArray(p.maquinas_asignadas)) {
      p.maquinas_asignadas.forEach((mId: any) => {
        maquinasProyectoMap.set(Number(mId), p.lugar);
      });
    }
  });

  const empFotoMap = new Map<number, string>();
  const maqFotoMap = new Map<number, string>();
  fotografias.forEach(f => {
    const rawUrl = `/api/fotografias/${f.id}/raw`;
    if (f.entidad_tipo === "empleado") {
      const esPerfil = f.descripcion === "Foto de perfil" || f.descripcion?.toLowerCase().includes("perfil");
      if (esPerfil) {
        empFotoMap.set(f.entidad_id, rawUrl);
      } else if (!empFotoMap.has(f.entidad_id)) {
        empFotoMap.set(f.entidad_id, rawUrl);
      }
    } else if (f.entidad_tipo === "maquina" && !maqFotoMap.has(f.entidad_id)) {
      maqFotoMap.set(f.entidad_id, rawUrl);
    }
  });

  const enriched = jornadas.map(j => {
    const hrInicio = j.horometro_inicio ? Number(j.horometro_inicio) : null;
    const hrFin    = j.horometro_fin    ? Number(j.horometro_fin)    : null;
    const horasDiff = hrInicio !== null && hrFin !== null ? hrFin - hrInicio : null;
    const horas = horasDiff !== null && horasDiff >= 0 ? Number(horasDiff.toFixed(2)) : null;
    let horasReloj = null;
    if (j.hora_inicio && j.hora_fin) {
      const [hI, mI] = j.hora_inicio.split(':').map(Number);
      const [hF, mF] = j.hora_fin.split(':').map(Number);
      if (!isNaN(hI) && !isNaN(mI) && !isNaN(hF) && !isNaN(mF)) {
        let diff = (hF * 60 + mF) - (hI * 60 + mI);
        if (diff < 0) diff += 24 * 60;
        horasReloj = Number((diff / 60).toFixed(2));
      }
    }
    const maqInfo = j.maquina_id ? maqMap.get(j.maquina_id) : null;
    return {
      ...j,
      empleado_nombre: j.empleado_id ? (empMap.get(j.empleado_id) ?? "Desconocido") : "Desconocido",
      empleado_foto: j.empleado_id ? (empFotoMap.get(j.empleado_id) || null) : null,
      maquina_nombre:  maqInfo?.nombre ?? "Desconocida",
      maquina_descripcion: maqInfo?.descripcion || null,
      maquina_foto: j.maquina_id ? (maqFotoMap.get(j.maquina_id) || null) : null,
      maquina_asignada_en: j.maquina_id ? (maquinasProyectoMap.get(j.maquina_id) || null) : null,
      km_inicio: j.km_inicio ? Number(j.km_inicio) : null,
      km_fin:    j.km_fin    ? Number(j.km_fin)    : null,
      horometro_inicio: hrInicio,
      horometro_fin:    hrFin,
      horas_trabajadas: horas,
      horas_reloj:      horasReloj,
    };
  });

  return res.json(enriched);
});

// Endpoint para cargar una jornada pasada que no se pudo registrar en el momento
router.post("/manual", async (req, res) => {
  try {
    const { empleado_id, maquina_id, fecha, hora_inicio, hora_fin, horometro_inicio, horometro_fin, horas_trabajadas, horas_reloj, ubicacion, descripcion_trabajo, observaciones } = req.body;

    if (!empleado_id || !maquina_id || !fecha || !hora_inicio || !hora_fin || horometro_inicio == null || horometro_fin == null) {
      return res.status(400).json({ error: "Campos requeridos: empleado, máquina, fecha, hora inicio, hora fin, horómetro" });
    }

    // Validar que la fecha no sea futura ni de más de 7 días atrás
    const fechaJornada = new Date(fecha + "T12:00:00");
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hace7Dias = new Date(hoy);
    hace7Dias.setDate(hace7Dias.getDate() - 7);

    if (fechaJornada >= hoy) {
      return res.status(400).json({ error: "No se puede cargar una jornada para hoy o una fecha futura. Use el flujo normal." });
    }
    if (fechaJornada < hace7Dias) {
      return res.status(400).json({ error: "Solo se pueden cargar jornadas de los últimos 7 días." });
    }

    // Si es empleado, solo puede cargar su propia jornada
    if (req.user?.rol?.toLowerCase() === "empleado") {
      const userEmpleadoId = await getEmpleadoIdForUser(req.user.id);
      if (parseInt(empleado_id) !== userEmpleadoId) {
        return res.status(403).json({ error: "Solo podés cargar tus propias jornadas" });
      }
    }

    const horasCalc = horas_trabajadas || (parseFloat(horometro_fin) - parseFloat(horometro_inicio));

    const [jornada] = await db.insert(jornadasTable).values({
      empleado_id: parseInt(empleado_id),
      maquina_id: parseInt(maquina_id),
      fecha,
      hora_inicio,
      hora_fin,
      horometro_inicio: horometro_inicio.toString(),
      horometro_fin: horometro_fin.toString(),
      ubicacion: ubicacion || null,
      descripcion_trabajo: descripcion_trabajo || null,
      observaciones: observaciones ? `[CARGA RETROACTIVA] ${observaciones}` : "[CARGA RETROACTIVA]",
      estado: "finalizada",
    }).returning();

    const [maquina] = await db.select({ nombre: maquinasTable.nombre }).from(maquinasTable).where(eq(maquinasTable.id, parseInt(maquina_id))).limit(1);
    const [empleado] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido }).from(empleadosTable).where(eq(empleadosTable.id, parseInt(empleado_id))).limit(1);

    await db.insert(actividadTable).values({
      tipo: "jornada",
      descripcion: `Jornada retroactiva registrada: ${empleado ? `${empleado.nombre} ${empleado.apellido}` : ""} en ${maquina?.nombre || ""} (${fecha})`,
      entidad_tipo: "jornada",
      entidad_id: jornada.id,
    });

    syncAllSheets().catch(() => {});
    return res.status(201).json(await enrichJornada(jornada));
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al guardar la jornada: " + (err?.message || "Error interno") });
  }
});

router.post("/iniciar", async (req, res) => {
  try {
    const { empleado_id, maquina_id, horometro_inicio, km_inicio, observaciones, checklist_previo, checklist_ok, estado_equipo_inicio, foto_tablero_inicio, ubicacion, tipo_trabajo, nombre_obra, descripcion_trabajo, confirmar_duplicado } = req.body;
    if (!empleado_id || !maquina_id || horometro_inicio === undefined) {
      return res.status(400).json({ error: "Campos requeridos faltantes" });
    }

    // Check for active jornadas (unless the user explicitly confirmed)
    if (!confirmar_duplicado) {
      const [jornadaEmpleado] = await db.select().from(jornadasTable)
        .where(and(eq(jornadasTable.empleado_id, empleado_id), eq(jornadasTable.estado, "en_curso")))
        .limit(1);
      const [jornadaMaquina] = await db.select().from(jornadasTable)
        .where(and(eq(jornadasTable.maquina_id, maquina_id), eq(jornadasTable.estado, "en_curso")))
        .limit(1);

      const conflictos = [];
      if (jornadaEmpleado) {
        const [emp] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
          .from(empleadosTable).where(eq(empleadosTable.id, empleado_id)).limit(1);
        conflictos.push(`El operario ${emp ? `${emp.nombre} ${emp.apellido}` : ""} ya tiene una jornada en curso iniciada a las ${jornadaEmpleado.hora_inicio}`);
      }
      if (jornadaMaquina && (!jornadaEmpleado || jornadaMaquina.id !== jornadaEmpleado.id)) {
        const [maq] = await db.select({ nombre: maquinasTable.nombre })
          .from(maquinasTable).where(eq(maquinasTable.id, maquina_id)).limit(1);
        conflictos.push(`La máquina ${maq?.nombre || ""} ya tiene una jornada en curso iniciada a las ${jornadaMaquina.hora_inicio}`);
      }

      if (conflictos.length > 0) {
        return res.status(409).json({ error: "conflict", conflictos });
      }
    }

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }); // YYYY-MM-DD format
    const horaInicio = new Date().toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });

    const [jornada] = await db.insert(jornadasTable).values({
      empleado_id, maquina_id,
      fecha: today,
      hora_inicio: horaInicio,
      horometro_inicio: horometro_inicio.toString(),
      km_inicio: km_inicio?.toString(),
      observaciones,
      checklist_previo,
      checklist_ok,
      estado_equipo_inicio,
      foto_tablero_inicio,
      ubicacion,
      tipo_trabajo,
      nombre_obra,
      descripcion_trabajo,
      estado: "en_curso"
    }).returning();

    const [maquina] = await db.select({ nombre: maquinasTable.nombre }).from(maquinasTable).where(eq(maquinasTable.id, maquina_id)).limit(1);
    const [empleado] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido }).from(empleadosTable).where(eq(empleadosTable.id, empleado_id)).limit(1);
    
    const maquinaNombre = maquina?.nombre || `ID ${maquina_id}`;
    const empleadoNombre = empleado ? `${empleado.nombre} ${empleado.apellido}` : `ID ${empleado_id}`;

    await db.insert(actividadTable).values({
      tipo: "jornada",
      descripcion: `Jornada iniciada por operario ${empleadoNombre} en la máquina ${maquinaNombre}`,
      entidad_tipo: "jornada",
      entidad_id: jornada.id,
    });

    // Generar alerta si el equipo no está apto
    if (estado_equipo_inicio === "no_apto") {
      await db.insert(alertasTable).values({
        tipo: "maquina",
        prioridad: "roja",
        descripcion: `El operario ${empleadoNombre} reportó que el equipo ${maquinaNombre} NO ESTÁ APTO para trabajar durante el checklist preoperacional. Observaciones: ${observaciones || "Sin observaciones adicionales."}`,
        entidad_tipo: "maquina",
        entidad_id: maquina_id,
        entidad_nombre: maquina?.nombre
      });
      
      // Cambiar estado de la máquina a detenida automáticamente
      await db.update(maquinasTable).set({ estado: "detenida" }).where(eq(maquinasTable.id, maquina_id));
    }

    return res.status(201).json(await enrichJornada(jornada));
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al iniciar jornada: " + (err?.message || "Error interno") });
  }
});

router.post("/:id/finalizar", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const { horometro_fin, km_fin, problemas, estado_equipo_fin, foto_tablero_fin, combustible_nivel, aceite_estado, danos_choques } = req.body;
    if (horometro_fin === undefined) return res.status(400).json({ error: "Horómetro final requerido" });

    // Validar que el horómetro final sea mayor al de inicio
    const [jornadaActual] = await db.select().from(jornadasTable).where(eq(jornadasTable.id, id)).limit(1);
    if (!jornadaActual) return res.status(404).json({ error: "Jornada no encontrada" });

    if (jornadaActual.horometro_inicio !== null && jornadaActual.horometro_inicio !== undefined) {
      const hrInicio = Number(jornadaActual.horometro_inicio);
      const hrFin = Number(horometro_fin);
      if (!isNaN(hrInicio) && !isNaN(hrFin) && hrFin <= hrInicio) {
        return res.status(400).json({
          error: `El horómetro final (${hrFin}) no puede ser menor o igual al de inicio (${hrInicio}). Verificá el valor ingresado.`
        });
      }
    }

    const horaFin = new Date().toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });

    const [jornada] = await db
      .update(jornadasTable)
      .set({ horometro_fin: horometro_fin.toString(), km_fin: km_fin?.toString(), problemas, estado_equipo_fin, foto_tablero_fin, combustible_nivel, aceite_estado, danos_choques, hora_fin: horaFin, estado: "finalizada" })
      .where(eq(jornadasTable.id, id))
      .returning();

    if (!jornada) return res.status(404).json({ error: "Jornada no encontrada" });

    await db.insert(actividadTable).values({
      tipo: "jornada",
      descripcion: `Jornada finalizada (ID ${id})`,
      entidad_tipo: "jornada",
      entidad_id: jornada.id,
    });

    // Generar alerta y cambiar estado de máquina si requiere mantenimiento o está fuera de servicio
    if (estado_equipo_fin === "requiere_mantenimiento" || estado_equipo_fin === "fuera_de_servicio") {
      const [maquina] = await db.select({ nombre: maquinasTable.nombre }).from(maquinasTable).where(eq(maquinasTable.id, jornada.maquina_id)).limit(1);
      
      const prioridad = estado_equipo_fin === "fuera_de_servicio" ? "roja" : "amarilla";
      const nuevoEstado = estado_equipo_fin === "fuera_de_servicio" ? "detenida" : "mantenimiento";
      
      await db.insert(alertasTable).values({
        tipo: "maquina",
        prioridad,
        descripcion: `Checklist de cierre: El equipo ${maquina?.nombre} se reportó como ${estado_equipo_fin.replace(/_/g, ' ')}. Novedades: ${problemas || "Sin detalles."}`,
        entidad_tipo: "maquina",
        entidad_id: jornada.maquina_id,
        entidad_nombre: maquina?.nombre
      });
      
      await db.update(maquinasTable).set({ estado: nuevoEstado }).where(eq(maquinasTable.id, jornada.maquina_id));
    }

    const enriched = await enrichJornada(jornada);

    // Async append to Google Sheets
    appendToSheet("Jornadas", [
      jornada.fecha,
      enriched.maquina_nombre,
      enriched.empleado_nombre,
      jornada.hora_inicio,
      jornada.hora_fin,
      jornada.horometro_inicio,
      jornada.horometro_fin,
      enriched.horas_trabajadas || "",
      jornada.ubicacion || "",
      jornada.tipo_trabajo || "",
      estado_equipo_fin || "",
    ]);

    // ── Verificación post-cierre: ¿olvidó cargar combustible o incidente? ──
    // Corre en background sin bloquear la respuesta
    setImmediate(async () => {
      try {
        const [empleado] = await db
          .select()
          .from(empleadosTable)
          .where(eq(empleadosTable.id, jornada.empleado_id))
          .limit(1);

        if (!empleado?.telefono_whatsapp) return; // Sin WhatsApp, no hay nada que hacer

        // Verificar si registró combustible en esta jornada (misma máquina, mismo día)
        const combustibleDelDia = await db
          .select({ id: combustibleTable.id })
          .from(combustibleTable)
          .where(
            and(
              eq(combustibleTable.empleado_id, jornada.empleado_id),
              eq(combustibleTable.maquina_id, jornada.maquina_id),
              eq(combustibleTable.fecha, jornada.fecha!)
            )
          )
          .limit(1);

        // Verificar si reportó algún incidente en esta jornada
        const incidenteDelDia = await db
          .select({ id: incidentesTable.id })
          .from(incidentesTable)
          .where(
            and(
              eq(incidentesTable.empleado_id, jornada.empleado_id),
              eq(incidentesTable.maquina_id, jornada.maquina_id),
              eq(incidentesTable.fecha, jornada.fecha!)
            )
          )
          .limit(1);

        const olvidos: string[] = [];
        if (combustibleDelDia.length === 0) olvidos.push("⛽ *carga de combustible*");
        if (incidenteDelDia.length === 0) olvidos.push("🔧 *incidente o novedad del equipo*");

        if (olvidos.length > 0) {
          const maqNombre = enriched.maquina_nombre;
          const mensaje =
            `📋 *PUFFIN SRL - Recordatorio de cierre*\n\n` +
            `Hola ${empleado.nombre}, cerraste tu jornada de hoy` +
            (maqNombre ? ` en *${maqNombre}*` : "") + `.\n\n` +
            `¿Olvidaste registrar alguno de estos datos?\n` +
            olvidos.map(o => `  • ${o}`).join("\n") + `\n\n` +
            `Si corresponde, podés cargarlo ahora en: https://puffinsrl.site\n` +
            `_Si no hubo novedades, ignorá este mensaje._`;

          await sendWhatsAppMessage(empleado.telefono_whatsapp, mensaje);
          console.log(`[Post-cierre] Recordatorio enviado a ${empleado.nombre} (${empleado.telefono_whatsapp})`);
        }
      } catch (e) {
        console.error("[Post-cierre] Error verificando registros:", e);
      }
    });

    return res.json(enriched);
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al finalizar jornada: " + (err?.message || "Error interno") });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    
    // Solo administradores o creadores deberían poder editar, pero por reglas de negocio, 
    // en este sistema las ediciones de jornadas están reservadas para administradores.
    if (req.user?.rol?.toLowerCase() === "empleado") {
      return res.status(403).json({ error: "No tienes permisos para editar jornadas." });
    }

    const { 
      empleado_id, maquina_id, fecha, hora_inicio, hora_fin, 
      horometro_inicio, horometro_fin, km_inicio, km_fin, estado 
    } = req.body;

    // Validar horómetros si se proporcionan ambos
    if (horometro_inicio !== undefined && horometro_fin !== undefined) {
      const hrI = Number(horometro_inicio);
      const hrF = Number(horometro_fin);
      if (!isNaN(hrI) && !isNaN(hrF) && hrF <= hrI) {
        return res.status(400).json({
          error: `El horómetro final (${hrF}) no puede ser menor o igual al de inicio (${hrI}). Verificá los valores.`
        });
      }
    }

    const [jornadaActualizada] = await db
      .update(jornadasTable)
      .set({
        empleado_id,
        maquina_id,
        fecha,
        hora_inicio,
        hora_fin,
        horometro_inicio: horometro_inicio?.toString(),
        horometro_fin: horometro_fin?.toString(),
        km_inicio: km_inicio?.toString(),
        km_fin: km_fin?.toString(),
        estado
      })
      .where(eq(jornadasTable.id, id))
      .returning();

    if (!jornadaActualizada) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }

    const enriched = await enrichJornada(jornadaActualizada);
    return res.json(enriched);
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al actualizar jornada: " + (err?.message || "Error interno") });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    // Solo administradores pueden eliminar jornadas
    if (req.user?.rol?.toLowerCase() === "empleado") {
      return res.status(403).json({ error: "No tienes permisos para eliminar jornadas." });
    }

    const [deleted] = await db
      .delete(jornadasTable)
      .where(eq(jornadasTable.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }

    return res.json({ success: true, message: "Jornada eliminada" });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al eliminar jornada: " + (err?.message || "Error interno") });
  }
});

export default router;
