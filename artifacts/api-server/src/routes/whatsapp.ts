import { Router } from "express";
import { handleWhatsAppMessage } from "../services/assistant.js";
import { downloadWhatsAppMedia } from "../services/whatsapp.js";

export const whatsappRouter = Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "puffin_secret_token";

// Cola / Buffer para agrupar mensajes continuos que llegan con segundos de diferencia
// (ej: primero la foto/PDF del comprobante y a continuación "Lipsa cargadora Liugong", o al revés)
interface PendingBatch {
  texts: string[];
  mediaBase64?: string;
  activeDownloads: number;
  timer?: NodeJS.Timeout;
}

const pendingBatches = new Map<string, PendingBatch>();
const DEBOUNCE_MS = 2500; // 2.5 segundos de espera tras el último mensaje/descarga para procesar el lote completo

function getOrCreateBatch(from: string): PendingBatch {
  let batch = pendingBatches.get(from);
  if (!batch) {
    batch = {
      texts: [],
      activeDownloads: 0,
    };
    pendingBatches.set(from, batch);
  }
  // Si entra nueva actividad, cancelamos el timer de disparo prematuro
  if (batch.timer) {
    clearTimeout(batch.timer);
    batch.timer = undefined;
  }
  return batch;
}

function scheduleBatch(from: string) {
  const batch = pendingBatches.get(from);
  if (!batch) return;

  // Si todavía hay descargas de imágenes o documentos en curso para este remitente, NO disparamos todavía
  if (batch.activeDownloads > 0) {
    return;
  }

  if (batch.timer) {
    clearTimeout(batch.timer);
  }

  // Si no hay texto ni media, limpiar y salir
  if (batch.texts.length === 0 && !batch.mediaBase64) {
    pendingBatches.delete(from);
    return;
  }

  batch.timer = setTimeout(async () => {
    pendingBatches.delete(from);
    const combinedText = batch.texts.filter(Boolean).join("\n\n");
    console.log(`[Webhook] Procesando lote combinado de ${from} (${batch.texts.length} partes, media adjunto: ${!!batch.mediaBase64}):\n${combinedText}`);
    try {
      await handleWhatsAppMessage(from, combinedText, batch.mediaBase64);
    } catch (err) {
      console.error(`[Webhook] Error procesando lote de ${from}:`, err);
    }
  }, DEBOUNCE_MS);
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

      // Ignorar mensajes enviados por el propio bot (evitar loop)
      const botPhoneNumber = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
      const botDisplayNumber = change.metadata?.display_phone_number?.replace(/\D/g, "") || "";
      const fromClean = from.replace(/\D/g, "");
      if (botDisplayNumber && fromClean === botDisplayNumber) {
        console.log(`[Webhook] Ignorando mensaje del propio bot (${from})`);
        return;
      }

      const batch = getOrCreateBatch(from);

      // 1. Manejo de mensajes de texto normales
      if (msgType === "text" && message.text?.body) {
        const textBody = message.text.body.trim();
        console.log(`[Webhook] Texto recibido de ${from}: "${textBody}"`);
        batch.texts.push(textBody);
        scheduleBatch(from);
      }

      // 2. Manejo de imágenes (fotos de comprobantes, tickets, etc.)
      else if (msgType === "image" && message.image) {
        const caption = message.image.caption ? message.image.caption.trim() : "";
        if (caption) batch.texts.push(caption);
        const mediaId = message.image.id;
        if (mediaId) {
          batch.activeDownloads++;
          console.log(`[Webhook] Descargando imagen ${mediaId} de ${from}...`);
          try {
            const base64 = await downloadWhatsAppMedia(mediaId);
            if (base64) {
              batch.mediaBase64 = base64;
              console.log(`[Webhook] Imagen ${mediaId} descargada correctamente`);
            }
          } catch (err) {
            console.error(`[Webhook] Error descargando imagen ${mediaId}:`, err);
          } finally {
            batch.activeDownloads--;
            scheduleBatch(from);
          }
        } else {
          scheduleBatch(from);
        }
      }

      // 3. Manejo de documentos (Facturas en PDF, recibos, etc.)
      else if (msgType === "document" && message.document) {
        const docName = message.document.filename || "documento.pdf";
        const docCaption = message.document.caption ? `${message.document.caption.trim()}\n` : "";
        let docHeader = `${docCaption}[Documento/Factura PDF adjunto: ${docName}]`;
        const mediaId = message.document.id;

        if (mediaId) {
          batch.activeDownloads++;
          console.log(`[Webhook] Descargando documento ${mediaId} (${docName}) de ${from}...`);
          try {
            const base64 = await downloadWhatsAppMedia(mediaId);
            if (base64) {
              batch.mediaBase64 = base64;
              // Si es un PDF, extraer el texto para que la IA lo interprete directamente
              if (message.document.mime_type?.includes("pdf") || docName.toLowerCase().endsWith(".pdf")) {
                try {
                  const { PDFParse } = await import("pdf-parse");
                  const base64Data = base64.includes(";base64,") ? base64.split(";base64,")[1] : base64;
                  const buffer = Buffer.from(base64Data, "base64");
                  const parser = new PDFParse({ data: buffer });
                  const parsedResult = await parser.getText();
                  if (parsedResult && parsedResult.text && parsedResult.text.trim()) {
                    // Preservar saltos de línea para conservar estructura de tablas y conceptos
                    const cleanedLines = parsedResult.text
                      .split("\n")
                      .map((l: string) => l.trim())
                      .filter(Boolean)
                      .join("\n");
                    docHeader += `\n\n--- CONTENIDO EXTRAÍDO DE LA FACTURA/PDF (${docName}) ---\n${cleanedLines.slice(0, 4000)}`;
                    console.log(`[Webhook] Texto extraído exitosamente de PDF ${docName} (${cleanedLines.length} caracteres)`);
                  }
                } catch (pdfErr) {
                  console.warn(`[Webhook] No se pudo extraer texto del PDF ${docName}:`, pdfErr);
                }
              }
            }
          } catch (err) {
            console.error(`[Webhook] Error descargando documento ${mediaId}:`, err);
          } finally {
            batch.texts.push(docHeader);
            batch.activeDownloads--;
            scheduleBatch(from);
          }
        } else {
          batch.texts.push(docHeader);
          scheduleBatch(from);
        }
      } else {
        console.log(`[Webhook] Tipo de mensaje recibido no manejado: ${msgType} de ${from}`);
      }

    } catch (error) {
      console.error("[Webhook] Error procesando mensaje:", error);
    }
  } else {
    res.sendStatus(404);
  }
});
