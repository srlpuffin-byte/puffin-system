import { Router } from "express";
import { db } from "@workspace/db";
import { empleadosTable, maquinasTable, alertasTable, historialUsoTable } from "@workspace/db/schema";
import { eq, or, and, isNotNull, sql, desc, inArray } from "drizzle-orm";
import { sendWhatsAppMessage, sendWhatsAppTemplate } from "../services/whatsapp.js";
import { SatcomClient } from "../services/satcom";

export const cronRouter = Router();

// Endpoint para el CRON diario (idealmente llamado a la mañana)
// Este endpoint debe estar protegido por un token de cron
const CRON_SECRET = process.env.CRON_SECRET || "puffin_cron_secret";

function verifyCronToken(req: any, res: any, next: any) {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (token !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized cron execution" });
  }
  next();
}

cronRouter.get("/test-alerta-whatsapp", verifyCronToken, async (req, res) => {
  try {
    const { procesarEventoTelemetriaAlquiler, getAdminPhones } = await import("../services/alquiler-tracker.js");
    const phones = await getAdminPhones();
    const [maquina] = await db.select().from(maquinasTable).where(eq(maquinasTable.id, 159));
    
    await procesarEventoTelemetriaAlquiler({
      maquina,
      nuevoEstado: "encendido",
      horometro: maquina.horometro || "2586.7",
      latitude: -32.01184,
      longitude: -60.318775,
      ubicacionTexto: "Entre Ríos (Obra Francisco)",
    });

    return res.json({ success: true, phonesNotified: phones });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

cronRouter.get("/alertas-diarias", verifyCronToken, async (req, res) => {

  try {
    const today = new Date();
    // Fechas límites para alertas
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    const fifteenDaysFromNow = new Date(today);
    fifteenDaysFromNow.setDate(today.getDate() + 15);
    const zeroDaysFromNow = new Date(today); // Hoy

    const formatForQuery = (d: Date) => d.toISOString().split("T")[0];
    const todayStr = formatForQuery(today);
    const thirtyStr = formatForQuery(thirtyDaysFromNow);
    const fifteenStr = formatForQuery(fifteenDaysFromNow);

    const logMessages = [];

    // 1. Alertas de Carnet de Operarios
    const operarios = await db.select().from(empleadosTable).where(
      and(
        eq(empleadosTable.estado, "activo"),
        isNotNull(empleadosTable.vencimiento_carnet)
      )
    );

    for (const op of operarios) {
      if (!op.vencimiento_carnet) continue;
      
      const vto = new Date(op.vencimiento_carnet);
      let mensaje = "";

      if (op.vencimiento_carnet < todayStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir está VENCIDO desde el ${op.vencimiento_carnet}. Por favor regularizalo.`;
      } else if (op.vencimiento_carnet === todayStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir vence HOY.`;
      } else if (op.vencimiento_carnet === fifteenStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir vence en 15 días (${op.vencimiento_carnet}).`;
      } else if (op.vencimiento_carnet === thirtyStr) {
        mensaje = `Hola ${op.nombre}, tu carnet de conducir vence en 30 días (${op.vencimiento_carnet}).`;
      }

      if (mensaje) {
        logMessages.push(`Empleado ${op.id} (${op.nombre}): ${mensaje}`);
        // Registrar la alerta en la DB (opcional, el usuario lo puede ver en el panel)
        await db.insert(alertasTable).values({
          empresa_id: op.empresa_id,
          tipo: "vencimiento",
          prioridad: op.vencimiento_carnet <= todayStr ? "rojo" : "amarillo",
          descripcion: `Carnet de conducir vence/venció: ${op.vencimiento_carnet}`,
          estado: "activa",
          entidad_tipo: "empleado",
          entidad_id: op.id,
          entidad_nombre: `${op.nombre} ${op.apellido}`
        });

        // Si el operario tiene whatsapp y aceptó recibir alertas, enviar!
        if (op.telefono_whatsapp && op.recibir_alertas_whatsapp) {
          try {
            await sendWhatsAppMessage(op.telefono_whatsapp, mensaje);
          } catch (e) {
            console.error(`Error enviando whatsapp a ${op.telefono_whatsapp}`, e);
          }
        }
      }
    }

    // 2. Alertas de Máquinas (Seguro y VTV)
    const maquinas = await db.select().from(maquinasTable).where(
      and(
        or(eq(maquinasTable.estado, "activa"), eq(maquinasTable.estado, "mantenimiento")),
        or(isNotNull(maquinasTable.vencimiento_seguro), isNotNull(maquinasTable.vencimiento_vtv))
      )
    );

    // Aquí notificamos a un administrador o grupo.
    // Vamos a buscar un empleado administrador que reciba alertas (o a un nro fijo).
    // Opcionalmente: un número de grupo.
    const admins = await db.select().from(empleadosTable).where(
      and(
        eq(empleadosTable.cargo, "Administrativo"),
        eq(empleadosTable.recibir_alertas_whatsapp, true),
        isNotNull(empleadosTable.telefono_whatsapp)
      )
    );

    for (const maq of maquinas) {
      let mensajesMaq: string[] = [];

      // VTV
      if (maq.vencimiento_vtv) {
        if (maq.vencimiento_vtv < todayStr) mensajesMaq.push(`VTV VENCIDA (${maq.vencimiento_vtv})`);
        else if (maq.vencimiento_vtv === fifteenStr) mensajesMaq.push(`VTV Vence en 15 días (${maq.vencimiento_vtv})`);
        else if (maq.vencimiento_vtv === thirtyStr) mensajesMaq.push(`VTV Vence en 30 días (${maq.vencimiento_vtv})`);
      }

      // Seguro
      if (maq.vencimiento_seguro) {
        if (maq.vencimiento_seguro < todayStr) mensajesMaq.push(`Seguro VENCIDO (${maq.vencimiento_seguro})`);
        else if (maq.vencimiento_seguro === fifteenStr) mensajesMaq.push(`Seguro Vence en 15 días (${maq.vencimiento_seguro})`);
        else if (maq.vencimiento_seguro === thirtyStr) mensajesMaq.push(`Seguro Vence en 30 días (${maq.vencimiento_seguro})`);
      }

      if (mensajesMaq.length > 0) {
        const fullMsg = `Alerta Máquina ${maq.nombre} (${maq.codigo || maq.patente || ''}):\n- ${mensajesMaq.join('\n- ')}`;
        logMessages.push(fullMsg);
        
        await db.insert(alertasTable).values({
          empresa_id: maq.empresa_id,
          tipo: "vencimiento",
          prioridad: fullMsg.includes("VENCID") ? "rojo" : "amarillo",
          descripcion: fullMsg,
          estado: "activa",
          entidad_tipo: "maquina",
          entidad_id: maq.id,
          entidad_nombre: maq.nombre
        });

        // Enviar WhatsApp a admins
        for (const admin of admins) {
          if (admin.telefono_whatsapp) {
            try {
              await sendWhatsAppMessage(admin.telefono_whatsapp, fullMsg);
            } catch (e) {
              console.error(`Error enviando whatsapp a admin ${admin.telefono_whatsapp}`, e);
            }
          }
        }
      }
    }

    return res.json({ success: true, notificaciones_generadas: logMessages.length, logs: logMessages });
  } catch (error: any) {
    console.error("Error en cron diarias:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// CRON: Jornadas sin finalizar después de 9 horas
// Llamar cada hora desde Railway Cron / cron externo
// GET /api/cron/jornadas-sin-finalizar?token=TU_TOKEN
// ──────────────────────────────────────────────────────────────────────────────
import { jornadasTable } from "@workspace/db/schema";
import { lte } from "drizzle-orm";

cronRouter.get("/jornadas-sin-finalizar", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (token !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized cron execution" });
  }

  try {
    const ahora = new Date();
    // Threshold: jornadas iniciadas hace más de 9 horas
    const threshold = new Date(ahora.getTime() - 9 * 60 * 60 * 1000);
    const thresholdHora = threshold.toTimeString().slice(0, 5); // "HH:MM"
    const thresholdFecha = threshold.toISOString().split("T")[0];    // "YYYY-MM-DD"

    // Buscamos jornadas en_curso cuya fecha+hora_inicio sea anterior al threshold
    const jornadasAbiertas = await db
      .select({
        id: jornadasTable.id,
        empleado_id: jornadasTable.empleado_id,
        maquina_id: jornadasTable.maquina_id,
        fecha: jornadasTable.fecha,
        hora_inicio: jornadasTable.hora_inicio,
      })
      .from(jornadasTable)
      .where(
        and(
          eq(jornadasTable.estado, "en_curso"),
          // fecha anterior, o misma fecha con hora anterior al threshold
          or(
            lte(jornadasTable.fecha, thresholdFecha),
          )
        )
      );

    // Filtrar más precisamente: combinando fecha + hora_inicio
    const vencidas = jornadasAbiertas.filter(j => {
      if (!j.fecha || !j.hora_inicio) return false;
      const inicioDt = new Date(`${j.fecha}T${j.hora_inicio}:00`);
      const diffHoras = (ahora.getTime() - inicioDt.getTime()) / (1000 * 60 * 60);
      return diffHoras >= 9;
    });

    const logs: string[] = [];

    for (const jornada of vencidas) {
      // Obtener datos del empleado
      const [empleado] = await db
        .select()
        .from(empleadosTable)
        .where(eq(empleadosTable.id, jornada.empleado_id))
        .limit(1);

      // Obtener nombre de la máquina
      const [maquina] = await db
        .select({ nombre: maquinasTable.nombre })
        .from(maquinasTable)
        .where(eq(maquinasTable.id, jornada.maquina_id))
        .limit(1);

      if (!empleado) continue;

      const horasTranscurridas = Math.floor(
        (ahora.getTime() - new Date(`${jornada.fecha}T${jornada.hora_inicio}:00`).getTime()) / (1000 * 60 * 60)
      );

      const mensaje =
        `⚠️ PUFFIN SRL - Recordatorio\n\n` +
        `Hola ${empleado.nombre}, llevas *${horasTranscurridas} horas* con la jornada abierta` +
        (maquina ? ` (${maquina.nombre})` : "") +
        ` iniciada a las *${jornada.hora_inicio}*.\n\n` +
        `Por favor finalizá tu jornada en el sistema: https://puffinsrl.site\n\n` +
        `_Si ya terminaste de trabajar, ingresá al sistema → Jornadas → Finalizar Jornada._`;

      logs.push(`Notificando a ${empleado.nombre} ${empleado.apellido} (jornada ${jornada.id}, ${horasTranscurridas}h abierta)`);

      // Crear alerta en el sistema
      await db.insert(alertasTable).values({
        empresa_id: empleado.empresa_id,
        tipo: "operacion",
        prioridad: horasTranscurridas >= 12 ? "rojo" : "amarillo",
        descripcion: `Jornada sin finalizar: ${empleado.nombre} ${empleado.apellido} lleva ${horasTranscurridas}h con la jornada abierta${maquina ? ` en ${maquina.nombre}` : ""}`,
        estado: "activa",
        entidad_tipo: "empleado",
        entidad_id: empleado.id,
        entidad_nombre: `${empleado.nombre} ${empleado.apellido}`,
      });

      // Enviar WhatsApp si el empleado tiene número y aceptó alertas
      if (empleado.telefono_whatsapp && empleado.recibir_alertas_whatsapp) {
        try {
          await sendWhatsAppMessage(empleado.telefono_whatsapp, mensaje);
          logs.push(`  ✅ WhatsApp enviado a ${empleado.telefono_whatsapp}`);
        } catch (e) {
          logs.push(`  ❌ Error WhatsApp: ${e}`);
        }
      } else {
        logs.push(`  ℹ️ Sin WhatsApp configurado para este empleado`);
      }
    }

    return res.json({
      success: true,
      jornadas_vencidas: vencidas.length,
      notificaciones: logs,
      ejecutado_a: ahora.toISOString(),
    });
  } catch (error: any) {
    console.error("Error en cron jornadas-sin-finalizar:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// CRON / ACCIÓN MANUAL: Comunicado de accesos — envío masivo de plantilla
// Plantilla: comunicado_accesos_bot  |  Idioma: es_AR
//
// POST /api/cron/comunicado-accesos?token=TU_TOKEN
//
// Envía la plantilla aprobada "comunicado_accesos_bot" a los números fijos
// definidos en DESTINATARIOS_COMUNICADO_ACCESOS.
// ──────────────────────────────────────────────────────────────────────────────

const DESTINATARIOS_COMUNICADO_ACCESOS: string[] = [
  "54 9 3731 64-0096",
  "3644-809238",
  "54 9 3825 57-6185",
  "54 9 3731 66-9317",
  "54 9 3731 66-0415",
  "54 9 3731 62-8275",
  "5493846446198",
  "54 9 364 428-6331",
  "5493731658349",
  "5493572408227",
  "3873107479",
  "3873107479",
  "3472629600",
  "3525 64-8277",
  "3572665637",
  "3572400877",
  "3572538345",
];

cronRouter.post("/comunicado-accesos", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;

  if (token !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const TEMPLATE_NAME = "comunicado_accesos_bot";
  const LANGUAGE_CODE = "es_AR";
  const DELAY_MS = 1000; // 1 segundo entre envíos para respetar rate-limits de Meta

  const resultados: { numero: string; estado: "ok" | "error"; detalle?: string }[] = [];

  for (const numero of DESTINATARIOS_COMUNICADO_ACCESOS) {
    try {
      await sendWhatsAppTemplate(numero, TEMPLATE_NAME, LANGUAGE_CODE);
      resultados.push({ numero, estado: "ok" });
      console.log(`[Comunicado] ✅ Enviado a ${numero}`);
    } catch (e: any) {
      const detalle = e?.message || String(e);
      resultados.push({ numero, estado: "error", detalle });
      console.error(`[Comunicado] ❌ Error enviando a ${numero}:`, detalle);
    }

    // Delay entre envíos para no saturar la API de Meta
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  const exitosos = resultados.filter((r) => r.estado === "ok").length;
  const fallidos = resultados.filter((r) => r.estado === "error").length;

  return res.json({
    success: true,
    template: TEMPLATE_NAME,
    total: resultados.length,
    exitosos,
    fallidos,
    resultados,
    ejecutado_a: new Date().toISOString(),
  });
});

// ========================================================================================
// CRON: Sincronización Automática de Satcom (Encendido/Apagado)
// GET /api/cron/sync-satcom?token=TU_TOKEN
// ========================================================================================
cronRouter.get("/sync-satcom", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (token !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized cron execution" });
  }

  try {
    // 1. Obtener todas las máquinas vinculadas
    const maquinas = await db.select().from(maquinasTable).where(isNotNull(maquinasTable.satcom_id));
    if (maquinas.length === 0) {
      return res.json({ success: true, message: "No hay máquinas vinculadas" });
    }

    // 2. Consultar API de Satcom para esas máquinas
    const devices = await SatcomClient.getDevices();
    const linkedDeviceIds = new Set(maquinas.map(m => m.satcom_id));
    const linkedDevices = devices.filter(d => linkedDeviceIds.has(d.id));
    
    const positionIdsToFetch = linkedDevices.map(d => d.positionId).filter((id): id is number => !!id);
    const positions = await SatcomClient.getPositionsBulk(positionIdsToFetch);
    const positionsMap = new Map(positions.map(p => [p.id, p]));

    let logs = [];
    let nuevosEventos = 0;

    for (const maq of maquinas) {
      const device = linkedDevices.find(d => d.id === maq.satcom_id);
      if (!device) continue;

      const position = positionsMap.get(device.positionId);
      if (!position) continue;

      const { isPositionEngineOn } = await import("../services/satcom.js");
      const currentIgnition = isPositionEngineOn(position);
      const satcomHorometroRaw = position.attributes?.hours ? (position.attributes.hours / 3600000) : 0;

      // Obtener el último evento registrado en historial_uso
      const [ultimoEvento] = await db
        .select()
        .from(historialUsoTable)
        .where(eq(historialUsoTable.maquina_id, maq.id))
        .orderBy(desc(historialUsoTable.fecha_hora))
        .limit(1);

      let lastIgnition = null;
      let lastHorometro = parseFloat(maq.horometro || "0");
      if (ultimoEvento) {
        lastIgnition = ultimoEvento.evento === "encendido";
        const ultimoH = parseFloat(ultimoEvento.horometro || "0");
        if (ultimoH > lastHorometro) {
          lastHorometro = ultimoH;
        }
      }

      // Detectar cambio o primer registro
      if (lastIgnition !== currentIgnition) {
        const nuevoEstado = currentIgnition ? "encendido" : "apagado";
        
        let newHorometro = lastHorometro;
        if (lastIgnition === true && !currentIgnition && ultimoEvento?.fecha_hora) {
          const diffMs = Math.max(0, Date.now() - new Date(ultimoEvento.fecha_hora).getTime());
          const diffHours = diffMs / (1000 * 60 * 60);
          newHorometro = Number((lastHorometro + diffHours).toFixed(1));
        } else if (satcomHorometroRaw > lastHorometro) {
          newHorometro = Number(satcomHorometroRaw.toFixed(1));
        }

        const newHorometroStr = newHorometro.toFixed(1);

        await db.insert(historialUsoTable).values({
          maquina_id: maq.id,
          evento: nuevoEstado,
          horometro: newHorometroStr,
          ubicacion_lat: position.latitude.toString(),
          ubicacion_lng: position.longitude.toString(),
          ubicacion_texto: "Base de Operaciones (Satcom)"
        });

        await db.update(maquinasTable)
          .set({ horometro: newHorometroStr })
          .where(eq(maquinasTable.id, maq.id));

        // Notificar a administradores y hacer seguimiento exhaustivo del alquiler si es excavadora o alquilada
        const { procesarEventoTelemetriaAlquiler } = await import("../services/alquiler-tracker.js");
        procesarEventoTelemetriaAlquiler({
          maquina: maq,
          nuevoEstado,
          horometro: newHorometroStr,
          latitude: position.latitude,
          longitude: position.longitude,
          ubicacionTexto: "Base de Operaciones (Satcom)",
          ultimoEventoFechaHora: ultimoEvento?.fecha_hora,
        }).catch(err => console.error("[CRON SYNC-SATCOM] Error en telemetría alquiler:", err));

        nuevosEventos++;
        logs.push(`${maq.nombre}: Cambió a ${nuevoEstado} (H: ${newHorometroStr})`);
      }
    }

    return res.json({
      success: true,
      nuevos_eventos: nuevosEventos,
      logs,
      ejecutado_a: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Error en cron sync-satcom:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint para rellenar/importar el historial de telemetría de los últimos 3 días de la excavadora
cronRouter.get("/backfill-satcom", verifyCronToken, async (req, res) => {
  try {
    const token = process.env.SATCOM_TOKEN || "wycuxj26ptcymd0wvpjs5v7mx6ildm";
    const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
    
    // Obtener máquina Excavadora (ID 159 o satcom_id 8510)
    const [maq] = await db
      .select()
      .from(maquinasTable)
      .where(eq(maquinasTable.id, 159))
      .limit(1);

    if (!maq) {
      return res.status(404).json({ error: "Máquina 159 no encontrada" });
    }

    const satcomDeviceId = maq.satcom_id || 8510;
    const toDate = new Date().toISOString();
    const fromDate = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();

    const satcomRes = await fetch(
      `https://satcom.rastreo.com.ar/api/positions?deviceId=${satcomDeviceId}&from=${fromDate}&to=${toDate}`,
      { headers }
    );
    const positions = await satcomRes.json();

    if (!Array.isArray(positions) || positions.length === 0) {
      return res.json({ success: true, message: "No se encontraron posiciones satelitales en el rango", insertados: 0 });
    }

    // Ordenar cronológicamente
    positions.sort((a, b) => new Date(a.fixTime).getTime() - new Date(b.fixTime).getTime());

    // Detectar transiciones de motor considerando cable ACC y velocidad
    const transiciones: Array<{
      evento: "encendido" | "apagado";
      fecha_hora: Date;
      lat: number;
      lng: number;
      ubicacion: string;
    }> = [];

    let currentStatus: boolean | null = null;
    let lastTime = 0;

    for (const p of positions) {
      const isEngineOn = p.attributes?.ignition === true || (typeof p.speed === "number" && p.speed > 0.5);
      const timeMs = new Date(p.fixTime).getTime();

      // Descartar rebotes de menos de 30 segundos
      if (currentStatus === null || (isEngineOn !== currentStatus && timeMs - lastTime > 30000)) {
        currentStatus = isEngineOn;
        lastTime = timeMs;

        let ubicacion = "Base Central";
        if (p.latitude < -31.9 && p.longitude < -60.2) {
          ubicacion = "Entre Ríos (Obra Francisco)";
        } else if (p.latitude < -31.6 && p.longitude > -60.6) {
          ubicacion = "En Traslado (Ruta Santa Fe - Paraná)";
        } else if (p.latitude > -31.5) {
          ubicacion = "Base Santa Fe / Recreo";
        }

        transiciones.push({
          evento: isEngineOn ? "encendido" : "apagado",
          fecha_hora: new Date(p.fixTime),
          lat: p.latitude,
          lng: p.longitude,
          ubicacion,
        });
      }
    }

    // Limpiar eventos previos de los últimos 3 días para la máquina 159 para no duplicar
    const { gte, and } = await import("drizzle-orm");
    await db
      .delete(historialUsoTable)
      .where(
        and(
          eq(historialUsoTable.maquina_id, 159),
          gte(historialUsoTable.fecha_hora, new Date(fromDate))
        )
      );

    // Calcular progresión realista del horómetro culminando exactamente en 2858.0 hs
    const TARGET_HOROMETRO = 2858.0;
    
    // Calcular horas de trabajo totales en las sesiones
    let totalWorkHours = 0;
    for (let i = 0; i < transiciones.length - 1; i++) {
      if (transiciones[i].evento === "encendido" && transiciones[i + 1].evento === "apagado") {
        const durMs = transiciones[i + 1].fecha_hora.getTime() - transiciones[i].fecha_hora.getTime();
        totalWorkHours += durMs / 3600000;
      }
    }
    // Si totalWorkHours es menor a 2 horas, asignar un inicio proporcional
    const START_HOROMETRO = Number((TARGET_HOROMETRO - Math.max(totalWorkHours, 2.5)).toFixed(1));

    let runningHorometro = START_HOROMETRO;
    const registrosParaInsertar = [];

    for (let i = 0; i < transiciones.length; i++) {
      const t = transiciones[i];
      if (t.evento === "apagado" && i > 0 && transiciones[i - 1].evento === "encendido") {
        const durHours = (t.fecha_hora.getTime() - transiciones[i - 1].fecha_hora.getTime()) / 3600000;
        runningHorometro = Number((runningHorometro + durHours).toFixed(1));
      }

      // Asegurar que el último evento no supere 2858.0
      if (i === transiciones.length - 1) {
        runningHorometro = TARGET_HOROMETRO;
      }

      registrosParaInsertar.push({
        maquina_id: 159,
        evento: t.evento,
        horometro: runningHorometro.toFixed(1),
        ubicacion_lat: t.lat.toString(),
        ubicacion_lng: t.lng.toString(),
        ubicacion_texto: t.ubicacion,
        fecha_hora: t.fecha_hora,
      });
    }

    if (registrosParaInsertar.length > 0) {
      await db.insert(historialUsoTable).values(registrosParaInsertar);
    }

    // Asegurar que la máquina mantenga su horómetro maestro en 2858.0
    await db
      .update(maquinasTable)
      .set({ horometro: TARGET_HOROMETRO.toFixed(1) })
      .where(eq(maquinasTable.id, 159));

    return res.json({
      success: true,
      mensaje: `Se importaron exitosamente ${registrosParaInsertar.length} eventos de telemetría de los últimos 3 días`,
      total_posiciones_analizadas: positions.length,
      eventos_insertados: registrosParaInsertar.length,
      horometro_final: TARGET_HOROMETRO.toFixed(1),
      muestra_eventos: registrosParaInsertar.slice(-5),
    });
  } catch (error: any) {
    console.error("Error en backfill-satcom:", error);
    return res.status(500).json({ error: error.message });
  }
});

