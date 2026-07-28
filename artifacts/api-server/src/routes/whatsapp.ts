import { Router } from "express";
import { handleWhatsAppMessage } from "../services/assistant.js";
import { downloadWhatsAppMedia } from "../services/whatsapp.js";

export const whatsappRouter = Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "puffin_secret_token";

// Endpoint para la validación de webhook de Meta
whatsappRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

// Endpoint para recibir mensajes
whatsappRouter.post("/", async (req, res) => {
  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    // Retornamos 200 OK inmediatamente para evitar reintentos por parte de Meta
    res.status(200).send("EVENT_RECEIVED");

    try {
      const change = body.entry?.[0]?.changes?.[0]?.value;
      if (!change) return;

      // Ignorar actualizaciones de estado (delivered, read, sent) — no son mensajes entrantes
      if (change.statuses) return;

      const message = change.messages?.[0];
      if (!message) return;

      const from: string = message.from;
      const msgType: string = message.type;
      
      let msgBody: string | undefined = message.text?.body;
      let imageBase64: string | undefined = undefined;

      // Soporte para imágenes
      if (msgType === "image" && message.image) {
        msgBody = message.image.caption || "[Imagen recibida sin texto]";
        const mediaId = message.image.id;
        if (mediaId) {
          console.log(`[Webhook] Descargando imagen ${mediaId} de ${from}...`);
          const base64 = await downloadWhatsAppMedia(mediaId);
          if (base64) {
            imageBase64 = base64;
          } else {
            console.warn(`[Webhook] No se pudo descargar la imagen ${mediaId}`);
          }
        }
      }

      // Ignorar mensajes enviados por el propio bot (evitar loop)
      const botPhoneNumber = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
      const botDisplayNumber = change.metadata?.display_phone_number?.replace(/\D/g, "") || "";
      const fromClean = from.replace(/\D/g, "");
      if (botDisplayNumber && fromClean === botDisplayNumber) {
        console.log(`[Webhook] Ignorando mensaje del propio bot (${from})`);
        return;
      }

      // Ignorar mensajes sin texto ni imagen
      if (!msgBody && !imageBase64) {
        console.log(`[Webhook] Ignorando mensaje tipo: ${msgType} de ${from}`);
        return;
      }

      console.log(`[Webhook] Mensaje entrante de ${from} (tipo: ${msgType}): ${msgBody}`);
      await handleWhatsAppMessage(from, msgBody, imageBase64);

    } catch (error) {
      console.error("[Webhook] Error procesando mensaje:", error);
    }
  } else {
    res.sendStatus(404);
  }
});
