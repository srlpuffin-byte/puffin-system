import { syncAllSheets } from "./artifacts/api-server/src/services/sync-sheets.ts";
import "dotenv/config";
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve("./artifacts/api-server/.env") });

async function run() {
  console.log("Running sync...");
  try {
    await syncAllSheets();
    console.log("Done");
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
run();
