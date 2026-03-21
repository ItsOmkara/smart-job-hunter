import { Clock, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

export default function ApplicationLogs({ logs }) {
    const [expandedId, setExpandedId] = useState(null)

    const getStatusClass = (status) => {
        const s = status?.toLowerCase() || ''
        if (s === 'applied') return 'status-success'
        if (s.includes('external apply')) return 'status-info'
        if (s.includes('login required')) return 'status-warning'
        if (s.includes('login failed')) return 'status-danger'
        if (s.includes('captcha')) return 'status-warning'
        if (s.includes('unverified')) return 'status-warning'
        if (s === 'failed') return 'status-danger'
        if (s.includes('skipped')) return 'status-warning'
        return 'status-info'
    }

    const formatTime = (dateStr) => {
        if (!dateStr) return ''
        try {
            const date = new Date(dateStr)
            return date.toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return dateStr
        }
    }

    const getDecisionBreakdown = (log) => {
        const matchScore = log.matchScore || 0
        const status = log.status?.toLowerCase() || ''

        const items = []

        // Skills match
        items.push({
            icon: matchScore >= 60 ? '✔' : '❌',
            text: `Skills match: ${matchScore}%`,
            positive: matchScore >= 60
        })

        // Location
        if (log.location) {
            items.push({
                icon: '✔',
                text: `Location: ${log.location}`,
                positive: true
            })
        }

        // Status-specific breakdown
        if (status.includes('external apply')) {
            items.push({ icon: '🔗', text: 'Redirected to external company site', positive: false })
        } else if (status.includes('login required')) {
            items.push({ icon: '🔒', text: 'Login wall appeared — could not apply', positive: false })
        } else if (status.includes('login failed')) {
            items.push({ icon: '🔒', text: 'Login was not successful', positive: false })
        } else if (status.includes('captcha')) {
            items.push({ icon: '🤖', text: 'CAPTCHA/bot detection triggered', positive: false })
        } else if (status.includes('unverified')) {
            items.push({ icon: '⚠️', text: 'Clicked Apply but no confirmation text seen', positive: false })
        } else if (status === 'failed') {
            items.push({ icon: '❌', text: 'Application submission failed', positive: false })
        } else if (status.includes('skipped')) {
            items.push({ icon: '❌', text: 'Skipped this job', positive: false })
        }

        // AI Confidence
        const confidence = matchScore >= 80 ? 'HIGH' : matchScore >= 50 ? 'MEDIUM' : 'LOW'
        const confColor = confidence === 'HIGH' ? 'var(--success)' : confidence === 'MEDIUM' ? 'var(--warning)' : 'var(--danger)'

        return { items, confidence, confColor }
    }

    const toggleExpand = (id) => {
        setExpandedId(expandedId === id ? null : id)
    }

    return (
        <div className="glass-panel" style={{ padding: '24px', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3>Live Application Logs</h3>
                <span className="status-pill status-info">{logs.length} Applications</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {logs.map((log, index) => {
                    const logId = log.id || index
                    const isExpanded = expandedId === logId
                    const breakdown = getDecisionBreakdown(log)

                    return (
                        <div key={logId} className="glass-card" style={{ padding: '0', overflow: 'hidden', transition: 'all 0.3s ease' }}>
                            {/* Main Row */}
                            <div
                                style={{
                                    padding: '16px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    cursor: 'pointer'
                                }}
                                onClick={() => toggleExpand(logId)}
                            >
                                <div>
                                    <h4 style={{ fontSize: '1.05rem', marginBottom: '4px' }}>{log.role}</h4>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <strong style={{ color: 'var(--text-main)' }}>{log.company}</strong>
                                        {log.appliedAt && (
                                            <>
                                                <span>•</span>
                                                <Clock size={14} /> {formatTime(log.appliedAt)}
                                            </>
                                        )}
                                    </p>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span className={`status-pill ${getStatusClass(log.status)}`}>
                                        {log.status}
                                    </span>
                                    {log.jobUrl && (
                                        <a
                                            href={log.jobUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: 'var(--text-muted)', display: 'flex' }}
                                            title="View Job"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <ExternalLink size={16} />
                                        </a>
                                    )}
                                    {isExpanded
                                        ? <ChevronUp size={16} color="var(--text-muted)" />
                                        : <ChevronDown size={16} color="var(--text-muted)" />
                                    }
                                </div>
                            </div>

                            {/* Expanded Decision Breakdown */}
                            {isExpanded && (
                                <div style={{
                                    padding: '0 16px 16px 16px',
                                    borderTop: '1px solid var(--border-color)',
                                    paddingTop: '12px',
                                    animation: 'fadeIn 0.25s ease-out'
                                }}>
                                    <p style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
                                        Decision Breakdown
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {breakdown.items.map((item, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}>
                                                <span>{item.icon}</span>
                                                <span style={{ color: item.positive ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                                    {item.text}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    {log.statusDetail && (
                                        <div style={{
                                            marginTop: '10px',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            background: 'rgba(6, 182, 212, 0.05)',
                                            border: '1px solid rgba(6, 182, 212, 0.12)',
                                            fontSize: '0.8rem',
                                            color: 'var(--text-muted)',
                                            lineHeight: '1.4',
                                            wordBreak: 'break-word'
                                        }}>
                                            <span style={{ color: 'var(--primary-cyan)', fontWeight: 500 }}>Debug: </span>
                                            {log.statusDetail}
                                        </div>
                                    )}
                                    <div style={{
                                        marginTop: '10px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 12px',
                                        borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid var(--border-color)',
                                        fontSize: '0.82rem'
                                    }}>
                                        <span style={{ color: 'var(--text-muted)' }}>AI Confidence:</span>
                                        <strong style={{ color: breakdown.confColor }}>{breakdown.confidence}</strong>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}

                {logs.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                        <p>No applications fired yet.</p>
                        <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>Set your preferences and let the agent begin.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
