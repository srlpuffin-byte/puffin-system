import app from "./app";
import { logger } from "./lib/logger";
import { startSpeedMonitor } from "./services/speed-monitor.js";
import { startSatcomMonitor } from "./services/satcom-monitor.js";
import { db } from "@workspace/db";
import { egresosTable } from "@workspace/db/schema";
import { inArray, sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startSpeedMonitor();
  startSatcomMonitor();

  // Ejecución puntual para reparar comprobante y desglose de Ronco #237
  import("./routes/index.js").then(({ fixComprobanteRonco }) => {
    if (fixComprobanteRonco) {
      fixComprobanteRonco().then(res => {
        logger.info({ res }, "[Auto-Fix] Resultado corrección egreso #237 Ronco/Gelso");
      }).catch(err => {
        logger.error({ err }, "[Auto-Fix] Error en corrección automática de egreso #237");
      });
    }
  }).catch(() => {});
});