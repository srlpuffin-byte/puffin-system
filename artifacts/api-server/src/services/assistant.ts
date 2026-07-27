import OpenAI from "openai"; // Usamos el SDK de OpenAI apuntando a Groq
import { db } from "@workspace/db";
import {
  empleadosTable,
  maquinasTable,
  fotografiasTable,
  egresosTable,
  whatsappSesionesTable,
  proyectosTable,
  jornadasTable,
} from "@workspace/db/schema";
import { eq, like, or, and, desc, count, ilike } from "drizzle-orm";
import { sendWhatsAppImage, sendWhatsAppMessage } from "./whatsapp.js";

const groqApiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
const openai = groqApiKey ? new OpenAI({
  apiKey: groqApiKey,
  baseURL: process.env.GROQ_API_KEY ? "https://api.groq.com/openai/v1" : undefined,
}) : null;

const MODEL = process.env.GROQ_API_KEY ? "llama-3.3-70b-versatile" : "gpt-4o-mini";
const MAX_HISTORY = 20; // últimos 20 mensajes por sesión
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 horas

// Herramientas disponibles para la IA
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "consultar_inventario",
      description: "Consulta el inventario de máquinas o ítems, y en qué proyecto están asignados.",
      parameters: {
        type: "object",
        properties: {
          termino: { type: "string", description: "Término de búsqueda (ej: 'Retroexcavadora', 'Camión')" },
        },
        required: ["termino"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_gastos",
      description: "Consulta los últimos gastos o egresos registrados.",
      parameters: {
        type: "object",
        properties: {
          categoria: { type: "string", description: "Categoría del gasto a filtrar (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_empleados",
      description: "Consulta información sobre los empleados: cantidad total, lista, datos de contacto, cargo, estado activo/inactivo.",
      parameters: {
        type: "object",
        properties: {
          termino: { type: "string", description: "Nombre o apellido a buscar (opcional, si no se da devuelve el resumen general)" },
          solo_activos: { type: "boolean", description: "Si true, filtra solo empleados activos (default: false)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_proyectos",
      description: "Consulta los proyectos/obras activos o históricos de la empresa, incluyendo estado, hectáreas y cobros.",
      parameters: {
        type: "object",
        properties: {
          estado: { type: "string", description: "Filtrar por estado: activo, finalizado, pausado (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_jornadas",
      description: "Consulta jornadas de trabajo: las activas en este momento, las del día de hoy, o busca por empleado/máquina.",
      parameters: {
        type: "object",
        properties: {
          estado: { type: "string", description: "Estado de la jornada: en_curso, finalizada (opcional)" },
          nombre_empleado: { type: "string", description: "Nombre del empleado a buscar (opcional)" },
          fecha: { type: "string", description: "Fecha a consultar en formato YYYY-MM-DD (opcional, default: hoy)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_imagen_vehiculo",
      description: "Obtiene y envía por WhatsApp la foto de una máquina o vehículo específico.",
      parameters: {
        type: "object",
        properties: {
          nombre_maquina: { type: "string", description: "Nombre de la máquina o vehículo" },
          maquina_id: { type: "number", description: "ID interno de la máquina (opcional)" },
        },
        required: ["nombre_maquina"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_mensaje_whatsapp",
      description: "Envía un mensaje de WhatsApp a un empleado o a un número específico en nombre de PUFFIN SRL.",
      parameters: {
        type: "object",
        properties: {
          numero: { type: "string", description: "Número de teléfono del destinatario (solo dígitos, con código de área argentina, ej: 3472629600)" },
          nombre_empleado: { type: "string", description: "Nombre del empleado si se busca por nombre en lugar de número (opcional)" },
          mensaje: { type: "string", description: "Texto del mensaje a enviar" },
        },
        required: ["mensaje"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_gasto",
      description: "Registra un gasto/egreso en el sistema. Llamar SOLO cuando el usuario haya confirmado con 'OK' o 'sí' o 'confirmar'. Antes de llamar esta función, SIEMPRE mostrar un resumen detallado al usuario y pedir confirmación explícita.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Fecha del gasto en formato YYYY-MM-DD" },
          categoria: { type: "string", description: "Categoría del gasto (ej: Combustible, Materiales, Servicios, Mantenimiento, Herramientas, Administrativo, Otro)" },
          concepto: { type: "string", description: "Descripción del gasto" },
          monto: { type: "number", description: "Monto en pesos" },
          proveedor: { type: "string", description: "Nombre del proveedor o empresa (opcional)" },
          metodo_pago: { type: "string", description: "Método de pago: efectivo, transferencia, tarjeta (opcional)" },
          centro_costos: { type: "string", description: "Proyecto u obra al que se imputa el gasto (opcional)" },
          observaciones: { type: "string", description: "Observaciones adicionales (opcional)" },
        },
        required: ["fecha", "categoria", "concepto", "monto"],
      },
    },
  },
];

// Números de administradores autorizados
const ADMIN_PHONES = ["3472629600", "3572665637", "3572400877"];

// Obtener o crear sesión para un número
async function obtenerSesion(phone: string) {
  const [sesion] = await db
    .select()
    .from(whatsappSesionesTable)
    .where(eq(whatsappSesionesTable.phone, phone))
    .limit(1);

  if (!sesion) {
    const [nueva] = await db
      .insert(whatsappSesionesTable)
      .values({ phone, messages: [], estado: "idle", datos_pendientes: null })
      .returning();
    return nueva;
  }

  // Limpiar sesión si lleva más de 2 horas inactiva
  const ahora = Date.now();
  const ultimaActividad = sesion.updated_at ? new Date(sesion.updated_at).getTime() : 0;
  if (ahora - ultimaActividad > SESSION_TIMEOUT_MS) {
    await db
      .update(whatsappSesionesTable)
      .set({ messages: [], estado: "idle", datos_pendientes: null, updated_at: new Date() })
      .where(eq(whatsappSesionesTable.phone, phone));
    return { ...sesion, messages: [], estado: "idle", datos_pendientes: null };
  }

  return sesion;
}

// Guardar sesión actualizada
async function guardarSesion(phone: string, messages: any[], estado: string = "idle", datos_pendientes: any = null) {
  // Mantener solo los últimos MAX_HISTORY mensajes
  const historial = messages.slice(-MAX_HISTORY);
  await db
    .update(whatsappSesionesTable)
    .set({ messages: historial, estado, datos_pendientes, updated_at: new Date() })
    .where(eq(whatsappSesionesTable.phone, phone));
}

export async function handleWhatsAppMessage(from: string, text: string) {
  const senderPhone = from.replace(/[^0-9]/g, "");

  const isAdmin = ADMIN_PHONES.some(admin =>
    senderPhone.endsWith(admin) || admin.endsWith(senderPhone.slice(-10))
  );

  if (!isAdmin) {
    console.log(`[WhatsApp] Mensaje de número no autorizado ${senderPhone} ignorado.`);
    return;
  }

  if (!openai) {
    console.warn("API KEY de IA no configurada. Asistente deshabilitado.");
    await sendWhatsAppMessage(from, "Lo siento, el asistente no está configurado por el momento.");
    return;
  }

  // Obtener historial de conversación
  const sesion = await obtenerSesion(senderPhone);
  const historial = (sesion.messages as any[]) || [];

  // Agregar mensaje del usuario al historial
  historial.push({ role: "user", content: text });

  const today = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const todayISO = new Date().toISOString().split("T")[0];

  const systemPrompt = `Sos el Asistente Virtual de PUFFIN SRL, empresa de maquinaria vial.
Hablás en español rioplatense, de forma profesional, clara y concisa.
La fecha de hoy es ${today} (${todayISO}).

Tus capacidades:
1. Consultar inventario de máquinas y equipos
2. Consultar gastos registrados
3. Enviar fotos de vehículos/máquinas por WhatsApp
4. Registrar nuevos gastos/egresos en el sistema

Para registrar un gasto, seguí este protocolo estrictamente:
- Recolectá los datos necesarios de forma conversacional (podés pedir varios datos juntos)
- Campos OBLIGATORIOS: fecha, categoría, concepto, monto
- Campos opcionales: proveedor, método de pago (efectivo/transferencia/tarjeta), centro de costos/proyecto, observaciones
- Cuando tenés TODOS los datos obligatorios, mostrá un resumen completo y pedí confirmación
- Usá este formato para el resumen:
  📋 *Resumen del gasto:*
  • Fecha: [fecha]
  • Categoría: [categoria]
  • Concepto: [concepto]
  • Monto: $[monto]
  • Proveedor: [proveedor o "-"]
  • Método de pago: [metodo o "-"]
  • Proyecto/Obra: [centro_costos o "-"]
  
  ¿Confirmás el registro? Respondé *OK* para guardar o *No* para cancelar.
- SOLO llamás a la función registrar_gasto cuando el usuario responde OK, sí, confirmar, o similar
- Si el usuario dice No o cancela, descartás los datos y preguntás si necesita algo más

Categorías de gasto disponibles: Combustible, Materiales, Servicios, Mantenimiento, Herramientas, Administrativo, Personal, Alquiler, Otro.`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...historial.slice(-MAX_HISTORY) as any[],
  ];

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
    });

    const responseMessage = response.choices[0].message;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Agregar respuesta del asistente al historial
      historial.push(responseMessage);
      messages.push(responseMessage);

      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.type !== "function") continue;
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        let toolResult = "";

        if (functionName === "consultar_inventario") {
          toolResult = await executeConsultarInventario(functionArgs.termino);
        } else if (functionName === "consultar_gastos") {
          toolResult = await executeConsultarGastos(functionArgs.categoria);
        } else if (functionName === "consultar_empleados") {
          toolResult = await executeConsultarEmpleados(functionArgs.termino, functionArgs.solo_activos);
        } else if (functionName === "consultar_proyectos") {
          toolResult = await executeConsultarProyectos(functionArgs.estado);
        } else if (functionName === "consultar_jornadas") {
          toolResult = await executeConsultarJornadas(functionArgs.estado, functionArgs.nombre_empleado, functionArgs.fecha);
        } else if (functionName === "enviar_imagen_vehiculo") {
          toolResult = await executeEnviarImagenVehiculo(from, functionArgs.nombre_maquina, functionArgs.maquina_id);
        } else if (functionName === "enviar_mensaje_whatsapp") {
          toolResult = await executeEnviarMensaje(functionArgs.mensaje, functionArgs.numero, functionArgs.nombre_empleado);
        } else if (functionName === "registrar_gasto") {
          toolResult = await executeRegistrarGasto(functionArgs);
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: toolResult,
        });
        historial.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: toolResult,
        });
      }

      // Segunda llamada con resultado de herramientas
      const secondResponse = await openai.chat.completions.create({
        model: MODEL,
        messages,
      });

      const finalContent = secondResponse.choices[0].message.content;
      if (finalContent) {
        await sendWhatsAppMessage(from, finalContent);
        historial.push({ role: "assistant", content: finalContent });
      }
    } else if (responseMessage.content) {
      await sendWhatsAppMessage(from, responseMessage.content);
      historial.push({ role: "assistant", content: responseMessage.content });
    }

    // Guardar historial actualizado
    await guardarSesion(senderPhone, historial);

  } catch (error) {
    console.error("Error en asistente PUFFIN:", error);
    try {
      await sendWhatsAppMessage(from, "Tuve un error al procesar tu consulta. Por favor intentá de nuevo.");
    } catch (e) {
      console.error("Error enviando mensaje de error:", e);
    }
  }
}

// ─── Implementaciones de herramientas ───────────────────────────────────────

async function executeEnviarMensaje(mensaje: string, numero?: string, nombreEmpleado?: string) {
  let destino = numero;

  // Buscar por nombre de empleado si no se dio número
  if (!destino && nombreEmpleado) {
    const t = `%${nombreEmpleado.toLowerCase()}%`;
    const [emp] = await db
      .select({ telefono: empleadosTable.telefono_whatsapp, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
      .from(empleadosTable)
      .where(or(like(empleadosTable.nombre, t), like(empleadosTable.apellido, t)))
      .limit(1);

    if (!emp || !emp.telefono) {
      return `No encontré un empleado llamado "${nombreEmpleado}" con número de WhatsApp registrado.`;
    }
    destino = emp.telefono;
    nombreEmpleado = `${emp.nombre} ${emp.apellido}`;
  }

  if (!destino) {
    return "No se pudo determinar el destinatario. Proporcioná un número o nombre de empleado.";
  }

  try {
    await sendWhatsAppMessage(destino, mensaje);
    return `✅ Mensaje enviado correctamente a ${nombreEmpleado || destino}.`;
  } catch (error: any) {
    return `❌ Error al enviar el mensaje a ${nombreEmpleado || destino}: ${error.message}`;
  }
}

async function executeConsultarEmpleados(termino?: string, soloActivos?: boolean) {
  let query = db.select().from(empleadosTable).$dynamic();
  const conditions: any[] = [];

  if (soloActivos) conditions.push(eq(empleadosTable.activo, true));
  if (termino) {
    const t = `%${termino.toLowerCase()}%`;
    conditions.push(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t)));
  }
  if (conditions.length) query = query.where(and(...conditions));

  const results = await query.limit(15);

  if (results.length === 0) return termino
    ? `No encontré empleados que coincidan con "${termino}".`
    : "No hay empleados registrados.";

  if (!termino) {
    const activos = results.filter(e => e.activo).length;
    const lineas = results.map(e =>
      `• ${e.nombre} ${e.apellido} — ${e.cargo || "Sin cargo"} | ${e.activo ? "Activo" : "Inactivo"}`
    );
    return `Total: ${results.length} empleados (${activos} activos)\n${lineas.join("\n")}`;
  }

  const lineas = results.map(e =>
    `• ${e.nombre} ${e.apellido} — Cargo: ${e.cargo || "-"} | Tel: ${e.telefono_whatsapp || "-"} | ${e.activo ? "Activo" : "Inactivo"}`
  );
  return lineas.join("\n");
}

async function executeConsultarProyectos(estado?: string) {
  let query = db.select().from(proyectosTable).$dynamic();
  if (estado) query = query.where(eq(proyectosTable.estado, estado));
  const results = await query.orderBy(desc(proyectosTable.createdAt)).limit(10);

  if (results.length === 0) return `No hay proyectos${estado ? ` con estado "${estado}"` : ""} registrados.`;

  const lineas = results.map(p =>
    `• ${p.lugar} — ${p.hectareas} ha | Estado: ${p.estado} | Pago: ${p.estado_pago} | Cobrado: $${Number(p.total_cobrado || 0).toLocaleString("es-AR")}`
  );
  return `${results.length} proyecto(s):\n${lineas.join("\n")}`;
}

async function executeConsultarJornadas(estado?: string, nombreEmpleado?: string, fecha?: string) {
  const hoy = fecha || new Date().toISOString().split("T")[0];

  let empId: number | undefined;
  if (nombreEmpleado) {
    const t = `%${nombreEmpleado.toLowerCase()}%`;
    const [emp] = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
      .from(empleadosTable)
      .where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t)))
      .limit(1);
    if (!emp) return `No encontré empleado con nombre "${nombreEmpleado}".`;
    empId = emp.id;
  }

  let query = db
    .select({
      id: jornadasTable.id,
      fecha: jornadasTable.fecha,
      estado: jornadasTable.estado,
      hora_inicio: jornadasTable.hora_inicio,
      hora_fin: jornadasTable.hora_fin,
      nombre_obra: jornadasTable.nombre_obra,
      empleado_id: jornadasTable.empleado_id,
    })
    .from(jornadasTable)
    .$dynamic();

  const conditions: any[] = [];
  if (estado) conditions.push(eq(jornadasTable.estado, estado));
  if (empId) conditions.push(eq(jornadasTable.empleado_id, empId));
  if (!estado && !empId) conditions.push(eq(jornadasTable.fecha, hoy));
  if (conditions.length) query = query.where(and(...conditions));

  const results = await query.orderBy(desc(jornadasTable.fecha)).limit(10);

  if (results.length === 0) return `No hay jornadas${estado ? ` "${estado}"` : ""} ${nombreEmpleado ? `para ${nombreEmpleado}` : `para hoy (${hoy})`}.`;

  // Obtener nombres de empleados
  const empIds = [...new Set(results.map(j => j.empleado_id))];
  const empleados = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
    .from(empleadosTable)
    .where(or(...empIds.map(id => eq(empleadosTable.id, id))));
  const empMap = Object.fromEntries(empleados.map(e => [e.id, `${e.nombre} ${e.apellido}`]));

  const lineas = results.map(j =>
    `• [${j.fecha}] ${empMap[j.empleado_id] || `Emp#${j.empleado_id}`} — ${j.nombre_obra || "Sin obra"} | ${j.hora_inicio || "?"}–${j.hora_fin || "en curso"} | Estado: ${j.estado}`
  );
  return `${results.length} jornada(s):\n${lineas.join("\n")}`;
}

async function executeConsultarInventario(termino: string) {
  const t = `%${termino.toLowerCase()}%`;
  const results = await db.select().from(maquinasTable).where(
    or(like(maquinasTable.nombre, t), like(maquinasTable.tipo, t))
  ).limit(8);

  if (results.length === 0) return `No se encontraron máquinas para "${termino}".`;

  const lineas = results.map(r =>
    `• ${r.nombre} (${r.tipo}) — Estado: ${r.estado} | Categoría: ${r.categoria}`
  );
  return `Resultados para "${termino}":\n${lineas.join("\n")}`;
}

async function executeConsultarGastos(categoria?: string) {
  let query = db.select().from(egresosTable).orderBy(desc(egresosTable.createdAt)).$dynamic();
  if (categoria) query = query.where(like(egresosTable.categoria, `%${categoria}%`));
  const results = await query.limit(8);

  if (results.length === 0) return "No hay gastos registrados" + (categoria ? ` en la categoría "${categoria}".` : ".");

  const sum = results.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
  const lineas = results.map(r =>
    `• [${r.fecha}] ${r.concepto} — $${Number(r.monto).toLocaleString("es-AR")} (${r.categoria})`
  );
  return `Últimos ${results.length} gastos (Total: $${sum.toLocaleString("es-AR")}):\n${lineas.join("\n")}`;
}

async function executeEnviarImagenVehiculo(from: string, nombreMaquina: string, maquinaId?: number) {
  let maqId = maquinaId;
  if (!maqId) {
    const t = `%${nombreMaquina.toLowerCase()}%`;
    const maq = await db.select().from(maquinasTable).where(like(maquinasTable.nombre, t)).limit(1);
    if (maq.length === 0) return `No encontré ninguna máquina llamada "${nombreMaquina}".`;
    maqId = maq[0].id;
  }

  const fotos = await db.select().from(fotografiasTable).where(
    and(eq(fotografiasTable.entidad_tipo, "maquina"), eq(fotografiasTable.entidad_id, maqId))
  ).limit(1);

  if (fotos.length === 0) return `La máquina "${nombreMaquina}" no tiene fotos registradas.`;

  await sendWhatsAppImage(from, fotos[0].url, `Imagen de ${nombreMaquina}`);
  return `Imagen de "${nombreMaquina}" enviada correctamente.`;
}

async function executeRegistrarGasto(args: {
  fecha: string;
  categoria: string;
  concepto: string;
  monto: number;
  proveedor?: string;
  metodo_pago?: string;
  centro_costos?: string;
  observaciones?: string;
}) {
  try {
    const [egreso] = await db.insert(egresosTable).values({
      fecha: args.fecha,
      categoria: args.categoria,
      concepto: args.concepto,
      monto: args.monto.toString(),
      proveedor: args.proveedor || null,
      metodo_pago: args.metodo_pago || null,
      comprobante: false,
      centro_costos: args.centro_costos || null,
      observaciones: args.observaciones || null,
    }).returning();

    // Intentar sincronizar con Google Sheets (no bloquear si falla)
    try {
      const { syncAllSheets } = await import("./sync-sheets.js");
      syncAllSheets().catch(console.error);
    } catch (_) {}

    return `✅ Gasto registrado correctamente con ID #${egreso.id}. Monto: $${Number(args.monto).toLocaleString("es-AR")} — ${args.concepto}.`;
  } catch (error: any) {
    console.error("Error registrando gasto:", error);
    return `❌ Error al registrar el gasto: ${error.message}`;
  }
}
