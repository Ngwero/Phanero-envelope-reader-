#!/bin/bash

# Quick deployment script

echo "🚀 Starting deployment process..."

# Build React frontend
echo "📦 Building React frontend..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed!"
    exit 1
fi

echo "✅ Frontend built successfully!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Deploy Python OCR service (ocr_service/):"
echo "   - Railway: cd ocr_service && railway up"
echo "   - Render: Create Web Service pointing to ocr_service/"
echo ""
echo "2. Deploy Node.js server (server/):"
echo "   - Railway: cd server && railway up"
echo "   - Render: Create Web Service pointing to server/"
echo "   - Set OCR_SERVICE_URL environment variable"
echo ""
echo "3. Deploy React frontend (dist/):"
echo "   - Vercel: vercel --prod"
echo "   - Netlify: netlify deploy --prod --dir=dist"
echo "   - GitHub Pages: gh-pages -d dist"
echo "   - Set VITE_API_URL environment variable"
echo ""
echo "✨ Deployment ready!"
