/**
 * Node.js Express server
 * React frontend + Google Gemini: image → vision API → structured form data.
 * No Python OCR needed; Gemini reads the image directly (free tier at aistudio.google.com).
 */

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const isProduction = process.env.NODE_ENV === 'production';

const gemini = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

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
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] --- Gemini extracted ---`);
  console.log('  name:', structured.name || '(empty)');
  console.log('  email:', structured.email || '(empty)');
  console.log('  telephone:', structured.telephone || '(empty)');
  console.log('  date:', structured.date || '(empty)');
  console.log('  paymentMethod:', structured.paymentMethod || '(empty)');
  console.log('  amount:', structured.amount || '(empty)');
  console.log('  contributionType:', structured.contributionType || '(empty)');
  console.log('-----------------------\n');
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
  });
});

/**
 * Process image with Gemini vision: extract form fields (no Python OCR).
 */
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  const reqId = Date.now();
  console.log(`[${new Date().toISOString()}] [OCR] Request ${reqId} received`);
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
    console.log(`[${new Date().toISOString()}] [OCR] Request ${reqId} calling Gemini...`);
    const structured = await extractWithGeminiVision(req.file.buffer, mimeType);

    if (!structured) {
      console.log(`[${new Date().toISOString()}] [OCR] Request ${reqId} no result from Gemini`);
      return res.status(422).json({
        error: 'Could not read form from image. Try a clearer photo or check Gemini quota.',
      });
    }

    const summary = [structured.name, structured.email, structured.telephone, structured.amount].filter(Boolean).join(' · ');
    logStructured(structured);
    console.log(`[${new Date().toISOString()}] [OCR] Request ${reqId} done, responding`);

    res.json({
      text: summary,
      rawText: summary,
      structured,
    });
  } catch (error) {
    console.error('OCR Error:', error.message);
    res.status(500).json({ error: error.message || 'Processing failed' });
  }
});

/**
 * Export to Excel endpoint
 */
app.post('/api/export', (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Node.js server running on http://localhost:${PORT}`);
  if (GEMINI_API_KEY) {
    console.log('Gemini vision enabled: image → form data (no Python OCR needed).');
  } else {
    console.log('Set GEMINI_API_KEY in .env. Get a free key at aistudio.google.com');
  }
});
