import { Router } from "express";
import { handleWhatsAppMessage } from "../services/assistant.js";
import { downloadWhatsAppMedia } from "../services/whatsapp.js";

export const whatsappRouter = Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "puffin_secret_token";

// Cola / Buffer para agrupar mensajes continuos que llegan con segundos de diferencia
// (ej: primero el texto del gasto, a continuación "Lipsa liugong" y luego la foto/PDF)
interface PendingBatch {
  texts: string[];
  imageBase64?: string;
  timer: NodeJS.Timeout;
}

const pendingBatches = new Map<string, PendingBatch>();
const DEBOUNCE_MS = 2000; // 2 segundos para agrupar ráfagas de mensajes del mismo remitente

function queueWhatsAppMessage(from: string, msgBody: string, imageBase64?: string) {
  const existing = pendingBatches.get(from);
  if (existing) {
    clearTimeout(existing.timer);
    if (msgBody) existing.texts.push(msgBody);
    if (imageBase64) existing.imageBase64 = imageBase64;

    existing.timer = setTimeout(async () => {
      pendingBatches.delete(from);
      const combinedText = existing.texts.filter(Boolean).join("\n");
      console.log(`[Webhook] Procesando lote continuo de ${from} (${existing.texts.length} mensajes combinados):\n${combinedText}`);
      try {
        await handleWhatsAppMessage(from, combinedText, existing.imageBase64);
      } catch (err) {
        console.error(`[Webhook] Error procesando lote de ${from}:`, err);
      }
    }, DEBOUNCE_MS);
  } else {
    const texts = msgBody ? [msgBody] : [];
    const batch: PendingBatch = {
      texts,
      imageBase64,
      timer: setTimeout(async () => {
        pendingBatches.delete(from);
        const combinedText = batch.texts.filter(Boolean).join("\n");
        console.log(`[Webhook] Procesando mensaje de ${from}:\n${combinedText}`);
        try {
          await handleWhatsAppMessage(from, combinedText, batch.imageBase64);
        } catch (err) {
          console.error(`[Webhook] Error procesando mensaje de ${from}:`, err);
        }
      }, DEBOUNCE_MS),
    };
    pendingBatches.set(from, batch);
  }
}

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

      // Soporte para documentos (Facturas en PDF, comprobantes, etc.)
      if (msgType === "document" && message.document) {
        const docName = message.document.filename || "documento.pdf";
        const docCaption = message.document.caption ? `${message.document.caption}\n` : "";
        msgBody = `${docCaption}[Documento/Factura PDF adjunto: ${docName}]`;
        const mediaId = message.document.id;
        if (mediaId) {
          console.log(`[Webhook] Descargando documento ${mediaId} (${docName}) de ${from}...`);
          const base64 = await downloadWhatsAppMedia(mediaId);
          if (base64) {
            imageBase64 = base64;
            // Si es un PDF, extraer el texto para que la IA lo interprete directamente
            if (message.document.mime_type?.includes("pdf") || docName.toLowerCase().endsWith(".pdf")) {
              try {
                const { PDFParse } = await import("pdf-parse");
                const base64Data = base64.includes(";base64,") ? base64.split(";base64,")[1] : base64;
                const buffer = Buffer.from(base64Data, "base64");
                const parser = new PDFParse({ data: buffer });
                const parsedResult = await parser.getText();
                if (parsedResult && parsedResult.text && parsedResult.text.trim()) {
                  const cleanedText = parsedResult.text.replace(/\s+/g, " ").trim();
                  msgBody += `\n\n--- CONTENIDO EXTRAÍDO DE LA FACTURA/PDF (${docName}) ---\n${cleanedText.slice(0, 3000)}`;
                  console.log(`[Webhook] Texto extraído exitosamente de PDF ${docName} (${cleanedText.length} caracteres)`);
                }
              } catch (pdfErr) {
                console.warn(`[Webhook] No se pudo extraer texto del PDF ${docName}:`, pdfErr);
              }
            }
          } else {
            console.warn(`[Webhook] No se pudo descargar el documento ${mediaId}`);
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

      console.log(`[Webhook] Mensaje encolado de ${from} (tipo: ${msgType}): ${msgBody}`);
      queueWhatsAppMessage(from, msgBody || "", imageBase64);

    } catch (error) {
      console.error("[Webhook] Error procesando mensaje:", error);
    }
  } else {
    res.sendStatus(404);
  }
});
