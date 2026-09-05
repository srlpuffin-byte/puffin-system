import OpenAI, { toFile } from "openai";

const groqApiKey = process.env.GROQ_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

// Cliente de Groq para Whisper (ultra-rápido, <1s, gratuito)
const groqClient = groqApiKey
  ? new OpenAI({ apiKey: groqApiKey, baseURL: "https://api.groq.com/openai/v1" })
  : null;

// Cliente de OpenAI como fallback
const openaiClient = openaiApiKey
  ? new OpenAI({ apiKey: openaiApiKey })
  : null;

/**
 * Transcribe un buffer de audio (nota de voz o archivo de WhatsApp) a texto usando Whisper.
 * Prioridad: Groq whisper-large-v3-turbo → OpenAI whisper-1
 */
export async function transcribeAudio(buffer: Buffer, mimeType: string = "audio/ogg"): Promise<string> {
  if (!buffer || buffer.length === 0) return "";

  const cleanMime = mimeType.split(";")[0].trim().toLowerCase();
  let extension = "ogg";
  if (cleanMime.includes("mp4") || cleanMime.includes("m4a")) extension = "m4a";
  else if (cleanMime.includes("mpeg") || cleanMime.includes("mp3")) extension = "mp3";
  else if (cleanMime.includes("wav")) extension = "wav";

  const filename = `voice_note_${Date.now()}.${extension}`;

  // 1. Intento primario con Groq Whisper (ultra veloz)
  if (groqClient) {
    try {
      const file = await toFile(buffer, filename, { type: cleanMime || "audio/ogg" });
      const response = await groqClient.audio.transcriptions.create({
        file,
        model: "whisper-large-v3-turbo",
        language: "es",
        temperature: 0.0,
      });

      const text = response.text ? response.text.trim() : "";
      if (text) {
        console.log(`[Audio/Whisper] ✅ Transcripción exitosa con Groq (${text.length} caracteres): "${text}"`);
        return text;
      }
    } catch (groqErr: any) {
      console.warn("[Audio/Whisper] Falló transcripción con Groq, intentando fallback:", groqErr?.message || groqErr);
    }
  }

  // 2. Fallback secundario con OpenAI Whisper
  if (openaiClient) {
    try {
      const file = await toFile(buffer, filename, { type: cleanMime || "audio/ogg" });
      const response = await openaiClient.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "es",
        temperature: 0.0,
      });

      const text = response.text ? response.text.trim() : "";
      if (text) {
        console.log(`[Audio/Whisper] ✅ Transcripción exitosa con OpenAI Whisper (${text.length} caracteres): "${text}"`);
        return text;
      }
    } catch (openaiErr: any) {
      console.error("[Audio/Whisper] Error en transcripción con OpenAI:", openaiErr?.message || openaiErr);
    }
  }

  if (!groqClient && !openaiClient) {
    console.warn("[Audio/Whisper] No hay API key configurada para transcripción de audio (GROQ_API_KEY u OPENAI_API_KEY)");
  }

  return "";
}
