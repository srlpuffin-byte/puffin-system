import OpenAI from "openai"; // Usamos el SDK de OpenAI apuntando a Groq
import { db } from "@workspace/db";
import {
  empleadosTable,
  maquinasTable,
  fotografiasTable,
  egresosTable,
  whatsappSesionesTable,
  proyectosTable,
  combustibleTable,
  mantenimientosTable,
  usuariosTable,
} from "@workspace/db/schema";
import { eq, like, or, and, desc, ilike, notInArray } from "drizzle-orm";
import crypto from "crypto";
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
      description: "Consulta máquinas/equipos e inventario. Muestra qué proyecto tiene asignada cada máquina (distribución). Úsala para: listar todas las máquinas, ver dónde está cada máquina/equipo, cómo están distribuidas las máquinas entre proyectos, buscar por nombre o tipo, filtrar por estado.",
      parameters: {
        type: "object",
        properties: {
          termino: { type: "string", description: "Término de búsqueda por nombre/tipo (opcional)" },
          estado: { type: "string", description: "Filtrar por estado: activo, inactivo, mantenimiento (opcional)" },
          categoria: { type: "string", description: "Filtrar por categoría: maquinaria, inventario (opcional)" },
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
          termino: { type: "string", description: "Nombre, apellido o DNI a buscar (opcional)" },
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
      description: "Consulta proyectos/obras con sus empleados y máquinas asignadas. Úsala cuando el usuario pregunta: qué máquinas/equipos hay en un proyecto, cómo están distribuidas las máquinas, qué operarios o maquinaria tiene una obra, dónde está cada máquina. Siempre usar incluir_asignaciones=true cuando pregunten por distribución de máquinas u operarios.",
      parameters: {
        type: "object",
        properties: {
          estado: { type: "string", description: "Filtrar por estado: activo, finalizado, pausado (opcional)" },
          nombre: { type: "string", description: "Buscar por nombre/lugar del proyecto (opcional)." },
          orden: { type: "string", description: "primer, ultimo, mayor_ganancia (opcional)" },
          incluir_asignaciones: { type: "boolean", description: "Si true, muestra los nombres de empleados Y máquinas asignadas. Usar true siempre que se pregunte por máquinas, equipos u operarios." },
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
      name: "enviar_fotografia",
      description: "Obtiene y envía por WhatsApp la foto de una máquina, un operario, un DNI o un comprobante/ticket de gasto.",
      parameters: {
        type: "object",
        properties: {
          tipo_entidad: { type: "string", description: "Tipo: maquina, operario, dni, comprobante" },
          busqueda: { type: "string", description: "Nombre, DNI o identificador (ej: 'ferreteria', concepto del gasto) de la entidad a buscar" },
        },
        required: ["tipo_entidad", "busqueda"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_mensaje_whatsapp",
      description: "Envía un mensaje de WhatsApp. Si el usuario dice 'mandale a todos' o similar, usá 'todos=true' sin dudar. De lo contrario, usá nombre o número.",
      parameters: {
        type: "object",
        properties: {
          numero: { type: "string", description: "Número de teléfono (solo dígitos)." },
          nombre_empleado: { type: "string", description: "Nombre del empleado destinatario." },
          todos: { type: "boolean", description: "Setear a true si el usuario pide enviar mensaje masivo a todos." },
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
      description: "Registra un gasto/egreso en el sistema. CRÍTICO: Si el usuario te pide cargar un gasto, pero no te da todos los datos obligatorios (Fecha, Categoría, Concepto, Monto), DEBÉS preguntarle cuáles son antes de usar esta herramienta. Una vez que tengas todo, mostrale un resumen detallado y pedí confirmación ('OK' o 'Sí') ANTES de llamar a la herramienta.",
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
      description: "Registra un nuevo empleado en el sistema. CRÍTICO: Si faltan datos obligatorios (Nombre, Apellido, DNI), debes preguntarle al usuario antes de usar esta herramienta. Luego pide confirmación.",
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
  {
    type: "function",
    function: {
      name: "registrar_jornada",
      description: "Registra una nueva jornada de trabajo. CRÍTICO: Si faltan datos (Empleado, Obra/Proyecto), pregúntale al usuario antes de llamar a la función. Pedir confirmación antes de guardar.",
      parameters: {
        type: "object",
        properties: {
          nombre_empleado: { type: "string", description: "Nombre del empleado" },
          nombre_obra: { type: "string", description: "Nombre de la obra o proyecto" },
          fecha: { type: "string", description: "Fecha YYYY-MM-DD (default: hoy)" },
          hora_inicio: { type: "string", description: "Hora de inicio HH:MM (opcional)" },
          hora_fin: { type: "string", description: "Hora de fin HH:MM (opcional)" },
          estado: { type: "string", description: "Estado: activo, completado, ausente (default: activo)" },
        },
        required: ["nombre_empleado", "nombre_obra"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "actualizar_jornada",
      description: "Actualiza una jornada existente: marcar como completada, registrar hora de salida, cambiar estado.",
      parameters: {
        type: "object",
        properties: {
          nombre_empleado: { type: "string", description: "Nombre del empleado" },
          fecha: { type: "string", description: "Fecha YYYY-MM-DD (default: hoy)" },
          hora_fin: { type: "string", description: "Hora de fin HH:MM" },
          estado: { type: "string", description: "Nuevo estado: completado, ausente, activo" },
        },
        required: ["nombre_empleado"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_combustible_bot",
      description: "Registra combustible. CRÍTICO: Debes pedir los datos obligatorios (Máquina, Litros, Empleado que cargó) si el usuario no los proporciona. Luego pide confirmación.",
      parameters: {
        type: "object",
        properties: {
          nombre_maquina: { type: "string", description: "Nombre de la máquina" },
          nombre_empleado: { type: "string", description: "Nombre del empleado que cargó" },
          litros: { type: "number", description: "Litros cargados" },
          importe: { type: "number", description: "Importe total en pesos (opcional)" },
          estacion: { type: "string", description: "Nombre de la estación de servicio (opcional)" },
          fecha: { type: "string", description: "Fecha YYYY-MM-DD (default: hoy)" },
        },
        required: ["nombre_maquina", "litros"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_mantenimiento_bot",
      description: "Registra un mantenimiento de máquina. CRÍTICO: Debes pedir los datos obligatorios (Máquina, Tipo de mantenimiento) si el usuario no los da. Luego pide confirmación.",
      parameters: {
        type: "object",
        properties: {
          nombre_maquina: { type: "string", description: "Nombre de la máquina" },
          tipo: { type: "string", description: "Tipo de mantenimiento (aceite, filtros, neumaticos, frenos, general, etc.)" },
          descripcion: { type: "string", description: "Descripción del trabajo realizado (opcional)" },
          proximo_service: { type: "string", description: "Fecha o descripción del próximo service (opcional)" },
          fecha: { type: "string", description: "Fecha YYYY-MM-DD (default: hoy)" },
        },
        required: ["nombre_maquina", "tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "actualizar_proyecto",
      description: "Actualiza el estado de un proyecto o asigna/desasigna empleados y máquinas.",
      parameters: {
        type: "object",
        properties: {
          nombre_proyecto: { type: "string", description: "Nombre o lugar del proyecto" },
          nuevo_estado: { type: "string", description: "Nuevo estado: activo, finalizado, pausado (opcional)" },
          agregar_empleado: { type: "string", description: "Nombre del empleado a asignar (opcional)" },
          quitar_empleado: { type: "string", description: "Nombre del empleado a desasignar (opcional)" },
          agregar_maquina: { type: "string", description: "Nombre de la máquina a asignar (opcional)" },
          quitar_maquina: { type: "string", description: "Nombre de la máquina a desasignar (opcional)" },
        },
        required: ["nombre_proyecto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crear_acceso_sistema",
      description: "Crea un usuario web. CRÍTICO: Requiere nombre, apellido, DNI y PIN. Si falta alguno, pregúntale al usuario primero.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "Nombre del empleado" },
          apellido: { type: "string", description: "Apellido del empleado" },
          dni: { type: "string", description: "DNI del empleado (se usará como nombre de usuario para el login)" },
          pin: { type: "string", description: "PIN de 4 a 6 dígitos para la contraseña" },
          rol: { type: "string", description: "Rol: empleado, admin (default: empleado)" },
        },
        required: ["nombre", "apellido", "dni", "pin"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crear_accesos_faltantes",
      description: "Revisa todos los empleados de la base de datos y les crea automáticamente un usuario para el sistema web a los que todavía no lo tengan. Usa su DNI como usuario y como PIN.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "limpiar_operarios_duplicados",
      description: "Busca operarios con el mismo nombre y DNI, conserva el que tenga más información y elimina los duplicados redundantes.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resumen_operativo",
      description: "Genera el reporte/resumen del día: incluye gastos, horas trabajadas, combustible cargado y mantenimientos.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Fecha YYYY-MM-DD (default: hoy)" }
        },
        required: [],
      },
    },
  }
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

export async function handleWhatsAppMessage(from: string, text: string, imageBase64?: string) {
  const senderPhone = from.replace(/[^0-9]/g, "");

  const isAdmin = ADMIN_PHONES.some(admin =>
    senderPhone.endsWith(admin) || admin.endsWith(senderPhone.slice(-10))
  );

  if (!openai) {
    console.warn("API KEY de IA no configurada. Asistente deshabilitado.");
    await sendWhatsAppMessage(from, "Lo siento, el asistente no está configurado por el momento.");
    return;
  }

  // Comando especial para limpiar historial (útil al cambiar de modelo)
  if (text.trim().toLowerCase() === "reset") {
    await db.update(whatsappSesionesTable).set({ messages: [] }).where(eq(whatsappSesionesTable.phone, senderPhone));
    await sendWhatsAppMessage(from, "✅ Memoria borrada. Arrancamos de cero con el nuevo modelo.");
    return;
  }

  // Obtener historial de conversación
  const sesion = await obtenerSesion(senderPhone);
  
  // Reconstruir historial preservando pares tool_call/tool_result completos.
  // Un tool_call sin su tool_result correspondiente rompe la API de OpenAI/Groq,
  // por eso se filtran los pares incompletos pero se mantienen los completos.
  const historial = (sesion.messages as any[]) || [];
  const historialFiltrado: any[] = [];
  for (let i = 0; i < historial.length; i++) {
    const msg = historial[i];
    if (msg.tool_calls) {
      // Verificar que el siguiente mensaje sea el tool_result correspondiente
      const toolIds = msg.tool_calls.map((tc: any) => tc.id);
      const siguientes = historial.slice(i + 1, i + 1 + toolIds.length);
      const tieneResultados = siguientes.every((s: any) => s.role === "tool" && toolIds.includes(s.tool_call_id));
      if (tieneResultados) {
        // Par completo: agregar el assistant + sus tool_results
        historialFiltrado.push(msg);
        for (let j = 0; j < toolIds.length; j++) {
          historialFiltrado.push(historial[i + 1 + j]);
        }
        i += toolIds.length; // saltar los tool_results ya procesados
      }
      // Si el par está incompleto (tool_call sin result), lo descartamos
    } else if (msg.role !== "tool") {
      // Mensajes user/assistant normales siempre se incluyen
      historialFiltrado.push(msg);
    }
  }

  // Agregar mensaje del usuario al historial
  if (imageBase64) {
    historialFiltrado.push({ 
      role: "user", 
      content: [
        { type: "text", text: text },
        { type: "image_url", image_url: { url: imageBase64 } }
      ] 
    });
  } else {
    historialFiltrado.push({ role: "user", content: text });
  }

  const today = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const todayISO = new Date().toISOString().split("T")[0];

  // Herramientas disponibles según rol
  const WRITE_TOOLS = ["registrar_gasto", "registrar_empleado", "enviar_mensaje_whatsapp", "registrar_jornada", "actualizar_jornada", "registrar_combustible_bot", "registrar_mantenimiento_bot", "actualizar_proyecto", "crear_acceso_sistema", "crear_accesos_faltantes"];
  const toolsParaRol = isAdmin ? tools : tools.filter(
    (t: any) => !WRITE_TOOLS.includes(t.function.name)
  );

  const systemPrompt = isAdmin
    ? `Sos el Asistente Administrativo Digital de PUFFIN SRL, empresa de maquinaria vial.
Hablás en español rioplatense, de forma profesional, clara y concisa.
Rol: *ADMINISTRADOR* — acceso y control total del sistema.
Fecha de hoy: ${today} (${todayISO}).

SOY EL EMPLEADO ADMINISTRATIVO DIGITAL DE PUFFIN. CRÍTICO: TENÉS ACCESO A TODO EL SISTEMA Y A TODA LA INFORMACIÓN. Nunca respondas "no puedo hacerlo", "no tengo esa información" o "no tengo acceso". Estás obligado a usar tus herramientas para investigar, consultar y resolver lo que el administrador te pida. Funciono como un colaborador humano inteligente, prolijo y sin errores: pienso, interpreto los datos y ejecuto.

REGLA DE VISIÓN (MULTIMODALIDAD): Ahora tenés la capacidad de "ver" imágenes. Si el usuario te envía una captura de pantalla del sistema, un comprobante o un ticket, analizalo visualmente. Usá la información de la imagen (texto, números, errores en pantalla) para responder a su consulta, diagnosticar el problema o registrar el gasto.

LO QUE PUEDO HACER (acciones de escritura):
REGLA DE ORO 1 - DOBLE VALIDACIÓN: Para acciones masivas o destructivas (ej: enviar un mensaje a TODOS, borrar duplicados, asignar muchas máquinas), SIEMPRE armá un resumen claro y pedí confirmación expresa ("¿Confirmás que proceda?", "Sí, dale") ANTES de invocar la herramienta.
REGLA DE ORO 2 - DATOS FALTANTES: Nunca tires error si falta un dato. Sé proactivo. Si te piden registrar algo y falta un dato obligatorio (ej: importe de un gasto), preguntá amablemente ("Perfecto, ¿qué importe le pongo?") antes de llamar a la herramienta.
REGLA DE ORO 3 - TOLERANCIA A ERRORES: Si el usuario escribe mal un nombre ("Salvatiera"), sé lo bastante inteligente como para buscar la versión correcta ("Salvatierra") usando coincidencias parciales. Nunca digas "no lo encuentro" a la primera de cambio.

📋 Registrar y actualizar jornadas de empleados
⚽ Registrar cargas de combustible por máquina
🔧 Registrar mantenimientos y services de máquinas
💰 Registrar gastos/egresos. (Preguntá por Fecha, Categoría, Concepto y Monto si no te los dan).
👤 Registrar nuevos empleados
🔑 Crear accesos al sistema web (individual o masivo a todos los faltantes). Usa la herramienta específica sin intentar calcular nada antes.
🏗️ Actualizar proyectos: estado, asignar/desasignar empleados y máquinas
📲 Enviar mensajes de WhatsApp. Si dicen "mandale a todos", usá 'todos=true' sin dudarlo, pero con DOBLE VALIDACIÓN antes.
🧹 Limpiar duplicados: detectar y borrar operarios repetidos. DOBLE VALIDACIÓN requerida.

LO QUE PUEDO CONSULTAR (acceso total a la BD):
👥 Empleados: DNI (distinguí homónimos con ID o DNI), cargos, teléfono, asignación a proyectos.
🛠️ Máquinas/Inventario: estado, tipo, asignaciones a obras. Separación clara de maquinarias vs inventario menor.
🏗️ Proyectos/Distribución Global: Cuando pidan distribución global o "cómo están asignados todos", extraé el reporte completo cruzando empleados, máquinas y proyectos, sin excusas.
📅 Jornadas: quién trabajó, dónde, cuándo, horarios.
💰 Gastos, ⚽ Combustible, 🔧 Mantenimientos.
📈 Resumen Operativo Diario: Si piden el resumen de hoy, ejecutá la herramienta correspondiente y mostralo limpio.
📸 Fotografías y Comprobantes: Si piden imagen de chata, operario, DNI, o comprobante/ticket de gasto, USÁ LA HERRAMIENTA 'enviar_fotografia'.
📊 Google Sheets: cualquier dato en las planillas (tus acciones de escritura ya sincronizan solas).

REGLAS DE OPERACIÓN:
- SIEMPRE usá las herramientas para buscar datos. Nunca inventés información.
- CONTEXTO DE CONVERSACIÓN: Si el usuario hace una pregunta de seguimiento corta, inferí el tema del mensaje anterior.
- Cuando no encontrés algo, decilo claramente.
- Respondé siempre de forma concisa y profesional.

CATEGORÍAS DE GASTO: Combustible, Materiales, Servicios, Mantenimiento, Herramientas, Administrativo, Personal, Alquiler, Otro.`
    : `Sos el Asistente de PUFFIN SRL.
Hablás en español rioplatense, de forma profesional.
Rol: *OPERARIO* — acceso solo lectura.
Fecha de hoy: ${today} (${todayISO}).

Podés consultar: empleados, proyectos, jornadas, máquinas, combustible, mantenimientos, gastos.
NO podés registrar ni modificar datos. Si te piden eso, informá que solo los administradores pueden hacerlo.
Nunca inventés datos. Usá siempre las herramientas disponibles.
CONTEXTO: Si el usuario hace una pregunta de seguimiento corta (ej: "y que maquinaria?", "y los equipos?"), inferí el tema del mensaje anterior para responder correctamente.`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...historialFiltrado.slice(-MAX_HISTORY) as any[],
  ];

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: toolsParaRol,
      tool_choice: "auto",
    });


    const responseMessage = response.choices[0].message;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Agregar respuesta del asistente al historial
      historialFiltrado.push(responseMessage);
      messages.push(responseMessage);

      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.type !== "function") continue;
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        let toolResult = "";

        if (functionName === "consultar_inventario") {
          toolResult = await executeConsultarInventario(functionArgs.termino, functionArgs.estado, functionArgs.orden, functionArgs.categoria);
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
        } else if (functionName === "enviar_fotografia") {
          toolResult = await executeEnviarFotografia(from, functionArgs.tipo_entidad, functionArgs.busqueda);
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
        } else if (functionName === "registrar_jornada") {
          toolResult = await executeRegistrarJornada(functionArgs);
        } else if (functionName === "actualizar_jornada") {
          toolResult = await executeActualizarJornada(functionArgs);
        } else if (functionName === "registrar_combustible_bot") {
          toolResult = await executeRegistrarCombustible(functionArgs);
        } else if (functionName === "registrar_mantenimiento_bot") {
          toolResult = await executeRegistrarMantenimiento(functionArgs);
        } else if (functionName === "actualizar_proyecto") {
          toolResult = await executeActualizarProyecto(functionArgs);
        } else if (functionName === "crear_acceso_sistema") {
          toolResult = await executeCrearAccesoSistema(functionArgs);
        } else if (functionName === "crear_accesos_faltantes") {
          toolResult = await executeCrearAccesosFaltantes();
        } else if (functionName === "limpiar_operarios_duplicados") {
          toolResult = await executeLimpiarOperariosDuplicados();
        } else if (functionName === "resumen_operativo") {
          toolResult = await executeResumenOperativo(functionArgs.fecha);
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: toolResult,
        });
        historialFiltrado.push({
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
        historialFiltrado.push({ role: "assistant", content: finalContent });
      }
    } else if (responseMessage.content) {
      await sendWhatsAppMessage(from, responseMessage.content);
      historialFiltrado.push({ role: "assistant", content: responseMessage.content });
    }

    // Guardar historial actualizado
    await guardarSesion(senderPhone, historialFiltrado);

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
  // Helper: obtener el mejor número disponible (whatsapp > telefono)
  const getNumero = (e: { telefono_whatsapp?: string | null; telefono?: string | null }) =>
    e.telefono_whatsapp || e.telefono || null;

  // Enviar a todos los empleados
  if (todos) {
    const empleados = await db.select({
      nombre: empleadosTable.nombre,
      apellido: empleadosTable.apellido,
      telefono_whatsapp: empleadosTable.telefono_whatsapp,
      telefono: empleadosTable.telefono,
    }).from(empleadosTable).where(eq(empleadosTable.estado, "activo"));

    const conTelefono = empleados.map(e => ({ ...e, num: getNumero(e) })).filter(e => e.num);
    if (conTelefono.length === 0) return "No hay empleados activos con teléfono registrado en el sistema.";

    let exitosos = 0;
    const errores: string[] = [];
    for (const emp of conTelefono) {
      try {
        await sendWhatsAppMessage(emp.num!, mensaje);
        exitosos++;
      } catch (e: any) {
        errores.push(`${emp.nombre} ${emp.apellido}`);
      }
    }
    return `✅ Mensaje enviado a ${exitosos}/${conTelefono.length} empleados.${errores.length ? ` No se pudo enviar a: ${errores.join(", ")}` : ""}`;
  }

  let destino = numero;

  // Buscar por nombre si no se dio número
  if (!destino && nombreEmpleado) {
    const t = `%${nombreEmpleado.toLowerCase()}%`;
    const [emp] = await db
      .select({ telefono_whatsapp: empleadosTable.telefono_whatsapp, telefono: empleadosTable.telefono, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
      .from(empleadosTable)
      .where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t)))
      .limit(1);

    if (!emp) return `No encontré un empleado llamado "${nombreEmpleado}".`;
    destino = getNumero(emp) || undefined;
    if (!destino) return `El empleado ${emp.nombre} ${emp.apellido} no tiene teléfono registrado en el sistema.`;
    nombreEmpleado = `${emp.nombre} ${emp.apellido}`;
  }

  if (!destino) return "No se pudo determinar el destinatario. Proporcioná un número o nombre de empleado.";

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
    conditions.push(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t), ilike(empleadosTable.dni, t)));
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
    return `El primer empleado en ingresar fue *${e.nombre} ${e.apellido}* (ID #${e.id}) — Cargo: ${e.cargo || "-"} | Fecha ingreso: ${e.fecha_ingreso || "No registrada"} | Estado: ${e.estado}`;
  }

  // Obtener asignaciones de proyectos
  const proyectosActivos = await db.select({ lugar: proyectosTable.lugar, empleados_asignados: proyectosTable.empleados_asignados })
    .from(proyectosTable).where(eq(proyectosTable.estado, "activo"));
  const empProyMap: Record<number, string> = {};
  for (const p of proyectosActivos) {
    const ids = (p.empleados_asignados as number[]) || [];
    for (const id of ids) empProyMap[id] = p.lugar;
  }

  // Si se busca por nombre/DNI, mostrar info completa
  if (termino) {
    const lineas = results.slice(0, 10).map(e => {
      const proy = empProyMap[e.id] ? `📍 Obra actual: ${empProyMap[e.id]}` : `📍 Obra actual: Sin asignar`;
      return `👤 ID #${e.id}: *${e.nombre} ${e.apellido}*
   • Cargo: ${e.cargo || "-"}
   • Tel: ${e.telefono_whatsapp || e.telefono || "-"}
   • DNI: ${e.dni || "-"}
   • Estado: ${e.estado}
   • Ingreso: ${e.fecha_ingreso || "-"}
   • ${proy}`;
    });
    return lineas.join("\n\n");
  }

  const lineas = results.slice(0, 15).map(e => {
    const proy = empProyMap[e.id] ? ` | 📍 ${empProyMap[e.id]}` : "";
    return `• ID #${e.id}: ${e.nombre} ${e.apellido} (DNI ${e.dni}) — ${e.cargo || "Sin cargo"} | Tel: ${e.telefono_whatsapp || e.telefono || "-"} | ${e.estado === "activo" ? "Activo" : "Inactivo"}${proy}`;
  });
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

  const results = await query.limit(50);

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

async function executeConsultarInventario(termino?: string, estado?: string, orden?: string, categoria?: string) {
  const { asc } = await import("drizzle-orm");
  let query = db.select().from(maquinasTable).$dynamic();
  const conditions: any[] = [];
  if (termino) { const t = `%${termino.toLowerCase()}%`; conditions.push(or(ilike(maquinasTable.nombre, t), ilike(maquinasTable.tipo, t))); }
  if (estado) conditions.push(eq(maquinasTable.estado, estado));
  if (categoria) conditions.push(ilike(maquinasTable.categoria, `%${categoria}%`));
  if (conditions.length) query = query.where(and(...conditions));
  if (orden === "primer") query = query.orderBy(asc(maquinasTable.id));
  else if (orden === "ultimo") query = query.orderBy(desc(maquinasTable.id));
  else if (orden === "nombre") query = query.orderBy(asc(maquinasTable.nombre));
  const results = await query.limit(50);
  if (results.length === 0) return termino ? `No se encontraron máquinas para "${termino}".` : "No hay máquinas registradas.";
  if (orden === "primer" && !termino) {
    const m = results[0];
    return `La primera máquina ingresada fue *${m.nombre}* — Tipo: ${m.tipo} | Estado: ${m.estado} | Categoría: ${m.categoria}`;
  }

  // Obtener proyectos activos para saber dónde está cada máquina
  const proyectosActivos = await db.select({ lugar: proyectosTable.lugar, maquinas_asignadas: proyectosTable.maquinas_asignadas })
    .from(proyectosTable).where(eq(proyectosTable.estado, "activo"));

  // Construir mapa: maquina_id -> nombre del proyecto
  const maqProyMap: Record<number, string> = {};
  for (const p of proyectosActivos) {
    const ids = (p.maquinas_asignadas as number[]) || [];
    for (const id of ids) {
      maqProyMap[id] = p.lugar;
    }
  }

  const lineas = results.map(r => {
    const proyecto = maqProyMap[r.id] ? ` | 📍 ${maqProyMap[r.id]}` : " | 📍 Sin asignar";
    return `• *${r.nombre}* (${r.tipo}) — ${r.estado} | ${r.categoria}${proyecto}`;
  });
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

async function executeEnviarFotografia(from: string, tipo_entidad: string, busqueda: string) {
  try {
    const b = busqueda || "";
    const te = tipo_entidad || "";
    
    if (!b) return "Falta proporcionar el parámetro de búsqueda (ej: nombre de la máquina o DNI).";
    if (!te) return "Falta proporcionar el tipo de entidad (maquina, operario, dni, comprobante).";

    const t = `%${b.toLowerCase()}%`;
    let entidad_id: number | null = null;
    let tipoReal = te.toLowerCase();

    // Buscar en la tabla correspondiente según el tipo pedido
    if (tipoReal.includes("maquina") || tipoReal.includes("vehiculo") || tipoReal.includes("chata")) {
      const maq = await db.select().from(maquinasTable).where(ilike(maquinasTable.nombre, t)).limit(1);
      if (maq.length === 0) return `No encontré ninguna máquina o vehículo coincidente con "${b}".`;
      entidad_id = maq[0].id;
      tipoReal = "maquina";
    } else if (tipoReal.includes("operario") || tipoReal.includes("empleado") || tipoReal.includes("dni") || tipoReal.includes("perfil")) {
      const emp = await db.select().from(empleadosTable)
        .where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t), ilike(empleadosTable.dni, t)))
        .limit(1);
      if (emp.length === 0) return `No encontré ningún operario coincidente con "${b}".`;
      entidad_id = emp[0].id;
      
      // Identificar si piden DNI o foto general
      tipoReal = tipoReal.includes("dni") ? "empleado_dni" : "empleado_perfil";
    } else if (tipoReal.includes("comprobante") || tipoReal.includes("ticket") || tipoReal.includes("factura") || tipoReal.includes("gasto") || tipoReal.includes("egreso")) {
      const egreso = await db.select().from(egresosTable)
        .where(or(ilike(egresosTable.concepto, t), ilike(egresosTable.proveedor, t), ilike(egresosTable.categoria, t)))
        .limit(1);
      if (egreso.length === 0) return `No encontré ningún gasto/comprobante coincidente con "${b}".`;
      entidad_id = egreso[0].id;
      tipoReal = "gasto"; 
    } else {
      return `No reconozco el tipo de entidad "${te}". Debe ser maquina, operario, dni, o comprobante.`;
    }

    // Buscar la foto en la tabla fotografias
    const fotos = await db.select().from(fotografiasTable).where(
      and(
        or(ilike(fotografiasTable.entidad_tipo, `%${tipoReal}%`), eq(fotografiasTable.entidad_tipo, te)), 
        eq(fotografiasTable.entidad_id, entidad_id)
      )
    ).limit(1);

    if (fotos.length === 0) return `No hay fotografías registradas de tipo "${tipoReal}" para "${b}".`;

    let finalUrl = fotos[0].url;
    
    // Si la imagen está guardada en base64, subirla a Cloudinary primero para generar el link
    if (finalUrl.startsWith("data:image/")) {
      try {
        const { uploadImage } = await import("./storage.js");
        finalUrl = await uploadImage(`wa_foto_${Date.now()}.jpg`, finalUrl);
      } catch (e) {
        console.error("Error subiendo base64 a Cloudinary desde el asistente:", e);
      }
    }

    try {
      await sendWhatsAppImage(from, finalUrl, `Imagen de ${b} (${tipoReal})`);
      return `✅ Imagen enviada correctamente a través del canal de WhatsApp. Adicionalmente, AQUÍ TIENES EL ENLACE PÚBLICO para que se lo envíes al usuario en tu mensaje de texto: ${finalUrl}`;
    } catch (sendErr: any) {
      console.error("[WhatsApp] Error en sendWhatsAppImage:", sendErr);
      return `Ocurrió un error al intentar enviar la imagen adjunta por WhatsApp, PERO la imagen sí existe. Dile al usuario que falló el adjunto y envíale este enlace público: ${finalUrl}`;
    }

  } catch (error: any) {
    console.error("Excepción en executeEnviarFotografia:", error);
    return `Ocurrió un error interno al buscar la fotografía: ${error.message}`;
  }
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

    // Sincronizar
    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ Empleado registrado: *${emp.nombre} ${emp.apellido}* (ID #${emp.id}) | DNI: ${emp.dni} | Cargo: ${emp.cargo || "-"}`;
  } catch (error: any) {
    return `❌ Error al registrar empleado: ${error.message}`;
  }
}

async function executeRegistrarJornada(args: { nombre_empleado: string; nombre_obra: string; fecha?: string; hora_inicio?: string; hora_fin?: string; estado?: string }) {
  try {
    const hoy = new Date().toISOString().split("T")[0];
    const t = `%${args.nombre_empleado.toLowerCase()}%`;
    const [emp] = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
      .from(empleadosTable).where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t))).limit(1);
    if (!emp) return `❌ No encontré empleado con nombre "${args.nombre_empleado}".`;

    const [jornada] = await db.insert(jornadasTable).values({
      empleado_id: emp.id,
      nombre_obra: args.nombre_obra,
      fecha: args.fecha || hoy,
      hora_inicio: args.hora_inicio || null,
      hora_fin: args.hora_fin || null,
      estado: args.estado || "activo",
      empresa_id: 1,
    }).returning();

    // Sincronizar
    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ Jornada registrada: *${emp.nombre} ${emp.apellido}* en ${args.nombre_obra} | Fecha: ${jornada.fecha} | Estado: ${jornada.estado}${jornada.hora_inicio ? ` | Entrada: ${jornada.hora_inicio}` : ""}`;
  } catch (error: any) {
    return `❌ Error al registrar jornada: ${error.message}`;
  }
}

async function executeActualizarJornada(args: { nombre_empleado: string; fecha?: string; hora_fin?: string; estado?: string }) {
  try {
    const hoy = new Date().toISOString().split("T")[0];
    const t = `%${args.nombre_empleado.toLowerCase()}%`;
    const [emp] = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
      .from(empleadosTable).where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t))).limit(1);
    if (!emp) return `❌ No encontré empleado con nombre "${args.nombre_empleado}".`;

    const fecha = args.fecha || hoy;
    const { set } = await import("drizzle-orm");
    const updates: any = {};
    if (args.hora_fin) updates.hora_fin = args.hora_fin;
    if (args.estado) updates.estado = args.estado;

    const [updated] = await db.update(jornadasTable)
      .set(updates)
      .where(and(eq(jornadasTable.empleado_id, emp.id), eq(jornadasTable.fecha, fecha)))
      .returning();

    if (!updated) return `No encontré jornada de ${emp.nombre} ${emp.apellido} para el ${fecha}.`;

    // Sincronizar
    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ Jornada actualizada: *${emp.nombre} ${emp.apellido}* | ${fecha} | Estado: ${updated.estado}${updated.hora_fin ? ` | Salida: ${updated.hora_fin}` : ""}`;
  } catch (error: any) {
    return `❌ Error al actualizar jornada: ${error.message}`;
  }
}

async function executeRegistrarCombustible(args: { nombre_maquina: string; nombre_empleado?: string; litros: number; importe?: number; estacion?: string; fecha?: string }) {
  try {
    const hoy = new Date().toISOString().split("T")[0];

    const [maq] = await db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre })
      .from(maquinasTable).where(ilike(maquinasTable.nombre, `%${args.nombre_maquina}%`)).limit(1);
    if (!maq) return `❌ No encontré máquina llamada "${args.nombre_maquina}".`;

    let empId = 1;
    if (args.nombre_empleado) {
      const t = `%${args.nombre_empleado.toLowerCase()}%`;
      const [emp] = await db.select({ id: empleadosTable.id }).from(empleadosTable)
        .where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t))).limit(1);
      if (emp) empId = emp.id;
    }

    const [reg] = await db.insert(combustibleTable).values({
      maquina_id: maq.id,
      empleado_id: empId,
      fecha: args.fecha || hoy,
      litros: args.litros.toString(),
      importe: args.importe ? args.importe.toString() : null,
      estacion: args.estacion || null,
      estado: "activo",
      empresa_id: 1,
    }).returning();

    // Sincronizar
    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ Combustible registrado: *${maq.nombre}* | ${reg.litros}L${args.importe ? ` | $${Number(args.importe).toLocaleString("es-AR")}` : ""} | ${args.estacion || "Sin estación"} | Fecha: ${reg.fecha}`;
  } catch (error: any) {
    return `❌ Error al registrar combustible: ${error.message}`;
  }
}

async function executeRegistrarMantenimiento(args: { nombre_maquina: string; tipo: string; descripcion?: string; proximo_service?: string; fecha?: string }) {
  try {
    const hoy = new Date().toISOString().split("T")[0];

    const [maq] = await db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre })
      .from(maquinasTable).where(ilike(maquinasTable.nombre, `%${args.nombre_maquina}%`)).limit(1);
    if (!maq) return `❌ No encontré máquina llamada "${args.nombre_maquina}".`;

    const [mant] = await db.insert(mantenimientosTable).values({
      maquina_id: maq.id,
      fecha: args.fecha || hoy,
      tipo: args.tipo,
      descripcion: args.descripcion || null,
      proximo_service: args.proximo_service || null,
      estado: "realizado",
      empresa_id: 1,
    }).returning();

    // Sincronizar
    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ Mantenimiento registrado: *${maq.nombre}* | Tipo: ${mant.tipo}${mant.descripcion ? ` | ${mant.descripcion}` : ""}${mant.proximo_service ? ` | Próximo: ${mant.proximo_service}` : ""} | Fecha: ${mant.fecha}`;
  } catch (error: any) {
    return `❌ Error al registrar mantenimiento: ${error.message}`;
  }
}

async function executeActualizarProyecto(args: { nombre_proyecto: string; nuevo_estado?: string; agregar_empleado?: string; quitar_empleado?: string; agregar_maquina?: string; quitar_maquina?: string }) {
  try {
    const [proy] = await db.select().from(proyectosTable)
      .where(ilike(proyectosTable.lugar, `%${args.nombre_proyecto}%`)).limit(1);
    if (!proy) return `❌ No encontré proyecto llamado "${args.nombre_proyecto}".`;

    const updates: any = {};
    const cambios: string[] = [];

    if (args.nuevo_estado) {
      updates.estado = args.nuevo_estado;
      cambios.push(`Estado → ${args.nuevo_estado}`);
    }

    let empIds: number[] = (proy.empleados_asignados as number[]) || [];
    let maqIds: number[] = (proy.maquinas_asignadas as number[]) || [];

    if (args.agregar_empleado) {
      const t = `%${args.agregar_empleado.toLowerCase()}%`;
      const [emp] = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
        .from(empleadosTable).where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t))).limit(1);
      if (!emp) return `❌ No encontré empleado "${args.agregar_empleado}".`;
      if (!empIds.includes(emp.id)) { empIds = [...empIds, emp.id]; cambios.push(`Asignado: ${emp.nombre} ${emp.apellido}`); }
    }
    if (args.quitar_empleado) {
      const t = `%${args.quitar_empleado.toLowerCase()}%`;
      const [emp] = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
        .from(empleadosTable).where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t))).limit(1);
      if (emp) { empIds = empIds.filter(id => id !== emp.id); cambios.push(`Desasignado: ${emp.nombre} ${emp.apellido}`); }
    }
    if (args.agregar_maquina) {
      const [maq] = await db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre })
        .from(maquinasTable).where(ilike(maquinasTable.nombre, `%${args.agregar_maquina}%`)).limit(1);
      if (!maq) return `❌ No encontré máquina "${args.agregar_maquina}".`;
      if (!maqIds.includes(maq.id)) { maqIds = [...maqIds, maq.id]; cambios.push(`Máquina asignada: ${maq.nombre}`); }
    }
    if (args.quitar_maquina) {
      const [maq] = await db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre })
        .from(maquinasTable).where(ilike(maquinasTable.nombre, `%${args.quitar_maquina}%`)).limit(1);
      if (maq) { maqIds = maqIds.filter(id => id !== maq.id); cambios.push(`Máquina desasignada: ${maq.nombre}`); }
    }

    updates.empleados_asignados = empIds;
    updates.maquinas_asignadas = maqIds;

    await db.update(proyectosTable).set(updates).where(eq(proyectosTable.id, proy.id));

    // Sincronizar
    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ Proyecto *${proy.lugar}* actualizado:\n${cambios.map(c => `• ${c}`).join("\n")}`;
  } catch (error: any) {
    return `❌ Error al actualizar proyecto: ${error.message}`;
  }
}

async function executeCrearAccesoSistema(args: { nombre: string; apellido: string; dni: string; pin: string; rol?: string }) {
  try {
    const dniStr = String(args.dni);
    const pinStr = String(args.pin);
    const rolStr = args.rol ? String(args.rol) : "empleado";
    
    const usuarioExistente = await db.select().from(usuariosTable).where(eq(usuariosTable.usuario, dniStr));
    if (usuarioExistente.length > 0) {
      return `❌ El usuario con DNI ${dniStr} ya tiene acceso al sistema.`;
    }

    const pinHash = crypto.createHash("sha256").update(pinStr + "puffin-salt").digest("hex");
    
    await db.insert(usuariosTable).values({
      nombre: String(args.nombre),
      apellido: String(args.apellido),
      usuario: dniStr,
      pin_hash: pinHash,
      rol: rolStr,
      activo: true
    });

    return `✅ Acceso al sistema creado para *${args.nombre} ${args.apellido}*.\nUsuario: ${dniStr}\nPIN: ${pinStr}\nRol: ${rolStr}`;
  } catch (error: any) {
    return `❌ Error al crear acceso al sistema: ${error.message}`;
  }
}

async function executeCrearAccesosFaltantes() {
  try {
    const empleados = await db.select().from(empleadosTable);
    const usuarios = await db.select().from(usuariosTable);
    
    const dnisConUsuario = new Set(usuarios.map(u => u.usuario));
    
    const empleadosSinUsuario = empleados.filter(e => e.dni && !dnisConUsuario.has(e.dni));
    
    if (empleadosSinUsuario.length === 0) {
      return `✅ Todos los operarios ya tienen usuario creado en el sistema.`;
    }

    let creados = 0;
    for (const emp of empleadosSinUsuario) {
      const dniStr = String(emp.dni).trim();
      const pinHash = crypto.createHash("sha256").update(dniStr + "puffin-salt").digest("hex");
      
      await db.insert(usuariosTable).values({
        nombre: emp.nombre,
        apellido: emp.apellido,
        usuario: dniStr,
        pin_hash: pinHash,
        rol: "empleado",
        activo: true
      });
      creados++;
    }

    return `✅ ¡Listo! Creé acceso masivo para los ${creados} operarios que faltaban. Se usó su DNI como usuario y su DNI como PIN para todos.`;
  } catch (error: any) {
    return `❌ Error al crear accesos masivos: ${error.message}`;
  }
}

async function executeLimpiarOperariosDuplicados() {
  try {
    const todos = await db.select().from(empleadosTable);
    
    // Agrupar por nombre+apellido (o dni si existe)
    const grupos: Record<string, typeof todos> = {};
    for (const e of todos) {
      const key = e.dni ? e.dni : `${e.nombre.toLowerCase()}_${e.apellido.toLowerCase()}`;
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(e);
    }

    let eliminados = 0;
    const detalles: string[] = [];

    for (const key of Object.keys(grupos)) {
      const lista = grupos[key];
      if (lista.length > 1) {
        // Ordenar: el que tenga más campos llenos gana
        lista.sort((a, b) => {
          const scoreA = Object.values(a).filter(v => v !== null && v !== "").length;
          const scoreB = Object.values(b).filter(v => v !== null && v !== "").length;
          return scoreB - scoreA;
        });

        const ganador = lista[0];
        const aEliminar = lista.slice(1);
        
        for (const e of aEliminar) {
          await db.delete(empleadosTable).where(eq(empleadosTable.id, e.id));
          eliminados++;
          detalles.push(`Eliminado ID #${e.id} (${e.nombre} ${e.apellido}) -> Conservado ID #${ganador.id}`);
        }
      }
    }

    if (eliminados === 0) return "✅ No se detectaron operarios duplicados en el sistema.";
    
    return `✅ Limpieza completada. Se eliminaron ${eliminados} registros duplicados:\n${detalles.map(d => `• ${d}`).join("\n")}`;
  } catch (error: any) {
    return `❌ Error al limpiar duplicados: ${error.message}`;
  }
}

async function executeResumenOperativo(fechaReq?: string) {
  try {
    const fecha = fechaReq || new Date().toISOString().split("T")[0];
    const { sum, and, eq, gte, lte } = await import("drizzle-orm");

    // Jornadas
    const jornadas = await db.select().from(jornadasTable).where(eq(jornadasTable.fecha, fecha));
    const totalJornadas = jornadas.length;
    const completadas = jornadas.filter(j => j.estado === "completado").length;

    // Egresos (Gastos)
    const egresos = await db.select().from(egresosTable).where(eq(egresosTable.fecha, fecha));
    const totalGasto = egresos.reduce((a, e) => a + Number(e.monto || 0), 0);

    // Combustible
    const combustible = await db.select().from(combustibleTable).where(eq(combustibleTable.fecha, fecha));
    const totalLitros = combustible.reduce((a, c) => a + Number(c.litros || 0), 0);

    // Mantenimientos
    const mantenimientos = await db.select().from(mantenimientosTable).where(eq(mantenimientosTable.fecha, fecha));

    // Incidentes
    const { incidentesTable } = await import("@workspace/db/schema");
    const incidentes = await db.select().from(incidentesTable).where(eq(incidentesTable.fecha, fecha));

    return `📈 *RESUMEN OPERATIVO - ${fecha}*

👷 *Personal*: ${totalJornadas} operarios trabajando (${completadas} completaron su turno).
💰 *Gastos*: $${totalGasto.toLocaleString("es-AR")} registrados hoy (${egresos.length} egresos).
⚽ *Combustible*: ${totalLitros.toFixed(1)} L cargados hoy (${combustible.length} cargas).
🔧 *Mantenimientos*: ${mantenimientos.length} service(s) realizados.
🚨 *Incidentes*: ${incidentes.length > 0 ? `${incidentes.length} incidente(s) registrado(s)` : "Ningún incidente"}.

(Podés pedirme detalles específicos de cualquiera de estos puntos).`;
  } catch (error: any) {
    return `❌ Error al generar resumen operativo: ${error.message}`;
  }
}
