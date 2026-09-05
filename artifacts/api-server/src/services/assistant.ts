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
  jornadasTable,
  auditoriaTable,
  incidentesTable,
  alertasTable,
  documentosTable,
  alquileresTable,
} from "@workspace/db/schema";
import { eq, like, or, and, desc, ilike, notInArray } from "drizzle-orm";
import crypto from "crypto";
import { sendWhatsAppImage, sendWhatsAppMessage, sendWhatsAppDocument } from "./whatsapp.js";

// ─── Helper de auditoría para acciones del bot ──────────────────────────────
async function auditarBot(accion: string, entidad: string, entidad_id?: number | null, valor_nuevo?: object) {
  try {
    await db.insert(auditoriaTable).values({
      accion,
      entidad,
      entidad_id: entidad_id ?? null,
      valor_nuevo: valor_nuevo ?? null,
      usuario_id: null,          // Sin usuario web (acción del bot)
      ip: "whatsapp",
      dispositivo: "WhatsApp Bot",
    });
  } catch (e) {
    // No bloquear el flujo si falla la auditoría
    console.warn("[Auditoría] No se pudo registrar acción del bot:", (e as any)?.message);
  }
}

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

// Fechas en zona horaria oficial de Argentina (UTC-3)
// Evita que después de las 21:00 hs de Argentina (cuando UTC cambia de día) se guarde la fecha del día siguiente
export function getArgentinaTodayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

export function getArgentinaTodayDisplay(): string {
  return new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Herramientas disponibles para la IA
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "consultar_inventario",
      description: "Consulta máquinas/equipos e inventario menor. IMPORTANTE: Si el usuario pide 'inventario' o 'herramientas menores', usá categoria='inventario'. Si pide 'máquinas' o 'maquinaria pesada', usá categoria='maquinaria'. Si pide 'todo' o no especifica, dejá categoria vacío. Muestra qué proyecto tiene asignada cada máquina (distribución).",
      parameters: {
        type: "object",
        properties: {
          termino: { type: "string", description: "Término de búsqueda por nombre/tipo (opcional)" },
          estado: { type: "string", description: "Filtrar por estado: activa, inactiva, mantenimiento (opcional)" },
          categoria: { type: "string", description: "OBLIGATORIO cuando el usuario dice 'inventario' o 'máquinas'. Valores: 'maquinaria' o 'inventario'. Dejá vacío solo si piden todo junto." },
          orden: { type: "string", description: "primer, ultimo, nombre (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_rastreo",
      description: "Consulta la ubicación y velocidad en tiempo real de los vehículos/máquinas con GPS satelital (Xpert Satcom). Úsala cuando pregunten: dónde está una máquina, a qué velocidad va, si está encendida, ubicación de los vehículos, rastreo GPS.",
      parameters: {
        type: "object",
        properties: {
          nombre_maquina: { type: "string", description: "Nombre de la máquina a buscar (opcional, si se omite muestra todas)" },
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
          proyecto: { type: "string", description: "Filtrar por proyecto/obra (usar solo la palabra clave más distintiva, ej: 'Broglia' en vez de 'Campo Broglia') (opcional)" },
          desde: { type: "string", description: "Fecha inicio YYYY-MM-DD (opcional)" },
          hasta: { type: "string", description: "Fecha fin YYYY-MM-DD (opcional)" },
          agrupar_por: { type: "string", description: "Agrupar por: categoria, proyecto, mes (opcional)" },
          orden: { type: "string", description: "primer, ultimo, mayor, menor (opcional)" },
          limite: { type: "number", description: "Máximo registros (default: 200)" },
          fecha_registro: { type: "string", description: "Fecha de carga/creación en el sistema YYYY-MM-DD. Usar SOLO si preguntan qué egresos se agregaron/cargaron hoy al sistema." },
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
      name: "auditar_egresos_sheets",
      description: "Corrobora y compara el monto total de egresos guardados en el sistema (base de datos) contra el monto total en Google Sheets (pestaña Egresos). Úsala cuando el usuario pida corroborar, verificar totales o pida el total general de egresos.",
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
          fecha_registro: { type: "string", description: "Fecha de registro/creación en el sistema YYYY-MM-DD. Usar SOLO si preguntan qué jornadas se agregaron/cargaron hoy al sistema." },
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
      name: "adjuntar_comprobante",
      description: "Adjunta la foto/imagen que se acaba de enviar a un egreso/gasto YA EXISTENTE en la base de datos. Usar cuando el usuario envía una imagen y pide agregarla a un egreso ya creado. Busca el egreso por concepto, proyecto, monto o fecha.",
      parameters: {
        type: "object",
        properties: {
          concepto: { type: "string", description: "Concepto o descripción parcial del egreso al que adjuntar la foto (opcional)" },
          monto: { type: "number", description: "Monto del egreso al que adjuntar la foto (opcional)" },
          fecha: { type: "string", description: "Fecha del egreso en formato YYYY-MM-DD (opcional)" },
          centro_costos: { type: "string", description: "Proyecto/obra del egreso (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_gasto",
      description: "Registra definitivamente un gasto/egreso en la base de datos del sistema. REGLA FUNDAMENTAL: NO llames a esta función en el primer mensaje de datos de un gasto. Primero debés armar e interpretar toda la estructura del egreso, presentársela al usuario y pedir confirmación expresa (consultando si fue por transferencia o efectivo, si fue facturado o si desea modificar algo). Únicamente cuando el usuario confirme ('sí', 'confirmá', 'dale', 'guardalo', o responda indicando cómo guardarlo), ejecutá esta función.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Fecha del gasto en formato YYYY-MM-DD (opcional, si no se especifica usa hoy)" },
          categoria: { type: "string", description: "Categoría del gasto (ej: Repuestos, Mantenimiento, Combustible, Materiales, Servicios, Sueldos, Alquiler, Otros). Inferir automáticamente." },
          concepto: { type: "string", description: "Descripción o detalle del gasto" },
          monto: { type: "number", description: "Monto TOTAL en pesos. Si el usuario indica cantidad y precio unitario (ej: 47 litros a $2290), multiplícalos." },
          proveedor: { type: "string", description: "Nombre del proveedor o empresa si figura (opcional)" },
          metodo_pago: { type: "string", description: "Método de pago si se especificó, ej: 'Transferencia', 'Efectivo', 'Tarjeta' (opcional)" },
          facturado: { type: "boolean", description: "true si fue facturado (con factura), false si sin factura (opcional)" },
          centro_costos: { type: "string", description: "Proyecto u obra al que se imputa el gasto, ej: 'Lipsa' (opcional)" },
          observaciones: { type: "string", description: "Observaciones adicionales, ej: máquina asociada como 'Cargadora LiuGong' (opcional)" },
        },
        required: ["concepto", "monto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "actualizar_gasto",
      description: "Actualiza o completa datos (proyecto/centro de costos, máquina en observaciones, método de pago, facturado, categoría, proveedor, monto) del egreso más reciente o de un egreso específico por ID. Úsala cuando el usuario envía mensajes sucesivos o correcciones sobre un gasto ya registrado.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "ID del egreso a actualizar (opcional, si se omite actualiza el egreso más reciente)" },
          fecha: { type: "string", description: "Nueva fecha en formato YYYY-MM-DD si se desea corregir o cambiar la fecha" },
          centro_costos: { type: "string", description: "Proyecto u obra a asignar (ej: 'Lipsa')" },
          observaciones: { type: "string", description: "Observaciones o máquina asignada (ej: 'Cargadora LiuGong')" },
          metodo_pago: { type: "string", description: "Método de pago: 'Transferencia', 'Efectivo', etc. (opcional)" },
          facturado: { type: "boolean", description: "true si fue facturado, false si sin factura (opcional)" },
          categoria: { type: "string", description: "Nueva categoría si se desea cambiar" },
          concepto: { type: "string", description: "Nuevo concepto si se desea cambiar" },
          monto: { type: "number", description: "Nuevo monto si se desea cambiar" },
          proveedor: { type: "string", description: "Nuevo proveedor si se desea cambiar" },
        },
        required: [],
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
          fecha_registro: { type: "string", description: "Fecha de registro/creación en el sistema YYYY-MM-DD. Usar SOLO si preguntan qué cargas se agregaron/cargaron hoy al sistema." },
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
          importe: { type: "number", description: "Importe TOTAL en pesos (opcional). Si el usuario da el precio por litro, DEBES multiplicarlo por los litros para enviar el total acá." },
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
      name: "mover_entidad_proyecto",
      description: "Mueve un empleado o una máquina a un proyecto. Automáticamente lo desasigna de sus proyectos anteriores y lo asigna al nuevo. CRÍTICO: debes pedir confirmación antes de llamar a esta función.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", description: "empleado o maquina" },
          nombre_entidad: { type: "string", description: "Nombre del empleado o máquina a mover (ej: Sebas Prueba, Retroexcavadora 1)" },
          nombre_proyecto: { type: "string", description: "Nombre del proyecto destino (ej: Lipsa, Campo Broglia). Si el usuario pide desasignarlo, sacarlo o dejarlo sin proyecto, pasá exactamente la palabra 'ninguno'." },
        },
        required: ["tipo", "nombre_entidad", "nombre_proyecto"],
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
  },
  {
    type: "function",
    function: {
      name: "actualizar_fotografia",
      description: "Guarda la imagen/foto enviada por el usuario como la foto de perfil o avatar de un empleado o máquina. CRÍTICO: El usuario debe haber enviado una foto inmediatamente antes. Busca la entidad por su nombre/DNI.",
      parameters: {
        type: "object",
        properties: {
          tipo_entidad: { type: "string", description: "Tipo de entidad: empleado, maquina" },
          busqueda: { type: "string", description: "Nombre o DNI del empleado o máquina (ej: 'sebas', 'retroexcavadora')" },
        },
        required: ["tipo_entidad", "busqueda"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generar_excel_gastos",
      description: "Genera un archivo Excel (.xlsx) con los gastos/egresos y lo envía como documento por WhatsApp. Útil cuando el usuario pide un Excel, reporte descargable o planilla de gastos de un mes o proyecto.",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "Fecha de inicio YYYY-MM-DD" },
          hasta: { type: "string", description: "Fecha de fin YYYY-MM-DD" },
          proyecto: { type: "string", description: "Filtrar por proyecto (opcional)" },
          categoria: { type: "string", description: "Filtrar por categoría (opcional)" }
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ejecutar_consulta_sql_lectura",
      description: "Ejecuta una consulta SQL SELECT cruda en la base de datos PostgreSQL. Úsala cuando necesites cruzar datos o responder preguntas complejas que las otras herramientas no cubren. Tablas principales: empleados(id, nombre, apellido, dni, estado), proyectos(id, nombre, estado), maquinas(id, nombre, categoria, estado), egresos(id, fecha, categoria, concepto, monto, centro_costos), jornadas(id, empleado_id, proyecto_id, fecha, estado, hora_inicio, hora_fin), combustible(id, maquina_id, empleado_id, fecha, litros, importe), incidentes(id, fecha, tipo, descripcion, gravedad). IMPORTANTE: Solo se permiten sentencias SELECT.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La consulta SQL SELECT a ejecutar" }
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_incidente",
      description: "Registra un incidente, accidente o rotura. CRÍTICO: Si faltan datos obligatorios (descripción, fecha, tipo), pregunta primero.",
      parameters: {
        type: "object",
        properties: {
          descripcion: { type: "string", description: "Descripción detallada del incidente" },
          tipo: { type: "string", description: "Tipo: accidente, rotura, robo, otro" },
          fecha: { type: "string", description: "Fecha YYYY-MM-DD" },
          entidad_tipo: { type: "string", description: "empleado o maquina (opcional)" },
          busqueda_entidad: { type: "string", description: "Nombre de la entidad involucrada (opcional)" }
        },
        required: ["descripcion", "tipo", "fecha"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_alerta",
      description: "Registra una alerta (aviso importante, sanción o recordatorio).",
      parameters: {
        type: "object",
        properties: {
          descripcion: { type: "string", description: "Descripción de la alerta" },
          tipo: { type: "string", description: "Tipo de alerta" },
          prioridad: { type: "string", description: "Prioridad: alta, media, baja" },
          entidad_tipo: { type: "string", description: "empleado o maquina (opcional)" },
          busqueda_entidad: { type: "string", description: "Nombre de la entidad (opcional)" }
        },
        required: ["descripcion", "tipo", "prioridad"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_documento",
      description: "Registra un documento y su vencimiento (licencia, seguro, vtv).",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", description: "Tipo de documento (licencia, seguro, vtv, etc)" },
          descripcion: { type: "string", description: "Descripción breve" },
          fecha_vencimiento: { type: "string", description: "Fecha de vencimiento YYYY-MM-DD" },
          entidad_tipo: { type: "string", description: "empleado o maquina" },
          busqueda_entidad: { type: "string", description: "Nombre del empleado o máquina" }
        },
        required: ["tipo", "fecha_vencimiento", "entidad_tipo", "busqueda_entidad"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_alquileres",
      description: "Consulta y realiza el seguimiento exhaustivo de los contratos de alquiler de maquinaria (especialmente la excavadora). Muestra cliente/obra, fecha de inicio, horómetro inicial, horómetro actual en vivo, horas trabajadas acumuladas en el alquiler, estado del motor (encendida/apagada) y ubicación satelital. Úsala SIEMPRE que el usuario pregunte por el alquiler de la excavadora, seguimiento de alquileres, horas acumuladas, etc.",
      parameters: {
        type: "object",
        properties: {
          nombre_maquina: { type: "string", description: "Filtrar por nombre o modelo de la máquina (opcional)" },
          cliente: { type: "string", description: "Filtrar por cliente/proyecto que alquiló (opcional)" },
          estado: { type: "string", description: "Filtrar por estado: 'en_curso', 'finalizado' o 'todos' (opcional)" },
        },
        required: [],
      },
    },
  }
];


// Números de administradores autorizados
const ADMIN_PHONES = ["3472629600", "3572538350", "3572665637", "3572400877"];

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
    sesion.datos_pendientes = { ...(typeof sesion.datos_pendientes === "object" ? sesion.datos_pendientes : {}), ultima_imagen_url: imageBase64 };

  } else {
    historialFiltrado.push({ role: "user", content: text });
  }

  const today = getArgentinaTodayDisplay();
  const todayISO = getArgentinaTodayISO();

  // Herramientas disponibles según rol
  const WRITE_TOOLS = ["registrar_gasto", "actualizar_gasto", "registrar_empleado", "enviar_mensaje_whatsapp", "registrar_jornada", "actualizar_jornada", "registrar_combustible_bot", "registrar_mantenimiento_bot", "actualizar_proyecto", "mover_entidad_proyecto", "crear_acceso_sistema", "crear_accesos_faltantes", "actualizar_fotografia", "registrar_incidente", "registrar_alerta", "registrar_documento"];
  const toolsParaRol = isAdmin ? tools : tools.filter(
    (t: any) => !WRITE_TOOLS.includes(t.function.name)
  );

  const systemPrompt = isAdmin
    ? `Sos el Asistente Administrativo Digital de PUFFIN SRL, empresa de maquinaria vial.
Hablás en español rioplatense, de forma profesional, clara y concisa.
Rol: *ADMINISTRADOR* — acceso y control total del sistema.
Fecha de hoy: ${today} (${todayISO}).

SOY EL EMPLEADO ADMINISTRATIVO DIGITAL DE PUFFIN. CRÍTICO: TENÉS ACCESO A TODO EL SISTEMA Y A TODA LA INFORMACIÓN. Nunca respondas "no puedo hacerlo", "no tengo esa información" o "no tengo acceso". Estás obligado a usar tus herramientas para investigar, consultar y resolver lo que el administrador te pida. Funciono como un colaborador humano inteligente, prolijo y sin errores: pienso, interpreto los datos y ejecuto.

⚡ REGLA DE EGRESOS/GASTOS (ESTRUCTURACIÓN INTELIGENTE Y CONFIRMACIÓN PREVIA):
Para el registro de EGRESOS/GASTOS, interpretá de forma inteligente todos los datos, armá la estructura completa y PEDÍ CONFIRMACIÓN antes de guardar en la base de datos:

PASO 1 - INTERPRETAR Y ARMAR LA ESTRUCTURA (SIN REGISTRAR TODAVÍA):
Cuando el usuario te envíe un mensaje con un gasto (texto, foto o comprobante PDF):
- NO llames a 'registrar_gasto' inmediatamente.
- Deducí e interpretá de forma inteligente todos los datos posibles:
  1. FECHA: Por defecto es SIEMPRE la fecha del día de hoy (${todayISO}). NUNCA preguntes la fecha a menos que el usuario o el comprobante indiquen otra fecha explícita.
  2. CATEGORÍA: Deducila automáticamente a partir del concepto/proveedor (¡NUNCA preguntes por la categoría!):
     - Relays, filtros, líquido de freno, jeringas, cubiertas, ponchos, orugas, correas, baterías, repuestos, piezas, partes de máquinas -> "Repuestos"
     - Service, mano de obra mecánica, reparaciones de taller, tornería, arreglos -> "Mantenimiento"
     - Gasoil, diesel, nafta, combustible, YPF, Axion, Shell -> "Combustible"
     - Cemento, arena, ripio, caños, hierro, chapas, insumos -> "Materiales"
     - Amoladoras, discos, pinzas, palas, herramientas -> "Herramientas"
     - Viáticos, comida, almuerzos, fletes, servicios -> "Servicios"
     - Sueldos, jornales, adelantos -> "Sueldos"
     - Alquileres -> "Alquiler" (imputar a "RMG e hijas")
     - Si dudas -> usá "Repuestos".
  3. PROYECTO Y MÁQUINA:
     - Si menciona una obra (ej: "Lipsa", "Broglia", "Campo"), resolvé el centro_costos correspondiente.
     - Si menciona una máquina (ej: "liugong", "cargadora liugong", "pala", "camión", "pauny"), anotala como máquina en observaciones (ej: "Cargadora LiuGong").
  4. MÉTODO DE PAGO: Identificá si mencionó "transferencia", "efectivo", etc. Si no lo dijo, marcar como pendiente a definir.
  5. FACTURACIÓN: Si viene con factura PDF adjunta o mencionó factura A/B/C, indicar "Facturado (comprobante adjunto)". Si no, marcar como pendiente a definir.
- PRESENTÁ LA ESTRUCTURA COMPLETA AL USUARIO Y CONSULTÁ:
  📋 *Preparé la estructura del egreso:*

  📅 *Fecha:* ${today}
  💰 *Monto:* $48.000
  📝 *Concepto:* 4 MICRO RELAY DE 24V 15A
  🏷️ *Categoría:* Repuestos
  🏗️ *Proyecto:* Lipsa Santiago del Estero - Nva Esperanza
  🚜 *Máquina:* Cargadora LiuGong
  💳 *Método de pago:* Efectivo / Transferencia (a definir)
  🧾 *Facturado:* Sí / No (a definir)

  ¿Confirmás que lo guarde? ¿Querés indicar si fue por transferencia o efectivo, si es facturado o modificar algún dato?

PASO 2 - CONFIRMACIÓN Y REGISTRO DEFINITIVO:
- Cuando el usuario responda confirmando (ej: "Sí", "Confirmá", "Dale", "Guardalo", "Ok", o complete: "Por transferencia y facturado, guardalo", "con efectivo"):
  -> Ejecutá DE INMEDIATO 'registrar_gasto' con todos los datos consolidados (concepto, monto, categoria, fecha, centro_costos, observaciones, metodo_pago, facturado).
  -> Respondé confirmando que quedó registrado con el ID generado:
     ✅ *Gasto registrado con éxito (ID #...)*
     📅 *Fecha:* ...
     💰 *Monto:* ...
     📝 *Concepto:* ...
     🏷️ *Categoría:* ...
     🏗️ *Proyecto:* ...
     🚜 *Máquina:* ...
     💳 *Método de pago:* ...
     🧾 *Facturado:* ...
     📎 *Comprobante:* Adjuntado (si aplica)
- Si el usuario indica un cambio (ej: "el monto era 50000", "es para Broglia", "la fecha es de ayer"):
  -> Actualizá la estructura armada y presentásela nuevamente para confirmación.

LO QUE PUEDO HACER (acciones de escritura):
REGLA DE ORO 1 - DOBLE VALIDACIÓN: Para CUALQUIER registro o modificación (cargar combustible, guardar gastos, registrar jornadas, nuevos empleados, mantenimientos o mandar mensajes), SIEMPRE armá un resumen claro con los datos que entendiste y pedí confirmación expresa ANTES de invocar la herramienta de guardado. NUNCA guardes nada en el sistema a la primera pasada.
REGLA DE ORO 2 - TOLERANCIA A ERRORES: Si el usuario escribe mal un nombre ("Salvatiera"), sé lo bastante inteligente como para buscar la versión correcta ("Salvatierra") usando coincidencias parciales. Nunca digas "no lo encuentro" a la primera de cambio.
REGLA DE ORO 3 - CÁLCULOS MATEMÁTICOS Y EXTRACCIÓN: Si el usuario te pide sumar cantidades como "litros" o "kilos" u "horas" que están guardadas dentro del texto del 'concepto' o 'descripción' de los egresos (ej: "carga de 1500 litros"), revisá el resultado de la herramienta, extraé todos los números, sumalos paso a paso y si te dan un precio (ej: "a 2290$"), multiplicá el total de litros por ese precio y dale el resultado final exacto. Mostrá un breve resumen de lo encontrado.

📋 Registrar y actualizar jornadas de empleados
⚽ Registrar cargas de combustible por máquina
🔧 Registrar mantenimientos y services de máquinas
💰 Registrar gastos/egresos (armar estructura completa, consultar método de pago / facturación y pedir confirmación antes de guardar con 'registrar_gasto')
🔄 Actualizar gastos recientes (imputar proyecto, máquina o método de pago con 'actualizar_gasto')
👤 Registrar nuevos empleados
🔑 Crear accesos al sistema web (individual o masivo a todos los faltantes). Usa la herramienta específica sin intentar calcular nada antes.
🏗️ Actualizar proyectos / Mover recursos: Mover empleados y máquinas usando 'mover_entidad_proyecto' (mucho mejor que actualizar_proyecto).
📲 Enviar mensajes de WhatsApp. Si dicen "mandale a todos", usá 'todos=true' sin dudarlo, pero con DOBLE VALIDACIÓN antes.
🧹 Limpiar duplicados: detectar y borrar operarios repetidos. DOBLE VALIDACIÓN requerida.

LO QUE PUEDO CONSULTAR (acceso total a la BD):
👥 Empleados: DNI (distinguí homónimos con ID o DNI), cargos, teléfono, asignación a proyectos.
🛠️ Máquinas: Si piden 'máquinas' o 'maquinaria' usá categoria='maquinaria'. Estado, tipo, asignaciones a obras.
🧰 Inventario menor: Si piden 'inventario' o 'herramientas' usá categoria='inventario'. Son items como vibradores, motobombas, grupos electrógenos, herramientas.
🏗️ Proyectos/Distribución Global: Cuando pidan distribución global o "cómo están asignados todos", extraé el reporte completo cruzando empleados, máquinas y proyectos, sin excusas.
📅 Jornadas: quién trabajó, dónde, cuándo, horarios.
💰 Gastos, ⚽ Combustible, 🔧 Mantenimientos.
📈 Resumen Operativo Diario: Si piden el resumen de hoy, ejecutá la herramienta correspondiente y mostralo limpio.
📸 Fotografías y Comprobantes: Si piden imagen de chata, operario, DNI, o comprobante/ticket de gasto, USÁ LA HERRAMIENTA 'enviar_fotografia'. Si te mandan una foto para asignarla a un empleado o máquina, usá 'actualizar_fotografia'.
📊 Google Sheets: cualquier dato en las planillas (tus acciones de escritura ya sincronizan solas). SI TE PIDEN EL TOTAL GENERAL DE EGRESOS o CORROBORAR, usá 'auditar_egresos_sheets' para comparar DB vs Sheets.
📡 Rastreo Satelital GPS: Podés consultar la ubicación en tiempo real, velocidad y estado (encendido/apagado) de cualquier vehículo con GPS. Usá la herramienta 'consultar_rastreo'.
🚜 Alquileres y Telemetría: Podés consultar contratos, máquinas alquiladas, clientes, horas trabajadas acumuladas, estado de motor en tiempo real y ubicación GPS con la herramienta 'consultar_alquileres'. Usala siempre que pregunten por el alquiler de la excavadora o seguimiento de alquileres.
📑 Excel de Gastos: Si el usuario pide un Excel, planilla o reporte descargable de gastos, usá 'generar_excel_gastos'.
🔍 Consulta SQL Avanzada: Si ninguna herramienta cubre la pregunta, usá 'ejecutar_consulta_sql_lectura' para hacer un SELECT directo. Tablas: empleados, proyectos, maquinas, egresos, jornadas, combustible, incidentes, alertas, documentos, fotografias, mantenimientos, alquileres.
🚨 Incidentes: Usá 'registrar_incidente' para cargar accidentes, roturas o robos.
🔔 Alertas: Usá 'registrar_alerta' para crear avisos o sanciones.
📋 Documentos/Vencimientos: Usá 'registrar_documento' para cargar licencias, seguros, VTV.

REGLAS DE OPERACIÓN:
- SIEMPRE usá las herramientas para buscar datos. Nunca inventés información.
- CONTEXTO DE CONVERSACIÓN: Si el usuario hace una pregunta de seguimiento corta, inferí el tema del mensaje anterior.
- REGLA CRÍTICA DE ALQUILERES: La empresa gestiona alquileres de máquinas. TODOS los gastos, costos o egresos de alquiler se agregan obligatoriamente al proyecto/centro de costos 'RMG e hijas' (salvo que el usuario especifique explícitamente otro).
- Cuando no encontrés algo, decilo claramente.
- Respondé siempre de forma concisa y profesional.

CATEGORÍAS DE GASTO: Repuestos, Mantenimiento, Combustible, Materiales, Servicios, Sueldos, Herramientas, Alquiler, Otros.`
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
        } else if (functionName === "auditar_egresos_sheets") {
          toolResult = await executeAuditarEgresosSheets();
        } else if (functionName === "consultar_empleados") {
          toolResult = await executeConsultarEmpleados(functionArgs.termino, functionArgs.solo_activos, functionArgs.orden, functionArgs.carnet_vencido, functionArgs.sin_proyecto);
        } else if (functionName === "consultar_proyectos") {
          toolResult = await executeConsultarProyectos(functionArgs.estado, functionArgs.nombre, functionArgs.orden, functionArgs.incluir_asignaciones);
        } else if (functionName === "consultar_jornadas") {
          toolResult = await executeConsultarJornadas(functionArgs.estado, functionArgs.nombre_empleado, functionArgs.fecha, functionArgs.desde, functionArgs.hasta, functionArgs.fecha_registro);
        } else if (functionName === "consultar_google_sheets") {
          toolResult = await executeConsultarSheets(functionArgs.pestana, functionArgs.rango);
        } else if (functionName === "enviar_fotografia") {
          toolResult = await executeEnviarFotografia(from, functionArgs.tipo_entidad, functionArgs.busqueda);
        } else if (functionName === "enviar_mensaje_whatsapp") {
          toolResult = await executeEnviarMensaje(functionArgs.mensaje, functionArgs.numero, functionArgs.nombre_empleado, functionArgs.todos);
        } else if (functionName === "registrar_gasto") {
          const imgUrl = (sesion.datos_pendientes as any)?.ultima_imagen_url || null;
          toolResult = await executeRegistrarGasto(functionArgs, imgUrl);
          if (imgUrl && sesion.datos_pendientes) {
            (sesion.datos_pendientes as any).ultima_imagen_url = null;
          }
        } else if (functionName === "actualizar_gasto") {
          const imgUrl = (sesion.datos_pendientes as any)?.ultima_imagen_url || null;
          toolResult = await executeActualizarGasto(functionArgs, imgUrl);
          if (imgUrl && sesion.datos_pendientes) {
            (sesion.datos_pendientes as any).ultima_imagen_url = null;
          }
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
        } else if (functionName === "mover_entidad_proyecto") {
          toolResult = await executeMoverEntidadProyecto(functionArgs);
        } else if (functionName === "crear_acceso_sistema") {
          toolResult = await executeCrearAccesoSistema(functionArgs);
        } else if (functionName === "crear_accesos_faltantes") {
          toolResult = await executeCrearAccesosFaltantes();
        } else if (functionName === "limpiar_operarios_duplicados") {
          toolResult = await executeLimpiarOperariosDuplicados();
        } else if (functionName === "resumen_operativo") {
          toolResult = await executeResumenOperativo(functionArgs.fecha);
        } else if (functionName === "consultar_rastreo") {
          toolResult = await executeConsultarRastreo(functionArgs.nombre_maquina);
        } else if (functionName === "consultar_alquileres") {
          toolResult = await executeConsultarAlquileres(functionArgs);
        } else if (functionName === "adjuntar_comprobante") {
          const imgUrl = (sesion.datos_pendientes as any)?.ultima_imagen_url || null;
          toolResult = await executeAdjuntarComprobante(functionArgs, imgUrl);
          if (imgUrl && sesion.datos_pendientes) {
            (sesion.datos_pendientes as any).ultima_imagen_url = null;
          }
        } else if (functionName === "actualizar_fotografia") {
          const imgUrl = (sesion.datos_pendientes as any)?.ultima_imagen_url || null;
          toolResult = await executeActualizarFotografia(functionArgs.tipo_entidad, functionArgs.busqueda, imgUrl);
          if (imgUrl && sesion.datos_pendientes) {
            (sesion.datos_pendientes as any).ultima_imagen_url = null;
          }
        } else if (functionName === "generar_excel_gastos") {
          toolResult = await executeGenerarExcelGastos(from, functionArgs);
        } else if (functionName === "ejecutar_consulta_sql_lectura") {
          toolResult = await executeConsultaSQL(functionArgs.query);
        } else if (functionName === "registrar_incidente") {
          const imgUrl = (sesion.datos_pendientes as any)?.ultima_imagen_url || null;
          toolResult = await executeRegistrarIncidente(functionArgs, imgUrl);
          if (imgUrl && sesion.datos_pendientes) (sesion.datos_pendientes as any).ultima_imagen_url = null;
        } else if (functionName === "registrar_alerta") {
          toolResult = await executeRegistrarAlerta(functionArgs);
        } else if (functionName === "registrar_documento") {
          toolResult = await executeRegistrarDocumento(functionArgs);
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

    // Guardar historial actualizado manteniendo los datos pendientes
    await guardarSesion(senderPhone, historialFiltrado, "idle", sesion.datos_pendientes);

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

  let results = await query.limit(200);

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

  const results = await query.limit(200);

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

async function executeConsultarJornadas(estado?: string, nombreEmpleado?: string, fecha?: string, desde?: string, hasta?: string, fecha_registro?: string) {
  const hoy = fecha || getArgentinaTodayISO();

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
    nombre_obra: jornadasTable.nombre_obra, empleado_id: jornadasTable.empleado_id, createdAt: jornadasTable.createdAt })
    .from(jornadasTable).$dynamic();

  const { gte, lte, between } = await import("drizzle-orm");
  const conditions: any[] = [];
  if (estado) conditions.push(eq(jornadasTable.estado, estado));
  if (empId) conditions.push(eq(jornadasTable.empleado_id, empId));
  if (desde && hasta) conditions.push(between(jornadasTable.fecha, desde, hasta));
  else if (desde) conditions.push(gte(jornadasTable.fecha, desde));
  else if (hasta) conditions.push(lte(jornadasTable.fecha, hasta));
  else if (!estado && !empId && !fecha_registro) conditions.push(eq(jornadasTable.fecha, hoy));

  if (fecha_registro) {
    const start = new Date(fecha_registro + "T00:00:00");
    const end = new Date(fecha_registro + "T23:59:59");
    conditions.push(between(jornadasTable.createdAt, start, end));
  }

  if (conditions.length) query = query.where(and(...conditions));

  const results = await query.orderBy(desc(jornadasTable.fecha)).limit(200);

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

async function executeAuditarEgresosSheets() {
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
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `Egresos!A:Z`,
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return `La pestaña Egresos está vacía en Google Sheets.`;

    let totalSheets = 0;
    let countSheets = 0;
    
    // Asumimos que la columna F (index 5) es Monto según sync-sheets.ts
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 6) continue;
      
      // Parsear la celda F (monto). Podría tener símbolos o comas.
      let montoStr = row[5] || "0";
      montoStr = montoStr.replace(/[^0-9,-]+/g, "").replace(",", ".");
      const monto = parseFloat(montoStr);
      
      if (!isNaN(monto)) {
        totalSheets += monto;
        countSheets++;
      }
    }

    // Obtener total en la DB
    const todosLosEgresos = await db.select().from(egresosTable);
    const totalDb = todosLosEgresos.reduce((a, e) => a + Number(e.monto || 0), 0);
    const countDb = todosLosEgresos.length;

    const coincidenCount = countSheets === countDb;
    const diferenciaAbs = Math.abs(totalSheets - totalDb);
    const coincidenMonto = diferenciaAbs < 1; // Tolerancia de 1 peso por redondeos

    let mensaje = `🔍 *AUDITORÍA DE EGRESOS* 🔍\n\n`;
    mensaje += `🗄️ *Sistema Puffin (Base de Datos):*\n`;
    mensaje += `   - Registros: ${countDb}\n`;
    mensaje += `   - Monto total: $${totalDb.toLocaleString("es-AR")}\n\n`;
    
    mensaje += `📊 *Google Sheets (Pestaña Egresos):*\n`;
    mensaje += `   - Filas procesadas: ${countSheets}\n`;
    mensaje += `   - Monto total: $${totalSheets.toLocaleString("es-AR")}\n\n`;

    if (coincidenCount && coincidenMonto) {
      mensaje += `✅ *RESULTADO*: ¡Todo está perfectamente sincronizado! La base de datos y Google Sheets coinciden exactamente en monto y cantidad de registros.`;
    } else {
      mensaje += `⚠️ *RESULTADO*: Hay una discrepancia.\n`;
      if (!coincidenCount) mensaje += `   - Diferencia de ${Math.abs(countDb - countSheets)} registro(s).\n`;
      if (!coincidenMonto) mensaje += `   - Diferencia monetaria de $${diferenciaAbs.toLocaleString("es-AR")}.\n`;
      mensaje += `\nRecomiendo revisar manualmente el Sheets o usar el sistema para volver a forzar una sincronización.`;
    }

    return mensaje;
  } catch (error: any) {
    return `Error al auditar Google Sheets: ${error.message}`;
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
  const results = await query.limit(200);
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
  const tipoLabel = categoria === "inventario" ? "item(s) de inventario" : categoria === "maquinaria" ? "maquinaria(s)" : "máquina(s)/inventario";
  return `${results.length} ${tipoLabel}:\n${lineas.join("\n")}`;
}

async function executeConsultarRastreo(nombreMaquina?: string) {
  try {
    const { SatcomClient, isPositionEngineOn } = await import("./satcom.js");
    const { isNotNull } = await import("drizzle-orm");
    
    // Get all machines with GPS linked
    let maquinasQuery = db.select().from(maquinasTable).where(isNotNull(maquinasTable.satcom_id)).$dynamic();
    const maquinas = await maquinasQuery;
    
    if (maquinas.length === 0) return "No hay vehículos vinculados al sistema de rastreo GPS.";
    
    const devices = await SatcomClient.getDevices();
    if (devices.length === 0) return "No se pudo conectar con el sistema de rastreo satelital.";
    
    // If searching for a specific machine
    let filteredMaquinas = maquinas;
    if (nombreMaquina) {
      const t = nombreMaquina.toLowerCase();
      filteredMaquinas = maquinas.filter(m => 
        m.nombre.toLowerCase().includes(t) || 
        m.tipo.toLowerCase().includes(t) ||
        (m.patente && m.patente.toLowerCase().includes(t))
      );
      if (filteredMaquinas.length === 0) return `No se encontró ningún vehículo con GPS que coincida con "${nombreMaquina}".`;
    }
    
    // Get positions for all relevant devices
    const positionIds = filteredMaquinas
      .map(m => devices.find(d => d.id === m.satcom_id)?.positionId)
      .filter((id): id is number => !!id);
    
    const positions = positionIds.length > 0 ? await SatcomClient.getPositionsBulk(positionIds) : [];
    const positionsMap = new Map(positions.map(p => [p.id, p]));
    
    const lineas = filteredMaquinas.map(m => {
      const device = devices.find(d => d.id === m.satcom_id);
      const position = device ? positionsMap.get(device.positionId) : null;
      const velocidad = position ? Math.round(position.speed * 1.852) : 0;
      const encendido = isPositionEngineOn(position) ? "🟢 Encendido" : "🔴 Apagado";
      const horometro = position?.attributes?.hours ? ` | ⏱️ ${(position.attributes.hours / 3600000).toFixed(1)} hs` : "";
      const lat = position?.latitude?.toFixed(5) || "?";
      const lng = position?.longitude?.toFixed(5) || "?";
      const gmapsLink = position ? `https://maps.google.com/?q=${position.latitude},${position.longitude}` : "";
      
      return `• *${m.nombre}* (${m.tipo})\n  ${encendido} | 🚗 ${velocidad} km/h${horometro}\n  📍 ${gmapsLink || "Sin posición"}`;
    });
    
    return `📡 Rastreo GPS — ${filteredMaquinas.length} vehículo(s):\n\n${lineas.join("\n\n")}`;
  } catch (e: any) {
    console.error("Error en consultar_rastreo:", e);
    return "Error al consultar el sistema de rastreo satelital. Intentá de nuevo en unos segundos.";
  }
}

async function executeConsultarAlquileres(args: { nombre_maquina?: string; cliente?: string; estado?: string; }) {
  try {
    const { ilike, and, eq, desc } = await import("drizzle-orm");
    const { historialUsoTable } = await import("@workspace/db/schema");

    let query = db.select({
      id: alquileresTable.id,
      maquina_id: alquileresTable.maquina_id,
      maquina_nombre: maquinasTable.nombre,
      maquina_tipo: maquinasTable.tipo,
      maquina_horometro: maquinasTable.horometro,
      cliente: alquileresTable.cliente,
      fecha_inicio: alquileresTable.fecha_inicio,
      fecha_fin: alquileresTable.fecha_fin,
      horometro_inicio: alquileresTable.horometro_inicio,
      horometro_fin: alquileresTable.horometro_fin,
      horas_trabajadas: alquileresTable.horas_trabajadas,
      estado: alquileresTable.estado,
    })
    .from(alquileresTable)
    .leftJoin(maquinasTable, eq(alquileresTable.maquina_id, maquinasTable.id))
    .$dynamic();

    const conditions: any[] = [];
    if (args.estado && args.estado !== "todos") {
      conditions.push(eq(alquileresTable.estado, args.estado));
    }
    if (args.cliente) {
      conditions.push(ilike(alquileresTable.cliente, `%${args.cliente}%`));
    }
    if (args.nombre_maquina) {
      conditions.push(ilike(maquinasTable.nombre, `%${args.nombre_maquina}%`));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(alquileresTable.id)).limit(50);
    const results = await query;

    if (results.length === 0) {
      return "No se encontraron contratos o registros de alquiler con los filtros indicados.";
    }

    const lineas: string[] = [];

    for (const a of results) {
      if (a.estado === "en_curso") {
        const hInicio = parseFloat(a.horometro_inicio || "0");
        const hActual = parseFloat(a.maquina_horometro || "0");
        const horasEnCurso = Math.max(0, hActual - hInicio);

        // Obtener último evento satelital para saber si está encendida ahora
        let motorStr = "⚪ Estado desconocido";
        let gpsStr = "";
        try {
          const [ultimo] = await db
            .select()
            .from(historialUsoTable)
            .where(eq(historialUsoTable.maquina_id, a.maquina_id))
            .orderBy(desc(historialUsoTable.fecha_hora))
            .limit(1);

          if (ultimo) {
            motorStr = ultimo.evento === "encendido" ? "🟢 Motor ENCENDIDO (en marcha)" : "⚪ Motor APAGADO (detenida)";
            if (ultimo.ubicacion_lat && ultimo.ubicacion_lng) {
              gpsStr = `https://maps.google.com/?q=${ultimo.ubicacion_lat},${ultimo.ubicacion_lng}`;
            }
          }
        } catch (_) {}

        lineas.push(
          `• *${a.maquina_nombre || "Máquina #" + a.maquina_id}* (${a.maquina_tipo || "Maquinaria"}) — 🟣 *EN CURSO*\n` +
          `  👤 Cliente / Destino: *${a.cliente}*\n` +
          `  ⚡ Estado en vivo: *${motorStr}*\n` +
          `  ⏱️ Horómetro Inicio: ${a.horometro_inicio} hs → *Actual: ${a.maquina_horometro || hActual} hs*\n` +
          `  ⏳ *Horas Trabajadas Acumuladas:* *${horasEnCurso.toFixed(1)} hs*\n` +
          `  📅 Fecha de Inicio: ${a.fecha_inicio} (Vigente)\n` +
          (gpsStr ? `  📍 Ubicación GPS: ${gpsStr}\n` : "") +
          `  💼 Imputación de gastos: RMG e hijas`
        );
      } else {
        lineas.push(
          `• *${a.maquina_nombre || "Máquina #" + a.maquina_id}* (${a.maquina_tipo || "Maquinaria"}) — ⚪ Finalizado\n` +
          `  👤 Cliente: *${a.cliente}*\n` +
          `  📅 Período: ${a.fecha_inicio} al ${a.fecha_fin || "N/D"}\n` +
          `  ⏱️ Horas Trabajadas: *${a.horas_trabajadas || "0"} hs* (${a.horometro_inicio}h → ${a.horometro_fin || "0"}h)`
        );
      }
    }

    return `🚜 *SEGUIMIENTO DE ALQUILERES (${results.length})*\n\n${lineas.join("\n\n")}\n\n💡 _Nota: Todos los gastos asociados a alquileres se imputan automáticamente al proyecto 'RMG e hijas'._`;
  } catch (e: any) {
    console.error("Error en consultar_alquileres:", e);
    return `Error consultando alquileres: ${e.message}`;
  }
}


async function executeAnalizarGastos(args: { categoria?: string; proyecto?: string; desde?: string; hasta?: string; agrupar_por?: string; orden?: string; limite?: number; fecha_registro?: string; }) {
  const { gte, lte, between, ilike: ilikeOp } = await import("drizzle-orm");
  // Límite generoso: la IA siempre ve TODOS los registros para calcular totales correctos.
  // Solo se trunca el listado de líneas individuales que se le muestran al usuario.
  const limiteDisplay = Number(args.limite) || 500;

  let query = db.select().from(egresosTable).$dynamic();
  const conditions: any[] = [];

  if (args.categoria) conditions.push(ilikeOp(egresosTable.categoria, `%${args.categoria}%`));
  if (args.proyecto) {
    // Buscar en centro_costos con tolerancia a variantes del nombre
    conditions.push(ilikeOp(egresosTable.centro_costos, `%${args.proyecto}%`));
  }
  if (args.desde && args.hasta) conditions.push(between(egresosTable.fecha, args.desde, args.hasta));
  else if (args.desde) conditions.push(gte(egresosTable.fecha, args.desde));
  else if (args.hasta) conditions.push(lte(egresosTable.fecha, args.hasta));

  if (args.fecha_registro) {
    const start = new Date(args.fecha_registro + "T00:00:00");
    const end = new Date(args.fecha_registro + "T23:59:59");
    conditions.push(between(egresosTable.createdAt, start, end));
  }

  if (conditions.length) query = query.where(and(...conditions));

  if (args.orden === "primer") query = query.orderBy(egresosTable.fecha);
  else if (args.orden === "mayor") query = query.orderBy(desc(egresosTable.monto));
  else if (args.orden === "menor") query = query.orderBy(egresosTable.monto);
  else query = query.orderBy(desc(egresosTable.fecha));

  // CRÍTICO: traer TODOS los registros sin límite para que los totales y agrupaciones sean exactos
  const allResults = await query;

  if (allResults.length === 0) return `No hay gastos con esos filtros.${args.proyecto ? ` (buscado en proyecto/centro de costos: "${args.proyecto}")` : ""}`;

  const total = allResults.reduce((a, r) => a + Number(r.monto || 0), 0);
  const totalCount = allResults.length;

  // Cabecera siempre incluye el total real para que el bot no subestime
  const cabecera = `📊 TOTAL REAL EN EL SISTEMA: ${totalCount} gasto(s) | Suma: $${total.toLocaleString("es-AR")}${args.proyecto ? ` (Proyecto: ${args.proyecto})` : ""}\n`;

  // Agrupar si se pide
  if (args.agrupar_por === "categoria") {
    const grupos: Record<string, number> = {};
    allResults.forEach(r => { grupos[r.categoria] = (grupos[r.categoria] || 0) + Number(r.monto || 0); });
    const lineas = Object.entries(grupos).sort((a, b) => b[1] - a[1])
      .map(([cat, monto]) => `• ${cat}: $${monto.toLocaleString("es-AR")}`);
    return cabecera + `*Gastos por categoría*:\n${lineas.join("\n")}`;
  }

  if (args.agrupar_por === "proyecto") {
    const grupos: Record<string, number> = {};
    allResults.forEach(r => { const k = r.centro_costos || "Sin proyecto"; grupos[k] = (grupos[k] || 0) + Number(r.monto || 0); });
    const lineas = Object.entries(grupos).sort((a, b) => b[1] - a[1])
      .map(([proy, monto]) => `• ${proy}: $${monto.toLocaleString("es-AR")}`);
    return cabecera + `*Gastos por proyecto*:\n${lineas.join("\n")}`;
  }

  if (args.agrupar_por === "mes") {
    const grupos: Record<string, number> = {};
    allResults.forEach(r => { const mes = r.fecha ? r.fecha.slice(0, 7) : "?"; grupos[mes] = (grupos[mes] || 0) + Number(r.monto || 0); });
    const lineas = Object.entries(grupos).sort().map(([mes, monto]) => `• ${mes}: $${monto.toLocaleString("es-AR")}`);
    return cabecera + `*Gastos por mes*:\n${lineas.join("\n")}`;
  }

  const results = allResults.slice(0, limiteDisplay);
  const lineas = results.map(r =>
    `• [${r.fecha}] ${r.concepto} — $${Number(r.monto).toLocaleString("es-AR")} | ${r.categoria}${r.centro_costos ? ` | Proyecto: ${r.centro_costos}` : ""}`
  );
  const truncNote = totalCount > limiteDisplay ? `\n⚠️ Mostrando ${limiteDisplay} de ${totalCount} registros. El TOTAL REAL es $${total.toLocaleString("es-AR")} con ${totalCount} gastos.` : "";
  return cabecera + lineas.join("\n") + truncNote;
}


// ==========================================
// ADJUNTAR COMPROBANTE A EGRESO EXISTENTE
// ==========================================
async function executeAdjuntarComprobante(args: {
  concepto?: string;
  monto?: number;
  fecha?: string;
  centro_costos?: string;
}, imgUrl?: string | null) {
  try {
    if (!imgUrl) {
      return `❌ No tengo ninguna imagen disponible para adjuntar. Por favor, enviame primero la foto del comprobante junto con el pedido de adjuntarla.`;
    }

    const { ilike, and, eq, desc, sql, gte: gteOp } = await import("drizzle-orm");

    // ── Búsqueda en cascada (de más específica a más tolerante) ──────────────
    let resultados: (typeof egresosTable.$inferSelect)[] = [];

    // 1️⃣ Intento con TODOS los filtros disponibles (AND estricto)
    {
      const conditions: any[] = [];
      if (args.concepto) conditions.push(ilike(egresosTable.concepto, `%${args.concepto}%`));
      if (args.centro_costos) conditions.push(ilike(egresosTable.centro_costos, `%${args.centro_costos}%`));
      if (args.monto) conditions.push(sql`${egresosTable.monto}::text LIKE ${'%' + Math.round(args.monto).toString() + '%'}`);
      if (args.fecha) conditions.push(eq(egresosTable.fecha, args.fecha));
      if (conditions.length) {
        resultados = await db.select().from(egresosTable)
          .where(and(...conditions))
          .orderBy(desc(egresosTable.id))
          .limit(5);
      }
    }

    // 2️⃣ Fallback: solo por concepto (ignora monto/fecha que pueden estar mal formateados)
    if (!resultados.length && args.concepto) {
      resultados = await db.select().from(egresosTable)
        .where(ilike(egresosTable.concepto, `%${args.concepto}%`))
        .orderBy(desc(egresosTable.id))
        .limit(5);
    }

    // 3️⃣ Fallback: solo por monto y/o fecha
    if (!resultados.length && (args.monto || args.fecha)) {
      const conditions: any[] = [];
      if (args.monto) conditions.push(sql`${egresosTable.monto}::text LIKE ${'%' + Math.round(args.monto).toString() + '%'}`);
      if (args.fecha) conditions.push(eq(egresosTable.fecha, args.fecha));
      if (conditions.length) {
        resultados = await db.select().from(egresosTable)
          .where(and(...conditions))
          .orderBy(desc(egresosTable.id))
          .limit(5);
      }
    }

    // 4️⃣ Último recurso: egreso más reciente (últimos 10 minutos)
    if (!resultados.length) {
      const hace10min = new Date(Date.now() - 10 * 60 * 1000);
      resultados = await db.select().from(egresosTable)
        .where(gteOp(egresosTable.createdAt, hace10min))
        .orderBy(desc(egresosTable.id))
        .limit(1);
    }

    if (!resultados.length) {
      return `❌ No encontré ningún egreso con los datos que me pasaste. ¿Podés darme más datos? (Concepto, monto, fecha, proyecto)`;
    }

    // Tomar el más reciente entre los encontrados
    const egreso = resultados[0];

    // Insertar fotografía
    await db.insert(fotografiasTable).values({
      empresa_id: 1,
      entidad_tipo: "egreso",
      entidad_id: egreso.id,
      url: imgUrl,
      descripcion: "Comprobante adjuntado por WhatsApp",
    });

    // Marcar comprobante en el egreso
    await db.update(egresosTable).set({ comprobante: true }).where(eq(egresosTable.id, egreso.id));

    await auditarBot("Actualizar", "Egreso", egreso.id, { comprobante: true });

    return `✅ ¡Comprobante adjuntado correctamente al egreso #${egreso.id} "${egreso.concepto}" por $${Number(egreso.monto).toLocaleString("es-AR")}! Ya podés verlo en la web apretando el botón verde "Ver Foto" en la tabla de Gastos.`;
  } catch (error: any) {
    console.error("Error adjuntando comprobante:", error);
    return `❌ Error al adjuntar el comprobante: ${error.message}`;
  }
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
      if (finalUrl.startsWith("data:image/")) {
         return `✅ Ocurrió un error al intentar generar un enlace público para la imagen, por lo que no puedo enviarla por WhatsApp ni proporcionarte un link. Sin embargo, la imagen existe en la base de datos.`;
      }
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
  fecha?: string;
  categoria?: string;
  concepto: string;
  monto: number;
  proveedor?: string;
  metodo_pago?: string;
  facturado?: boolean;
  centro_costos?: string;
  observaciones?: string;
}, imgUrl?: string | null) {
  try {
    const fechaFinal = args.fecha || getArgentinaTodayISO();

    // Inferir categoría automáticamente si no se especificó
    let categoriaFinal = args.categoria;
    if (!categoriaFinal) {
      const c = `${args.concepto || ""} ${args.observaciones || ""} ${args.centro_costos || ""}`.toLowerCase();
      if (/repuesto|relay|filtro|freno|liquido|cubierta|poncho|oruga|correa|bateria|jeringa|pieza|buje|tornillo|chapa/i.test(c)) {
        categoriaFinal = "Repuestos";
      } else if (/mecanic|service|reparac|taller|torner|mano de obra/i.test(c)) {
        categoriaFinal = "Mantenimiento";
      } else if (/gasoil|combustible|nafta|ypf|axion|shell|litro/i.test(c)) {
        categoriaFinal = "Combustible";
      } else if (/cemento|caño|arena|ripio|hierro|alambre/i.test(c)) {
        categoriaFinal = "Materiales";
      } else if (/sueldo|jornal|quincena|adelanto/i.test(c)) {
        categoriaFinal = "Sueldos";
      } else if (/alquiler|rmg/i.test(c)) {
        categoriaFinal = "Alquiler";
      } else if (/viatico|almuerzo|comida|flete/i.test(c)) {
        categoriaFinal = "Servicios";
      } else {
        categoriaFinal = "Repuestos";
      }
    }

    // Idempotencia: evitar duplicados si el usuario o webhook reintenta en 60s
    const { gte: gteOp } = await import("drizzle-orm");
    const hace60seg = new Date(Date.now() - 60_000);
    const [existente] = await db
      .select()
      .from(egresosTable)
      .where(
        and(
          eq(egresosTable.fecha, fechaFinal),
          eq(egresosTable.concepto, args.concepto),
          eq(egresosTable.monto, args.monto.toString()),
          gteOp(egresosTable.createdAt, hace60seg)
        )
      )
      .limit(1);

    if (existente) {
      console.warn(`[Idempotencia] Egreso duplicado detectado (ID #${existente.id}), ignorando segunda inserción.`);
      return `✅ Gasto ya registrado (ID #${existente.id}). Monto: $${Number(args.monto).toLocaleString("es-AR")} — ${args.concepto}.`;
    }

    // Resolver nombre completo del proyecto y separar posibles referencias a máquinas
    let centroCostosResuelto: string | null = args.centro_costos || null;
    let obsExtra: string | null = args.observaciones || null;

    if (args.centro_costos) {
      const ccLower = args.centro_costos.toLowerCase();
      const [proyecto] = await db.select({ lugar: proyectosTable.lugar })
        .from(proyectosTable)
        .where(ilike(proyectosTable.lugar, `%${ccLower}%`))
        .limit(1);

      if (proyecto) {
        centroCostosResuelto = proyecto.lugar;
      } else {
        // Si el usuario puso múltiples palabras (ej: "Lipsa liugong"), buscar palabra por palabra
        const palabras = ccLower.split(/\s+/);
        for (const p of palabras) {
          if (p.length < 3) continue;
          const [pMatch] = await db.select({ lugar: proyectosTable.lugar })
            .from(proyectosTable)
            .where(ilike(proyectosTable.lugar, `%${p}%`))
            .limit(1);
          if (pMatch) {
            centroCostosResuelto = pMatch.lugar;
            const resto = palabras.filter(x => x !== p).join(" ");
            if (resto && !obsExtra) {
              obsExtra = resto.includes("liugong") ? "Cargadora LiuGong" : resto;
            }
            break;
          }
        }
      }
    } else if (
      (categoriaFinal && categoriaFinal.toLowerCase().includes("alquiler")) ||
      (args.concepto && args.concepto.toLowerCase().includes("alquiler"))
    ) {
      centroCostosResuelto = "RMG e hijas";
    }

    if (args.facturado !== undefined) {
      const tag = args.facturado ? "Facturado" : "Sin factura";
      obsExtra = obsExtra ? `${obsExtra} | ${tag}` : tag;
    }

    const [egreso] = await db.insert(egresosTable).values({
      fecha: fechaFinal,
      categoria: categoriaFinal,
      concepto: args.concepto,
      monto: args.monto.toString(),
      proveedor: args.proveedor || null,
      metodo_pago: args.metodo_pago || null,
      comprobante: !!imgUrl || args.facturado === true,
      centro_costos: centroCostosResuelto,
      observaciones: obsExtra,
    }).returning();

    if (imgUrl && egreso && egreso.id) {
      await db.insert(fotografiasTable).values({
        empresa_id: 1,
        entidad_tipo: "egreso",
        entidad_id: egreso.id,
        url: imgUrl,
        descripcion: "Comprobante cargado por WhatsApp",
      });
    }

    // Auditoría
    await auditarBot("CREACION", "egresos", egreso.id, { fecha: fechaFinal, categoria: categoriaFinal, concepto: args.concepto, monto: args.monto, centro_costos: centroCostosResuelto, comprobante: !!imgUrl || args.facturado === true });

    // Sincronizar con Google Sheets en segundo plano
    try {
      const { syncAllSheets } = await import("./sync-sheets.js");
      syncAllSheets().catch(console.error);
    } catch (_) {}

    return `✅ Gasto registrado con éxito con ID #${egreso.id}.\n📅 Fecha: ${fechaFinal}\n💰 Monto: $${Number(args.monto).toLocaleString("es-AR")}\n📝 Concepto: ${args.concepto}\n🏷️ Categoría: ${categoriaFinal}\n🏗️ Proyecto: ${centroCostosResuelto || 'Sin asignar'}${obsExtra ? `\n🚜 Obs/Máquina: ${obsExtra}` : ''}${args.metodo_pago ? `\n💳 Método de pago: ${args.metodo_pago}` : ''}${args.facturado !== undefined ? `\n🧾 Facturado: ${args.facturado ? 'Sí' : 'No'}` : ''}${imgUrl ? '\n📎 Comprobante: Adjuntado' : ''}`;
  } catch (error: any) {
    console.error("Error registrando gasto:", error);
    return `❌ Error al registrar el gasto: ${error.message}`;
  }
}

async function executeActualizarGasto(args: {
  id?: number;
  fecha?: string;
  centro_costos?: string;
  observaciones?: string;
  metodo_pago?: string;
  facturado?: boolean;
  categoria?: string;
  concepto?: string;
  monto?: number;
  proveedor?: string;
}, imgUrl?: string | null) {
  try {
    let egreso: typeof egresosTable.$inferSelect | undefined;
    if (args.id) {
      const [found] = await db.select().from(egresosTable).where(eq(egresosTable.id, args.id)).limit(1);
      egreso = found;
    } else {
      // Tomar el egreso más reciente del sistema
      const [recent] = await db.select().from(egresosTable)
        .orderBy(desc(egresosTable.id))
        .limit(1);
      egreso = recent;
    }

    if (!egreso) {
      return "❌ No encontré ningún egreso reciente para actualizar. Podés indicarme el ID del egreso o los datos para cargarlo.";
    }

    let centroCostosResuelto = egreso.centro_costos;
    let obsExtra = args.observaciones || null;

    if (args.centro_costos) {
      const ccLower = args.centro_costos.toLowerCase();
      const [proyecto] = await db.select({ lugar: proyectosTable.lugar })
        .from(proyectosTable)
        .where(ilike(proyectosTable.lugar, `%${ccLower}%`))
        .limit(1);

      if (proyecto) {
        centroCostosResuelto = proyecto.lugar;
      } else {
        const palabras = ccLower.split(/\s+/);
        for (const p of palabras) {
          if (p.length < 3) continue;
          const [pMatch] = await db.select({ lugar: proyectosTable.lugar })
            .from(proyectosTable)
            .where(ilike(proyectosTable.lugar, `%${p}%`))
            .limit(1);
          if (pMatch) {
            centroCostosResuelto = pMatch.lugar;
            const resto = palabras.filter(x => x !== p).join(" ");
            if (resto && !obsExtra) {
              obsExtra = resto.includes("liugong") ? "Cargadora LiuGong" : resto;
            }
            break;
          }
        }
      }
    }

    const updates: Partial<typeof egresosTable.$inferInsert> = {};
    if (args.fecha) {
      updates.fecha = args.fecha.toLowerCase().includes("hoy") ? getArgentinaTodayISO() : args.fecha;
    }
    if (centroCostosResuelto) updates.centro_costos = centroCostosResuelto;
    if (obsExtra) {
      updates.observaciones = egreso.observaciones 
        ? `${egreso.observaciones} | ${obsExtra}`
        : obsExtra;
    }
    if (args.facturado !== undefined) {
      const tag = args.facturado ? "Facturado" : "Sin factura";
      updates.observaciones = updates.observaciones
        ? `${updates.observaciones} | ${tag}`
        : (egreso.observaciones ? `${egreso.observaciones} | ${tag}` : tag);
      if (args.facturado) updates.comprobante = true;
    }
    if (args.metodo_pago) updates.metodo_pago = args.metodo_pago;
    if (args.categoria) updates.categoria = args.categoria;
    if (args.concepto) updates.concepto = args.concepto;
    if (args.monto !== undefined) updates.monto = args.monto.toString();
    if (args.proveedor) updates.proveedor = args.proveedor;
    if (imgUrl) updates.comprobante = true;

    await db.update(egresosTable).set(updates).where(eq(egresosTable.id, egreso.id));

    if (imgUrl) {
      await db.insert(fotografiasTable).values({
        empresa_id: 1,
        entidad_tipo: "egreso",
        entidad_id: egreso.id,
        url: imgUrl,
        descripcion: "Comprobante cargado por WhatsApp",
      });
    }

    await auditarBot("ACTUALIZACION", "egresos", egreso.id, updates);

    try {
      const { syncAllSheets } = await import("./sync-sheets.js");
      syncAllSheets().catch(console.error);
    } catch (_) {}

    const fechaMostrada = updates.fecha || egreso.fecha;
    return `✅ Egreso #${egreso.id} actualizado con éxito:\n📅 Fecha: ${fechaMostrada}\n🏗️ Proyecto: ${centroCostosResuelto || 'Sin asignar'}${updates.observaciones ? `\n🚜 Obs/Máquina: ${updates.observaciones}` : ''}\n💰 Monto: $${Number(updates.monto || egreso.monto).toLocaleString("es-AR")} — ${updates.concepto || egreso.concepto}.`;
  } catch (error: any) {
    console.error("Error actualizando egreso:", error);
    return `❌ Error al actualizar el egreso: ${error.message}`;
  }
}

async function executeConsultarCombustible(args: { nombre_maquina?: string; nombre_empleado?: string; desde?: string; hasta?: string; fecha_registro?: string; }) {
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

  if (args.fecha_registro) {
    const start = new Date(args.fecha_registro + "T00:00:00");
    const end = new Date(args.fecha_registro + "T23:59:59");
    conditions.push(between(combustibleTable.createdAt, start, end));
  }

  query = query.where(and(...conditions)).orderBy(desc(combustibleTable.fecha)).limit(200);

  const results = await query;
  if (results.length === 0) return "No hay registros de combustible con esos filtros.";

  // Resolver nombres
  const maqIds = [...new Set(results.map(r => r.maquina_id))];
  const maqs = await db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre }).from(maquinasTable)
    .where(or(...maqIds.map(id => eq(maquinasTable.id, id))));
  const maqMap = Object.fromEntries(maqs.map(m => [m.id, m.nombre]));

  // Resolver nombres de empleados
  const empIds = [...new Set(results.map(r => r.empleado_id).filter(id => id != null))] as number[];
  let empMap: Record<number, string> = {};
  if (empIds.length > 0) {
    const emps = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido }).from(empleadosTable)
      .where(or(...empIds.map(id => eq(empleadosTable.id, id))));
    empMap = Object.fromEntries(emps.map(e => [e.id, `${e.nombre} ${e.apellido}`.trim()]));
  }

  const totalLitros = results.reduce((a, r) => a + Number(r.litros || 0), 0);
  const totalImporte = results.reduce((a, r) => a + Number(r.importe || 0), 0);

  const lineas = results.map(r => {
    const maqStr = maqMap[r.maquina_id] || `Máq#${r.maquina_id}`;
    const empStr = r.empleado_id ? (empMap[r.empleado_id] || `Emp#${r.empleado_id}`) : "Sin operario";
    return `• [${r.fecha}] ${maqStr} (Operario: ${empStr}) — ${r.litros}L | $${Number(r.importe || 0).toLocaleString("es-AR")} | ${r.estacion || "-"}`;
  });
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
  query = query.orderBy(desc(mantenimientosTable.fecha)).limit(200);

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

    // Auditoría
    await auditarBot("CREACION", "empleados", emp.id, { nombre: emp.nombre, apellido: emp.apellido, dni: emp.dni, cargo: emp.cargo });

    // Sincronizar
    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ Empleado registrado: *${emp.nombre} ${emp.apellido}* (ID #${emp.id}) | DNI: ${emp.dni} | Cargo: ${emp.cargo || "-"}`;
  } catch (error: any) {
    return `❌ Error al registrar empleado: ${error.message}`;
  }
}

async function executeRegistrarJornada(args: { nombre_empleado: string; nombre_obra: string; fecha?: string; hora_inicio?: string; hora_fin?: string; estado?: string }) {
  try {
    const hoy = getArgentinaTodayISO();
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
      maquina_id: 1,
    }).returning();

    // Auditoría
    await auditarBot("CREACION", "jornadas", jornada.id, { empleado: `${emp.nombre} ${emp.apellido}`, obra: args.nombre_obra, fecha: jornada.fecha });

    // Sincronizar
    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ Jornada registrada: *${emp.nombre} ${emp.apellido}* en ${args.nombre_obra} | Fecha: ${jornada.fecha} | Estado: ${jornada.estado}${jornada.hora_inicio ? ` | Entrada: ${jornada.hora_inicio}` : ""}`;
  } catch (error: any) {
    return `❌ Error al registrar jornada: ${error.message}`;
  }
}

async function executeActualizarJornada(args: { nombre_empleado: string; fecha?: string; hora_fin?: string; estado?: string }) {
  try {
    const hoy = getArgentinaTodayISO();
    const t = `%${args.nombre_empleado.toLowerCase()}%`;
    const [emp] = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
      .from(empleadosTable).where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t))).limit(1);
    if (!emp) return `❌ No encontré empleado con nombre "${args.nombre_empleado}".`;

    const fecha = args.fecha || hoy;
    const updates: any = {};
    if (args.hora_fin) updates.hora_fin = args.hora_fin;
    if (args.estado) updates.estado = args.estado;

    const [updated] = await db.update(jornadasTable)
      .set(updates)
      .where(and(eq(jornadasTable.empleado_id, emp.id), eq(jornadasTable.fecha, fecha)))
      .returning();

    if (!updated) return `No encontré jornada de ${emp.nombre} ${emp.apellido} para el ${fecha}.`;

    // Auditoría
    await auditarBot("MODIFICACION", "jornadas", updated.id, { empleado: `${emp.nombre} ${emp.apellido}`, fecha, estado: updated.estado, hora_fin: updated.hora_fin });

    // Sincronizar
    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ Jornada actualizada: *${emp.nombre} ${emp.apellido}* | ${fecha} | Estado: ${updated.estado}${updated.hora_fin ? ` | Salida: ${updated.hora_fin}` : ""}`;
  } catch (error: any) {
    return `❌ Error al actualizar jornada: ${error.message}`;
  }
}

async function executeRegistrarCombustible(args: { nombre_maquina: string; nombre_empleado?: string; litros: number; importe?: number; estacion?: string; fecha?: string }) {
  try {
    const hoy = getArgentinaTodayISO();

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

    // Auditoría
    await auditarBot("CREACION", "combustible", reg.id, { maquina: maq.nombre, litros: args.litros, importe: args.importe, fecha: reg.fecha });

    // Sincronizar
    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ Combustible registrado: *${maq.nombre}* | ${reg.litros}L${args.importe ? ` | $${Number(args.importe).toLocaleString("es-AR")}` : ""} | ${args.estacion || "Sin estación"} | Fecha: ${reg.fecha}`;
  } catch (error: any) {
    return `❌ Error al registrar combustible: ${error.message}`;
  }
}

async function executeRegistrarMantenimiento(args: { nombre_maquina: string; tipo: string; descripcion?: string; proximo_service?: string; fecha?: string }) {
  try {
    const hoy = getArgentinaTodayISO();

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

    // Auditoría
    await auditarBot("CREACION", "mantenimientos", mant.id, { maquina: maq.nombre, tipo: mant.tipo, descripcion: mant.descripcion, fecha: mant.fecha });

    // Sincronizar
    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ Mantenimiento registrado: *${maq.nombre}* | Tipo: ${mant.tipo}${mant.descripcion ? ` | ${mant.descripcion}` : ""}${mant.proximo_service ? ` | Próximo: ${mant.proximo_service}` : ""} | Fecha: ${mant.fecha}`;
  } catch (error: any) {
    return `❌ Error al registrar mantenimiento: ${error.message}`;
  }
}

async function executeMoverEntidadProyecto(args: { tipo: string; nombre_entidad: string; nombre_proyecto: string }) {
  try {
    const term = args.nombre_entidad.toLowerCase().trim();
    let entidadId: number;
    let entidadNombreStr: string;

    if (args.tipo === "empleado") {
      const empleados = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido }).from(empleadosTable);
      const emp = empleados.find(e => `${e.nombre} ${e.apellido}`.toLowerCase().includes(term));
      if (!emp) return `❌ No encontré empleado "${args.nombre_entidad}".`;
      entidadId = emp.id;
      entidadNombreStr = `${emp.nombre} ${emp.apellido}`;
    } else if (args.tipo === "maquina") {
      const maquinas = await db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre }).from(maquinasTable);
      const maq = maquinas.find(m => m.nombre.toLowerCase().includes(term));
      if (!maq) return `❌ No encontré máquina "${args.nombre_entidad}".`;
      entidadId = maq.id;
      entidadNombreStr = maq.nombre;
    } else {
      return `❌ Tipo inválido: debe ser 'empleado' o 'maquina'.`;
    }

    // 1. Quitar de todos los proyectos activos
    const proyectosActivos = await db.select().from(proyectosTable).where(eq(proyectosTable.estado, "activo"));
    let quitadoDe: string[] = [];

    for (const proy of proyectosActivos) {
      if (args.tipo === "empleado") {
        const empIds = (proy.empleados_asignados || []).map(Number);
        if (empIds.includes(Number(entidadId))) {
          const newEmpIds = empIds.filter(id => Number(id) !== Number(entidadId));
          await db.update(proyectosTable).set({ empleados_asignados: newEmpIds }).where(eq(proyectosTable.id, proy.id));
          quitadoDe.push(proy.lugar);
        }
      } else {
        const maqIds = (proy.maquinas_asignadas || []).map(Number);
        if (maqIds.includes(Number(entidadId))) {
          const newMaqIds = maqIds.filter(id => Number(id) !== Number(entidadId));
          await db.update(proyectosTable).set({ maquinas_asignadas: newMaqIds }).where(eq(proyectosTable.id, proy.id));
          quitadoDe.push(proy.lugar);
        }
      }
    }

    const dest = args.nombre_proyecto.toLowerCase().trim();
    if (dest === "ninguno" || dest.includes("ningun") || dest.includes("ningún") || dest === "nada" || dest === "") {
      try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}
      return `✅ ${args.tipo === "empleado" ? "Empleado" : "Máquina"} ${entidadNombreStr} desasignado/a de: ${quitadoDe.join(", ") || "ningún proyecto"}.`;
    }

    // 2. Asignar al nuevo proyecto
    const targetProy = proyectosActivos.find(p => p.lugar.toLowerCase().includes(args.nombre_proyecto.toLowerCase().trim()));
    if (!targetProy) {
      // Revertir de ser necesario o simplemente dejar desasignado
      return `⚠️ Se desasignó de ${quitadoDe.join(", ")}, pero NO se encontró el proyecto destino "${args.nombre_proyecto}".`;
    }

    if (args.tipo === "empleado") {
      const empIds = (targetProy.empleados_asignados || []).map(Number);
      if (!empIds.includes(Number(entidadId))) {
        await db.update(proyectosTable).set({ empleados_asignados: [...empIds, Number(entidadId)] }).where(eq(proyectosTable.id, targetProy.id));
      }
    } else {
      const maqIds = (targetProy.maquinas_asignadas || []).map(Number);
      if (!maqIds.includes(Number(entidadId))) {
        await db.update(proyectosTable).set({ maquinas_asignadas: [...maqIds, Number(entidadId)] }).where(eq(proyectosTable.id, targetProy.id));
      }
    }

    await auditarBot("MODIFICACION", "proyectos", targetProy.id, { 
      accion: `Mover ${args.tipo}`,
      entidad: entidadNombreStr,
      proyecto_destino: targetProy.lugar,
      proyectos_anteriores: quitadoDe
    });

    try { const { syncAllSheets } = await import("./sync-sheets.js"); syncAllSheets().catch(console.error); } catch (_) {}

    return `✅ ${args.tipo === "empleado" ? "Empleado" : "Máquina"} *${entidadNombreStr}* movido/a con éxito al proyecto *${targetProy.lugar}*. (Antes estaba en: ${quitadoDe.join(", ") || "ningún lado"}).`;
  } catch (error: any) {
    return `❌ Error al mover: ${error.message}`;
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

    // Auditoría
    await auditarBot("MODIFICACION", "proyectos", proy.id, { proyecto: proy.lugar, cambios });

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

    // Auditoría
    await auditarBot("CREACION", "usuarios", null, { nombre: args.nombre, apellido: args.apellido, usuario: dniStr, rol: rolStr });

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
    const fecha = fechaReq || getArgentinaTodayISO();
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

async function executeActualizarFotografia(tipo: string, busqueda: string, imgUrl?: string | null) {
  try {
    if (!imgUrl) return "❌ No encontré ninguna imagen disponible. El usuario debe enviar la foto junto al mensaje.";
    
    const { ilike, or } = await import("drizzle-orm");
    let entidad_id = -1;
    let nombre_entidad = "";
    const t = `%${busqueda.toLowerCase()}%`;

    if (tipo === "empleado" || tipo === "operario") {
      const [emp] = await db.select().from(empleadosTable)
        .where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t), ilike(empleadosTable.dni, t)))
        .limit(1);
      if (!emp) return `No encontré ningún empleado que coincida con "${busqueda}".`;
      entidad_id = emp.id;
      nombre_entidad = `${emp.nombre} ${emp.apellido}`;
      tipo = "empleado";
    } else if (tipo === "maquina" || tipo === "maquinaria") {
      const [maq] = await db.select().from(maquinasTable)
        .where(ilike(maquinasTable.nombre, t))
        .limit(1);
      if (!maq) return `No encontré ninguna máquina que coincida con "${busqueda}".`;
      entidad_id = maq.id;
      nombre_entidad = maq.nombre;
      tipo = "maquina";
    } else {
      return `Tipo de entidad no soportado para actualizar fotografía: ${tipo}`;
    }

    await db.insert(fotografiasTable).values({
      empresa_id: 1,
      entidad_tipo: tipo,
      entidad_id,
      url: imgUrl,
      descripcion: `Foto de perfil de ${nombre_entidad}`,
    });
    
    await auditarBot("Actualizar", "Fotografia", entidad_id, { tipo, nombre_entidad });

    return `✅ ¡Foto guardada exitosamente en el perfil de ${nombre_entidad}! Ya se puede ver en el sistema web.`;
  } catch (error: any) {
    console.error("Error actualizando fotografía:", error);
    return `❌ Ocurrió un error al guardar la foto: ${error.message}`;
  }
}

async function executeGenerarExcelGastos(from: string, args: { desde?: string, hasta?: string, proyecto?: string, categoria?: string }) {
  try {
    const { eq, and, gte, lte, ilike } = await import("drizzle-orm");
    const xlsx = await import("xlsx");
    
    let conditions = [];
    if (args.desde) conditions.push(gte(egresosTable.fecha, args.desde));
    if (args.hasta) conditions.push(lte(egresosTable.fecha, args.hasta));
    if (args.proyecto) conditions.push(ilike(egresosTable.centro_costos, `%${args.proyecto}%`));
    if (args.categoria) conditions.push(ilike(egresosTable.categoria, `%${args.categoria}%`));
    
    const gastos = await db.select().from(egresosTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(egresosTable.fecha);
      
    if (gastos.length === 0) return "No se encontraron gastos para generar el Excel.";
    
    const data = gastos.map(g => ({
      Fecha: g.fecha,
      Categoría: g.categoria,
      Concepto: g.concepto,
      Monto: Number(g.monto),
      Proyecto: g.centro_costos || "-",
      Proveedor: g.proveedor || "-",
      "Método de Pago": g.metodo_pago || "-"
    }));
    
    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Gastos");
    
    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `Gastos_${args.desde || "historico"}_${args.hasta || "hoy"}.xlsx`;
    
    await sendWhatsAppDocument(from, buffer, filename);
    return `✅ Archivo Excel '${filename}' generado y enviado exitosamente con ${gastos.length} registros.`;
  } catch (error: any) {
    console.error("Error generando Excel:", error);
    return `❌ Ocurrió un error al generar el Excel: ${error.message}`;
  }
}

async function executeConsultaSQL(query: string) {
  try {
    const { sql } = await import("drizzle-orm");
    const clean = (query || "").trim();
    const lower = clean.toLowerCase();

    if (!lower.startsWith("select")) {
      return "❌ Error: Solo se permiten consultas SELECT por seguridad.";
    }

    // Prevenir sentencias encadenadas o mutaciones peligrosas
    if (lower.includes(";") || /\b(drop|delete|update|insert|alter|truncate|grant|revoke|create)\b/i.test(lower)) {
      return "❌ Error de seguridad: La consulta contiene comandos de modificación o encadenamiento no permitidos.";
    }

    const { rows } = await db.execute(sql.raw(clean));
    if (rows.length === 0) return "La consulta no devolvió resultados.";
    let res = JSON.stringify(rows.slice(0, 50));
    if (rows.length > 50) res += `\n... (mostrando 50 de ${rows.length} resultados)`;
    return res;
  } catch (error: any) {
    console.error("Error en consulta SQL:", error);
    return `❌ Error en consulta SQL: ${error.message}`;
  }
}

async function resolveEntity(tipo: string, busqueda: string) {
  const { ilike, or } = await import("drizzle-orm");
  const t = `%${busqueda.toLowerCase()}%`;
  if (tipo === "empleado" || tipo === "operario") {
    const [emp] = await db.select().from(empleadosTable)
      .where(or(ilike(empleadosTable.nombre, t), ilike(empleadosTable.apellido, t), ilike(empleadosTable.dni, t))).limit(1);
    if (emp) return { id: emp.id, nombre: `${emp.nombre} ${emp.apellido}`, tipo: "empleado" };
  } else if (tipo === "maquina" || tipo === "maquinaria") {
    const [maq] = await db.select().from(maquinasTable).where(ilike(maquinasTable.nombre, t)).limit(1);
    if (maq) return { id: maq.id, nombre: maq.nombre, tipo: "maquina" };
  }
  return null;
}

async function executeRegistrarIncidente(args: any, imgUrl?: string | null) {
  try {
    let empId = null;
    let maqId = null;
    if (args.entidad_tipo && args.busqueda_entidad) {
      const ent = await resolveEntity(args.entidad_tipo, args.busqueda_entidad);
      if (!ent) return `❌ No encontré ninguna entidad que coincida con "${args.busqueda_entidad}".`;
      if (ent.tipo === "empleado") empId = ent.id;
      if (ent.tipo === "maquina") maqId = ent.id;
    }
    
    await db.insert(incidentesTable).values({
      empresa_id: 1,
      empleado_id: empId,
      maquina_id: maqId,
      tipo: args.tipo,
      descripcion: args.descripcion,
      fecha: args.fecha,
      foto_url: imgUrl || null,
    });
    
    return `✅ Incidente de tipo "${args.tipo}" registrado exitosamente para la fecha ${args.fecha}.`;
  } catch (error: any) {
    return `❌ Error al registrar incidente: ${error.message}`;
  }
}

async function executeRegistrarAlerta(args: any) {
  try {
    let entId = null;
    let entNombre = null;
    let entTipo = null;
    if (args.entidad_tipo && args.busqueda_entidad) {
      const ent = await resolveEntity(args.entidad_tipo, args.busqueda_entidad);
      if (!ent) return `❌ No encontré ninguna entidad que coincida con "${args.busqueda_entidad}".`;
      entId = ent.id;
      entNombre = ent.nombre;
      entTipo = ent.tipo;
    }
    
    await db.insert(alertasTable).values({
      empresa_id: 1,
      tipo: args.tipo,
      prioridad: args.prioridad,
      descripcion: args.descripcion,
      entidad_tipo: entTipo,
      entidad_id: entId,
      entidad_nombre: entNombre,
    });
    
    return `✅ Alerta de prioridad "${args.prioridad}" registrada exitosamente.`;
  } catch (error: any) {
    return `❌ Error al registrar alerta: ${error.message}`;
  }
}

async function executeRegistrarDocumento(args: any) {
  try {
    const ent = await resolveEntity(args.entidad_tipo, args.busqueda_entidad);
    if (!ent) return `❌ No encontré ninguna entidad que coincida con "${args.busqueda_entidad}".`;
    
    await db.insert(documentosTable).values({
      empresa_id: 1,
      tipo: args.tipo,
      descripcion: args.descripcion || "",
      entidad_tipo: ent.tipo,
      entidad_id: ent.id,
      fecha_vencimiento: args.fecha_vencimiento,
    });
    
    return `✅ Documento "${args.tipo}" registrado para ${ent.nombre}. Vencimiento: ${args.fecha_vencimiento}.`;
  } catch (error: any) {
    return `❌ Error al registrar documento: ${error.message}`;
  }
}
