import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const AUTH_KEY = 'phaneroo_token'

function LoginPage({ onLogin, loginError, setLoginError, onNavigateToSuperAdmin }) {
  const [number, setNumber] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoginError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: number.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoginError(data.error || 'Login failed')
        return
      }
      if (data.token) onLogin(data.token)
    } catch {
      setLoginError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page login-page">
      <div className="login-card">
        <div className="brand-pill">
          <span className="brand-dot" />
          <span>Phaneroo Envelope Checker</span>
        </div>
        <h1>Log in</h1>
        <p className="login-lede">Enter your number and password to access the scanner.</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span className="label-text">Number</span>
            <input
              type="text"
              placeholder="e.g. 0753995292"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              autoComplete="tel"
              required
            />
          </label>
          <label>
            <span className="label-text">Password</span>
            <input
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {loginError && <p className="error">{loginError}</p>}
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Logging in...' : 'Log in'}
          </button>
          <button
            type="button"
            className="ghost super-admin-btn"
            onClick={onNavigateToSuperAdmin}
          >
            Super admin
          </button>
        </form>
      </div>
    </div>
  )
}

function SuperAdminLoginPage({ onLogin, onBack }) {
  const [number, setNumber] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: number.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }
      if (data.isSuperAdmin && data.token) {
        onLogin(data.token, { isSuperAdmin: true })
      } else {
        setError('Not a super admin. Use the main login.')
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page login-page">
      <div className="login-card">
        <div className="brand-pill">
          <span className="brand-dot" />
          <span>Super Admin</span>
        </div>
        <h1>Super admin login</h1>
        <p className="login-lede">Enter your number and password to access the dashboard.</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span className="label-text">Number</span>
            <input
              type="text"
              placeholder="e.g. 0753995292"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              autoComplete="tel"
              required
            />
          </label>
          <label>
            <span className="label-text">Password</span>
            <input
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Logging in...' : 'Log in'}
          </button>
          <button type="button" className="ghost super-admin-btn" onClick={onBack}>
            Back to main login
          </button>
        </form>
      </div>
    </div>
  )
}

function SuperAdminDashboard({ onLogout }) {
  const [stats, setStats] = useState({ total: 0, byNumber: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addNumber, setAddNumber] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState(null)
  const [resetNumber, setResetNumber] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(null)

  const token = localStorage.getItem(AUTH_KEY)

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setResetError('')
    setResetSuccess(null)
    setResetLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/users/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ number: resetNumber.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401 || res.status === 403) {
        onLogout()
        return
      }
      if (!res.ok) {
        setResetError(data.error || 'Failed to reset password')
        return
      }
      setResetSuccess({ number: data.number, password: data.password })
      setResetNumber('')
    } catch {
      setResetError('Network error. Try again.')
    } finally {
      setResetLoading(false)
    }
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    setAddError('')
    setAddSuccess(null)
    setAddLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/users/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ number: addNumber.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401 || res.status === 403) {
        onLogout()
        return
      }
      if (!res.ok) {
        setAddError(data.error || 'Failed to add user')
        return
      }
      setAddSuccess({ number: data.number, password: data.password })
      setAddNumber('')
    } catch {
      setAddError('Network error. Try again.')
    } finally {
      setAddLoading(false)
    }
  }

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401 || res.status === 403) {
          onLogout()
          return
        }
        if (!res.ok) {
          setError('Failed to load dashboard')
          return
        }
        const data = await res.json()
        setStats({ total: data.total || 0, byNumber: data.byNumber || {} })
      } catch {
        setError('Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [token, onLogout])

  const entries = Object.entries(stats.byNumber).sort((a, b) => b[1] - a[1])

  return (
    <div className="page">
      <header className="hero">
        <div>
          <div className="hero-top">
            <div className="brand-pill">
              <span className="brand-dot" />
              <span>Super Admin Dashboard</span>
            </div>
            <button type="button" className="ghost logout-btn" onClick={onLogout}>
              Log out
            </button>
          </div>
          <h1>Processing stats</h1>
          <p className="lede">Total pictures processed and breakdown by user number.</p>
        </div>
      </header>
      <section className="panel">
        <div className="dashboard-add-user">
          <h3 className="dashboard-subtitle">Add user</h3>
          <form onSubmit={handleAddUser} className="add-user-form">
            <label>
              <span className="label-text">Phone number</span>
              <input
                type="text"
                placeholder="e.g. 0753995292"
                value={addNumber}
                onChange={(e) => setAddNumber(e.target.value)}
                autoComplete="tel"
                disabled={addLoading}
                required
              />
            </label>
            <button type="submit" className="primary" disabled={addLoading}>
              {addLoading ? 'Adding...' : 'Add user'}
            </button>
          </form>
          {addError && <p className="error">{addError}</p>}
          {addSuccess && (
            <p className="add-success">
              User <strong>{addSuccess.number}</strong> added. Password: <strong>{addSuccess.password}</strong>
            </p>
          )}
          <p className="add-user-hint">A 5-digit password will be generated. Share it with the user.</p>
        </div>
        <div className="dashboard-add-user">
          <h3 className="dashboard-subtitle">Reset password</h3>
          <form onSubmit={handleResetPassword} className="add-user-form">
            <label>
              <span className="label-text">Phone number</span>
              <input
                type="text"
                placeholder="e.g. 0753995292"
                value={resetNumber}
                onChange={(e) => setResetNumber(e.target.value)}
                autoComplete="tel"
                disabled={resetLoading}
                required
              />
            </label>
            <button type="submit" className="secondary" disabled={resetLoading}>
              {resetLoading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
          {resetError && <p className="error">{resetError}</p>}
          {resetSuccess && (
            <p className="add-success">
              Password reset for <strong>{resetSuccess.number}</strong>. New password: <strong>{resetSuccess.password}</strong>
            </p>
          )}
          <p className="add-user-hint">Generates a new 5-digit password. Use when a user forgets theirs.</p>
        </div>
        {loading ? (
          <p className="empty">Loading...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          <>
            <div className="dashboard-summary">
              <p className="dashboard-total">{stats.total} pictures processed</p>
            </div>
            <div className="dashboard-table-wrap">
              <h3 className="dashboard-subtitle">By user number</h3>
              {entries.length === 0 ? (
                <p className="empty">No data yet.</p>
              ) : (
                <div className="dashboard-table">
                  <div className="table-head" role="row">
                    <span>Number</span>
                    <span>Count</span>
                  </div>
                  {entries.map(([num, count]) => (
                    <div className="table-row" role="row" key={num}>
                      <span>{num}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
      <footer className="page-footer">
        <small>© 2026 Phaneroo Envelope Checker</small>
      </footer>
    </div>
  )
}

function App() {
  const takePhotoInputRef = useRef(null)
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_KEY))
  const [view, setView] = useState('login')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Ready to scan')
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')

  const logout = () => {
    localStorage.removeItem(AUTH_KEY)
    setToken(null)
    setView('login')
    setError('')
  }

  const authHeaders = () => (token ? { Authorization: `Bearer ${token}` } : {})
  const checkAuth = (res) => {
    if (res.status === 401) {
      logout()
      return true
    }
    return false
  }

  const processOneImage = async (dataUrl) => {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    const formData = new FormData()
    formData.append('image', blob, 'image.jpg')
    const ocrResponse = await fetch(`${API_URL}/api/ocr`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    })
    if (checkAuth(ocrResponse)) throw new Error('Session expired')
    if (!ocrResponse.ok) {
      const errorData = await ocrResponse.json().catch(() => ({}))
      throw new Error(errorData.error || 'OCR processing failed')
    }
    const result = await ocrResponse.json()
    if (!result.text || !result.text.trim()) {
      throw new Error('No text detected. Ensure the form is well-lit and clearly visible.')
    }
    return {
      id: Date.now() + Math.random(),
      text: result.text,
      structured: result.structured || {},
      rawText: result.rawText || result.text,
    }
  }

  const processImage = async (dataUrl) => {
    setIsProcessing(true)
    setStatus('Processing image...')
    setError('')
    setProgress(10)
    try {
      setProgress(50)
      const entry = await processOneImage(dataUrl)
      setProgress(95)
      setEntries((prev) => [entry, ...prev])
      setStatus('Captured and added to the table.')
      setProgress(100)
    } catch (err) {
      const errorMsg = err.message || 'Scan failed. Try again or upload a photo.'
      setError(err.message === 'Session expired' ? 'Session expired. Please log in again.' : errorMsg)
      setStatus(`Error: ${errorMsg}`)
      if (err.message === 'Session expired') logout()
    } finally {
      setIsProcessing(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  const processImagesBatch = async (dataUrls) => {
    if (!dataUrls.length) return
    const total = dataUrls.length
    setIsProcessing(true)
    setError('')
    const added = []
    const failed = []
    for (let i = 0; i < total; i++) {
      setStatus(`Processing image ${i + 1} of ${total}...`)
      setProgress(Math.round(((i + 0.5) / total) * 100))
      try {
        const entry = await processOneImage(dataUrls[i])
        added.push(entry)
        setEntries((prev) => [entry, ...prev])
      } catch (err) {
        failed.push({ index: i + 1, message: err.message })
        if (err.message === 'Session expired') {
          setError('Session expired. Please log in again.')
          logout()
          return
        }
      }
    }
    setProgress(100)
    setStatus(added.length === total
      ? `Added ${total} row${total === 1 ? '' : 's'} to the table.`
      : `Added ${added.length} of ${total}. ${failed.length} failed.`)
    if (failed.length) {
      setError(failed.map((f) => `Image ${f.index}: ${f.message}`).join('; '))
    }
    setIsProcessing(false)
    setTimeout(() => setProgress(0), 1000)
  }

  const handleUpload = (event) => {
    const files = event.target.files
    if (!files?.length) return
    const fileList = Array.from(files)
    event.target.value = ''
    if (fileList.length === 1) {
      const reader = new FileReader()
      reader.onload = async () => {
        await processImage(reader.result)
      }
      reader.readAsDataURL(fileList[0])
      return
    }
    let loaded = 0
    const dataUrls = []
    fileList.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        dataUrls.push(reader.result)
        loaded++
        if (loaded === fileList.length) {
          processImagesBatch(dataUrls)
        }
      }
      reader.readAsDataURL(file)
    })
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
          ...authHeaders(),
        },
        body: JSON.stringify({ entries }),
      })
      if (checkAuth(response)) {
        setError('Session expired. Please log in again.')
        return
      }
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
          Name: s.name || '',
          Email: s.email || '',
          Telephone: s.telephone || '',
          Date: s.date || '',
          'Contribution Type': s.contributionType || '',
          'Payment Method': s.paymentMethod || '',
          Amount: s.amount || '',
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

  const updateEntryField = (entryId, field, value) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? { ...entry, structured: { ...(entry.structured || {}), [field]: value } }
          : entry
      )
    )
  }

  if (!token) {
    if (view === 'superAdminLogin') {
      return (
        <SuperAdminLoginPage
          onLogin={(t, opts) => {
            localStorage.setItem(AUTH_KEY, t)
            setToken(t)
            setView('superAdminDashboard')
            setError('')
          }}
          onBack={() => setView('login')}
        />
      )
    }
    return (
      <LoginPage
        onLogin={(t) => {
          localStorage.setItem(AUTH_KEY, t)
          setToken(t)
          setView('app')
          setError('')
        }}
        loginError={error}
        setLoginError={setError}
        onNavigateToSuperAdmin={() => setView('superAdminLogin')}
      />
    )
  }

  if (view === 'superAdminDashboard') {
    return <SuperAdminDashboard onLogout={logout} />
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <div className="hero-top">
            <div className="brand-pill">
              <span className="brand-dot" />
              <span>Phaneroo Envelope Checker</span>
            </div>
            <button type="button" className="ghost logout-btn" onClick={logout}>
              Log out
            </button>
          </div>
          <h1>Scan, extract, and export without typing.</h1>
          <p className="lede">Point your phone camera at a Phaneroo contribution form, capture the form, and export everything to Excel with one click.</p>
          <blockquote className="verse">
            "The greatest among you will be your servant." <span>Matthew 23:11</span>
          </blockquote>
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => takePhotoInputRef.current?.click()}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Take a photo'}
            </button>
            <input
              ref={takePhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
            <label className="secondary">
              Upload from gallery
              <input type="file" accept="image/*" multiple onChange={handleUpload} disabled={isProcessing} hidden />
            </label>
          </div>
          <p className="status">
            {status}
            {isProcessing && progress > 0 ? ` – ${progress}%` : ''}
          </p>
          {error && <p className="error">{error}</p>}
          <p className="hint hero-hint">On your phone, “Take a photo” opens the camera app. Use “Upload from gallery” to select multiple images at once; all will be processed in order.</p>
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
          <div className="table-wrap">
            <div className="table" role="table" aria-label="Captured contribution forms">
              <div className="table-head" role="row">
              <span>#</span>
              <span>NAME</span>
              <span>EMAIL</span>
              <span>TELEPHONE</span>
              <span>DATE</span>
              <span>TYPE</span>
              <span>PAYMENT</span>
              <span>AMOUNT</span>
            </div>
            <div className="table-body">
              {entries.map((row, idx) => {
                const s = row.structured || {}
                return (
                  <div className="table-row" role="row" key={row.id}>
                    <span className="table-cell-index">{entries.length - idx}</span>
                    <span className="table-cell-edit">
                      <input
                        type="text"
                        value={s.name ?? ''}
                        onChange={(e) => updateEntryField(row.id, 'name', e.target.value)}
                        aria-label="Name"
                      />
                    </span>
                    <span className="table-cell-edit">
                      <input
                        type="text"
                        value={s.email ?? ''}
                        onChange={(e) => updateEntryField(row.id, 'email', e.target.value)}
                        aria-label="Email"
                      />
                    </span>
                    <span className="table-cell-edit">
                      <input
                        type="text"
                        value={s.telephone ?? ''}
                        onChange={(e) => updateEntryField(row.id, 'telephone', e.target.value)}
                        aria-label="Telephone"
                      />
                    </span>
                    <span className="table-cell-edit">
                      <input
                        type="text"
                        value={s.date ?? ''}
                        onChange={(e) => updateEntryField(row.id, 'date', e.target.value)}
                        aria-label="Date"
                      />
                    </span>
                    <span className="table-cell-edit">
                      <input
                        type="text"
                        value={s.contributionType ?? ''}
                        onChange={(e) => updateEntryField(row.id, 'contributionType', e.target.value)}
                        aria-label="Type"
                      />
                    </span>
                    <span className="table-cell-edit">
                      <input
                        type="text"
                        value={s.paymentMethod ?? ''}
                        onChange={(e) => updateEntryField(row.id, 'paymentMethod', e.target.value)}
                        aria-label="Payment"
                      />
                    </span>
                    <span className="table-cell-edit">
                      <input
                        type="text"
                        value={s.amount ?? ''}
                        onChange={(e) => updateEntryField(row.id, 'amount', e.target.value)}
                        aria-label="Amount"
                      />
                    </span>
                  </div>
                )
              })}
              </div>
            </div>
          </div>
        )}
      </section>
      <footer className="page-footer">
        <small>© 2026 Phaneroo Envelope Checker</small>
      </footer>
    </div>
  )
}

export default App
