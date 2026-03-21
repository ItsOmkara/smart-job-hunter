import { useState, useRef, useEffect } from 'react'
import { KeyRound, Loader2, AlertTriangle, RefreshCw, X } from 'lucide-react'

export default function OtpModal({ isOpen, message, onSubmit, onCancel, isSubmitting, error }) {
    const [otp, setOtp] = useState('')
    const inputRef = useRef(null)

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus()
        }
        // Reset OTP when modal opens
        if (isOpen) setOtp('')
    }, [isOpen])

    if (!isOpen) return null

    const handleSubmit = (e) => {
        e.preventDefault()
        if (otp.trim().length >= 4) {
            onSubmit(otp.trim())
        }
    }

    const handleKeyDown = (e) => {
        // Only allow digits, backspace, delete, arrow keys, tab
        if (
            !/[0-9]/.test(e.key) &&
            !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)
        ) {
            e.preventDefault()
        }
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.3s ease-out'
        }}>
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '20px',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                padding: '36px',
                width: '100%',
                maxWidth: '440px',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(6, 182, 212, 0.1)',
                animation: 'slideIn 0.3s ease-out'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(139, 92, 246, 0.2))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <KeyRound size={24} color="var(--primary-cyan)" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>OTP Verification</h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Naukri.com login</p>
                        </div>
                    </div>
                    {!isSubmitting && (
                        <button
                            onClick={onCancel}
                            style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                padding: '8px',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                transition: 'all 0.2s'
                            }}
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>

                {/* Message */}
                <div style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    background: 'rgba(6, 182, 212, 0.08)',
                    border: '1px solid rgba(6, 182, 212, 0.15)',
                    marginBottom: '24px'
                }}>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                        🔐 {message || 'Please enter the OTP sent to your email/phone to complete login.'}
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        marginBottom: '16px'
                    }}>
                        <AlertTriangle size={18} color="var(--danger)" />
                        <p style={{ fontSize: '0.85rem', color: 'var(--danger)', margin: 0 }}>{error}</p>
                    </div>
                )}

                {/* OTP Input */}
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '10px',
                            fontSize: '0.88rem',
                            color: 'var(--text-muted)',
                            fontWeight: 500
                        }}>
                            Enter OTP Code
                        </label>
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            className="input-field"
                            placeholder="Enter 4-6 digit OTP"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            onKeyDown={handleKeyDown}
                            disabled={isSubmitting}
                            style={{
                                fontSize: '1.4rem',
                                textAlign: 'center',
                                letterSpacing: '0.5em',
                                fontWeight: 600,
                                padding: '16px',
                                fontFamily: 'monospace'
                            }}
                        />
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isSubmitting}
                            style={{
                                flex: 1,
                                padding: '14px',
                                borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-muted)',
                                fontSize: '0.9rem',
                                fontWeight: 500,
                                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                opacity: isSubmitting ? 0.5 : 1
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={isSubmitting || otp.length < 4}
                            style={{
                                flex: 2,
                                padding: '14px',
                                gap: '8px',
                                opacity: (isSubmitting || otp.length < 4) ? 0.6 : 1
                            }}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Verifying OTP...
                                </>
                            ) : error ? (
                                <>
                                    <RefreshCw size={18} />
                                    Retry OTP
                                </>
                            ) : (
                                <>
                                    <KeyRound size={18} />
                                    Submit OTP
                                </>
                            )}
                        </button>
                    </div>
                </form>

                {/* Help text */}
                <p style={{
                    textAlign: 'center',
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                    marginTop: '16px',
                    opacity: 0.7
                }}>
                    Check your email for the OTP from Naukri.com. The agent will resume automatically after verification.
                </p>
            </div>

            {/* Animation keyframes */}
            <style>{`
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
            `}</style>
        </div>
    )
}
