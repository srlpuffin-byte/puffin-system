
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
    const data = await res.json();
    return data;
  } catch (error) {
    console.error(`[WhatsApp] Excepción enviando a ${toFormatted}:`, error);
    throw error;
  }
}


export async function sendWhatsAppImage(to: string, imageUrl: string, caption?: string) {
  if (!WHATSAPP_ACCESS_TOKEN || WHATSAPP_ACCESS_TOKEN === "TODO_ACCESS_TOKEN") {
    console.warn(`[WhatsApp] Simulando envío de imagen a ${to}: ${imageUrl}`);
    return { status: "simulated" };
  }

  const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;
  
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/[^0-9]/g, ""),
    type: "image",
    image: { 
      link: imageUrl,
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
