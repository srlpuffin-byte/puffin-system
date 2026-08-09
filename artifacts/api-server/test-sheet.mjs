import { google } from "googleapis";

async function run() {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || !SHEET_ID) {
    console.log("Faltan variables de entorno");
    return;
  }
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheetsClient = google.sheets({ version: "v4", auth });

  const res = await sheetsClient.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetNames = res.data.sheets?.map(s => s.properties?.title) || [];
  console.log("Sheet names:", sheetNames);
  console.log("Combustible includes space?", sheetNames.find(s => s?.includes("Combustible")));
}
run().catch(console.error);
