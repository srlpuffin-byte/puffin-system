import { resolve } from "path";
import { readFileSync } from "fs";

const envPath = resolve("./artifacts/api-server/.env");
const content = readFileSync(envPath, "utf8");
for (const line of content.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
}

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
