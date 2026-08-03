import app from "./app";
import { logger } from "./lib/logger";
import { startSpeedMonitor } from "./services/speed-monitor.js";
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
});

