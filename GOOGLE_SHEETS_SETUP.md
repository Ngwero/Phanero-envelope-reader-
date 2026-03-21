# Google Sheets push (optional)

When the user clicks **Push data** in the app, all rows currently in the table are **appended** to your Google Sheet (same order as on screen). Nothing is sent to Sheets until they click that button. You can edit cells first, then push.

## 1. Create the spreadsheet

1. Open [Google Sheets](https://sheets.google.com) and create a new spreadsheet.
2. On the first row, add these **headers** (same order):

   | A | B | C | D | E | F | G | H | I |
   |---|---|---|---|---|---|---|---|---|
   | Timestamp | Scanner Number | Name | Email | Telephone | Date | Contribution Type | Payment Method | Amount |

3. Copy the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART_IS_THE_ID`**`/edit`

4. Note the **tab name** at the bottom (default `Sheet1`). If you rename it, set `GOOGLE_SHEETS_TAB_NAME` to match.

## 2. Service account (Google Cloud)

1. In [Google Cloud Console](https://console.cloud.google.com), select your project (same as Gemini is fine).
2. **APIs & Services → Library** → enable **Google Sheets API**.
3. **IAM & Admin → Service Accounts** → **Create service account** (any name).
4. **Keys** → **Add key** → **JSON** → download the file. **Keep it secret.**

5. Open the JSON file and copy the **`client_email`** value (e.g. `something@project.iam.gserviceaccount.com`).
6. In your Google Sheet: **Share** → paste that email → role **Editor** → Send.

## 3. Environment variables

Set on your machine (`server/.env`) and on **Render** (or your host):

| Variable | Description |
|----------|-------------|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | The ID from the sheet URL (required for Sheets). |
| `GOOGLE_SHEETS_TAB_NAME` | Tab name; default `Sheet1` if omitted. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Entire** service account JSON as **one line** (or Base64-encoded JSON for easier paste in dashboards). |
| `GOOGLE_APPLICATION_CREDENTIALS` | *(Alternative, local only)* Absolute path to the downloaded `.json` file. |

**Render tip:** Minify the JSON (remove line breaks) and paste as one line into `GOOGLE_SERVICE_ACCOUNT_JSON`. If the dashboard breaks on quotes, Base64-encode the file and paste the Base64 string (the server accepts both).

## 4. Behaviour

- **Push data** calls `POST /api/sheets/push` with the current table rows. If Sheets is not configured, the user sees an error message.
- If append fails (permissions, wrong ID), the API returns an error and the status line shows it.

## 5. Excel export

**Export to Excel** is separate — download a file anytime. **Push data** only updates Google Sheets.
