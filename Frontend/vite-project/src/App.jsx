import { useState } from 'react'
import { LayoutDashboard, FileText, Settings, Bot } from 'lucide-react'
import ResumeUpload from './components/ResumeUpload'
import JobPreferences from './components/JobPreferences'
import ApplicationLogs from './components/ApplicationLogs'
import SettingsPanel from './components/SettingsPanel'
import './App.css'

const API_BASE = 'http://localhost:8080'

const STATUS_LABELS = {
  idle: 'IDLE',
  parsing: 'PARSING',
  ready_to_apply: 'READY TO APPLY',
  applying: 'APPLYING',
  completed: 'COMPLETED'
}

function App() {
  const [appState, setAppState] = useState('idle')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [extractedSkills, setExtractedSkills] = useState([])
  const [parsedProfile, setParsedProfile] = useState(null)
  const [logs, setLogs] = useState([])
  const [isNaukriConnected, setIsNaukriConnected] = useState(false)

  const handleParseStart = () => {
    setAppState('parsing')
  }

  const handleParseSuccess = (file, parsedData) => {
    const skillsList = Array.isArray(parsedData.skills) ? parsedData.skills : []
    setExtractedSkills(skillsList)
    setParsedProfile({
      role: parsedData.detectedRole || 'Unknown',
      experience: parsedData.experience || 'Unknown',
      topSkills: skillsList.slice(0, 3).join(', ')
    })
    setAppState('ready_to_apply')
  }

  const handleStartApplying = async (preferences) => {
    setAppState('applying')
    try {
      const response = await fetch(`${API_BASE}/api/agent/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: preferences.role,
          location: preferences.location,
          experience: preferences.experience,
          skills: preferences.skills,
          dailyLimit: preferences.dailyLimit,
          matchThreshold: preferences.matchThreshold
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Server error: ${response.status}`)
      }

      const data = await response.json()
      const sessionExpired = data.some(log => log.status === 'Session Expired')
      if (sessionExpired) {
        setIsNaukriConnected(false)
      }
      setLogs(prev => [...data, ...prev])
      setAppState('completed')
    } catch (err) {
      console.error('Agent API call failed:', err)
      setAppState('ready_to_apply')
      throw err
    }
  }

  const handleConnectionChange = (connected) => {
    setIsNaukriConnected(connected)
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <Bot size={28} />
          </div>
          <h2 className="gradient-text">SmartHunter</h2>
        </div>

        <nav className="nav-links">
          <a href="#" className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('dashboard') }}>
            <LayoutDashboard size={20} /> Dashboard
          </a>
          <a href="#" className={`nav-item ${activeTab === 'resumes' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('resumes') }}>
            <FileText size={20} /> Resumes
          </a>
          <a href="#" className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('settings') }}>
            <Settings size={20} /> Settings
          </a>
        </nav>
      </aside>

      <main className="main-content">
        <header className="header">
          <div className="header-title">
            <h1>Welcome, Omkar</h1>
            <p>Let AI find and apply to your dream jobs automatically.</p>
          </div>
          <div className="agent-status-badge">
            <div className={`status-dot ${appState === 'applying' || appState === 'parsing' ? 'active animate-pulse' : ''} ${appState === 'completed' ? 'completed' : ''}`}></div>
            <span>Agent Status: <strong className="gradient-text">{STATUS_LABELS[appState]}</strong></span>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="dashboard-grid">
            <div className="left-column">
              <ResumeUpload
                onUploadStart={handleParseStart}
                onUpload={handleParseSuccess}
                appState={appState}
                skills={extractedSkills}
                parsedProfile={parsedProfile}
              />
              {appState !== 'idle' && appState !== 'parsing' && (
                <JobPreferences
                  onStartApplying={handleStartApplying}
                  isApplying={appState === 'applying'}
                  autoFilledSkills={extractedSkills}
                  isConnected={isNaukriConnected}
                  onConnectionChange={handleConnectionChange}
                />
              )}
            </div>

            <div className="right-column">
              <ApplicationLogs logs={logs} />
            </div>
          </div>
        )}

        {activeTab === 'resumes' && (
          <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
            <FileText size={48} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
            <h3 style={{ marginBottom: '8px' }}>Resume Manager</h3>
            <p style={{ color: 'var(--text-muted)' }}>Manage multiple resumes coming soon.</p>
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={{ maxWidth: '600px' }}>
            <SettingsPanel />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
