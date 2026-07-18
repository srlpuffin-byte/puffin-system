import { google } from "googleapis";
import { logger } from "../lib/logger.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

let sheetsClient: any = null;

function getAuthClient() {
  return null; // Disabled to prevent Google Sheets sync issues
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

/**
 * Updates an existing row if an ID matches, otherwise appends a new row.
 * @param tabName Name of the tab (e.g. "Empleados")
 * @param values Array of values representing the columns of the row
 * @param idColIndex The 0-based index of the column containing the unique ID (e.g., 8 for column I)
 * @param idValue The unique ID value to search for
 */
export async function updateOrAppendToSheet(tabName: string, values: any[], idColIndex: number, idValue: any) {
  const sheets = getAuthClient();
  if (!sheets || !SHEET_ID) return;

  try {
    // 1. Fetch existing data to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A:Z`,
    });

    const rows = response.data.values || [];
    let rowIndexToUpdate = -1;

    // Search for the ID in the specified column
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][idColIndex] && String(rows[i][idColIndex]) === String(idValue)) {
        rowIndexToUpdate = i;
        break;
      }
    }

    if (rowIndexToUpdate >= 0) {
      // 2. Update existing row (Google Sheets rows are 1-indexed)
      const range = `${tabName}!A${rowIndexToUpdate + 1}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [values],
        },
      });
      logger.info(`Successfully updated row ${rowIndexToUpdate + 1} in Google Sheet: ${tabName}`);
    } else {
      // 3. Append new row if not found
      await appendToSheet(tabName, values);
    }
  } catch (error: any) {
    logger.error({ err: error.message, tabName, idValue }, "Failed to update or append row to Google Sheet");
  }
}
