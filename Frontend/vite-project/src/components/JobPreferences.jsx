import { useState, useEffect } from 'react'
import { Search, MapPin, Briefcase, Code, Loader2, SlidersHorizontal, Plug, CheckCircle, XCircle, RefreshCw, Monitor } from 'lucide-react'

const API_BASE = 'http://localhost:8080'

export default function JobPreferences({ onStartApplying, isApplying, autoFilledSkills, isConnected, onConnectionChange }) {
    const [preferences, setPreferences] = useState({
        role: '',
        location: '',
        experience: 'entry',
        skills: ''
    })
    const [matchThreshold, setMatchThreshold] = useState(() => {
        const stored = localStorage.getItem('matchThreshold')
        return stored ? Number(stored) : 25
    })
    const [error, setError] = useState('')
    const [connectionStatus, setConnectionStatus] = useState('checking')
    const [sessionSavedAt, setSessionSavedAt] = useState(null)

    useEffect(() => {
        checkSessionStatus()
        // Sync settings from localStorage (picks up changes from SettingsPanel)
        const storedThreshold = localStorage.getItem('matchThreshold')
        if (storedThreshold) setMatchThreshold(Number(storedThreshold))
    }, [])

    useEffect(() => {
        if (autoFilledSkills && autoFilledSkills.length > 0 && !preferences.skills) {
            setPreferences(prev => ({ ...prev, skills: autoFilledSkills.join(', ') }))
        }
    }, [autoFilledSkills])

    const checkSessionStatus = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/session/status/naukri`)
            const data = await response.json()
            if (data.connected) {
                setConnectionStatus('connected')
                setSessionSavedAt(data.savedAt)
                onConnectionChange?.(true)
            } else if (connectionStatus !== 'connecting') {
                setConnectionStatus('disconnected')
                onConnectionChange?.(false)
            }
        } catch (err) {
            console.error('Failed to check session status:', err)
            if (connectionStatus !== 'connecting') {
                setConnectionStatus('disconnected')
                onConnectionChange?.(false)
            }
        }
    }

    const handleConnectNaukri = async () => {
        setConnectionStatus('connecting')
        setError('')
        try {
            // Backend blocks until login completes (Playwright opens local browser)
            const response = await fetch(`${API_BASE}/api/session/connect/naukri`, { method: 'POST' })
            const data = await response.json()

            if (data.status === 'connected') {
                setConnectionStatus('connected')
                setSessionSavedAt(new Date().toISOString())
                onConnectionChange?.(true)
            } else {
                setConnectionStatus('disconnected')
                const errorType = data.errorType || 'UNKNOWN'
                let errorMsg = data.message || 'Failed to connect. Please try again.'
                if (errorType === 'TIMEOUT') {
                    errorMsg = '⏱️ Login timed out. Please try again and complete login within 5 minutes.'
                }
                setError(errorMsg)
                onConnectionChange?.(false)
            }
        } catch (err) {
            console.error('Connect failed:', err)
            setConnectionStatus('disconnected')
            setError('❌ Connection failed. Make sure the backend is running on localhost:8080.')
            onConnectionChange?.(false)
        }
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setPreferences(prev => ({ ...prev, [name]: value }))
        setError('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!preferences.role || !preferences.location) {
            setError('Please fill in all required fields.')
            return
        }
        if (connectionStatus !== 'connected') {
            setError('Please connect Naukri first before applying.')
            return
        }
        setError('')
        try {
            // Always read BOTH settings from localStorage at submit time
            // so they reflect whatever the user last saved in Settings
            const storedLimit = localStorage.getItem('dailyLimit')
            const storedThreshold = localStorage.getItem('matchThreshold')
            const finalDailyLimit = storedLimit ? Number(storedLimit) : 5
            const finalThreshold = storedThreshold ? Number(storedThreshold) : matchThreshold
            console.log(`[JobPreferences] Submitting with dailyLimit=${finalDailyLimit}, matchThreshold=${finalThreshold}`)
            await onStartApplying({ ...preferences, matchThreshold: finalThreshold, dailyLimit: finalDailyLimit })
        } catch (err) {
            setError(err.message || 'Something went wrong. Please try again.')
            checkSessionStatus()
        }
    }

    const getConnectionUI = () => {
        switch (connectionStatus) {
            case 'checking':
                return { icon: <Loader2 size={18} className="animate-spin" />, text: 'Checking session...', color: 'var(--text-muted)', bgColor: 'rgba(148, 163, 184, 0.08)', borderColor: 'rgba(148, 163, 184, 0.15)' }
            case 'connecting':
                return {
                    icon: <Loader2 size={18} className="animate-spin" />,
                    text: 'Browser opened — please login in the Chromium window.',
                    color: 'var(--primary-cyan)',
                    bgColor: 'rgba(6, 182, 212, 0.08)',
                    borderColor: 'rgba(6, 182, 212, 0.2)'
                }
            case 'connected':
                return { icon: <CheckCircle size={18} />, text: 'Connected \u2705 Session active', subtext: sessionSavedAt ? `Since ${new Date(sessionSavedAt).toLocaleString('en-IN')}` : '', color: 'var(--success)', bgColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.2)' }
            case 'expired':
                return { icon: <RefreshCw size={18} />, text: 'Session expired \uD83D\uDD04 Reconnect', color: 'var(--warning)', bgColor: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.2)' }
            default:
                return { icon: <XCircle size={18} />, text: 'Not connected \u274C', color: 'var(--danger)', bgColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.15)' }
        }
    }

    const connUI = getConnectionUI()

    return (
        <div className="glass-panel" style={{ padding: '24px', animation: 'fadeIn 0.5s ease-out' }}>
            <h3 style={{ marginBottom: '20px' }}>2. Job Preferences & Connect</h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Naukri Connection Section */}
                <div style={{ padding: '16px', borderRadius: '12px', background: connUI.bgColor, border: `1px solid ${connUI.borderColor}`, transition: 'all 0.3s ease' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--primary-cyan)', marginBottom: '12px', fontWeight: 500 }}>
                        {'🔗'} Naukri.com Session
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: connUI.color, fontSize: '0.9rem', fontWeight: 500 }}>
                        {connUI.icon}
                        <span>{connUI.text}</span>
                    </div>
                    {connUI.subtext && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '10px', marginLeft: '26px' }}>{connUI.subtext}</p>
                    )}

                    {(connectionStatus === 'disconnected' || connectionStatus === 'expired') && (
                        <button type="button" onClick={handleConnectNaukri} className="btn-connect" disabled={isApplying}>
                            <Plug size={16} />
                            {connectionStatus === 'expired' ? 'Reconnect Naukri' : 'Connect Naukri'}
                        </button>
                    )}

                    {connectionStatus === 'connected' && (
                        <button type="button" onClick={handleConnectNaukri} disabled={isApplying}
                            style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-main)', transition: 'all 0.2s ease' }}>
                            <RefreshCw size={12} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            Refresh Session
                        </button>
                    )}

                    {connectionStatus === 'connecting' && (
                        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.1)', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <Monitor size={16} color="var(--primary-cyan)" />
                                <span style={{ fontWeight: 600, color: 'var(--primary-cyan)' }}>A Chromium window opened on your machine.</span>
                            </div>
                            <p style={{ marginTop: '4px' }}>1. Enter your Naukri credentials in the browser</p>
                            <p>2. Complete OTP/CAPTCHA if prompted</p>
                            <p>3. Once you reach the dashboard, the session will be captured automatically</p>
                            <p style={{ marginTop: '8px', color: 'var(--primary-cyan)', fontWeight: 500 }}>
                                {'⏳'} Waiting for you to complete login...
                            </p>
                        </div>
                    )}
                </div>

                {/* Role */}
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Target Role *</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input type="text" name="role" className="input-field" placeholder="e.g. Full Stack Developer" value={preferences.role} onChange={handleChange} style={{ paddingLeft: '40px' }} disabled={isApplying} required />
                    </div>
                </div>

                {/* Location + Experience */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Location(s) *</label>
                        <div style={{ position: 'relative' }}>
                            <MapPin size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input type="text" name="location" className="input-field" placeholder="e.g. Pune, Bangalore, Remote" value={preferences.location} onChange={handleChange} style={{ paddingLeft: '40px' }} disabled={isApplying} required />
                        </div>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', opacity: 0.8 }}>
                            {'💡'} Separation multiple cities with commas. Agent will search each one.
                        </p>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Experience</label>
                        <div style={{ position: 'relative' }}>
                            <Briefcase size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            <select name="experience" className="input-field" value={preferences.experience} onChange={handleChange} style={{ paddingLeft: '40px', appearance: 'none' }} disabled={isApplying}>
                                <option value="entry">Entry Level (0-2 Yrs)</option>
                                <option value="mid">Mid Level (3-5 Yrs)</option>
                                <option value="senior">Senior (5+ Yrs)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Skills */}
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Edit / Override Skills (Optional)</label>
                    <div style={{ position: 'relative' }}>
                        <Code size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input type="text" name="skills" className="input-field" placeholder="e.g. React, Java, Spring Boot" value={preferences.skills} onChange={handleChange} style={{ paddingLeft: '40px' }} disabled={isApplying} />
                    </div>
                    {autoFilledSkills && autoFilledSkills.length > 0 && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--primary-cyan)', marginTop: '6px', opacity: 0.8 }}>
                            {'✨'} Auto-filled from your resume. Edit if needed.
                        </p>
                    )}
                </div>

                {/* Match Threshold Slider */}
                <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            <SlidersHorizontal size={16} color="var(--primary-cyan)" />
                            Match Threshold
                        </label>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: matchThreshold >= 80 ? 'var(--success)' : matchThreshold >= 60 ? 'var(--warning)' : 'var(--danger)', background: matchThreshold >= 80 ? 'rgba(16, 185, 129, 0.1)' : matchThreshold >= 60 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '3px 10px', borderRadius: '12px' }}>
                            {matchThreshold}%
                        </span>
                    </div>
                    <input type="range" min="20" max="100" step="5" value={matchThreshold} onChange={(e) => setMatchThreshold(Number(e.target.value))} disabled={isApplying} style={{ width: '100%', accentColor: 'var(--primary-cyan)', height: '6px', cursor: 'pointer' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>20%</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Apply if match {'≥'} {matchThreshold}%</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>100%</span>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.85rem', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>{error}</p>
                )}

                {/* Submit Button */}
                <button type="submit" className="btn-primary" style={{ marginTop: '8px', width: '100%', padding: '14px' }} disabled={isApplying || !preferences.role || !preferences.location || connectionStatus !== 'connected'}>
                    {isApplying ? (
                        <><Loader2 size={20} className="animate-spin" /> Agent Working... (may take 5-7 min)</>
                    ) : connectionStatus !== 'connected' ? (
                        '🔒 Connect Naukri First'
                    ) : (
                        'Start Autonomous Applying'
                    )}
                </button>

                {isApplying && (
                    <div style={{ textAlign: 'center', padding: '12px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.15)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <p>{'🤖'} The AI agent is browsing Naukri.com using your saved session, searching for jobs, and applying on your behalf.</p>
                        <p style={{ marginTop: '4px', color: 'var(--primary-cyan)' }}>Please wait — this usually takes 5-7 minutes.</p>
                    </div>
                )}
            </form>
        </div>
    )
}
