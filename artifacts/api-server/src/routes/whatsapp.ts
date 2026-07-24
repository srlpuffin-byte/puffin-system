import { Router } from "express";
import { handleWhatsAppMessage } from "../services/assistant.js";

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
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0] &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
        const from = body.entry[0].changes[0].value.messages[0].from; // Número de quien envía el mensaje
        const msgBody = body.entry[0].changes[0].value.messages[0].text?.body; // Texto del mensaje
        const msgType = body.entry[0].changes[0].value.messages[0].type;

        console.log(`Mensaje recibido de ${from}: ${msgBody} (Tipo: ${msgType})`);
        
        if (msgType === "text" && msgBody) {
          await handleWhatsAppMessage(from, msgBody);
        }
      }
    } catch (error) {
      console.error("Error processing WhatsApp webhook:", error);
    }
  } else {
    res.sendStatus(404);
  }
});
