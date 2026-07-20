import "dotenv/config";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { egresosTable } from "@workspace/db/schema";

async function main() {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    console.log("No credentials");
    return;
  }

  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheetsClient = google.sheets({ version: "v4", auth });

  console.log("Fetching Sheets data...");
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Egresos!A:Z",
  });
  const rows = response.data.values || [];
  const existingIds = new Set(rows.map(r => r[0] ? r[0].toString() : ""));

  console.log("Fetching DB data...");
  const egresos = await db.select().from(egresosTable);
  
  const missing = egresos.filter(e => !existingIds.has(e.id.toString()));
  
  if (missing.length === 0) {
    console.log("No missing egresos found!");
    return;
  }
  
  console.log(`Found ${missing.length} missing egresos. Appending to Sheets...`);
  
  const missingData = missing.map(e => [
    e.id, e.fecha, e.categoria, e.concepto, e.proveedor || "", 
    Number(e.monto), e.metodo_pago || "", e.comprobante ? "SI" : "NO", 
    e.centro_costos || "", e.observaciones || ""
  ]);

  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Egresos!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: missingData,
    },
  });
  
  console.log("Done!");
}

main().catch(console.error);
