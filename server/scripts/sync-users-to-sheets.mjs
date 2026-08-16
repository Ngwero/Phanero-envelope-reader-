/**
 * One-time / manual sync: merge local users.json + live server accounts → Google Sheets.
 *
 * Usage (from server/):
 *   node scripts/sync-users-to-sheets.mjs
 *   PROD_URL=https://your-app.onrender.com node scripts/sync-users-to-sheets.mjs
 *
 * Requires server/.env with GOOGLE_SHEETS_* and optionally SEED_USER_PASSWORD for production fetch.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readUsers, saveUser } from '../usersStore.js';
import { isSheetsConfigured } from '../sheets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROD = process.env.PROD_URL?.trim() || 'https://phanero-envelope-reader.onrender.com';
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

async function tryLogin(number, password) {
  const res = await fetch(`${PROD}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, password }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? data.token : null;
}

async function fetchProdUsers(token) {
  const res = await fetch(`${PROD}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.users || [];
}

async function main() {
  if (!isSheetsConfigured()) {
    console.error('Google Sheets is not configured. Set GOOGLE_SHEETS_SPREADSHEET_ID and credentials in server/.env');
    process.exit(1);
  }

  const localUsers = fs.existsSync(USERS_FILE)
    ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
    : [];
  console.log(`Local file: ${localUsers.length} account(s)`);

  let prodUsers = [];
  const seedPwd = process.env.SEED_USER_PASSWORD;
  const seedNum = (process.env.SEED_USER_NUMBER || '0705161161').replace(/\s/g, '');
  const superNumbers = (process.env.SUPER_ADMIN_NUMBERS || '0705161161,0703492020')
    .split(',')
    .map((n) => n.trim().replace(/\s/g, ''))
    .filter(Boolean);

  if (seedPwd) {
    let token = await tryLogin(seedNum, seedPwd);
    if (!token) {
      for (const n of superNumbers) {
        token = await tryLogin(n, seedPwd);
        if (token) break;
      }
    }
    if (token) {
      prodUsers = await fetchProdUsers(token);
      console.log(`Production (${PROD}): ${prodUsers.length} account(s)`);
    } else {
      console.warn('Could not log in to production — syncing local file only.');
    }
  } else {
    console.warn('SEED_USER_PASSWORD not set — syncing local file only.');
  }

  const merged = new Map();
  for (const u of localUsers) merged.set(u.number, { ...u });
  for (const u of prodUsers) {
    const existing = merged.get(u.number) || {};
    merged.set(u.number, {
      ...existing,
      number: u.number,
      name: u.name || existing.name || '',
      password: u.password || existing.password || '',
      passwordHash: existing.passwordHash || '',
    });
  }

  let saved = 0;
  for (const u of merged.values()) {
    if (!u.passwordHash) {
      console.warn(`Skip ${u.number}: no password hash (cannot log in)`);
      continue;
    }
    await saveUser(u);
    saved += 1;
  }

  const final = await readUsers();
  console.log(`Done. ${saved} account(s) written to Google Sheets (Users tab).`);
  final.forEach((u) => {
    console.log(`  ${u.number}${u.name ? ` (${u.name})` : ''}${u.password ? ' — password stored' : ' — use Reset password in dashboard'}`);
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
