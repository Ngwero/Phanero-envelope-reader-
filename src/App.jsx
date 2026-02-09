import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

// When deployed on Render (frontend + API same origin), leave VITE_API_URL unset
// so we use relative URLs like '/api/ocr'. For local dev, set VITE_API_URL=http://localhost:3001.
const API_URL = import.meta.env.VITE_API_URL || ''

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Ready to scan')
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!cameraOn) return

    let stream
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (err) {
        setError('Could not access camera. Try allowing camera permissions or use photo upload.')
        setCameraOn(false)
      }
    }

    startCamera()

    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [cameraOn])

  const processImage = async (dataUrl) => {
    setIsProcessing(true)
    setStatus('Processing image...')
    setError('')
    setProgress(10)

    try {
      // Convert data URL to blob
      const response = await fetch(dataUrl)
      const blob = await response.blob()

      setProgress(30)

      // Send to Node.js backend
      const formData = new FormData()
      formData.append('image', blob, 'image.jpg')

      setProgress(50)

      const ocrResponse = await fetch(`${API_URL}/api/ocr`, {
        method: 'POST',
        body: formData,
      })

      if (!ocrResponse.ok) {
        const errorData = await ocrResponse.json()
        throw new Error(errorData.error || 'OCR processing failed')
      }

      setProgress(80)

      const result = await ocrResponse.json()

      if (!result.text || !result.text.trim()) {
        setStatus('No text detected. Try again with better lighting or clearer image.')
        setError('No text detected. Ensure the form is well-lit and clearly visible.')
        return
      }

      setProgress(95)

      // Store entry with structured data
      const entry = {
        id: Date.now(),
        text: result.text,
        structured: result.structured || {},
        rawText: result.rawText || result.text,
      }

      setEntries((prev) => [entry, ...prev])
      setStatus('Captured and added to the table.')
      setProgress(100)
    } catch (err) {
      const errorMsg = err.message || 'Scan failed. Try again or upload a photo.'
      setError(errorMsg)
      setStatus(`Error: ${errorMsg}`)
      console.error('OCR Processing Error:', err)
    } finally {
      setIsProcessing(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  const handleCapture = async () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const width = video.videoWidth || 720
    const height = video.videoHeight || 480
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    await processImage(dataUrl)
  }

  const handleUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      await processImage(reader.result)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const exportExcel = async () => {
    if (!entries.length) {
      setStatus('Nothing to export yet.')
      return
    }

    try {
      // Send entries to backend for Excel export
      const response = await fetch(`${API_URL}/api/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entries }),
      })

      if (!response.ok) {
        throw new Error('Export failed')
      }

      // Download file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'phaneroo-extracted-data.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setStatus('Excel file downloaded.')
    } catch (err) {
      // Fallback to client-side export (without department and title columns)
      const worksheetData = entries.map((entry, index) => {
        const s = entry.structured || {}
        return {
          '#': index + 1,
          name: s.name || '',
          email: s.email || '',
          telephone: s.telephone || '',
          date: s.date || '',
          paymentMethod: s.paymentMethod || '',
          amount: s.amount || '',
        }
      })

      const worksheet = XLSX.utils.json_to_sheet(worksheetData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Extracted Data')
      XLSX.writeFile(workbook, 'phaneroo-extracted-data.xlsx')
      setStatus('Excel file created.')
    }
  }

  const clearEntries = () => {
    setEntries([])
    setStatus('Cleared all rows.')
  }

  const formatField = (value) => {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'number') return value.toLocaleString()
    return value || '—'
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <div className="brand-pill">
            <span className="brand-dot" />
            <span>Phaneroo Envelope Checker</span>
          </div>
          <h1>Scan, extract, and export without typing.</h1>
          <p className="lede">Point your phone camera at a Phaneroo contribution form, capture the form, and export everything to Excel with one click.</p>
          <blockquote className="verse">
            "The greatest among you will be your servant." <span>Matthew 23:11</span>
          </blockquote>
          <div className="actions">
            <button className="primary" onClick={() => setCameraOn((c) => !c)}>
              {cameraOn ? 'Stop camera' : 'Enable camera'}
            </button>
            <label className="secondary">
              Upload a photo
              <input type="file" accept="image/*" onChange={handleUpload} hidden />
            </label>
          </div>
          <p className="status">
            {status}
            {isProcessing && progress > 0 ? ` – ${progress}%` : ''}
          </p>
          {error && <p className="error">{error}</p>}
        </div>
        <div className="camera-shell">
          <div className="camera-frame">
            {cameraOn ? (
              <video ref={videoRef} className="video" playsInline muted />
            ) : (
              <div className="camera-placeholder">
                <p>Camera preview</p>
                <small>Enable the camera or upload a photo to start.</small>
              </div>
            )}
            <div className="frame-guides" />
          </div>
          <div className="camera-actions">
            <button className="primary" onClick={handleCapture} disabled={!cameraOn || isProcessing}>
              {isProcessing ? 'Processing...' : 'Capture & Read'}
            </button>
            <span className="hint">Use natural light and fill the frame with the contribution form.</span>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Captured rows</p>
            <h2>Contribution form data</h2>
          </div>
          <div className="panel-actions">
            <button className="ghost" onClick={exportExcel} disabled={!entries.length}>
              Export to Excel
            </button>
            <button className="secondary" onClick={clearEntries} disabled={!entries.length}>
              Clear
            </button>
          </div>
        </div>
        {!entries.length ? (
          <div className="empty">
            <p>No rows yet.</p>
            <small>Capture with the camera or upload a photo to populate the table.</small>
          </div>
        ) : (
          <div className="table" role="table" aria-label="Captured contribution forms">
            <div className="table-head" role="row">
              <span>#</span>
              <span>NAME</span>
              <span>EMAIL</span>
              <span>TELEPHONE</span>
              <span>DATE</span>
              <span>PAYMENT</span>
              <span>AMOUNT</span>
            </div>
            <div className="table-body">
              {entries.map((row, idx) => {
                const s = row.structured || {}
                return (
                  <div className="table-row" role="row" key={row.id}>
                    <span>{entries.length - idx}</span>
                    <span>{formatField(s.name)}</span>
                    <span>{formatField(s.email)}</span>
                    <span>{formatField(s.telephone)}</span>
                    <span>{formatField(s.date)}</span>
                    <span>{formatField(s.paymentMethod)}</span>
                    <span>{formatField(s.amount)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
      <canvas ref={canvasRef} className="hidden-canvas" />
    </div>
  )
}

export default App
