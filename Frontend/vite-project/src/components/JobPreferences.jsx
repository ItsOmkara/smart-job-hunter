import { useState, useEffect } from 'react'
import { Search, MapPin, Briefcase, Mail, Lock, Code, Loader2, SlidersHorizontal } from 'lucide-react'

export default function JobPreferences({ onStartApplying, isApplying, autoFilledSkills }) {
    const [preferences, setPreferences] = useState({
        role: '',
        location: '',
        experience: 'entry',
        skills: '',
        naukriEmail: '',
        naukriPassword: ''
    })
    const [matchThreshold, setMatchThreshold] = useState(() => {
        const stored = localStorage.getItem('matchThreshold')
        return stored ? Number(stored) : 60
    })
    const [error, setError] = useState('')

    // Auto-fill skills from resume parsing
    useEffect(() => {
        if (autoFilledSkills && autoFilledSkills.length > 0 && !preferences.skills) {
            setPreferences(prev => ({ ...prev, skills: autoFilledSkills.join(', ') }))
        }
    }, [autoFilledSkills])

    const handleChange = (e) => {
        const { name, value } = e.target
        setPreferences(prev => ({ ...prev, [name]: value }))
        setError('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!preferences.role || !preferences.location || !preferences.naukriEmail || !preferences.naukriPassword) {
            setError('Please fill in all required fields.')
            return
        }

        setError('')
        try {
            const dailyLimit = localStorage.getItem('dailyLimit') || 5
            await onStartApplying({ ...preferences, matchThreshold, dailyLimit: Number(dailyLimit) })
        } catch (err) {
            setError(err.message || 'Something went wrong. Please try again.')
        }
    }

    return (
        <div className="glass-panel" style={{ padding: '24px', animation: 'fadeIn 0.5s ease-out' }}>
            <h3 style={{ marginBottom: '20px' }}>2. Job Preferences & Login</h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Role */}
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Target Role *</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            name="role"
                            className="input-field"
                            placeholder="e.g. Full Stack Developer"
                            value={preferences.role}
                            onChange={handleChange}
                            style={{ paddingLeft: '40px' }}
                            disabled={isApplying}
                            required
                        />
                    </div>
                </div>

                {/* Location + Experience */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Location *</label>
                        <div style={{ position: 'relative' }}>
                            <MapPin size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                name="location"
                                className="input-field"
                                placeholder="e.g. Remote, India"
                                value={preferences.location}
                                onChange={handleChange}
                                style={{ paddingLeft: '40px' }}
                                disabled={isApplying}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Experience</label>
                        <div style={{ position: 'relative' }}>
                            <Briefcase size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            <select
                                name="experience"
                                className="input-field"
                                value={preferences.experience}
                                onChange={handleChange}
                                style={{ paddingLeft: '40px', appearance: 'none' }}
                                disabled={isApplying}
                            >
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
                        <input
                            type="text"
                            name="skills"
                            className="input-field"
                            placeholder="e.g. React, Java, Spring Boot"
                            value={preferences.skills}
                            onChange={handleChange}
                            style={{ paddingLeft: '40px' }}
                            disabled={isApplying}
                        />
                    </div>
                    {autoFilledSkills && autoFilledSkills.length > 0 && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--primary-cyan)', marginTop: '6px', opacity: 0.8 }}>
                            ✨ Auto-filled from your resume. Edit if needed.
                        </p>
                    )}
                </div>

                {/* Match Threshold Slider */}
                <div style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            <SlidersHorizontal size={16} color="var(--primary-cyan)" />
                            Match Threshold
                        </label>
                        <span style={{
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: matchThreshold >= 80 ? 'var(--success)' : matchThreshold >= 60 ? 'var(--warning)' : 'var(--danger)',
                            background: matchThreshold >= 80
                                ? 'rgba(16, 185, 129, 0.1)'
                                : matchThreshold >= 60
                                    ? 'rgba(245, 158, 11, 0.1)'
                                    : 'rgba(239, 68, 68, 0.1)',
                            padding: '3px 10px',
                            borderRadius: '12px'
                        }}>
                            {matchThreshold}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min="50"
                        max="100"
                        step="5"
                        value={matchThreshold}
                        onChange={(e) => setMatchThreshold(Number(e.target.value))}
                        disabled={isApplying}
                        style={{
                            width: '100%',
                            accentColor: 'var(--primary-cyan)',
                            height: '6px',
                            cursor: 'pointer'
                        }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>50%</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Apply if match ≥ {matchThreshold}%
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>100%</span>
                    </div>
                </div>

                {/* Naukri Credentials */}
                <div style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'rgba(6, 182, 212, 0.05)',
                    border: '1px solid rgba(6, 182, 212, 0.15)'
                }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--primary-cyan)', marginBottom: '12px', fontWeight: 500 }}>
                        🔐 Naukri.com Login Credentials
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Email *</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="email"
                                    name="naukriEmail"
                                    className="input-field"
                                    placeholder="your@email.com"
                                    value={preferences.naukriEmail}
                                    onChange={handleChange}
                                    style={{ paddingLeft: '36px', fontSize: '0.9rem' }}
                                    disabled={isApplying}
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Password *</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="password"
                                    name="naukriPassword"
                                    className="input-field"
                                    placeholder="••••••••"
                                    value={preferences.naukriPassword}
                                    onChange={handleChange}
                                    style={{ paddingLeft: '36px', fontSize: '0.9rem' }}
                                    disabled={isApplying}
                                    required
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.85rem', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
                        {error}
                    </p>
                )}

                {/* Submit Button */}
                <button
                    type="submit"
                    className="btn-primary"
                    style={{ marginTop: '8px', width: '100%', padding: '14px' }}
                    disabled={isApplying || !preferences.role || !preferences.location || !preferences.naukriEmail || !preferences.naukriPassword}
                >
                    {isApplying ? (
                        <>
                            <Loader2 size={20} className="animate-spin" />
                            Agent Working... (may take 5-7 min)
                        </>
                    ) : (
                        'Start Autonomous Applying'
                    )}
                </button>

                {/* Loading hint */}
                {isApplying && (
                    <div style={{
                        textAlign: 'center',
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'rgba(6, 182, 212, 0.08)',
                        border: '1px solid rgba(6, 182, 212, 0.15)',
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)'
                    }}>
                        <p>🤖 The AI agent is browsing Naukri.com, searching for jobs, and applying on your behalf.</p>
                        <p style={{ marginTop: '4px', color: 'var(--primary-cyan)' }}>Please wait — this usually takes 5-7 minutes.</p>
                    </div>
                )}
            </form>
        </div>
    )
}
