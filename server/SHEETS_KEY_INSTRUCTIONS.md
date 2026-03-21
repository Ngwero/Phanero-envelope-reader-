# Where to paste your Google service account JSON (local dev)

1. Open **`sheets-credentials.json`** in this same folder (`server/`).
2. **Select all** and **delete** the `{}`.
3. **Paste** the entire contents of the `.json` file you downloaded from Google Cloud (starts with `{` and `"type": "service_account"`).
4. **Save** the file.
5. **`server/.env`** should include:
   - `GOOGLE_APPLICATION_CREDENTIALS=./sheets-credentials.json`
   - `GOOGLE_SHEETS_SPREADSHEET_ID=...`
6. Restart the server: `npm start`

This file is **gitignored** — it is never pushed to GitHub.

**Render:** after saving `sheets-credentials.json` locally, run:

```bash
cd server && node scripts/print-google-json-for-render.mjs
```

Copy the **single line** it prints into Render → **`GOOGLE_SERVICE_ACCOUNT_JSON`**.  
(Do not paste private keys in chat — use this script only on your machine.)
