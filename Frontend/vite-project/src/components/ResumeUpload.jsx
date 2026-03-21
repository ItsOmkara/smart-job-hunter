import { useState } from 'react'
import { UploadCloud, File, CheckCircle, Briefcase, MapPin, Code } from 'lucide-react'

export default function ResumeUpload({ onUploadStart, onUpload, appState, skills, parsedProfile }) {
    const [dragActive, setDragActive] = useState(false)
    const [selectedFile, setSelectedFile] = useState(null)

    const handleDrag = (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true)
        } else if (e.type === "dragleave") {
            setDragActive(false)
        }
    }

    const handleDrop = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0])
        }
    }

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0])
        }
    }

    const handleFile = async (file) => {
        setSelectedFile(file)
        if (onUploadStart) onUploadStart()

        try {
            const formData = new FormData()
            formData.append('file', file)

            const response = await fetch('http://localhost:8080/api/resume/parse', {
                method: 'POST',
                body: formData
            })

            if (!response.ok) {
                throw new Error('Failed to parse resume')
            }

            const data = await response.json()
            onUpload(file, data)
        } catch (error) {
            console.error('Error parsing resume:', error)
            alert('Failed to extract data from resume. Make sure backend is running.')
        }
    }

    return (
        <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px' }}>1. Upload Resume</h3>

            {appState === 'idle' && (
                <div
                    className={`upload-zone glass-card ${dragActive ? 'active' : ''}`}
                    style={{
                        padding: '40px 20px',
                        textAlign: 'center',
                        borderStyle: dragActive ? 'solid' : 'dashed',
                        borderColor: dragActive ? 'var(--primary-cyan)' : 'var(--border-color)',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                    }}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('file-upload').click()}
                >
                    <UploadCloud size={48} color="var(--primary-cyan)" style={{ marginBottom: '16px' }} />
                    <h4>Drag & Drop your resume</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '8px' }}>PDF or DOCX (Max 5MB)</p>
                    <input
                        id="file-upload"
                        type="file"
                        accept=".pdf,.docx"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />
                </div>
            )}

            {appState === 'parsing' && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <div className="animate-spin" style={{ display: 'inline-block', marginBottom: '16px' }}>
                        <UploadCloud size={40} color="var(--primary-cyan)" />
                    </div>
                    <h4>AI is reading your resume...</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '8px' }}>Extracting skills & experience from {selectedFile?.name}</p>
                </div>
            )}

            {(appState === 'ready_to_apply' || appState === 'applying' || appState === 'completed') && (
                <div>
                    {/* Success banner */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', padding: '16px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <CheckCircle color="var(--success)" />
                        <div>
                            <p style={{ fontWeight: 500, color: 'var(--success)' }}>Resume Parsed Successfully</p>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{selectedFile?.name}</p>
                        </div>
                    </div>

                    {/* Detected Profile Summary */}
                    {parsedProfile && (
                        <div style={{
                            padding: '16px',
                            borderRadius: '12px',
                            background: 'rgba(6, 182, 212, 0.05)',
                            border: '1px solid rgba(6, 182, 212, 0.12)',
                            marginBottom: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                        }}>
                            <p style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary-cyan)', fontWeight: 600, marginBottom: '2px' }}>
                                AI-Detected Profile
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Briefcase size={15} color="var(--text-muted)" />
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Detected Role:</span>
                                <strong style={{ fontSize: '0.9rem' }}>{parsedProfile.role}</strong>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MapPin size={15} color="var(--text-muted)" />
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Experience:</span>
                                <strong style={{ fontSize: '0.9rem' }}>{parsedProfile.experience}</strong>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Code size={15} color="var(--text-muted)" />
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Top Skills:</span>
                                <strong style={{ fontSize: '0.9rem' }}>{parsedProfile.topSkills}</strong>
                            </div>
                        </div>
                    )}

                    {/* Extracted skill pills */}
                    <h4 style={{ marginBottom: '12px', fontSize: '0.95rem', color: 'var(--text-muted)' }}>Extracted Skills</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {skills.map((skill, index) => (
                            <span key={index} style={{
                                background: 'rgba(6, 182, 212, 0.1)',
                                color: 'var(--primary-cyan)',
                                padding: '6px 12px',
                                borderRadius: '16px',
                                border: '1px solid rgba(6, 182, 212, 0.2)',
                                fontSize: '0.85rem'
                            }}>
                                {skill}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
