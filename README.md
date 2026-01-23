# Envelope Scanner Web

React + Vite single-page app that captures an envelope with your phone camera, reads the address block via OCR, and exports rows to Excel.

## Quickstart

```bash
npm install
npm run dev
```

Open the printed URL (or `http://localhost:5173`) in your phone browser. HTTPS is required for the camera on non-localhost hosts.

## How to use

1) Enable the camera (facing mode is set to `environment`) or upload a photo.  
2) Fill the frame with the address block and tap “Capture & Read.”  
3) The OCR result is parsed into Recipient, Street, City/State/Postal, Notes, plus a Raw OCR column.  
4) Export to Excel anytime; rows are written to `envelope-scans.xlsx`.  
5) Use “Clear” to reset the table.

## Notes

- Tesseract.js runs fully in the browser; scanning speed depends on device performance and lighting.  
- Keep the address well lit with minimal shadows for best accuracy.  
- The postal line is detected with a ZIP/ZIP+4 pattern; other lines fall back to their order in the OCR result.
# Phanero-envelope-reader-
