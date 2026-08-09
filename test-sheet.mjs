import { google } from "googleapis";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve("./artifacts/api-server/.env") });

async function run() {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheetsClient = google.sheets({ version: "v4", auth });

  const res = await sheetsClient.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetNames = res.data.sheets?.map(s => s.properties?.title) || [];
  console.log("Sheet names:");
  sheetNames.forEach(n => console.log(`'${n}'`));
}
run().catch(console.error);
