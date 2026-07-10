import { google } from "googleapis";
import { logger } from "../lib/logger.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

let sheetsClient: any = null;

function getAuthClient() {
  if (sheetsClient) return sheetsClient;

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    logger.warn("No GOOGLE_APPLICATION_CREDENTIALS_JSON defined. Google Sheets sync is disabled.");
    return null;
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    sheetsClient = google.sheets({ version: "v4", auth });
    return sheetsClient;
  } catch (error) {
    logger.error({ err: error }, "Failed to initialize Google Sheets client");
    return null;
  }
}

/**
 * Appends a row to a specific tab in the Google Sheet.
 * @param tabName Name of the tab (e.g. "Combustible", "Jornadas")
 * @param values Array of values representing the columns of the new row
 */
export async function appendToSheet(tabName: string, values: any[]) {
  const sheets = getAuthClient();
  if (!sheets || !SHEET_ID) return;

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [values],
      },
    });
    logger.info(`Successfully appended row to Google Sheet: ${tabName}`);
  } catch (error: any) {
    logger.error({ err: error.message, tabName, values }, "Failed to append row to Google Sheet");
  }
}
