import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../lib/logger";

// Caché en memoria para almacenar las peticiones procesadas recientemente.
// Dado que esto corre en un solo nodo/proceso, un Map es suficiente y ultra rápido.
const requestCache = new Map<string, { timestamp: number; responseData?: any }>();
const DEDUPLICATION_WINDOW_MS = 60 * 1000; // 60 segundos

// Tarea en segundo plano para limpiar el caché y evitar memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCache.entries()) {
    if (now - value.timestamp > DEDUPLICATION_WINDOW_MS) {
      requestCache.delete(key);
    }
  }
}, 60 * 1000).unref();

export const deduplicatePOSTs = (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST") return next();

  // No deduplicar si no hay body o es un request muy genérico sin payload.
  const bodyString = JSON.stringify(req.body || {});
  if (bodyString.length < 5) return next();

  // La firma identifica unívocamente: Endpoint + Usuario (Token/IP) + Payload Exacto
  const token = req.headers.authorization || req.ip || "unknown-user";
  const rawKey = `${req.url}|${token}|${bodyString}`;
  const hash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const now = Date.now();

  // 1. Verificamos si ya existe una petición idéntica en el último minuto
  if (requestCache.has(hash)) {
    const cached = requestCache.get(hash)!;
    if (now - cached.timestamp < DEDUPLICATION_WINDOW_MS) {
      logger.info(`[Deduplicate] Bloqueando solicitud duplicada offline/flaky en ${req.url}`);
      
      // Devolvemos exactamente lo mismo que se devolvió la primera vez, 
      // garantizando que el frontend siga su flujo de "Éxito" sin duplicar la BD.
      return res.status(200).json(cached.responseData || { message: "Solicitud ya procesada" });
    }
  }

  // 2. Interceptamos el método res.json para guardar la respuesta exitosa
  const originalJson = res.json;
  res.json = function (body) {
    if (res.statusCode >= 400) {
      // Si la petición original falló, borramos el caché para permitir que el operario reintente.
      requestCache.delete(hash);
    } else {
      // Si fue exitosa, actualizamos el caché con el payload de respuesta para futuros duplicados.
      requestCache.set(hash, { timestamp: Date.now(), responseData: body });
    }
    return originalJson.call(this, body);
  };

  // Marcamos la petición como "en progreso" para evitar condiciones de carrera (doble clic rapidísimo)
  requestCache.set(hash, { timestamp: now }); 
  
  next();
};
