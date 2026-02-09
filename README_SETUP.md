# Envelope Scanner Web – Setup

## Overview

This system uses:
- **Node.js Express** server: receives images and calls **Google Gemini** (vision) to extract form data
- **React** frontend for camera/upload and table/export

**No Python or OCR service is required.** Gemini reads the image directly.

## Prerequisites

- Node.js 18+ with npm
- A free Gemini API key from [aistudio.google.com](https://aistudio.google.com/app/apikey)

## Setup Steps

### 1. Node.js Server

```bash
cd server
npm install
```

Create `server/.env` with your Gemini key:
```
GEMINI_API_KEY=your-gemini-api-key
PORT=3001
```

```bash
npm start
# Or: npm run dev
```
Server runs on: http://localhost:3001

### 2. React Frontend

```bash
# In project root
npm install
npm run dev
```
Frontend runs on: http://localhost:5173 (or Vite's default port)

Create `.env` in project root (optional, if API is not on localhost:3001):
```
VITE_API_URL=http://localhost:3001
```

## Running the System

**Terminal 1 – Node server**
```bash
cd server
npm start
```

**Terminal 2 – React**
```bash
npm run dev
```

Open http://localhost:5173, enable camera or upload a form image. Gemini extracts name, email, telephone, date, payment method, and amount.

## Environment Variables

- **Project root** (optional): `VITE_API_URL=http://localhost:3001`
- **server/.env** (required for form extraction): `GEMINI_API_KEY=...`, `PORT=3001`

## Testing

1. Open http://localhost:5173 in browser
2. Click "Enable camera" or "Upload a photo"
3. Capture/upload a contribution form image
4. Wait for Gemini to extract form data
5. View extracted data in table
6. Click "Export to Excel" to download

## Troubleshooting

### "Gemini not configured"
- Add `GEMINI_API_KEY` to `server/.env` (get a free key at [aistudio.google.com](https://aistudio.google.com/app/apikey))

### "Could not read form from image"
- Use a clearer, well-lit photo of the form
- Check [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) if you hit quota

### No data in table
- Ensure the image contains a contribution/donation form with readable text
- Try a different image or orientation

## Production Deployment

- **Node server**: Use PM2 or similar; set up reverse proxy and CORS for your domain
- **React**: `npm run build`, serve `dist/`, set `VITE_API_URL` to your API URL

## File Structure

```
.
├── server/               # Node.js + Gemini vision
│   ├── index.js
│   └── package.json
├── src/                  # React frontend
│   └── App.jsx
└── README_SETUP.md
```
