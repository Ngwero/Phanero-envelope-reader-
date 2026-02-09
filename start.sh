#!/bin/bash

# Quick start script for PaddleOCR OCR system

echo "Starting PaddleOCR OCR System..."
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

# Start Python OCR service
echo "Starting Python OCR service..."
cd ocr_service
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt
python main.py &
PYTHON_PID=$!
cd ..

# Wait a moment for Python service to start
sleep 3

# Start Node.js server
echo "Starting Node.js server..."
cd server
if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install
fi
node index.js &
NODE_PID=$!
cd ..

# Wait a moment for Node.js server to start
sleep 2

echo ""
echo "Services started!"
echo "Python OCR service: http://localhost:8000"
echo "Node.js server: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for user interrupt
trap "kill $PYTHON_PID $NODE_PID 2>/dev/null; exit" INT
wait
