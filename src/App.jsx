import { useEffect, useRef, useState } from 'react'
import Tesseract from 'tesseract.js'
import * as XLSX from 'xlsx'
import './App.css'

const parseEnvelopeText = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[^\w\s.,#\-\/]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const postalIndex = lines.findIndex((line) => /\b\d{5}(?:-\d{4})?\b/.test(line))
  const cityStatePostal = postalIndex >= 0 ? lines[postalIndex] : lines[2] ?? ''

  return {
    recipient: lines[0] ?? '',
    street: lines[1] ?? '',
    cityStatePostal,
    notes: lines
      .filter((_, idx) => idx > 2 && idx !== postalIndex)
      .join(' ')
      .trim(),
    rawText: text.trim(),
  }
}

const formatRowForExcel = (row, index) => ({
  '#': index + 1,
  Recipient: row.recipient,
  Street: row.street,
  'City / State / Postal': row.cityStatePostal,
  Notes: row.notes,
  'Raw OCR': row.rawText,
})

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

  const runOcr = async (imageDataUrl) => {
    const result = await Tesseract.recognize(imageDataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          setProgress(Math.round(m.progress * 100))
        }
      },
    })
    return result.data?.text || ''
  }

  const processImage = async (dataUrl) => {
    setIsProcessing(true)
    setStatus('Scanning for text...')
    setError('')
    try {
      const text = await runOcr(dataUrl)
      if (!text.trim()) {
        setStatus('No text detected. Try again with more light.')
        return
      }
      const parsed = parseEnvelopeText(text)
      setEntries((prev) => [{ id: Date.now(), ...parsed }, ...prev])
      setStatus('Captured and added to the table.')
    } catch (err) {
      setError('Scan failed. Try again or upload a photo.')
      console.error(err)
    } finally {
      setIsProcessing(false)
      setProgress(0)
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

  const exportExcel = () => {
    if (!entries.length) {
      setStatus('Nothing to export yet.')
      return
    }
    const worksheet = XLSX.utils.json_to_sheet(entries.map(formatRowForExcel))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Envelope Scans')
    XLSX.writeFile(workbook, 'envelope-scans.xlsx')
    setStatus('Excel file created.')
  }

  const clearEntries = () => {
    setEntries([])
    setStatus('Cleared all rows.')
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
          <p className="lede">Point your phone camera at an envelope, capture the address block, and export everything to Excel with one click.</p>
          <div className="actions">
            <button className="primary" onClick={() => setCameraOn((c) => !c)}>
              {cameraOn ? 'Stop camera' : 'Enable camera'}
            </button>
            <label className="secondary">
              Upload a photo
              <input type="file" accept="image/*" onChange={handleUpload} hidden />
            </label>
            <button className="ghost" onClick={exportExcel}>
              Export to Excel
            </button>
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
              {isProcessing ? 'Reading...' : 'Capture & Read'}
            </button>
            <span className="hint">Use natural light and fill the frame with the address block.</span>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Captured rows</p>
            <h2>Auto-filled address table</h2>
          </div>
          <div className="panel-actions">
            <button className="ghost" onClick={exportExcel}>
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
          <div className="table" role="table" aria-label="Captured envelope rows">
            <div className="table-head" role="row">
              <span>#</span>
              <span>Recipient</span>
              <span>Street</span>
              <span>City / State / Postal</span>
              <span>Notes</span>
              <span>Raw OCR</span>
            </div>
            <div className="table-body">
              {entries.map((row, idx) => (
                <div className="table-row" role="row" key={row.id}>
                  <span>{entries.length - idx}</span>
                  <span>{row.recipient || '—'}</span>
                  <span>{row.street || '—'}</span>
                  <span>{row.cityStatePostal || '—'}</span>
                  <span>{row.notes || '—'}</span>
                  <span className="raw">{row.rawText || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <canvas ref={canvasRef} className="hidden-canvas" />
    </div>
  )
}

export default App
