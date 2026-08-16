/**
 * Node.js Express server
 * React frontend + Google Gemini: image → vision API → structured form data.
 * Login required: users in Google Sheets (Users tab) when configured, else DATA_DIR/users.json.
 */

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { GoogleGenAI } from '@google/genai';
import { appendEntriesToSheet, isSheetsConfigured } from './sheets.js';
import {
  readUsers,
  saveUser,
  migrateUsersOnStartup,
  normalizeNumber,
  getDataDir,
  getUsersFilePath,
  isUsersSheetsEnabled,
} from './usersStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET || process.env.GEMINI_API_KEY || 'change-me-in-production';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const BUILTIN_SUPER_ADMIN_NUMBERS = ['0705161161', '0703492020'];
let SUPER_ADMIN_NUMBERS = (process.env.SUPER_ADMIN_NUMBERS || BUILTIN_SUPER_ADMIN_NUMBERS.join(','))
  .split(',')
  .map((n) => n.trim().replace(/\s/g, ''))
  .filter(Boolean);
if (SUPER_ADMIN_NUMBERS.length === 0) {
  SUPER_ADMIN_NUMBERS = [...BUILTIN_SUPER_ADMIN_NUMBERS];
}
for (const n of BUILTIN_SUPER_ADMIN_NUMBERS) {
  if (!SUPER_ADMIN_NUMBERS.includes(n)) {
    SUPER_ADMIN_NUMBERS.unshift(n);
  }
}
const isProduction = process.env.NODE_ENV === 'production';

const gemini = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// In-memory log buffer so logs can be viewed via /api/logs (e.g. locally)
const LOG_BUFFER_MAX = 200;
const logBuffer = [];
function log(line) {
  const entry = `[${new Date().toISOString()}] ${line}`;
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
  // Write to terminal immediately so logs show when running in background
  process.stdout.write(entry + '\n');
}

const DATA_DIR = getDataDir();
const USERS_FILE = getUsersFilePath();
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStats() {
  ensureDataDir();
  if (!fs.existsSync(STATS_FILE)) return { total: 0, byNumber: {} };
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch {
    return { total: 0, byNumber: {} };
  }
}

function incrementStats(userNumber) {
  const stats = readStats();
  stats.total = (stats.total || 0) + 1;
  stats.byNumber = stats.byNumber || {};
  stats.byNumber[userNumber] = (stats.byNumber[userNumber] || 0) + 1;
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
}

function signUserToken(number) {
  return jwt.sign({ number }, JWT_SECRET, { expiresIn: '365d' });
}

/** Auth middleware: require valid JWT in Authorization: Bearer <token> */
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Login required' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { number: payload.number };
    next();
  } catch {
    return res.status(401).json({ error: 'Login required' });
  }
}

/** Super admin middleware: require auth + number in SUPER_ADMIN_NUMBERS */
function requireSuperAdmin(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!SUPER_ADMIN_NUMBERS.includes(payload.number)) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    req.user = { number: payload.number };
    next();
  } catch {
    return res.status(401).json({ error: 'Login required' });
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/** Normalize parsed object to our structured shape */
function toStructured(parsed) {
  return {
    name: String(parsed.name ?? '').trim(),
    email: String(parsed.email ?? '').trim(),
    telephone: String(parsed.telephone ?? '').trim(),
    date: String(parsed.date ?? '').trim(),
    paymentMethod: String(parsed.paymentMethod ?? '').trim(),
    amount: String(parsed.amount ?? '').trim(),
    contributionType: String(parsed.contributionType ?? '').trim(),
  };
}

const VISION_PROMPT = `Look at this image of a contribution/donation form. Extract the following fields and return ONLY a JSON object with exactly these keys (use empty string "" if not found): name, email, telephone, date, paymentMethod, amount, contributionType. No markdown, no explanation. Dates: YYYY-MM-DD or original format. Amount: digits or with currency. Telephone: digits only, include country code if present (e.g. +256). For contributionType: look at which option is TICKED/CHECKED on the form and use that exact label. Common options: Tithe, 1st fruits, Offertory, Prisons ministry, Manifest, Other. If multiple are ticked, use the first one; if none, use "".`;

/**
 * Send image to Gemini vision and get structured fields (name, email, telephone, date, paymentMethod, amount).
 */
async function extractWithGeminiVision(imageBuffer, mimeType = 'image/jpeg') {
  if (!gemini || !imageBuffer?.length) return null;
  const base64 = imageBuffer.toString('base64');
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
  for (const modelId of modelsToTry) {
    try {
      const response = await gemini.models.generateContent({
        model: modelId,
        contents: [
          {
            role: 'user',
            parts: [
              { text: VISION_PROMPT },
              { inlineData: { mimeType, data: base64 } },
            ],
          },
        ],
      });
      const text = response?.text ?? null;
      if (!text) continue;
      let jsonStr = text.trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      return toStructured(parsed);
    } catch (err) {
      const isQuota = err.message && (err.message.includes('429') || err.message.includes('quota'));
      if (isQuota) {
        console.warn('Gemini quota exceeded.');
      } else {
        console.warn(`Gemini (${modelId}):`, err.message?.slice(0, 100));
      }
    }
  }
  return null;
}

function logStructured(structured) {
  const lines = [
    '--- Gemini extracted ---',
    `  name: ${structured.name || '(empty)'}`,
    `  email: ${structured.email || '(empty)'}`,
    `  telephone: ${structured.telephone || '(empty)'}`,
    `  date: ${structured.date || '(empty)'}`,
    `  paymentMethod: ${structured.paymentMethod || '(empty)'}`,
    `  amount: ${structured.amount || '(empty)'}`,
    `  contributionType: ${structured.contributionType || '(empty)'}`,
    '-----------------------',
  ];
  lines.forEach((l) => log(l));
}

// Serve React build in production (when deploying as single app)
if (isProduction) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiUsed: !!GEMINI_API_KEY,
    sheetsAppend: isSheetsConfigured(),
    usersStorage: isUsersSheetsEnabled() ? 'google-sheets' : 'file',
  });
});

/**
 * Super admin first-login check: body { number } → { isSuperAdmin, needsPasswordSetup }
 */
app.post('/api/super-admin/check', async (req, res) => {
  try {
    const normalized = normalizeNumber(req.body?.number);
    if (!normalized) {
      return res.status(400).json({ error: 'Number required' });
    }
    const isSuperAdmin = SUPER_ADMIN_NUMBERS.includes(normalized);
    if (!isSuperAdmin) {
      return res.json({ isSuperAdmin: false, needsPasswordSetup: false });
    }
    const users = await readUsers();
    const exists = users.some((u) => u.number === normalized);
    res.json({ isSuperAdmin: true, needsPasswordSetup: !exists });
  } catch (err) {
    console.error('Super admin check error:', err.message);
    res.status(500).json({ error: 'Failed to check account' });
  }
});

/**
 * Super admin first-time password setup. Body: { number, password }
 */
app.post('/api/super-admin/setup-password', async (req, res) => {
  try {
    const normalized = normalizeNumber(req.body?.number);
    const password = req.body?.password;
    if (!normalized) {
      return res.status(400).json({ error: 'Number required' });
    }
    if (!SUPER_ADMIN_NUMBERS.includes(normalized)) {
      return res.status(403).json({ error: 'Not a super admin number' });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const users = await readUsers();
    if (users.some((u) => u.number === normalized)) {
      return res.status(400).json({ error: 'Account already exists. Log in with your password.' });
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    await saveUser({
      number: normalized,
      passwordHash,
      password: String(password),
    });
    const token = signUserToken(normalized);
    res.json({ token, isSuperAdmin: true });
  } catch (err) {
    console.error('Super admin setup password error:', err.message);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

/**
 * Login: body { number, password } → { token } or 401
 */
app.post('/api/login', async (req, res) => {
  try {
    const { number, password } = req.body || {};
    const normalized = normalizeNumber(number);
    if (!normalized || !password) {
      return res.status(400).json({ error: 'Number and password required' });
    }
    const users = await readUsers();
    const user = users.find((u) => u.number === normalized);
    if (!user) {
      if (SUPER_ADMIN_NUMBERS.includes(normalized)) {
        return res.status(403).json({
          error: 'Set your password on first login.',
          needsPasswordSetup: true,
        });
      }
      return res.status(401).json({ error: 'Number is not registered with us' });
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    const isSuperAdmin = SUPER_ADMIN_NUMBERS.includes(user.number);
    const token = signUserToken(user.number);
    res.json({ token, isSuperAdmin: !!isSuperAdmin });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({
      error: isProduction ? 'Login failed' : `Login failed: ${err.message}`,
    });
  }
});

/**
 * Add user (admin only). Body: { adminSecret, number, password }
 * Set ADMIN_SECRET in env; use this to add numbers and set their passwords.
 */
app.post('/api/admin/users', async (req, res) => {
  try {
    const { adminSecret, number, password } = req.body || {};
    if (!ADMIN_SECRET || adminSecret !== ADMIN_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const normalized = String(number ?? '').trim().replace(/\s/g, '');
    if (!normalized || !password || password.length < 4) {
      return res.status(400).json({ error: 'Number and password (min 4 chars) required' });
    }
    const users = await readUsers();
    if (users.some((u) => u.number === normalized)) {
      return res.status(400).json({ error: 'Number already registered' });
    }
    const displayName = String(req.body.name ?? '')
      .trim()
      .slice(0, 120);
    const passwordHash = await bcrypt.hash(password, 10);
    await saveUser({
      number: normalized,
      passwordHash,
      password: String(password),
      name: displayName || undefined,
    });
    res.json({ ok: true, number: normalized });
  } catch (err) {
    console.error('Admin add user error:', err.message);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

/**
 * Get recent server logs (for local/dev). Requires auth.
 */
app.get('/api/logs', requireAuth, (req, res) => {
  res.json({ logs: [...logBuffer] });
});

/**
 * List users (number + name, no secrets). Super admin only.
 */
app.get('/api/admin/users', requireSuperAdmin, async (req, res) => {
  try {
    const users = await readUsers();
    res.json({
      users: users.map((u) => ({
        number: u.number,
        name: u.name || '',
        password: u.password || '',
      })),
    });
  } catch (err) {
    console.error('List users error:', err.message);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

/**
 * Dashboard stats: total pictures processed, by user number. Super admin only.
 */
app.get('/api/admin/dashboard', requireSuperAdmin, (req, res) => {
  const stats = readStats();
  res.json({
    total: stats.total || 0,
    byNumber: stats.byNumber || {},
  });
});

/**
 * Add user from super admin dashboard. Body: { number, name }.
 * System generates a 5-digit password. Returns { number, password, name }.
 */
app.post('/api/admin/users/add', requireSuperAdmin, async (req, res) => {
  try {
    const { number, name } = req.body || {};
    const normalized = String(number ?? '').trim().replace(/\s/g, '');
    const displayName = String(name ?? '')
      .trim()
      .slice(0, 120);
    if (!displayName) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!normalized || normalized.length < 9) {
      return res.status(400).json({ error: 'Valid phone number required' });
    }
    const users = await readUsers();
    if (users.some((u) => u.number === normalized)) {
      return res.status(400).json({ error: 'Number already registered' });
    }
    const password = String(Math.floor(10000 + Math.random() * 90000));
    const passwordHash = await bcrypt.hash(password, 10);
    await saveUser({ number: normalized, passwordHash, password, name: displayName });
    res.json({ ok: true, number: normalized, password, name: displayName });
  } catch (err) {
    console.error('Super admin add user error:', err.message);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

/**
 * Reset user password from super admin dashboard. Body: { number }.
 * Generates new 5-digit password. Returns { number, password }.
 */
app.post('/api/admin/users/reset', requireSuperAdmin, async (req, res) => {
  try {
    const { number } = req.body || {};
    const normalized = String(number ?? '').trim().replace(/\s/g, '');
    if (!normalized || normalized.length < 9) {
      return res.status(400).json({ error: 'Valid phone number required' });
    }
    const users = await readUsers();
    const user = users.find((u) => u.number === normalized);
    if (!user) {
      return res.status(404).json({ error: 'Number not registered' });
    }
    const password = String(Math.floor(10000 + Math.random() * 90000));
    const passwordHash = await bcrypt.hash(password, 10);
    await saveUser({
      number: normalized,
      passwordHash,
      password,
      name: user.name,
    });
    res.json({ ok: true, number: normalized, password });
  } catch (err) {
    console.error('Super admin reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

/**
 * Process image with Gemini vision: extract form fields (no Python OCR).
 * Requires auth.
 */
app.post('/api/ocr', requireAuth, upload.single('image'), async (req, res) => {
  const reqId = Date.now();
  log(`[OCR] Request ${reqId} received`);
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    if (!gemini) {
      return res.status(503).json({
        error: 'Gemini not configured. Set GEMINI_API_KEY in server .env (get free key at aistudio.google.com).',
      });
    }

    const mimeType = req.file.mimetype || 'image/jpeg';
    log(`[OCR] Request ${reqId} calling Gemini...`);
    const structured = await extractWithGeminiVision(req.file.buffer, mimeType);

    if (!structured) {
      log(`[OCR] Request ${reqId} no result from Gemini`);
      return res.status(422).json({
        error: 'Could not read form from image. Try a clearer photo or check Gemini quota.',
      });
    }

    const summary = [structured.name, structured.email, structured.telephone, structured.amount].filter(Boolean).join(' · ');
    logStructured(structured);
    log(`[OCR] Request ${reqId} done, responding`);

    try {
      incrementStats(req.user.number);
    } catch (e) {
      console.warn('Stats write failed:', e.message);
    }

    res.json({
      text: summary,
      rawText: summary,
      structured,
    });
  } catch (error) {
    log(`[OCR] Error: ${error.message}`);
    console.error('OCR Error:', error.message);
    res.status(500).json({ error: error.message || 'Processing failed' });
  }
});

/**
 * Push current table rows to Google Sheets. Requires auth.
 */
app.post('/api/sheets/push', requireAuth, async (req, res) => {
  try {
    const { entries } = req.body || {};
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'No entries provided' });
    }
    const result = await appendEntriesToSheet(entries, req.user.number);
    if (result.skipped) {
      return res.status(503).json({ error: `Google Sheets not configured: ${result.reason}` });
    }
    if (result.error) {
      log(`[Sheets] Push failed: ${result.error}`);
      return res.status(502).json({ error: result.error });
    }
    log(`[Sheets] Pushed ${result.appended} row(s) for user ${req.user.number}`);
    res.json({ ok: true, appended: result.appended });
  } catch (err) {
    console.error('Sheets push error:', err.message);
    res.status(500).json({ error: 'Failed to push to Google Sheets' });
  }
});

/**
 * Export to Excel endpoint. Requires auth.
 */
app.post('/api/export', requireAuth, (req, res) => {
  try {
    const { entries } = req.body;
    
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'No entries provided' });
    }

    // Format data for Excel (without department and title columns)
    const worksheetData = entries.map((entry, index) => {
      const structured = entry.structured || {};
      return {
        '#': index + 1,
        Name: structured.name || '',
        Email: structured.email || '',
        Telephone: structured.telephone || '',
        Date: structured.date || '',
        'Contribution Type': structured.contributionType || '',
        'Payment Method': structured.paymentMethod || '',
        Amount: structured.amount || '',
      };
    });

    // Create workbook
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Extracted Data');

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=phaneroo-extracted-data.xlsx');
    res.send(excelBuffer);
  } catch (error) {
    console.error('Export Error:', error);
    res.status(500).json({ error: 'Failed to export Excel file' });
  }
});

// SPA fallback: serve index.html for non-API routes (production only)
if (isProduction) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(distPath, 'index.html'), (err) => { if (err) next(err); });
  });
}

// Optional: ensure seed user from env exists (merges; never wipes other accounts).
async function seedUserIfNeeded() {
  const pwd = process.env.SEED_USER_PASSWORD;
  if (!pwd) return;
  const num = normalizeNumber(process.env.SEED_USER_NUMBER || '0705161161');
  const users = await readUsers();
  if (users.some((u) => u.number === num)) return;
  const passwordHash = await bcrypt.hash(pwd, 10);
  const seedName = String(process.env.SEED_USER_NAME ?? '').trim().slice(0, 120);
  await saveUser(
    seedName
      ? { number: num, passwordHash, password: pwd, name: seedName }
      : { number: num, passwordHash, password: pwd }
  );
  console.log('Seeded user (saved permanently):', num, seedName ? `(${seedName})` : '');
}

(async () => {
  const migration = await migrateUsersOnStartup();
  await seedUserIfNeeded();
  const userCount = (await readUsers()).length;
  app.listen(PORT, () => {
    console.log(`Node.js server running on http://localhost:${PORT}`);
    console.log(`Data directory (stats + file backup): ${DATA_DIR}`);
    console.log(
      `User accounts: ${userCount} loaded (${migration.source === 'sheets' ? 'Google Sheets' : USERS_FILE})`
    );
    if (isUsersSheetsEnabled()) {
      console.log('User accounts persist in Google Sheets (Users tab) — survives redeploys.');
    } else if (isProduction && !process.env.DATA_DIR) {
      console.warn(
        'WARNING: No Google Sheets user storage and DATA_DIR is not set. User logins will be lost on every deploy.'
      );
    }
    if (GEMINI_API_KEY) {
      console.log('Gemini vision enabled: image → form data (no Python OCR needed).');
    } else {
      console.log('Set GEMINI_API_KEY in .env. Get a free key at aistudio.google.com');
    }
    if (!JWT_SECRET || JWT_SECRET === 'change-me-in-production') {
      console.warn('Set JWT_SECRET in production.');
    }
    if (ADMIN_SECRET) {
      console.log('Admin endpoint /api/admin/users enabled (add users with ADMIN_SECRET).');
    }
  });
})();
