# How to Host Envelope Scanner Web

Your app has two parts:
- **React frontend** (camera, table, export)
- **Node.js API** (Gemini vision, Excel export)

You only need **Node 18+** and a **Gemini API key**. No Python.

---

## Option 1: Render (recommended, free tier)

[Render](https://render.com) can host everything. Two ways:

### A) One service (frontend + API together)

One URL, simplest.

1. Push your code to **GitHub**.
2. On [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**.
3. Connect your repo.
4. Use these settings:

   | Setting | Value |
   |--------|--------|
   | **Root Directory** | *(leave blank)* |
   | **Build Command** | `npm install && npm run build && cd server && npm install` |
   | **Start Command** | `cd server && NODE_ENV=production node index.js` |
   | **Environment** | Node |

5. **Environment Variables** (in Render dashboard):

   | Key | Value |
   |-----|--------|
   | `GEMINI_API_KEY` | your key from [aistudio.google.com](https://aistudio.google.com/app/apikey) |
   | `NODE_ENV` | `production` |

6. Deploy. Your app will be at `https://<your-service>.onrender.com`.

**Notes:**
- Do not set `VITE_API_URL` so the frontend uses the same origin for `/api`.
- If your app will be at the site root (e.g. `https://yourapp.onrender.com/`), set `base: '/'` in `vite.config.js` (instead of a path like `/Phanero-envelope-reader-/`).

---

### B) Two services (frontend + API separate)

Use if you want a static frontend (e.g. CDN) and API on its own URL.

**Service 1 – API**

1. **New** → **Web Service**, connect repo.
2. Settings:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
3. Env: `GEMINI_API_KEY` = your key.
4. Deploy and copy the API URL, e.g. `https://your-api.onrender.com`.

**Service 2 – Frontend**

1. **New** → **Static Site**, connect same repo.
2. Settings:
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
3. Env: `VITE_API_URL` = your API URL (e.g. `https://your-api.onrender.com`).
4. Deploy. Frontend URL e.g. `https://your-site.onrender.com`.

---

## Option 2: Vercel (frontend) + Render (API)

- **API:** Deploy the **server** on Render as in Option 1B (Web Service, root `server`, `GEMINI_API_KEY`).
- **Frontend:** Deploy the **root** on [Vercel](https://vercel.com):
  - Import repo, leave build as `npm run build`, output `dist`.
  - Env: `VITE_API_URL` = your Render API URL (e.g. `https://your-api.onrender.com`).

---

## Option 3: Railway

1. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub** → choose repo.
2. One service:
   - **Root:** leave blank.
   - **Build:** `npm install && npm run build && cd server && npm install`
   - **Start:** `cd server && NODE_ENV=production node index.js`
3. Variables: `GEMINI_API_KEY`, `NODE_ENV=production`.
4. Deploy; Railway gives you a URL.

---

## Option 4: VPS (Ubuntu, DigitalOcean, etc.)

1. On the server: install Node 18+.
2. Clone repo, then:

   ```bash
   npm install && npm run build
   cd server && npm install
   ```

3. Set env (e.g. in `server/.env`): `GEMINI_API_KEY=...`, `NODE_ENV=production`, `PORT=3001`.
4. Run with PM2:

   ```bash
   npm install -g pm2
   cd server
   pm2 start index.js --name envelope-api
   pm2 save && pm2 startup
   ```

5. Put Nginx (or Caddy) in front: proxy `/api` and `/health` to `http://127.0.0.1:3001`, serve `dist` for `/` (or proxy everything to Node when using single-service).

---

## Environment variables summary

| Variable | Where | Required |
|----------|--------|----------|
| `GEMINI_API_KEY` | Server (Render/Railway/VPS) | Yes |
| `NODE_ENV` | Server (set to `production` for single-service deploy) | For single-service |
| `VITE_API_URL` | Build-time for frontend (only when API is on a different URL) | Only for split deploy |
| `PORT` | Server (Render/Railway set automatically) | Optional |

---

## After hosting

- Use **HTTPS** so the camera works in browsers (they require secure context).
- If the frontend is on a different domain than the API, CORS is already enabled on the server; set `VITE_API_URL` to the full API URL.
- Free tiers (Render, Railway) may spin down after inactivity; the first request after a while can be slow.
