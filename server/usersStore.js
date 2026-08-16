/**
 * User account persistence: Google Sheets (primary when configured) + local JSON backup.
 * Sheets survives Render redeploys without a persistent disk.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { getSheetsAuth, isSheetsConfigured } from './sheets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const USERS_BACKUP_FILE = `${USERS_FILE}.bak`;
const USERS_TAB = process.env.GOOGLE_SHEETS_USERS_TAB_NAME?.trim() || 'Users';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function getUsersFilePath() {
  return USERS_FILE;
}

export function getDataDir() {
  return DATA_DIR;
}

export function normalizeNumber(number) {
  return String(number ?? '').trim().replace(/\s/g, '');
}

function parseUsersFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('users file must be a JSON array');
  }
  return data;
}

function readUsersFromFile() {
  ensureDataDir();
  try {
    return parseUsersFile(USERS_FILE);
  } catch (err) {
    console.error(`Failed to read ${USERS_FILE}:`, err.message);
    try {
      const fromBackup = parseUsersFile(USERS_BACKUP_FILE);
      console.warn('Restored users from backup file');
      writeUsersToFile(fromBackup);
      return fromBackup;
    } catch (backupErr) {
      console.error(`Failed to read ${USERS_BACKUP_FILE}:`, backupErr.message);
      return [];
    }
  }
}

function writeUsersToFile(users) {
  ensureDataDir();
  if (!Array.isArray(users)) {
    throw new Error('writeUsersToFile expects an array');
  }
  if (fs.existsSync(USERS_FILE)) {
    fs.copyFileSync(USERS_FILE, USERS_BACKUP_FILE);
  }
  const tmp = `${USERS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmp, USERS_FILE);
  const fd = fs.openSync(USERS_FILE, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function getSpreadsheetId() {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || '';
}

async function ensureUsersTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === USERS_TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: USERS_TAB } } }],
      },
    });
  }
}

async function readUsersFromSheet() {
  const spreadsheetId = getSpreadsheetId();
  const auth = getSheetsAuth();
  if (!spreadsheetId || !auth) return null;

  const sheets = google.sheets({ version: 'v4', auth });
  await ensureUsersTab(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${USERS_TAB}!A2:D5000`,
  });
  const rows = res.data.values || [];
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      number: normalizeNumber(row[0]),
      name: String(row[1] ?? '').trim(),
      password: String(row[2] ?? ''),
      passwordHash: String(row[3] ?? ''),
    }))
    .filter((u) => u.number && u.passwordHash);
}

async function writeUsersToSheet(users) {
  const spreadsheetId = getSpreadsheetId();
  const auth = getSheetsAuth();
  if (!spreadsheetId || !auth) {
    throw new Error('Google Sheets not configured for user storage');
  }

  const sheets = google.sheets({ version: 'v4', auth });
  await ensureUsersTab(sheets, spreadsheetId);

  const header = ['number', 'name', 'password', 'passwordHash'];
  const rows = users.map((u) => [
    u.number,
    u.name || '',
    u.password || '',
    u.passwordHash || '',
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${USERS_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [header, ...rows] },
  });
}

export function isUsersSheetsEnabled() {
  return isSheetsConfigured();
}

function mergeUserRecords(base, incoming) {
  return {
    number: incoming.number || base.number,
    name: (incoming.name && String(incoming.name).trim()) || base.name || '',
    password: incoming.password || base.password || '',
    passwordHash: incoming.passwordHash || base.passwordHash || '',
  };
}

function mergeUserLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const u of list || []) {
      const num = normalizeNumber(u.number);
      if (!num) continue;
      const row = { ...u, number: num };
      const prev = map.get(num);
      map.set(num, prev ? mergeUserRecords(prev, row) : row);
    }
  }
  return [...map.values()].filter((u) => u.passwordHash);
}

async function loadMergedUsers() {
  const fileUsers = readUsersFromFile();
  if (!isSheetsConfigured()) return fileUsers;
  try {
    const sheetUsers = (await readUsersFromSheet()) ?? [];
    return mergeUserLists(fileUsers, sheetUsers);
  } catch (err) {
    console.error('Failed to read users from Google Sheets:', err.message);
    return fileUsers;
  }
}

async function persistUsers(users) {
  writeUsersToFile(users);
  if (isSheetsConfigured()) {
    await writeUsersToSheet(users);
  }
}

/** Load all accounts (Sheets + local file, merged so nobody is dropped). */
export async function readUsers() {
  return loadMergedUsers();
}

/** Add or update one account; persists to Sheets + local file when Sheets is configured. */
export async function saveUser(record) {
  const normalized = normalizeNumber(record.number);
  if (!normalized) {
    throw new Error('User number required');
  }

  const users = await loadMergedUsers();
  const idx = users.findIndex((u) => u.number === normalized);
  const row = { ...record, number: normalized };
  if (idx >= 0) {
    users[idx] = mergeUserRecords(users[idx], row);
  } else {
    users.push(row);
  }

  await persistUsers(users);
  if (isSheetsConfigured()) {
    console.log(`User saved permanently to Google Sheets (${USERS_TAB}): ${normalized}`);
  }

  return users[idx >= 0 ? idx : users.length - 1];
}

/** On startup: merge file + Sheets, then write both so logins survive redeploys. */
export async function migrateUsersOnStartup() {
  const fileUsers = readUsersFromFile();
  if (!isSheetsConfigured()) return { source: 'file', count: fileUsers.length };

  let sheetUsers = [];
  try {
    sheetUsers = (await readUsersFromSheet()) ?? [];
  } catch (err) {
    console.error('Could not read users tab on startup:', err.message);
    return { source: 'file', count: fileUsers.length };
  }

  const merged = mergeUserLists(fileUsers, sheetUsers);
  await persistUsers(merged);
  console.log(
    `User accounts persisted: ${merged.length} (file ${fileUsers.length} + sheet ${sheetUsers.length} → Google Sheets "${USERS_TAB}")`
  );
  return { source: 'sheets', count: merged.length };
}
