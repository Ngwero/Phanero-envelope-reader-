#!/usr/bin/env node
/**
 * After pasting your service account JSON into server/sheets-credentials.json,
 * run: node scripts/print-google-json-for-render.mjs
 * Copy the single line of output into Render → GOOGLE_SERVICE_ACCOUNT_JSON
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const credPath = path.join(__dirname, '..', 'sheets-credentials.json');

let raw;
try {
  raw = fs.readFileSync(credPath, 'utf8');
} catch {
  console.error('Missing file:', credPath);
  process.exit(1);
}

let obj;
try {
  obj = JSON.parse(raw);
} catch (e) {
  console.error('Invalid JSON in sheets-credentials.json:', e.message);
  process.exit(1);
}

if (!obj.private_key || !obj.client_email) {
  console.error('Not a valid service account JSON (need private_key + client_email). Paste the full downloaded key into server/sheets-credentials.json');
  process.exit(1);
}

// One line for Render env var
console.log(JSON.stringify(obj));
