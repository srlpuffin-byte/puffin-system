import { resolve } from "path";
import { config } from "dotenv";

// Load .env first
config({ path: resolve("./artifacts/api-server/.env") });
console.log("DATABASE_URL loaded:", !!process.env.DATABASE_URL);
console.log("GOOGLE_SHEET_ID loaded:", !!process.env.GOOGLE_SHEET_ID);

async function run() {
  console.log("Running sync...");
  try {
    const { syncAllSheets } = await import("./artifacts/api-server/src/services/sync-sheets.ts");
    await syncAllSheets();
    console.log("Done");
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
run();
