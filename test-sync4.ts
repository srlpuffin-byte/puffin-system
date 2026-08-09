import { resolve } from "path";
import { readFileSync } from "fs";

const envPath = resolve("./artifacts/api-server/.env");
const content = readFileSync(envPath, "utf16le");
for (const line of content.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
}

async function run() {
  const { syncAllSheets } = await import("./artifacts/api-server/src/services/sync-sheets.ts");
  await syncAllSheets();
  console.log("Done");
}
run();
