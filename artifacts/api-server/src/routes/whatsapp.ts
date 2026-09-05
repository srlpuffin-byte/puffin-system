import { Router } from "express";
import zlib from "node:zlib";
import { handleWhatsAppMessage } from "../services/assistant.js";
import { downloadWhatsAppMedia } from "../services/whatsapp.js";

export const whatsappRouter = Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "puffin_secret_token";

/**
 * Extractor ultra-robusto de texto para facturas y documentos PDF.
 * 1. Intenta con pdf-parse (v2 clase PDFParse o v1 función).
 * 2. Si falla o devuelve vacío, aplica un fallback directo descompimiendo los streams FlateDecode con zlib.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length < 10) return "";

  // 1. Intento primario con unpdf (100% puro JS, estándar Web, sin binarios nativos ni canvas)
  try {
    const { extractText } = await import("unpdf");
    const parsed = await extractText(new Uint8Array(buffer));
    const fullText = Array.isArray(parsed?.text) ? parsed.text.join("\n") : (parsed?.text || "");
    if (fullText && fullText.trim().length > 10) {
      const cleaned = fullText
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean)
        .join("\n");
      console.log(`[PDF] Texto extraído exitosamente con unpdf (${cleaned.length} caracteres, ${parsed.totalPages} páginas)`);
      return cleaned;
    }
  } catch (unpdfErr) {
    console.warn("[PDF] Advertencia con unpdf:", unpdfErr);
  }

  // 2. Intento secundario con pdf-parse
  try {
    const pdfModule = await import("pdf-parse");
    if (typeof (pdfModule as any).default === "function") {
      const parsedResult = await (pdfModule as any).default(buffer);
      if (parsedResult?.text?.trim()?.length > 10) {
        const cleaned = parsedResult.text
          .split("\n")
          .map((l: string) => l.trim())
          .filter(Boolean)
          .join("\n");
        console.log(`[PDF] Texto extraído con pdf-parse v1 (${cleaned.length} caracteres)`);
        return cleaned;
      }
    } else if ((pdfModule as any).PDFParse) {
      const parser = new (pdfModule as any).PDFParse({ data: buffer });
      const parsedResult = await parser.getText();
      const text = parsedResult?.text || parsedResult?.pages?.map((p: any) => p.text).join("\n") || "";
      if (text && text.trim().length > 10) {
        const cleaned = text
          .split("\n")
          .map((l: string) => l.trim())
          .filter(Boolean)
          .join("\n");
        console.log(`[PDF] Texto extraído exitosamente con PDFParse v2 (${cleaned.length} caracteres)`);
        return cleaned;
      }
    }
  } catch (pdfErr) {
    console.warn("[PDF] Advertencia con pdf-parse:", pdfErr);
  }

  // 2. Fallback robusto: extracción de streams descomprimidos de PDF
  // Las facturas electrónicas de AFIP guardan conceptos y montos en bloques de texto FlateDecode
  try {
    const binaryStr = buffer.toString("binary");
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    const extractedWords: string[] = [];

    while ((match = streamRegex.exec(binaryStr)) !== null) {
      const rawData = Buffer.from(match[1], "binary");
      let decompressed = "";
      try {
        decompressed = zlib.inflateSync(rawData).toString("latin1");
      } catch {
        try {
          decompressed = zlib.inflateRawSync(rawData).toString("latin1");
        } catch {
          decompressed = rawData.toString("latin1");
        }
      }

      // Buscar operadores Tj: (texto) Tj
      const tjMatches = decompressed.match(/\([^)]+\)\s*Tj/g) || [];
      for (const m of tjMatches) {
        const t = m.slice(1, m.lastIndexOf(")")).trim();
        if (t && t.length > 0 && !/^[\x00-\x1F\x7F]+$/.test(t)) {
          extractedWords.push(t);
        }
      }

      // Buscar operadores TJ: [(texto) -12 (otro)] TJ
      const arrMatches = decompressed.match(/\[[^\]]+\]\s*TJ/g) || [];
      for (const m of arrMatches) {
        const innerMatches = m.match(/\([^)]+\)/g) || [];
        const combined = innerMatches.map(s => s.slice(1, -1)).join("");
        if (combined.trim().length > 0 && !/^[\x00-\x1F\x7F]+$/.test(combined)) {
          extractedWords.push(combined.trim());
        }
      }

      // Buscar operadores hex Tj: <00460069...> Tj común en fuentes Unicode AFIP
      const hexMatches = decompressed.match(/<([0-9a-fA-F\s]+)>\s*Tj/g) || [];
      for (const hm of hexMatches) {
        const hex = hm.slice(1, hm.lastIndexOf(">")).replace(/\s+/g, "");
        let str = "";
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.substr(i, 2), 16);
          if (code >= 32 && code <= 126) str += String.fromCharCode(code);
        }
        if (str.trim()) extractedWords.push(str.trim());
      }
    }

    if (extractedWords.length > 5) {
      const fallbackText = extractedWords.join(" ");
      console.log(`[PDF] Fallback de streams zlib extrajo ${extractedWords.length} palabras (${fallbackText.length} caracteres)`);
      return fallbackText;
    }
  } catch (streamErr) {
    console.warn("[PDF] Falló extracción de streams crudos:", streamErr);
  }

  return "";
}

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
              const base64Data = base64.includes(";base64,") ? base64.split(";base64,")[1] : base64;
              const buffer = Buffer.from(base64Data.trim(), "base64");
              const isPdf = message.document.mime_type?.includes("pdf") ||
                            docName.toLowerCase().endsWith(".pdf") ||
                            buffer.slice(0, 10).toString("latin1").includes("%PDF");
              if (isPdf) {
                const extractedText = await extractPdfText(buffer);
                if (extractedText && extractedText.trim()) {
                  docHeader += `\n\n--- CONTENIDO EXTRAÍDO DE LA FACTURA/PDF (${docName}) ---\n${extractedText.slice(0, 8000)}`;
                  console.log(`[Webhook] ✅ Texto extraído exitosamente de PDF ${docName} (${extractedText.length} caracteres)`);
                } else {
                  console.warn(`[Webhook] ⚠️ No se pudo extraer texto del PDF ${docName}`);
                }
              }
            } else {
              console.error(`[Webhook] ❌ downloadWhatsAppMedia devolvió null para el documento ${mediaId}`);
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
