<p align="center">
  <img src="Frontend/vite-project/src/assets/react.svg" width="80" alt="Smart Job Hunter Logo" />
</p>

<h1 align="center">🤖 Smart Job Hunter</h1>

<p align="center">
  <b>An AI-powered, full-stack job application automation platform that uses LLMs and browser automation to search, evaluate, and apply to jobs on your behalf.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Java-21-orange?logo=openjdk" />
  <img src="https://img.shields.io/badge/Spring%20Boot-3.5-green?logo=spring-boot" />
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" />
  <img src="https://img.shields.io/badge/Vite-8-purple?logo=vite" />
  <img src="https://img.shields.io/badge/MongoDB-Database-47A248?logo=mongodb" />
  <img src="https://img.shields.io/badge/Playwright-Automation-2EAD33?logo=playwright" />
  <img src="https://img.shields.io/badge/Groq%20LLM-AI%20Brain-FF6F00" />
</p>

---

## 📋 Table of Contents
- [Overview](#-overview)
- [Architecture](#-architecture)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [How It Works](#-how-it-works)
- [Configuration](#-configuration)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

**Smart Job Hunter** is a full-stack platform that automates the job application process on [Naukri.com](https://www.naukri.com). Upload your resume, set your preferences, and let the AI agent handle the rest — from searching for relevant roles, to scoring job matches against your skills, to clicking "Apply" on your behalf.

The system combines:
- **LLM-powered resume parsing** (Groq API + Llama) to extract skills, experience, and role from your PDF resume.
- **Hybrid browser automation** (Playwright) using both deterministic scripts and LLM-driven decision-making for navigating complex, dynamic web pages.
- **Intelligent job matching** with skill synonym expansion, role allowlists, and configurable match thresholds.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     React Frontend (Vite)                    │
│  ┌─────────────┬──────────────┬─────────────┬──────────────┐ │
│  │ResumeUpload │JobPreferences│ AppLogs     │ Settings     │ │
│  └──────┬──────┴──────┬───────┴──────┬──────┴──────┬───────┘ │
└─────────┼─────────────┼──────────────┼─────────────┼─────────┘
          │  REST API   │              │             │
┌─────────▼─────────────▼──────────────▼─────────────▼─────────┐
│                 Spring Boot Backend (Java 21)                 │
│  ┌───────────────┬─────────────────┬───────────────────────┐  │
│  │ResumeController│AgentController │SessionController      │  │
│  │  (PDF → LLM)   │ (Start Agent) │ (Naukri Login/Session)│  │
│  └───────┬────────┴───────┬────────┴───────────┬──────────┘  │
│          │                │                    │              │
│  ┌───────▼────────────────▼────────────────────▼──────────┐  │
│  │              PlaywrightService                          │  │
│  │   Spawns Node.js scripts as child processes             │  │
│  └────────────────────────┬───────────────────────────────┘  │
└───────────────────────────┼──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│              Playwright Automation Scripts (Node.js)          │
│  ┌──────────┬──────────┬──────────────┬────────────────────┐ │
│  │ login.js │ apply.js │  agent.js    │   llm-brain.js     │ │
│  │ (Manual  │(Legacy   │(Hybrid v5.0)│  (Groq LLM Client) │ │
│  │  Login)  │ Apply)   │ Deterministic│  decideAction()   │ │
│  │          │          │ + LLM Agent  │  parseAction()    │ │
│  └──────────┴──────────┴──────────────┴────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │   MongoDB     │
                    │ (Sessions,    │
                    │  App Logs)    │
                    └───────────────┘
```

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 📄 **AI Resume Parsing** | Upload a PDF resume → PDFBox extracts text → Groq LLM extracts name, skills, experience, and detected role |
| 🔐 **Session Management** | Playwright opens a real Chromium browser for manual Naukri.com login; session is persisted and reused across runs |
| 🤖 **Hybrid Automation Agent** | Deterministic logic for search/navigation + LLM-driven decisions for complex UI interactions (modals, questionnaires) |
| 🎯 **Smart Job Matching** | Skill synonym expansion (e.g., "JS" → "JavaScript"), role allowlists, and configurable match threshold (20-100%) |
| 🛡 **Anti-Detection** | Stealth scripts, randomized viewports, humanized mouse movements (Bézier curves), and natural typing delays |
| 📊 **Application Logs** | Real-time dashboard showing applied/skipped/failed jobs with match scores and status details |
| ⚙️ **Configurable Settings** | Daily application limit, match threshold, and skill overrides — all adjustable from the UI |
| 🔄 **Session Expiry Handling** | Auto-detects expired sessions and prompts reconnection |

---

## 🛠 Tech Stack

### Backend
| Technology | Purpose |
|-----------|---------|
| **Java 21** | Primary backend language |
| **Spring Boot 3.5** | REST API framework |
| **Spring WebFlux** | Non-blocking HTTP client for Groq API calls |
| **MongoDB** | Stores user sessions and application logs |
| **Apache PDFBox 3.x** | PDF text extraction from resumes |
| **Lombok** | Reduces boilerplate (DTOs, models) |

### Frontend
| Technology | Purpose |
|-----------|---------|
| **React 19** | UI library |
| **Vite 8** | Build tool & dev server |
| **Lucide React** | Icon library |
| **Vanilla CSS** | Custom glassmorphism dark theme |

### Automation
| Technology | Purpose |
|-----------|---------|
| **Playwright** | Browser automation (Chromium) |
| **Groq API** | LLM inference (Llama 4 Scout) |
| **Node.js** | Script runtime for automation agents |

---

## 📁 Project Structure

```
smart-job-hunter/
├── Frontend/
│   └── vite-project/
│       ├── src/
│       │   ├── App.jsx                # Main app with tab navigation
│       │   ├── App.css                # Glassmorphism dark theme
│       │   ├── index.css              # Global styles
│       │   ├── components/
│       │   │   ├── ResumeUpload.jsx   # PDF upload + AI parsing
│       │   │   ├── JobPreferences.jsx # Role, location, skills + Naukri connect
│       │   │   ├── ApplicationLogs.jsx# Real-time job application logs
│       │   │   ├── SettingsPanel.jsx  # Daily limit & threshold config
│       │   │   └── OtpModal.jsx       # OTP handling modal
│       │   └── assets/
│       └── package.json
│
├── job-hunter/                         # Spring Boot Backend
│   ├── src/main/java/com/omkar/jobhunter/
│   │   ├── Application.java           # Spring Boot entry point
│   │   ├── config/
│   │   │   └── WebConfig.java         # CORS configuration
│   │   ├── controller/
│   │   │   ├── ResumeController.java  # POST /api/resume/parse
│   │   │   ├── AgentController.java   # POST /api/agent/start
│   │   │   └── SessionController.java # POST /api/session/connect/naukri
│   │   ├── dto/
│   │   │   ├── AgentRequest.java      # Agent start request DTO
│   │   │   ├── AgentResponse.java     # Agent response DTO
│   │   │   └── OtpSubmitRequest.java  # OTP submission DTO
│   │   ├── model/
│   │   │   ├── ApplicationLog.java    # MongoDB document for job logs
│   │   │   └── UserSession.java       # MongoDB document for sessions
│   │   ├── repository/
│   │   │   ├── ApplicationLogRepository.java
│   │   │   └── UserSessionRepository.java
│   │   └── service/
│   │       └── PlaywrightService.java # Spawns Node.js automation scripts
│   ├── scripts/                       # Playwright Automation
│   │   ├── agent.js                   # Hybrid v5.0 — main automation agent
│   │   ├── apply.js                   # Legacy apply script
│   │   ├── login.js                   # Manual login via Playwright
│   │   ├── llm-brain.js              # Groq LLM client (decideAction)
│   │   └── package.json
│   └── pom.xml
│
├── .gitignore
└── README.md
```

---

## 📋 Prerequisites

- **Java 21** (JDK)
- **Node.js 18+** and npm
- **MongoDB** (running locally on port `27017`)
- **Groq API Key** — [Get one free at groq.com](https://console.groq.com/keys)
- **Maven** (or use the included `mvnw` wrapper)

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/ItsOmkara/smart-job-hunter.git
cd smart-job-hunter
```

### 2. Configure the backend

Create `job-hunter/src/main/resources/application.properties`:

```properties
spring.data.mongodb.uri=mongodb://localhost:27017/jobhunter
spring.data.mongodb.database=jobhunter

# Playwright config
playwright.scripts.dir=scripts
playwright.browser.datadir=browser-data

# Groq API (for resume parsing + LLM agent)
groq.api.key=YOUR_GROQ_API_KEY_HERE
groq.model=meta-llama/llama-4-scout-17b-16e-instruct
```

### 3. Install & run the backend

```bash
cd job-hunter
./mvnw spring-boot:run
```

The API server starts at `http://localhost:8080`.

### 4. Install Playwright browsers

```bash
cd job-hunter/scripts
npm install
npx playwright install chromium
```

### 5. Install & run the frontend

```bash
cd Frontend/vite-project
npm install
npm run dev
```

The frontend starts at `http://localhost:5173`.

### 6. Use the app

1. **Upload Resume** — Drop your PDF on the dashboard. The AI extracts your skills and role automatically.
2. **Connect Naukri** — Click "Connect Naukri" to open a Chromium window. Log in manually; the session is captured automatically.
3. **Set Preferences** — Choose target role, location(s), experience level, and adjust the match threshold.
4. **Start Applying** — Click "Start Autonomous Applying" and watch the logs roll in!

---

## 📡 API Reference

### Resume

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/resume/parse` | Upload PDF resume → returns extracted JSON (name, skills, role, experience) |

### Session

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/session/connect/naukri` | Opens Chromium for manual login; persists session |
| `GET`  | `/api/session/status/naukri` | Check if an active Naukri session exists |

### Agent

| Method   | Endpoint | Description |
|----------|----------|-------------|
| `POST`   | `/api/agent/start` | Start the automation agent with role, location, skills, limits |
| `DELETE` | `/api/agent/logs` | Clear all application logs |

#### `POST /api/agent/start` — Request Body

```json
{
  "role": "Full Stack Developer",
  "location": "Pune, Bangalore",
  "experience": "entry",
  "skills": "React, Java, Spring Boot, MongoDB",
  "dailyLimit": 5,
  "matchThreshold": 25
}
```

---

## ⚙️ How It Works

### 1. Resume Parsing Pipeline
```
PDF Upload → PDFBox text extraction → Groq LLM (Llama 3.3 70B) → JSON { name, skills, role, experience }
```

### 2. Session Management
- Playwright launches a **persistent Chromium browser** (with `userDataDir`)
- User logs in manually → cookies/session are saved to disk
- Subsequent agent runs reuse the same browser profile — **no re-login needed**

### 3. Hybrid Agent (v5.0)
The agent combines two strategies:

| Phase | Strategy | What It Does |
|-------|----------|--------------|
| Search & Navigate | **Deterministic** | Constructs Naukri.com search URLs, handles pagination |
| Job Extraction | **Deterministic** | Parses job cards, extracts title/company/skills |
| Role Filtering | **Deterministic** | Uses role allowlist + exclusion list to filter irrelevant jobs |
| Skill Matching | **Deterministic** | Expands skill synonyms, calculates match score |
| Apply Flow | **LLM-Driven** | Handles dynamic modals, questionnaires, and complex UI states via Groq API |

### 4. Anti-Detection
- Stealth scripts (navigator overrides, plugin simulation)
- Randomized viewport sizes
- Humanized mouse movements using Bézier curves
- Natural typing delays (jitter per keystroke)
- Watchdog timer for stuck-state recovery

---

## 🔧 Configuration

### Application Settings (via UI → Settings Panel)

| Setting | Default | Description |
|---------|---------|-------------|
| Daily Limit | `5` | Max applications per agent run |
| Match Threshold | `25%` | Minimum skill match score to apply |

### Agent Configuration (via `agent.js`)

| Config | Description |
|--------|-------------|
| `ROLE_ALLOWLIST` | Map of target roles → acceptable title variants |
| `EXCLUSIONS` | Job titles to always skip (sales, HR, etc.) |
| `SKILL_SYNONYMS` | Maps skill names to equivalents (e.g., `react` → `reactjs`) |
| `WATCHDOG_TIMEOUT` | Auto-exit if no progress for 3 minutes |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/ItsOmkara">Omkar</a>
</p>
