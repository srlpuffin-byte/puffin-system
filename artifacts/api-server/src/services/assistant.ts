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
  combustibleTable,
  mantenimientosTable,
} from "@workspace/db/schema";
import { eq, like, or, and, desc, ilike } from "drizzle-orm";
import { sendWhatsAppImage, sendWhatsAppMessage } from "./whatsapp.js";

const groqApiKey = process.env.GROQ_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

// Prioridad: Groq (gratis, rápido) → Gemini (gratis, sin límite diario) → OpenAI (pago)
let openai: OpenAI | null = null;
let MODEL = "llama-3.3-70b-versatile";

if (groqApiKey) {
  openai = new OpenAI({ apiKey: groqApiKey, baseURL: "https://api.groq.com/openai/v1" });
  MODEL = "llama-3.1-8b-instant"; // 500K tokens/día gratis (vs 100K del 70b)
  console.log("[IA] Usando Groq: llama-3.1-8b-instant");
} else if (geminiApiKey) {
  openai = new OpenAI({ apiKey: geminiApiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" });
  MODEL = "gemini-1.5-flash";
  console.log("[IA] Usando Google Gemini: gemini-1.5-flash");
} else if (openaiApiKey) {
  openai = new OpenAI({ apiKey: openaiApiKey });
  MODEL = "gpt-4o-mini";
  console.log("[IA] Usando OpenAI: gpt-4o-mini");
} else {
  console.error("[IA] ERROR: No hay ninguna API key configurada (GROQ_API_KEY, GEMINI_API_KEY u OPENAI_API_KEY)");
}
const MAX_HISTORY = 8;  // reducido para ahorrar tokens
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 horas

// Herramientas disponibles para la IA
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "consultar_inventario",
      description: "Consulta máquinas/equipos. Busca por nombre, filtra por estado o tipo, ordena por primero/último ingresado.",
      parameters: {
        type: "object",
        properties: {
          termino: { type: "string", description: "Término de búsqueda por nombre/tipo (opcional)" },
          estado: { type: "string", description: "Filtrar por estado: activo, inactivo, mantenimiento (opcional)" },
          orden: { type: "string", description: "primer, ultimo, nombre (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analizar_gastos",
      description: "Consulta y analiza gastos/egresos con sumas totales, agrupaciones por categoría o proyecto, filtros por fecha. Úsala para preguntas como: suma total, gasto mayor, gastos de un proyecto, gastos del mes, etc.",
      parameters: {
        type: "object",
        properties: {
          categoria: { type: "string", description: "Filtrar por categoría (opcional)" },
          proyecto: { type: "string", description: "Filtrar por proyecto/obra (centro de costos) (opcional)" },
          desde: { type: "string", description: "Fecha inicio YYYY-MM-DD (opcional)" },
          hasta: { type: "string", description: "Fecha fin YYYY-MM-DD (opcional)" },
          agrupar_por: { type: "string", description: "Agrupar por: categoria, proyecto, mes (opcional)" },
          orden: { type: "string", description: "primer, ultimo, mayor, menor (opcional)" },
          limite: { type: "number", description: "Máximo registros (default: 15)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_google_sheets",
      description: "Lee datos de una pestaña del Google Sheet de la empresa. Útil para consultar datos de planillas, presupuestos, reportes o cualquier información almacenada en el Google Sheets.",
      parameters: {
        type: "object",
        properties: {
          pestana: { type: "string", description: "Nombre de la pestaña/tab a leer (ej: Egresos, Jornadas, Combustible, Empleados)" },
          rango: { type: "string", description: "Rango de celdas a leer, ej: A1:E20 (opcional, default: A1:Z50)" },
        },
        required: ["pestana"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_empleados",
      description: "Consulta empleados: total, primer/último en ingresar, carnet vencido, empleados sin asignar a proyectos, datos de contacto.",
      parameters: {
        type: "object",
        properties: {
          termino: { type: "string", description: "Nombre o apellido a buscar (opcional)" },
          solo_activos: { type: "boolean", description: "Filtrar solo activos" },
          orden: { type: "string", description: "primer (primero en ingresar), ultimo, nombre" },
          carnet_vencido: { type: "boolean", description: "Si true, muestra empleados con carnet vencido o próximo a vencer" },
          sin_proyecto: { type: "boolean", description: "Si true, muestra empleados que no están asignados a ningún proyecto activo" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_proyectos",
      description: "Consulta proyectos/obras con sus empleados y máquinas asignadas. Puede buscar qué operarios o máquinas están en un proyecto específico.",
      parameters: {
        type: "object",
        properties: {
          estado: { type: "string", description: "Filtrar por estado: activo, finalizado, pausado (opcional)" },
          nombre: { type: "string", description: "Buscar por nombre/lugar del proyecto (opcional)" },
          orden: { type: "string", description: "primer, ultimo, mayor_ganancia (opcional)" },
          incluir_asignaciones: { type: "boolean", description: "Si true, muestra los nombres de empleados y máquinas asignadas (default: false)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_jornadas",
      description: "Consulta jornadas de trabajo: activas ahora, del día, por empleado, rangos de fecha.",
      parameters: {
        type: "object",
        properties: {
          estado: { type: "string", description: "en_curso, finalizada (opcional)" },
          nombre_empleado: { type: "string", description: "Nombre del empleado (opcional)" },
          fecha: { type: "string", description: "Fecha YYYY-MM-DD (opcional, default: hoy)" },
          desde: { type: "string", description: "Fecha inicio para rango YYYY-MM-DD (opcional)" },
          hasta: { type: "string", description: "Fecha fin para rango YYYY-MM-DD (opcional)" },
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
      description: "Envía un mensaje de WhatsApp a un empleado, a un número, o a TODOS los empleados con número registrado en el sistema.",
      parameters: {
        type: "object",
        properties: {
          numero: { type: "string", description: "Número de teléfono (solo dígitos, ej: 3472629600). Omitir si se usa nombre_empleado o todos." },
          nombre_empleado: { type: "string", description: "Nombre del empleado (opcional si se da número o todos)" },
          todos: { type: "boolean", description: "Si true, envía el mensaje a TODOS los empleados con WhatsApp registrado en el sistema" },
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
  {
    type: "function",
    function: {
      name: "consultar_combustible",
      description: "Consulta registros de combustible: litros cargados, importe, máquina, empleado, estación, fecha. Puede calcular totales y filtrar por máquina o empleado.",
      parameters: {
        type: "object",
        properties: {
          nombre_maquina: { type: "string", description: "Nombre de la máquina (opcional)" },
          nombre_empleado: { type: "string", description: "Nombre del empleado (opcional)" },
          desde: { type: "string", description: "Fecha inicio YYYY-MM-DD (opcional)" },
          hasta: { type: "string", description: "Fecha fin YYYY-MM-DD (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_mantenimientos",
      description: "Consulta registros de mantenimiento de máquinas: tipo de service, fecha, estado, próximo service.",
      parameters: {
        type: "object",
        properties: {
          nombre_maquina: { type: "string", description: "Nombre de la máquina (opcional)" },
          tipo: { type: "string", description: "Tipo de mantenimiento (opcional)" },
          desde: { type: "string", description: "Fecha inicio YYYY-MM-DD (opcional)" },
          hasta: { type: "string", description: "Fecha fin YYYY-MM-DD (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_empleado",
      description: "Registra un nuevo empleado en el sistema. Pedirá confirmación antes de guardar.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "Nombre del empleado" },
          apellido: { type: "string", description: "Apellido del empleado" },
          dni: { type: "string", description: "DNI del empleado" },
          telefono: { type: "string", description: "Teléfono (opcional)" },
          telefono_whatsapp: { type: "string", description: "Número de WhatsApp (opcional)" },
          cargo: { type: "string", description: "Cargo o puesto (opcional)" },
          fecha_ingreso: { type: "string", description: "Fecha de ingreso YYYY-MM-DD (opcional)" },
        },
        required: ["nombre", "apellido", "dni"],
      },
    },
  },
];


// Números de administradores autorizados
const ADMIN_PHONES = ["3472629600", "3572665637", "3572400877"];

// Obtener o crear sesión — con fallback si la tabla no existe aún
async function obtenerSesion(phone: string) {
  try {
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
  } catch (e) {
    // Si la tabla no existe todavía, devolver sesión vacía en memoria
    console.warn("[Sesion] Tabla whatsapp_sesiones no disponible, usando sesion en memoria:", (e as any).message);
    return { phone, messages: [], estado: "idle", datos_pendientes: null, updated_at: new Date() };
  }
}

// Guardar sesión — con fallback si la tabla no existe
async function guardarSesion(phone: string, messages: any[], estado: string = "idle", datos_pendientes: any = null) {
  try {
    const historial = messages.slice(-MAX_HISTORY);
    await db
      .update(whatsappSesionesTable)
      .set({ messages: historial, estado, datos_pendientes, updated_at: new Date() })
      .where(eq(whatsappSesionesTable.phone, phone));
  } catch (e) {
    console.warn("[Sesion] No se pudo guardar la sesion:", (e as any).message);
  }
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

TENÉS ACCESO COMPLETO A TODA LA INFORMACIÓN DEL SISTEMA. Si el usuario pregunta algo que esté en la base de datos, SIEMPRE usá las herramientas para buscarlo. Nunca digas que no tenés acceso a algo si hay una herramienta disponible para consultarlo.

ACCESO TOTAL AL SISTEMA:
👥 EMPLEADOS: nombres, apellidos, DNI, teléfonos, cargos, estado, fecha de ingreso, carnet de conducir, contacto familiar
🛠️ MÁQUINAS/EQUIPOS: nombre, tipo, estado, categoría, asignación a proyectos
🏗️ PROYECTOS/OBRAS: lugar, hectáreas, estado, empleados asignados, máquinas asignadas, pagos, ganancia
📅 JORNADAS: quién trabajó, en qué proyecto, qué horario, estado de la jornada
💰 GASTOS/EGRESOS: monto, categoría, fecha, proveedor, proyecto al que se imputa
📊 GOOGLE SHEETS: cualquier dato en las planillas de la empresa

REGLAS FUNDAMENTALES:
- Cuando alguien pregunte por un dato de una persona (teléfono, cargo, DNI, etc.), usá consultar_empleados con su nombre
- Cuando pregunten por un proyecto, usá consultar_proyectos con incluir_asignaciones=true para ver empleados y máquinas
- Cuando pidan enviar mensaje a todos, usá enviar_mensaje_whatsapp con todos=true
- Nunca inventés datos. Si no encontrás algo, decílo claramente
- Respondé siempre en español

PARA REGISTRAR UN GASTO (protocolo obligatorio):
- Recolectá los datos de forma conversacional
- Campos OBLIGATORIOS: fecha, categoría, concepto, monto
- Opcionales: proveedor, método de pago (efectivo/transferencia/tarjeta), proyecto/obra, observaciones
- Mostrá resumen con este formato y pedió confirmación:
  📋 *Resumen del gasto:*
  • Fecha: [fecha]
  • Categoría: [categoria]
  • Concepto: [concepto]
  • Monto: $[monto]
  • Proveedor: [proveedor o "-"]
  • Método de pago: [metodo o "-"]
  • Proyecto/Obra: [centro_costos o "-"]
  ¿Confirmás el registro? Respondé *OK* para guardar o *No* para cancelar.
- SOLO llamás a registrar_gasto cuando el usuario responde OK, sí, confirmar, o similar

Categorías de gasto: Combustible, Materiales, Servicios, Mantenimiento, Herramientas, Administrativo, Personal, Alquiler, Otro.`;

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
          toolResult = await executeConsultarInventario(functionArgs.termino, functionArgs.estado, functionArgs.orden);
        } else if (functionName === "consultar_gastos" || functionName === "analizar_gastos") {
          toolResult = await executeAnalizarGastos(functionArgs);
        } else if (functionName === "consultar_empleados") {
          toolResult = await executeConsultarEmpleados(functionArgs.termino, functionArgs.solo_activos, functionArgs.orden, functionArgs.carnet_vencido, functionArgs.sin_proyecto);
        } else if (functionName === "consultar_proyectos") {
          toolResult = await executeConsultarProyectos(functionArgs.estado, functionArgs.nombre, functionArgs.orden, functionArgs.incluir_asignaciones);
        } else if (functionName === "consultar_jornadas") {
          toolResult = await executeConsultarJornadas(functionArgs.estado, functionArgs.nombre_empleado, functionArgs.fecha, functionArgs.desde, functionArgs.hasta);
        } else if (functionName === "consultar_google_sheets") {
          toolResult = await executeConsultarSheets(functionArgs.pestana, functionArgs.rango);
        } else if (functionName === "enviar_imagen_vehiculo") {
          toolResult = await executeEnviarImagenVehiculo(from, functionArgs.nombre_maquina, functionArgs.maquina_id);
        } else if (functionName === "enviar_mensaje_whatsapp") {
          toolResult = await executeEnviarMensaje(functionArgs.mensaje, functionArgs.numero, functionArgs.nombre_empleado, functionArgs.todos);
        } else if (functionName === "registrar_gasto") {
          toolResult = await executeRegistrarGasto(functionArgs);
        } else if (functionName === "consultar_combustible") {
          toolResult = await executeConsultarCombustible(functionArgs);
        } else if (functionName === "consultar_mantenimientos") {
          toolResult = await executeConsultarMantenimientos(functionArgs);
        } else if (functionName === "registrar_empleado") {
          toolResult = await executeRegistrarEmpleado(functionArgs);
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

async function executeEnviarMensaje(mensaje: string, numero?: string, nombreEmpleado?: string, todos?: boolean) {
  // Enviar a todos los empleados con WhatsApp
  if (todos) {
    const empleados = await db.select({
      nombre: empleadosTable.nombre,
      apellido: empleadosTable.apellido,
      telefono: empleadosTable.telefono_whatsapp,
    }).from(empleadosTable)
      .where(and(eq(empleadosTable.estado, "activo"), eq(empleadosTable.recibir_alertas_whatsapp, true)));

    const conTelefono = empleados.filter(e => e.telefono);
    if (conTelefono.length === 0) return "No hay empleados activos con WhatsApp registrado.";

    let exitosos = 0;
    const errores: string[] = [];
    for (const emp of conTelefono) {
      try {
        await sendWhatsAppMessage(emp.telefono!, mensaje);
        exitosos++;
      } catch (e: any) {
        errores.push(`${emp.nombre} ${emp.apellido}: ${e.message}`);
      }
    }
    return `✅ Mensaje enviado a ${exitosos}/${conTelefono.length} empleados.${errores.length ? ` Errores: ${errores.join(", ")}` : ""}`;
  }

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

async function executeConsultarEmpleados(termino?: string, soloActivos?: boolean, orden?: string, carnetVencido?: boolean, sinProyecto?: boolean) {
  let query = db.select().from(empleadosTable).$dynamic();
  const conditions: any[] = [];

  if (soloActivos) conditions.push(eq(empleadosTable.estado, "activo"));
  if (termino) {
    const t = `%${termino.toLowerCase()}%`;
    conditions.push(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t)));
  }
  if (carnetVencido) {
    const en30 = new Date(Date.now() + 30 * 864e5).toISOString().split("T")[0];
    const { lte } = await import("drizzle-orm");
    conditions.push(lte(empleadosTable.vencimiento_carnet, en30));
  }
  if (conditions.length) query = query.where(and(...conditions));

  const { asc } = await import("drizzle-orm");
  if (orden === "primer") query = query.orderBy(asc(empleadosTable.fecha_ingreso));
  else if (orden === "ultimo") query = query.orderBy(desc(empleadosTable.fecha_ingreso));
  else if (orden === "nombre") query = query.orderBy(asc(empleadosTable.apellido));
  else query = query.orderBy(asc(empleadosTable.id));

  let results = await query.limit(50);

  // Filtrar empleados sin proyecto activo
  if (sinProyecto) {
    const proyectos = await db.select({ asignados: proyectosTable.empleados_asignados })
      .from(proyectosTable).where(eq(proyectosTable.estado, "activo"));
    const idsAsignados = new Set(proyectos.flatMap(p => (p.asignados as number[]) || []));
    results = results.filter(e => !idsAsignados.has(e.id));
    if (results.length === 0) return "Todos los empleados activos están asignados a algún proyecto.";
    const lineas = results.map(e => `• ${e.nombre} ${e.apellido} — ${e.cargo || "Sin cargo"} | ${e.estado}`);
    return `Empleados sin asignar a ningún proyecto activo (${results.length}):\n${lineas.join("\n")}`;
  }

  if (results.length === 0) return termino
    ? `No encontré empleados que coincidan con "${termino}".`
    : "No hay empleados registrados.";

  const activos = results.slice(0, 15).filter(e => e.estado === "activo").length;

  if (orden === "primer" && !termino) {
    const e = results[0];
    return `El primer empleado en ingresar fue *${e.nombre} ${e.apellido}* — Cargo: ${e.cargo || "-"} | Fecha ingreso: ${e.fecha_ingreso || "No registrada"} | Estado: ${e.estado}`;
  }

  // Si se busca por nombre, mostrar info completa incluyendo teléfono
  if (termino) {
    const lineas = results.slice(0, 10).map(e =>
      `👤 *${e.nombre} ${e.apellido}*
   • Cargo: ${e.cargo || "-"}
   • Teléfono: ${e.telefono || "-"}
   • WhatsApp: ${e.telefono_whatsapp || "-"}
   • DNI: ${e.dni || "-"}
   • Estado: ${e.estado}
   • Ingreso: ${e.fecha_ingreso || "-"}
   • Venc. carnet: ${e.vencimiento_carnet || "-"}
   • Contacto familiar: ${e.contacto_familiar_nombre || "-"} (${e.contacto_familiar_telefono || "-"})`
    );
    return lineas.join("\n\n");
  }

  const lineas = results.slice(0, 15).map(e =>
    `• ${e.nombre} ${e.apellido} — ${e.cargo || "Sin cargo"} | Ingreso: ${e.fecha_ingreso || "-"} | ${e.estado === "activo" ? "Activo" : "Inactivo"}${
      carnetVencido && e.vencimiento_carnet ? ` | Carnet vence: ${e.vencimiento_carnet}` : ""
    }`
  );
  return `Total: ${results.length} empleados (${activos} activos)\n${lineas.join("\n")}`;
}

async function executeConsultarProyectos(estado?: string, nombre?: string, orden?: string, incluirAsignaciones?: boolean) {
  let query = db.select().from(proyectosTable).$dynamic();
  const conditions: any[] = [];
  if (estado) conditions.push(eq(proyectosTable.estado, estado));
  if (nombre) conditions.push(ilike(proyectosTable.lugar, `%${nombre}%`));
  if (conditions.length) query = query.where(and(...conditions));

  const { asc } = await import("drizzle-orm");
  if (orden === "primer") query = query.orderBy(asc(proyectosTable.createdAt));
  else if (orden === "mayor_ganancia") query = query.orderBy(desc(proyectosTable.ganancia_estimada));
  else query = query.orderBy(desc(proyectosTable.createdAt));

  const results = await query.limit(10);

  if (results.length === 0) return `No hay proyectos${estado ? ` con estado "${estado}"` : ""} registrados.`;

  const totalCobrado = results.reduce((a, p) => a + Number(p.total_cobrado || 0), 0);
  const gananciaTotal = results.reduce((a, p) => a + Number(p.ganancia_estimada || 0), 0);

  // Resolver nombres de empleados y máquinas si se pide
  let empMap: Record<number, string> = {};
  let maqMap: Record<number, string> = {};
  if (incluirAsignaciones) {
    const todosEmpIds = [...new Set(results.flatMap(p => (p.empleados_asignados as number[]) || []))];
    const todosMaqIds = [...new Set(results.flatMap(p => (p.maquinas_asignadas as number[]) || []))];

    if (todosEmpIds.length > 0) {
      const emps = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido, cargo: empleadosTable.cargo })
        .from(empleadosTable).where(or(...todosEmpIds.map(id => eq(empleadosTable.id, id))));
      empMap = Object.fromEntries(emps.map(e => [e.id, `${e.nombre} ${e.apellido} (${e.cargo || "operario"})`]));
    }
    if (todosMaqIds.length > 0) {
      const maqs = await db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre, tipo: maquinasTable.tipo })
        .from(maquinasTable).where(or(...todosMaqIds.map(id => eq(maquinasTable.id, id))));
      maqMap = Object.fromEntries(maqs.map(m => [m.id, `${m.nombre} (${m.tipo})`]));
    }
  }

  const lineas = results.map(p => {
    let linea = `• *${p.lugar}* — ${p.hectareas} ha | Estado: ${p.estado} | Cobrado: $${Number(p.total_cobrado || 0).toLocaleString("es-AR")} | Pago: ${p.estado_pago}`;
    if (incluirAsignaciones) {
      const empIds = (p.empleados_asignados as number[]) || [];
      const maqIds = (p.maquinas_asignadas as number[]) || [];
      const empNombres = empIds.map(id => empMap[id] || `#${id}`).join(", ") || "Ninguno";
      const maqNombres = maqIds.map(id => maqMap[id] || `#${id}`).join(", ") || "Ninguna";
      linea += `\n  👷 Operarios: ${empNombres}\n  🛠️ Máquinas: ${maqNombres}`;
    }
    return linea;
  });

  const resumen = results.length > 1
    ? `${results.length} proyecto(s) | Total cobrado: $${totalCobrado.toLocaleString("es-AR")} | Ganancia estimada total: $${gananciaTotal.toLocaleString("es-AR")}\n`
    : "";
  return resumen + lineas.join("\n");
}

async function executeConsultarJornadas(estado?: string, nombreEmpleado?: string, fecha?: string, desde?: string, hasta?: string) {
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

  let query = db.select({ id: jornadasTable.id, fecha: jornadasTable.fecha, estado: jornadasTable.estado,
    hora_inicio: jornadasTable.hora_inicio, hora_fin: jornadasTable.hora_fin,
    nombre_obra: jornadasTable.nombre_obra, empleado_id: jornadasTable.empleado_id })
    .from(jornadasTable).$dynamic();

  const { gte, lte, between } = await import("drizzle-orm");
  const conditions: any[] = [];
  if (estado) conditions.push(eq(jornadasTable.estado, estado));
  if (empId) conditions.push(eq(jornadasTable.empleado_id, empId));
  if (desde && hasta) conditions.push(between(jornadasTable.fecha, desde, hasta));
  else if (desde) conditions.push(gte(jornadasTable.fecha, desde));
  else if (hasta) conditions.push(lte(jornadasTable.fecha, hasta));
  else if (!estado && !empId) conditions.push(eq(jornadasTable.fecha, hoy));
  if (conditions.length) query = query.where(and(...conditions));

  const results = await query.orderBy(desc(jornadasTable.fecha)).limit(15);

  if (results.length === 0) return `No hay jornadas${estado ? ` "${estado}"` : ""} ${nombreEmpleado ? `para ${nombreEmpleado}` : `para hoy (${hoy})`}.`;

  const empIds = [...new Set(results.map(j => j.empleado_id))];
  const empleados = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
    .from(empleadosTable).where(or(...empIds.map(id => eq(empleadosTable.id, id))));
  const empMap = Object.fromEntries(empleados.map(e => [e.id, `${e.nombre} ${e.apellido}`]));

  const lineas = results.map(j =>
    `• [${j.fecha}] ${empMap[j.empleado_id] || `Emp#${j.empleado_id}`} — ${j.nombre_obra || "Sin obra"} | ${j.hora_inicio || "?"}–${j.hora_fin || "en curso"} | ${j.estado}`
  );
  return `${results.length} jornada(s):\n${lineas.join("\n")}`;
}

async function executeConsultarSheets(pestana: string, rango?: string) {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!SHEET_ID || !credsJson) {
    return "Google Sheets no está configurado en el servidor.";
  }

  try {
    const { google } = await import("googleapis");
    const credentials = JSON.parse(credsJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const rangoFinal = rango || "A1:Z50";
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${pestana}!${rangoFinal}`,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) return `La pestaña "${pestana}" está vacía o no existe.`;

    // Formatear como tabla legible
    const headers = rows[0];
    const data = rows.slice(1).slice(0, 20); // Máximo 20 filas para no saturar
    const lineas = data.map((row, i) =>
      headers.map((h: string, j: number) => `${h}: ${row[j] || "-"}`).join(" | ")
    );
    return `📊 *${pestana}* (${data.length} registros):\n` + lineas.join("\n");
  } catch (error: any) {
    return `Error al leer Google Sheets (pestaña: ${pestana}): ${error.message}`;
  }
}

async function executeConsultarInventario(termino?: string, estado?: string, orden?: string) {
  const { asc } = await import("drizzle-orm");
  let query = db.select().from(maquinasTable).$dynamic();
  const conditions: any[] = [];
  if (termino) { const t = `%${termino.toLowerCase()}%`; conditions.push(or(ilike(maquinasTable.nombre, t), ilike(maquinasTable.tipo, t))); }
  if (estado) conditions.push(eq(maquinasTable.estado, estado));
  if (conditions.length) query = query.where(and(...conditions));
  if (orden === "primer") query = query.orderBy(asc(maquinasTable.id));
  else if (orden === "ultimo") query = query.orderBy(desc(maquinasTable.id));
  else if (orden === "nombre") query = query.orderBy(asc(maquinasTable.nombre));
  const results = await query.limit(10);
  if (results.length === 0) return termino ? `No se encontraron máquinas para "${termino}".` : "No hay máquinas registradas.";
  if (orden === "primer" && !termino) {
    const m = results[0];
    return `La primera máquina ingresada fue *${m.nombre}* — Tipo: ${m.tipo} | Estado: ${m.estado} | Categoría: ${m.categoria}`;
  }
  const lineas = results.map(r => `• ${r.nombre} (${r.tipo}) — Estado: ${r.estado} | Categoría: ${r.categoria}`);
  return `${results.length} máquina(s):\n${lineas.join("\n")}`;
}

async function executeAnalizarGastos(args: { categoria?: string; proyecto?: string; desde?: string; hasta?: string; agrupar_por?: string; orden?: string; limite?: number; }) {
  const { gte, lte, between, ilike: ilikeOp, sum } = await import("drizzle-orm");
  const limite = args.limite || 15;

  let query = db.select().from(egresosTable).$dynamic();
  const conditions: any[] = [];

  if (args.categoria) conditions.push(ilikeOp(egresosTable.categoria, `%${args.categoria}%`));
  if (args.proyecto) conditions.push(ilikeOp(egresosTable.centro_costos, `%${args.proyecto}%`));
  if (args.desde && args.hasta) conditions.push(between(egresosTable.fecha, args.desde, args.hasta));
  else if (args.desde) conditions.push(gte(egresosTable.fecha, args.desde));
  else if (args.hasta) conditions.push(lte(egresosTable.fecha, args.hasta));
  if (conditions.length) query = query.where(and(...conditions));

  if (args.orden === "primer") query = query.orderBy(egresosTable.fecha);
  else if (args.orden === "mayor") query = query.orderBy(desc(egresosTable.monto));
  else if (args.orden === "menor") query = query.orderBy(egresosTable.monto);
  else query = query.orderBy(desc(egresosTable.fecha));

  const results = await query.limit(limite);

  if (results.length === 0) return "No hay gastos con esos filtros.";

  const total = results.reduce((a, r) => a + Number(r.monto || 0), 0);

  // Agrupar si se pide
  if (args.agrupar_por === "categoria") {
    const grupos: Record<string, number> = {};
    results.forEach(r => { grupos[r.categoria] = (grupos[r.categoria] || 0) + Number(r.monto || 0); });
    const lineas = Object.entries(grupos).sort((a, b) => b[1] - a[1])
      .map(([cat, monto]) => `• ${cat}: $${monto.toLocaleString("es-AR")}`);
    return `*Gastos por categoría* (Total: $${total.toLocaleString("es-AR")}):\n${lineas.join("\n")}`;
  }

  if (args.agrupar_por === "proyecto") {
    const grupos: Record<string, number> = {};
    results.forEach(r => { const k = r.centro_costos || "Sin proyecto"; grupos[k] = (grupos[k] || 0) + Number(r.monto || 0); });
    const lineas = Object.entries(grupos).sort((a, b) => b[1] - a[1])
      .map(([proy, monto]) => `• ${proy}: $${monto.toLocaleString("es-AR")}`);
    return `*Gastos por proyecto* (Total: $${total.toLocaleString("es-AR")}):\n${lineas.join("\n")}`;
  }

  if (args.agrupar_por === "mes") {
    const grupos: Record<string, number> = {};
    results.forEach(r => { const mes = r.fecha ? r.fecha.slice(0, 7) : "?"; grupos[mes] = (grupos[mes] || 0) + Number(r.monto || 0); });
    const lineas = Object.entries(grupos).sort().map(([mes, monto]) => `• ${mes}: $${monto.toLocaleString("es-AR")}`);
    return `*Gastos por mes* (Total: $${total.toLocaleString("es-AR")}):\n${lineas.join("\n")}`;
  }

  const lineas = results.map(r =>
    `• [${r.fecha}] ${r.concepto} — $${Number(r.monto).toLocaleString("es-AR")} | ${r.categoria}${r.centro_costos ? ` | Proyecto: ${r.centro_costos}` : ""}`
  );
  return `${results.length} gastos | *Total: $${total.toLocaleString("es-AR")}*\n${lineas.join("\n")}`;
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

async function executeConsultarCombustible(args: { nombre_maquina?: string; nombre_empleado?: string; desde?: string; hasta?: string }) {
  const { gte, lte, between } = await import("drizzle-orm");

  // Resolver IDs si se dan nombres
  let maqId: number | undefined;
  let empId: number | undefined;
  if (args.nombre_maquina) {
    const [m] = await db.select({ id: maquinasTable.id }).from(maquinasTable)
      .where(ilike(maquinasTable.nombre, `%${args.nombre_maquina}%`)).limit(1);
    if (!m) return `No encontré máquina llamada "${args.nombre_maquina}".`;
    maqId = m.id;
  }
  if (args.nombre_empleado) {
    const t = `%${args.nombre_empleado.toLowerCase()}%`;
    const [e] = await db.select({ id: empleadosTable.id }).from(empleadosTable)
      .where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t))).limit(1);
    if (!e) return `No encontré empleado llamado "${args.nombre_empleado}".`;
    empId = e.id;
  }

  let query = db.select().from(combustibleTable).$dynamic();
  const conditions: any[] = [eq(combustibleTable.estado, "activo")];
  if (maqId) conditions.push(eq(combustibleTable.maquina_id, maqId));
  if (empId) conditions.push(eq(combustibleTable.empleado_id, empId));
  if (args.desde && args.hasta) conditions.push(between(combustibleTable.fecha, args.desde, args.hasta));
  else if (args.desde) conditions.push(gte(combustibleTable.fecha, args.desde));
  else if (args.hasta) conditions.push(lte(combustibleTable.fecha, args.hasta));
  query = query.where(and(...conditions)).orderBy(desc(combustibleTable.fecha)).limit(20);

  const results = await query;
  if (results.length === 0) return "No hay registros de combustible con esos filtros.";

  // Resolver nombres
  const maqIds = [...new Set(results.map(r => r.maquina_id))];
  const maqs = await db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre }).from(maquinasTable)
    .where(or(...maqIds.map(id => eq(maquinasTable.id, id))));
  const maqMap = Object.fromEntries(maqs.map(m => [m.id, m.nombre]));

  const totalLitros = results.reduce((a, r) => a + Number(r.litros || 0), 0);
  const totalImporte = results.reduce((a, r) => a + Number(r.importe || 0), 0);

  const lineas = results.map(r =>
    `• [${r.fecha}] ${maqMap[r.maquina_id] || `Máq#${r.maquina_id}`} — ${r.litros}L | $${Number(r.importe || 0).toLocaleString("es-AR")} | ${r.estacion || "-"}`
  );
  return `${results.length} cargas | Total: ${totalLitros.toFixed(1)}L | $${totalImporte.toLocaleString("es-AR")}\n${lineas.join("\n")}`;
}

async function executeConsultarMantenimientos(args: { nombre_maquina?: string; tipo?: string; desde?: string; hasta?: string }) {
  const { gte, lte, between } = await import("drizzle-orm");

  let maqId: number | undefined;
  if (args.nombre_maquina) {
    const [m] = await db.select({ id: maquinasTable.id }).from(maquinasTable)
      .where(ilike(maquinasTable.nombre, `%${args.nombre_maquina}%`)).limit(1);
    if (!m) return `No encontré máquina llamada "${args.nombre_maquina}".`;
    maqId = m.id;
  }

  let query = db.select().from(mantenimientosTable).$dynamic();
  const conditions: any[] = [];
  if (maqId) conditions.push(eq(mantenimientosTable.maquina_id, maqId));
  if (args.tipo) conditions.push(ilike(mantenimientosTable.tipo, `%${args.tipo}%`));
  if (args.desde && args.hasta) conditions.push(between(mantenimientosTable.fecha, args.desde, args.hasta));
  else if (args.desde) conditions.push(gte(mantenimientosTable.fecha, args.desde));
  else if (args.hasta) conditions.push(lte(mantenimientosTable.fecha, args.hasta));
  if (conditions.length) query = query.where(and(...conditions));
  query = query.orderBy(desc(mantenimientosTable.fecha)).limit(15);

  const results = await query;
  if (results.length === 0) return "No hay registros de mantenimiento con esos filtros.";

  const maqIds = [...new Set(results.map(r => r.maquina_id))];
  const maqs = await db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre }).from(maquinasTable)
    .where(or(...maqIds.map(id => eq(maquinasTable.id, id))));
  const maqMap = Object.fromEntries(maqs.map(m => [m.id, m.nombre]));

  const lineas = results.map(r =>
    `• [${r.fecha}] ${maqMap[r.maquina_id] || `Máq#${r.maquina_id}`} — ${r.tipo} | ${r.descripcion || "-"} | Estado: ${r.estado}${r.proximo_service ? ` | Próximo: ${r.proximo_service}` : ""}`
  );
  return `${results.length} mantenimiento(s):\n${lineas.join("\n")}`;
}

async function executeRegistrarEmpleado(args: { nombre: string; apellido: string; dni: string; telefono?: string; telefono_whatsapp?: string; cargo?: string; fecha_ingreso?: string }) {
  try {
    const [emp] = await db.insert(empleadosTable).values({
      nombre: args.nombre,
      apellido: args.apellido,
      dni: args.dni,
      telefono: args.telefono || null,
      telefono_whatsapp: args.telefono_whatsapp || null,
      cargo: args.cargo || null,
      fecha_ingreso: args.fecha_ingreso || null,
      estado: "activo",
    }).returning();
    return `✅ Empleado registrado: *${emp.nombre} ${emp.apellido}* (ID #${emp.id}) | DNI: ${emp.dni} | Cargo: ${emp.cargo || "-"}`;
  } catch (error: any) {
    return `❌ Error al registrar empleado: ${error.message}`;
  }
}
