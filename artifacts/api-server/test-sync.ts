import "dotenv/config";
import { syncAllSheets } from "./src/services/sync-sheets.js";

async function run() {
  console.log("Iniciando sincronizacion...");
  try {
    await syncAllSheets();
    console.log("Completado");
  } catch (err) {
    console.error("Error global:", err);
  }
  process.exit(0);
}

run();
