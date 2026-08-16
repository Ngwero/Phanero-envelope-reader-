/**
 * Append extracted form rows to Google Sheets (optional).
 * Set GOOGLE_SHEETS_SPREADSHEET_ID + service account credentials in env.
 */

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

export function getSheetsAuth() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFile && fs.existsSync(path.resolve(keyFile))) {
    return new google.auth.GoogleAuth({
      keyFile: path.resolve(keyFile),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) return null;
  let credentials;
  try {
    credentials = JSON.parse(raw.trim());
  } catch {
    try {
      credentials = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
  if (!credentials.client_email || !credentials.private_key) return null;
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function entryToRow(entry, userNumber, pushedAt) {
  const s = entry?.structured || {};
  return [
    pushedAt,
    String(userNumber ?? ''),
    String(s.name ?? ''),
    String(s.email ?? ''),
    String(s.telephone ?? ''),
    String(s.date ?? ''),
    String(s.contributionType ?? ''),
    String(s.paymentMethod ?? ''),
    String(s.amount ?? ''),
  ];
}

/**
 * Append multiple table rows to the sheet (one API call). Used when user clicks "Push data".
 * @param {Array<{ structured?: object }>} entries
 * @param {string} [userNumber]
 * @returns {{ ok?: true, appended?: number, skipped?: true, reason?: string, error?: string }}
 */
export async function appendEntriesToSheet(entries, userNumber) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) {
    return { skipped: true, reason: 'GOOGLE_SHEETS_SPREADSHEET_ID not set' };
  }
  const auth = getSheetsAuth();
  if (!auth) {
    return { skipped: true, reason: 'No service account (GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS)' };
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return { error: 'No entries to append' };
  }
  const tab = process.env.GOOGLE_SHEETS_TAB_NAME?.trim() || 'Sheet1';
  const pushedAt = new Date().toISOString();
  const values = entries.map((e) => entryToRow(e, userNumber, pushedAt));
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
    return { ok: true, appended: values.length };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

export function isSheetsConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() && getSheetsAuth()
  );
}
