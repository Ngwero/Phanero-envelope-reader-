import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const AUTH_KEY = 'phaneroo_token'
const VIEW_KEY = 'phaneroo_view'

function getInitialView() {
  if (!localStorage.getItem(AUTH_KEY)) return 'login'
  return localStorage.getItem(VIEW_KEY) === 'superAdminDashboard' ? 'superAdminDashboard' : 'app'
}

function persistView(view) {
  if (view === 'app' || view === 'superAdminDashboard') {
    localStorage.setItem(VIEW_KEY, view)
  } else {
    localStorage.removeItem(VIEW_KEY)
  }
}

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
  const [confirmPassword, setConfirmPassword] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(null)
  const [checking, setChecking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const normalized = number.trim().replace(/\s/g, '')
    if (normalized.length < 9) {
      setNeedsSetup(false)
      setIsSuperAdmin(null)
      return undefined
    }
    let cancelled = false
    setChecking(true)
    setError('')
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/super-admin/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: normalized }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!data.isSuperAdmin) {
          setIsSuperAdmin(false)
          setNeedsSetup(false)
        } else {
          setIsSuperAdmin(true)
          setNeedsSetup(!!data.needsPasswordSetup)
        }
      } catch {
        if (!cancelled) {
          setIsSuperAdmin(null)
          setNeedsSetup(false)
        }
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [number])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const normalized = number.trim().replace(/\s/g, '')
    if (isSuperAdmin === false) {
      setError('Not a super admin. Use the main login.')
      return
    }
    if (needsSetup) {
      if (password.length < 4) {
        setError('Password must be at least 4 characters')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
      setLoading(true)
      try {
        const res = await fetch(`${API_URL}/api/super-admin/setup-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: normalized, password }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.error || 'Failed to set password')
          return
        }
        if (data.token) onLogin(data.token)
      } catch {
        setError('Network error. Try again.')
      } finally {
        setLoading(false)
      }
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: normalized, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.needsPasswordSetup) {
        setNeedsSetup(true)
        setError('Set your password below — first-time setup for this number.')
        return
      }
      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }
      if (data.isSuperAdmin && data.token) {
        onLogin(data.token)
      } else {
        setError('Not a super admin. Use the main login.')
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const lede = needsSetup
    ? 'First time here? Choose a password for your super admin number.'
    : 'Enter your number and password to access the dashboard.'

  return (
    <div className="page login-page">
      <div className="login-card">
        <div className="brand-pill">
          <span className="brand-dot" />
          <span>Super Admin</span>
        </div>
        <h1>{needsSetup ? 'Set your password' : 'Super admin login'}</h1>
        <p className="login-lede">{lede}</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span className="label-text">Number</span>
            <input
              type="text"
              placeholder="e.g. 0703492020"
              value={number}
              onChange={(e) => {
                setNumber(e.target.value)
                setPassword('')
                setConfirmPassword('')
              }}
              autoComplete="tel"
              required
            />
          </label>
          {checking && number.trim().replace(/\s/g, '').length >= 9 && (
            <p className="login-hint">Checking number…</p>
          )}
          {needsSetup ? (
            <>
              <label>
                <span className="label-text">New password</span>
                <input
                  type="password"
                  placeholder="At least 4 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={4}
                />
              </label>
              <label>
                <span className="label-text">Confirm password</span>
                <input
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={4}
                />
              </label>
            </>
          ) : (
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
          )}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary" disabled={loading || checking}>
            {loading
              ? needsSetup
                ? 'Saving...'
                : 'Logging in...'
              : needsSetup
                ? 'Set password & log in'
                : 'Log in'}
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
  const [addName, setAddName] = useState('')
  const [addNumber, setAddNumber] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState(null)
  const [resetNumber, setResetNumber] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(null)
  const [userNames, setUserNames] = useState({})
  const [registeredUsers, setRegisteredUsers] = useState([])

  const token = localStorage.getItem(AUTH_KEY)

  const applyUsersList = (users) => {
    const list = users || []
    setRegisteredUsers(list)
    const map = {}
    list.forEach((row) => {
      map[row.number] = row.name || '—'
    })
    setUserNames(map)
  }

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
      setRegisteredUsers((prev) =>
        prev.map((u) =>
          u.number === data.number ? { ...u, password: data.password } : u
        )
      )
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
        body: JSON.stringify({ number: addNumber.trim(), name: addName.trim() }),
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
      setAddSuccess({ number: data.number, password: data.password, name: data.name })
      setAddNumber('')
      setAddName('')
      setRegisteredUsers((prev) => [
        ...prev,
        { number: data.number, name: data.name || '', password: data.password },
      ])
      setUserNames((prev) => ({ ...prev, [data.number]: data.name || '—' }))
    } catch {
      setAddError('Network error. Try again.')
    } finally {
      setAddLoading(false)
    }
  }

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [dashRes, usersRes] = await Promise.all([
          fetch(`${API_URL}/api/admin/dashboard`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/api/admin/users`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])
        if (dashRes.status === 401 || dashRes.status === 403) {
          onLogout()
          return
        }
        if (!dashRes.ok) {
          setError('Failed to load dashboard')
          return
        }
        const data = await dashRes.json()
        setStats({ total: data.total || 0, byNumber: data.byNumber || {} })
        if (usersRes.ok) {
          const u = await usersRes.json()
          applyUsersList(u.users)
        }
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
              <span className="label-text">Full name</span>
              <input
                type="text"
                placeholder="e.g. Jane Mukasa"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                autoComplete="name"
                disabled={addLoading}
                required
              />
            </label>
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
              <strong>{addSuccess.name}</strong> ({addSuccess.number}) added. Password:{' '}
              <strong>{addSuccess.password}</strong>
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
              <h3 className="dashboard-subtitle">Registered users</h3>
              {registeredUsers.length === 0 ? (
                <p className="empty">No users yet. Add one above.</p>
              ) : (
                <div className="dashboard-table dashboard-table-users dashboard-table-accounts">
                  <div className="table-head" role="row">
                    <span>Name</span>
                    <span>Number</span>
                    <span>Password</span>
                  </div>
                  {registeredUsers
                    .slice()
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map((row) => (
                      <div className="table-row" role="row" key={row.number}>
                        <span>{row.name || '—'}</span>
                        <span>{row.number}</span>
                        <span>{row.password || '—'}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="dashboard-table-wrap">
              <h3 className="dashboard-subtitle">By user number</h3>
              {entries.length === 0 ? (
                <p className="empty">No data yet.</p>
              ) : (
                <div className="dashboard-table dashboard-table-users">
                  <div className="table-head" role="row">
                    <span>Name</span>
                    <span>Number</span>
                    <span>Count</span>
                  </div>
                  {entries.map(([num, count]) => (
                    <div className="table-row" role="row" key={num}>
                      <span>{userNames[num] || '—'}</span>
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
  const [view, setView] = useState(getInitialView)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Ready to scan')
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const [pushSheetsLoading, setPushSheetsLoading] = useState(false)

  const logout = () => {
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem(VIEW_KEY)
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

  const pushToSheets = async () => {
    if (!entries.length) {
      setStatus('Nothing to push yet.')
      return
    }
    setPushSheetsLoading(true)
    setError('')
    setStatus('Pushing to Google Sheet...')
    try {
      const response = await fetch(`${API_URL}/api/sheets/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ entries }),
      })
      if (checkAuth(response)) {
        setError('Session expired. Please log in again.')
        setStatus('Session expired.')
        return
      }
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || 'Push to Google Sheet failed')
        setStatus('Push failed.')
        return
      }
      setStatus(`Pushed ${data.appended} row${data.appended === 1 ? '' : 's'} to Google Sheet.`)
    } catch {
      setError('Network error. Try again.')
      setStatus('Push failed.')
    } finally {
      setPushSheetsLoading(false)
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
          onLogin={(t) => {
            localStorage.setItem(AUTH_KEY, t)
            setToken(t)
            setView('superAdminDashboard')
            persistView('superAdminDashboard')
            setError('')
          }}
          onBack={() => {
            setView('login')
            persistView('login')
          }}
        />
      )
    }
    return (
      <LoginPage
        onLogin={(t) => {
          localStorage.setItem(AUTH_KEY, t)
          setToken(t)
          setView('app')
          persistView('app')
          setError('')
        }}
        loginError={error}
        setLoginError={setError}
        onNavigateToSuperAdmin={() => {
          setView('superAdminLogin')
          persistView('superAdminLogin')
        }}
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
            <button
              type="button"
              className="primary"
              onClick={pushToSheets}
              disabled={!entries.length || pushSheetsLoading || isProcessing}
            >
              {pushSheetsLoading ? 'Pushing…' : 'Push data'}
            </button>
            <button className="secondary" onClick={clearEntries} disabled={!entries.length || pushSheetsLoading}>
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
