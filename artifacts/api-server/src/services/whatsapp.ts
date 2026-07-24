

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0"; // Ajustar a la versión actual
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || "TODO_PHONE_ID";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "TODO_ACCESS_TOKEN";

export async function sendWhatsAppMessage(to: string, text: string) {
  if (!WHATSAPP_ACCESS_TOKEN || WHATSAPP_ACCESS_TOKEN === "TODO_ACCESS_TOKEN") {
    console.warn(`[WhatsApp] Simulando envío a ${to}: ${text}`);
    return { status: "simulated" };
  }

  const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;
  
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/[^0-9]/g, ""),
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
      console.error(`Error enviando WhatsApp a ${to}:`, errText);
      throw new Error(`WhatsApp API error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error(`Excepción enviando WhatsApp a ${to}:`, error);
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
