import OpenAI from "openai"; // Usamos el SDK de OpenAI apuntando a Groq
import { db } from "@workspace/db";
import {
  empleadosTable,
  maquinasTable,
  fotografiasTable,
  egresosTable,
} from "@workspace/db/schema";
import { eq, like, or, and } from "drizzle-orm";
import { sendWhatsAppImage, sendWhatsAppMessage } from "./whatsapp.js";

const groqApiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
const openai = groqApiKey ? new OpenAI({
  apiKey: groqApiKey,
  baseURL: process.env.GROQ_API_KEY ? "https://api.groq.com/openai/v1" : undefined,
}) : null;

// Herramientas que la IA puede usar
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "consultar_inventario",
      description: "Consulta el inventario de máquinas o ítems disponibles, y en qué proyecto están asignadas.",
      parameters: {
        type: "object",
        properties: {
          termino: { type: "string", description: "Término de búsqueda (ej. 'Retroexcavadora', 'Caterpillar', 'Casilla')" },
        },
        required: ["termino"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_gastos",
      description: "Consulta los gastos o egresos recientes.",
      parameters: {
        type: "object",
        properties: {
          categoria: { type: "string", description: "Categoría del gasto (opcional)" },
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
          maquina_id: { type: "number", description: "ID interno de la máquina (opcional, si se conoce)" },
          nombre_maquina: { type: "string", description: "Nombre de la máquina o vehículo" },
        },
        required: ["nombre_maquina"],
      },
    },
  }
];

// Números de administradores autorizados para usar el asistente IA
const ADMIN_PHONES = ["3472629600", "3572665637", "3572400877"];

export async function handleWhatsAppMessage(from: string, text: string) {
  // Normalizar número: solo dígitos, sin código de país
  const senderPhone = from.replace(/[^0-9]/g, "");

  // Verificar si el número está autorizado (últimos 10 dígitos para manejar código de país)
  const isAdmin = ADMIN_PHONES.some(admin =>
    senderPhone.endsWith(admin) || admin.endsWith(senderPhone.slice(-10))
  );

  if (!isAdmin) {
    // Empleados no autorizados: ignorar silenciosamente (sin respuesta)
    console.log(`[WhatsApp] Mensaje de número no autorizado ${senderPhone} ignorado.`);
    return;
  }

  if (!openai) {
    console.warn("OpenAI API KEY no configurada. Asistente deshabilitado.");
    await sendWhatsAppMessage(from, "Lo siento, el asistente no está configurado por el momento.");
    return;
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { 
      role: "system", 
      content: `Eres el Asistente Virtual de PUFFIN SRL. 
      Hablas en español de Argentina de forma concisa y profesional. 
      Tu objetivo es ayudar a los administradores y operarios respondiendo consultas sobre el inventario, 
      proyectos asignados, gastos y enviar fotos de vehículos si te lo piden.` 
    },
    { role: "user", content: text }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: process.env.GROQ_API_KEY ? "llama-3.3-70b-versatile" : "gpt-4o-mini",
      messages,
      tools,
      tool_choice: "auto",
    });

    const responseMessage = response.choices[0].message;

    if (responseMessage.tool_calls) {
      messages.push(responseMessage); // Añadir la llamada a la herramienta al historial

      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.type !== "function") continue;
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        let toolResult = "";

        if (functionName === "consultar_inventario") {
          toolResult = await executeConsultarInventario(functionArgs.termino);
        } else if (functionName === "consultar_gastos") {
          toolResult = await executeConsultarGastos(functionArgs.categoria);
        } else if (functionName === "enviar_imagen_vehiculo") {
          toolResult = await executeEnviarImagenVehiculo(from, functionArgs.nombre_maquina, functionArgs.maquina_id);
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: toolResult,
        });
      }

      // Segunda llamada a OpenAI con los resultados de las herramientas
      const secondResponse = await openai.chat.completions.create({
        model: process.env.GROQ_API_KEY ? "llama-3.3-70b-versatile" : "gpt-4o-mini",
        messages,
      });

      const finalResponse = secondResponse.choices[0].message.content;
      if (finalResponse) {
        await sendWhatsAppMessage(from, finalResponse);
      }
    } else {
      if (responseMessage.content) {
        await sendWhatsAppMessage(from, responseMessage.content);
      }
    }
  } catch (error) {
    console.error("Error en asistente PUFFIN:", error);
    await sendWhatsAppMessage(from, "Tuve un error al procesar tu consulta.");
  }
}

async function executeConsultarInventario(termino: string) {
  const t = `%${termino.toLowerCase()}%`;
  const results = await db.select().from(maquinasTable).where(
    or(
      like(maquinasTable.nombre, t),
      like(maquinasTable.tipo, t)
    )
  ).limit(5);

  if (results.length === 0) return `No se encontraron máquinas ni inventario para "${termino}".`;

  // Asignamos el estado y la categoría
  const lineas = results.map(r => `- ${r.nombre} (Tipo: ${r.tipo}). Estado: ${r.estado} / Categoría: ${r.categoria}`);
  return "Se encontraron estos resultados:\n" + lineas.join("\n");
}

async function executeConsultarGastos(categoria?: string) {
  // Retorna un resumen de gastos (ej. últimos 10 o sumatoria)
  const results = await db.select().from(egresosTable).limit(5);
  if (results.length === 0) return "No hay gastos registrados recientes.";
  const sum = results.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
  return `Tengo ${results.length} gastos recientes registrados. Suman un total de $${sum}. Algunos son: ` + 
         results.map(r => `${r.concepto}: $${r.monto}`).join(", ");
}

async function executeEnviarImagenVehiculo(from: string, nombreMaquina: string, maquinaId?: number) {
  let maqId = maquinaId;
  if (!maqId) {
    const t = `%${nombreMaquina.toLowerCase()}%`;
    const maq = await db.select().from(maquinasTable).where(like(maquinasTable.nombre, t)).limit(1);
    if (maq.length === 0) return `No encontré ninguna máquina llamada ${nombreMaquina}.`;
    maqId = maq[0].id;
  }

  const fotos = await db.select().from(fotografiasTable).where(
    and(eq(fotografiasTable.entidad_tipo, "maquina"), eq(fotografiasTable.entidad_id, maqId))
  ).limit(1);

  if (fotos.length === 0) {
    return `La máquina ${nombreMaquina} (ID ${maqId}) no tiene fotos registradas.`;
  }

  // Envía imagen por WhatsApp
  const foto = fotos[0];
  await sendWhatsAppImage(from, foto.url, `Aquí tienes la imagen de ${nombreMaquina}`);
  return `He enviado la imagen de la máquina ${nombreMaquina} por WhatsApp al usuario.`;
}
