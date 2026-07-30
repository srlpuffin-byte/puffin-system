
const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || "TODO_PHONE_ID";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "TODO_ACCESS_TOKEN";

// Formatea números argentinos al formato internacional requerido por WhatsApp
// Ej: "3472629600" → "5493472629600"
function formatArgentinaPhone(number: string): string {
  const digits = number.replace(/[^0-9]/g, "");
  if (digits.startsWith("549")) return digits;           // Ya tiene 549
  if (digits.startsWith("54")) return `549${digits.slice(2)}`; // Tiene 54 pero falta el 9
  if (digits.startsWith("9") && digits.length === 11) return `54${digits}`;  // Tiene 9 pero falta 54
  if (digits.length === 10) return `549${digits}`;       // Solo el número local (10 dígitos)
  return digits; // Formato desconocido, enviar tal cual
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<{ status: string; error?: string }> {
  const toFormatted = formatArgentinaPhone(to);

  if (!WHATSAPP_ACCESS_TOKEN || WHATSAPP_ACCESS_TOKEN === "TODO_ACCESS_TOKEN") {
    console.warn(`[WhatsApp] Simulando envío a ${toFormatted}: ${text}`);
    return { status: "simulated" };
  }

  const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;
  
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toFormatted,
    type: "text",
    text: { body: text }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[WhatsApp] Error enviando a ${toFormatted}:`, errText);
      throw new Error(`WhatsApp API error: ${res.status} ${errText}`);
    }

    console.log(`[WhatsApp] ✅ Enviado a ${toFormatted}`);
    const data = await res.json() as any;
    return data;
  } catch (error) {
    console.error(`[WhatsApp] Excepción enviando a ${toFormatted}:`, error);
    throw error;
  }
}


import { uploadImage } from "./storage.js";

export async function sendWhatsAppImage(to: string, imageUrl: string, caption?: string) {
  const toFormatted = formatArgentinaPhone(to);
  
  let finalUrl = imageUrl;
  
  // Si la imagen es un base64 directo, WhatsApp la va a rechazar. 
  // Intentamos subirla a Cloudinary al vuelo para obtener una URL pública.
  if (finalUrl.startsWith("data:image/")) {
    try {
      console.log(`[WhatsApp] Transformando imagen Base64 a URL pública...`);
      finalUrl = await uploadImage(`wa_foto_${Date.now()}.jpg`, finalUrl);
    } catch (e) {
      console.error("[WhatsApp] Error subiendo imagen base64 a Cloudinary:", e);
      // Fallback: dejaremos que falle en la API de WhatsApp, pero registramos el error.
    }
  }

  if (!WHATSAPP_ACCESS_TOKEN || WHATSAPP_ACCESS_TOKEN === "TODO_ACCESS_TOKEN") {
    console.warn(`[WhatsApp] Simulando envío de imagen a ${toFormatted}: ${imageUrl}`);
    return { status: "simulated" };
  }

  const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;
  
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toFormatted,
    type: "image",
    image: { 
      link: finalUrl,
      ...(caption ? { caption } : {})
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Error enviando imagen de WhatsApp a ${to}:`, errText);
      throw new Error(`WhatsApp API error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error(`Excepción enviando imagen de WhatsApp a ${to}:`, error);
    throw error;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Envío de mensajes usando plantillas aprobadas por Meta (WhatsApp Business API)
// ──────────────────────────────────────────────────────────────────────────────

export interface TemplateParameter {
  type: "text";
  text: string;
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string = "es_AR",
  bodyParameters: TemplateParameter[] = []
): Promise<{ status: string; error?: string }> {
  const toFormatted = formatArgentinaPhone(to);

  if (!WHATSAPP_ACCESS_TOKEN || WHATSAPP_ACCESS_TOKEN === "TODO_ACCESS_TOKEN") {
    console.warn(`[WhatsApp] Simulando envío de template "${templateName}" a ${toFormatted}`);
    return { status: "simulated" };
  }

  const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;

  const components: object[] = [];
  if (bodyParameters.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParameters,
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toFormatted,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[WhatsApp] Error enviando template "${templateName}" a ${toFormatted}:`, errText);
      throw new Error(`WhatsApp API error: ${res.status} ${errText}`);
    }

    console.log(`[WhatsApp] ✅ Template "${templateName}" enviado a ${toFormatted}`);
    const data = await res.json() as any;
    return data;
  } catch (error) {
    console.error(`[WhatsApp] Excepción enviando template "${templateName}" a ${toFormatted}:`, error);
    throw error;
  }
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<string | null> {
  if (!WHATSAPP_ACCESS_TOKEN || WHATSAPP_ACCESS_TOKEN === "TODO_ACCESS_TOKEN") {
    console.warn(`[WhatsApp] Modo simulado: no se puede descargar el mediaId ${mediaId}`);
    return null;
  }

  try {
    // 1. Obtener la URL del medio
    const url = `${WHATSAPP_API_URL}/${mediaId}`;
    const urlRes = await fetch(url, {
      headers: { "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
    });

    if (!urlRes.ok) {
      console.error(`[WhatsApp] Error obteniendo URL del media ${mediaId}:`, await urlRes.text());
      return null;
    }

    const mediaData = await urlRes.json() as any;
    const mediaUrl = mediaData.url;

    if (!mediaUrl) return null;

    // 2. Descargar el binario del medio
    const mediaRes = await fetch(mediaUrl, {
      headers: { "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
    });

    if (!mediaRes.ok) {
      console.error(`[WhatsApp] Error descargando binario del media ${mediaId}:`, await mediaRes.text());
      return null;
    }

    const arrayBuffer = await mediaRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    // Suponemos que es jpeg para WhatsApp, aunque podría ser otro
    const mimeType = mediaData.mime_type || "image/jpeg";
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`[WhatsApp] Excepción al descargar media ${mediaId}:`, error);
    return null;
  }
}
