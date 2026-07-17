import { google } from "googleapis";
import { db } from "@workspace/db";
import { egresosTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
import * as dotenv from 'dotenv';
dotenv.config();

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

async function syncEgresos() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    console.error("No GOOGLE_APPLICATION_CREDENTIALS_JSON defined");
    return;
  }

  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheetsClient = google.sheets({ version: "v4", auth });

  console.log("Fetching Egresos from database...");
  const egresos = await db.select().from(egresosTable).orderBy(desc(egresosTable.fecha));

  const headers = [
    "ID", "Fecha", "Categoría", "Concepto", "Proveedor", "Monto", 
    "Método de Pago", "Comprobante", "Proyecto", "Observaciones"
  ];

  const rows = egresos.map(e => [
    e.id, e.fecha, e.categoria, e.concepto, e.proveedor || "", 
    Number(e.monto), e.metodo_pago || "", e.comprobante ? "SI" : "NO",
    e.centro_costos || "", e.observaciones || ""
  ]);

  const allData = [headers, ...rows];

  console.log("Clearing Egresos sheet...");
  await sheetsClient.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: "Egresos!A:Z",
  });

  console.log("Writing Egresos sheet...");
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "Egresos!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: allData,
    },
  });

  console.log("Success! Egresos sheet has been rebuilt.");
}

syncEgresos().catch(console.error).then(() => process.exit(0));
