import { useState } from 'react'
import { Globe, Gauge, ToggleLeft, ToggleRight, Save, SlidersHorizontal } from 'lucide-react'

export default function SettingsPanel() {
    const [platforms, setPlatforms] = useState({
        naukri: true,
        linkedin: false,
        foundit: false
    })
    const [dailyLimit, setDailyLimit] = useState(() => {
        const stored = localStorage.getItem('dailyLimit')
        return stored ? Number(stored) : 10
    })
    const [matchThreshold, setMatchThreshold] = useState(() => {
        const stored = localStorage.getItem('matchThreshold')
        return stored ? Number(stored) : 60
    })
    const [autoApply, setAutoApply] = useState(false)
    const [saved, setSaved] = useState(false)

    const togglePlatform = (key) => {
        setPlatforms(prev => ({ ...prev, [key]: !prev[key] }))
        setSaved(false)
    }

    const handleSave = () => {
        localStorage.setItem('dailyLimit', dailyLimit)
        localStorage.setItem('matchThreshold', matchThreshold)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    return (
        <div className="glass-panel" style={{ padding: '24px', animation: 'fadeIn 0.5s ease-out' }}>
            <h3 style={{ marginBottom: '24px' }}>Settings</h3>

            {/* Preferred Platforms */}
            <div style={{ marginBottom: '24px' }}>
                <label style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '14px', fontWeight: 500
                }}>
                    <Globe size={16} color="var(--primary-cyan)" />
                    Preferred Platforms
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                        { key: 'naukri', label: 'Naukri.com', available: true },
                        { key: 'linkedin', label: 'LinkedIn', available: false },
                        { key: 'foundit', label: 'Foundit (Monster)', available: false }
                    ].map(({ key, label, available }) => (
                        <label
                            key={key}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                background: platforms[key] ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${platforms[key] ? 'rgba(6, 182, 212, 0.2)' : 'var(--border-color)'}`,
                                cursor: available ? 'pointer' : 'not-allowed',
                                opacity: available ? 1 : 0.5,
                                transition: 'all 0.2s ease'
                            }}
                            onClick={() => available && togglePlatform(key)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input
                                    type="checkbox"
                                    checked={platforms[key]}
                                    readOnly
                                    disabled={!available}
                                    style={{ accentColor: 'var(--primary-cyan)', width: '16px', height: '16px' }}
                                />
                                <span style={{ fontSize: '0.9rem' }}>{label}</span>
                            </div>
                            {!available && (
                                <span style={{
                                    fontSize: '0.7rem', padding: '2px 8px',
                                    borderRadius: '8px', background: 'rgba(255,255,255,0.05)',
                                    color: 'var(--text-muted)'
                                }}>
                                    Coming Soon
                                </span>
                            )}
                        </label>
                    ))}
                </div>
            </div>

            {/* Daily Application Limit */}
            <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500
                    }}>
                        <Gauge size={16} color="var(--primary-cyan)" />
                        Daily Application Limit
                    </label>
                    <span style={{
                        fontSize: '0.85rem', fontWeight: 600,
                        color: 'var(--primary-cyan)',
                        background: 'rgba(6, 182, 212, 0.1)',
                        padding: '3px 12px', borderRadius: '12px'
                    }}>
                        {dailyLimit} / day
                    </span>
                </div>
                <input
                    type="range"
                    min="1"
                    max="20"
                    step="1"
                    value={dailyLimit}
                    onChange={(e) => { setDailyLimit(Number(e.target.value)); setSaved(false) }}
                    style={{
                        width: '100%',
                        accentColor: 'var(--primary-cyan)',
                        height: '6px',
                        cursor: 'pointer'
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>20</span>
                </div>
            </div>

            {/* Match Threshold Slider */}
            <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500
                    }}>
                        <SlidersHorizontal size={16} color="var(--primary-cyan)" />
                        Match Threshold
                    </label>
                    <span style={{
                        fontSize: '0.85rem', fontWeight: 600,
                        color: matchThreshold >= 80 ? 'var(--success)' : matchThreshold >= 60 ? 'var(--warning)' : 'var(--danger)',
                        background: matchThreshold >= 80
                            ? 'rgba(16, 185, 129, 0.1)'
                            : matchThreshold >= 60
                                ? 'rgba(245, 158, 11, 0.1)'
                                : 'rgba(239, 68, 68, 0.1)',
                        padding: '3px 12px', borderRadius: '12px'
                    }}>
                        {matchThreshold}%
                    </span>
                </div>
                <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={matchThreshold}
                    onChange={(e) => { setMatchThreshold(Number(e.target.value)); setSaved(false) }}
                    style={{
                        width: '100%',
                        accentColor: 'var(--primary-cyan)',
                        height: '6px',
                        cursor: 'pointer'
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>20%</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Apply if match ≥ {matchThreshold}%
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>100%</span>
                </div>
            </div>

            {/* Auto-Apply Toggle */}
            <div style={{ marginBottom: '24px' }}>
                <div
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 16px',
                        borderRadius: '12px',
                        background: autoApply ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${autoApply ? 'rgba(16, 185, 129, 0.2)' : 'var(--border-color)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}
                    onClick={() => { setAutoApply(!autoApply); setSaved(false) }}
                >
                    <div>
                        <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>Auto-Apply Mode</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Automatically apply when match ≥ threshold
                        </p>
                    </div>
                    {autoApply
                        ? <ToggleRight size={28} color="var(--success)" />
                        : <ToggleLeft size={28} color="var(--text-muted)" />
                    }
                </div>
            </div>

            {/* Save Button */}
            <button
                className="btn-primary"
                onClick={handleSave}
                style={{ width: '100%', padding: '12px', gap: '8px' }}
            >
                <Save size={18} />
                {saved ? '✅ Settings Saved!' : 'Save Settings'}
            </button>
        </div>
    )
}
