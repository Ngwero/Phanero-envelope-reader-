import { useEffect, useRef, useState } from 'react'
import Tesseract from 'tesseract.js'
import * as XLSX from 'xlsx'
import './App.css'

const parseContributionForm = (text) => {
  // Extract Names - look for "Names:" followed by name text
  // Handle OCR errors: "Names" might be read as "Narnes", "Narnes", etc.
  let names = ''
  const namesPatterns = [
    /(?:Names?|Narnes?|Narnes)[:\s]+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,5})/i,
    /(?:Names?)[:\s]*([A-Z][A-Za-z\s]{3,50})/i,
  ]
  for (const pattern of namesPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      names = match[1].trim().replace(/\s+/g, ' ')
      // Clean up common OCR errors in names
      names = names.replace(/[|]/g, 'I').replace(/[0O](?=\s|$)/g, 'O')
      break
    }
  }

  // Extract Date - look for date patterns like 29/1/2026, 29-1-2026, 29.1.2026
  let date = ''
  const datePatterns = [
    /(?:Date)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/,
  ]
  for (const pattern of datePatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      date = match[1]
      break
    }
  }

  // Extract Telephone - look for phone numbers (typically 9-15 digits, often starting with 0)
  // Handle spaces, dashes, and OCR errors
  let telephone = ''
  const telPatterns = [
    /(?:Telephone|Phone|Tel)[:\s]*(?:No[:\s]*)?([0O]?[\d\s\-]{9,18})/i,
    /([0O]\d[\d\s\-]{7,15})/,
  ]
  for (const pattern of telPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      telephone = match[1].replace(/\s+/g, '').replace(/\-/g, '').replace(/O/g, '0')
      // Ensure it starts with 0 and has 10 digits
      if (telephone.length >= 9 && telephone.length <= 15) {
        if (!telephone.startsWith('0') && telephone.length === 9) {
          telephone = '0' + telephone
        }
        break
      }
    }
  }

  // Extract Email Address - look for email pattern (usually reliable in OCR)
  let emailAddress = ''
  const emailPatterns = [
    /(?:Email|E-mail|Ernail)[:\s]*(?:Address[:\s]*)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
  ]
  for (const pattern of emailPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      emailAddress = match[1]
      break
    }
  }

  // Extract Amount - look for numbers with commas (like 2,120,000)
  // Often appears near "Tithe", "Cash", "Amount", "Prisons Ministry"
  let amount = ''
  const amountPatterns = [
    /(?:Tithe|Cash|Amount|Prisons\s+Ministry|1st\s+Fruit)[:\s]*(\d{1,3}(?:[,\s]\d{3}){1,})/i,
    /(\d{1,3}(?:[,\s]\d{3}){2,})/,
    /(\d{4,}(?:[,\s]\d{3})*)/,
  ]
  for (const pattern of amountPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      amount = match[1].replace(/\s+/g, '').replace(/[Oo]/g, '0')
      // Validate it's a reasonable amount (at least 4 digits)
      if (amount.replace(/,/g, '').length >= 4) {
        break
      }
    }
  }

  return {
    names: names || '',
    date: date || '',
    telephone: telephone || '',
    emailAddress: emailAddress || '',
    amount: amount || '',
    rawText: text.trim(),
  }
}

const formatRowForExcel = (row, index) => ({
  '#': index + 1,
  NAMES: row.names,
  DATE: row.date,
  TELEPHONE: row.telephone,
  'EMAIL ADDRESS': row.emailAddress,
  AMOUNT: row.amount,
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
  const [ocrMethod, setOcrMethod] = useState('ocrspace') // 'tesseract' or 'ocrspace'
  const [apiKey, setApiKey] = useState('') // OCR.space API key (optional for free tier)

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

  // Convert data URL to base64 without data URL prefix
  const dataURLtoBase64 = (dataUrl) => {
    return dataUrl.split(',')[1]
  }

  // Convert data URL to Blob
  const dataURLtoBlob = (dataUrl) => {
    const arr = dataUrl.split(',')
    const mime = arr[0].match(/:(.*?);/)[1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new Blob([u8arr], { type: mime })
  }

  const runOcrSpace = async (imageDataUrl) => {
    setProgress(10)
    const formData = new FormData()
    const blob = dataURLtoBlob(imageDataUrl)
    formData.append('file', blob, 'image.jpg')
    
    // OCR.space API endpoint
    // Free tier: 25,000 requests/month, no API key needed for basic usage
    // For better accuracy, you can get a free API key from https://ocr.space/OCRAPI
    const apiUrl = apiKey 
      ? `https://api.ocr.space/parse/image?apikey=${apiKey}&language=eng&isOverlayRequired=false`
      : 'https://api.ocr.space/parse/image?language=eng&isOverlayRequired=false'
    
    setProgress(30)
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
    })
    
    setProgress(70)
    const data = await response.json()
    setProgress(100)
    
    if (data.ParsedResults && data.ParsedResults.length > 0) {
      return data.ParsedResults[0].ParsedText || ''
    } else if (data.ErrorMessage) {
      throw new Error(data.ErrorMessage)
    }
    return ''
  }

  const runTesseract = async (imageDataUrl) => {
    const result = await Tesseract.recognize(imageDataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          setProgress(Math.round(m.progress * 100))
        }
      },
    })
    return result.data?.text || ''
  }

  const runOcr = async (imageDataUrl) => {
    if (ocrMethod === 'ocrspace') {
      try {
        return await runOcrSpace(imageDataUrl)
      } catch (err) {
        console.warn('OCR.space failed, falling back to Tesseract:', err)
        setStatus('OCR.space unavailable, using Tesseract...')
        return await runTesseract(imageDataUrl)
      }
    } else {
      return await runTesseract(imageDataUrl)
    }
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
      const parsed = parseContributionForm(text)
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
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contribution Forms')
    XLSX.writeFile(workbook, 'phaneroo-contributions.xlsx')
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
          <p className="lede">Point your phone camera at a Phaneroo contribution form, capture the form, and export everything to Excel with one click.</p>
          <blockquote className="verse">
            “The greatest among you will be your servant.” <span>Matthew 23:11</span>
          </blockquote>
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
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d0e4b2', fontSize: '0.9rem' }}>
              <span>OCR Method:</span>
              <select 
                value={ocrMethod} 
                onChange={(e) => setOcrMethod(e.target.value)}
                style={{ 
                  padding: '0.5rem', 
                  borderRadius: '4px', 
                  border: '1px solid #2b3f17',
                  background: '#151e0d',
                  color: '#d0e4b2',
                  cursor: 'pointer'
                }}
              >
                <option value="ocrspace">OCR.space (More Accurate)</option>
                <option value="tesseract">Tesseract.js (Free, Local)</option>
              </select>
            </label>
            {ocrMethod === 'ocrspace' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <input
                  type="text"
                  placeholder="OCR.space API Key (optional - free tier: 25k/month)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #2b3f17',
                    background: '#151e0d',
                    color: '#d0e4b2',
                    fontSize: '0.85rem',
                    minWidth: '250px'
                  }}
                />
                <small style={{ color: '#8a9a6b', fontSize: '0.75rem' }}>
                  Get free API key at <a href="https://ocr.space/OCRAPI" target="_blank" rel="noopener noreferrer" style={{ color: '#a8d5ba' }}>ocr.space/OCRAPI</a> (optional)
                </small>
              </div>
            )}
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
          <div className="table" role="table" aria-label="Captured contribution forms">
            <div className="table-head" role="row">
              <span>#</span>
              <span>NAMES</span>
              <span>DATE</span>
              <span>TELEPHONE</span>
              <span>EMAIL ADDRESS</span>
              <span>AMOUNT</span>
            </div>
            <div className="table-body">
              {entries.map((row, idx) => (
                <div className="table-row" role="row" key={row.id}>
                  <span>{entries.length - idx}</span>
                  <span>{row.names || '—'}</span>
                  <span>{row.date || '—'}</span>
                  <span>{row.telephone || '—'}</span>
                  <span>{row.emailAddress || '—'}</span>
                  <span>{row.amount || '—'}</span>
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
