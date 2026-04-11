/**
 * agent.js — Hybrid Playwright agent for Naukri.com job applications
 * VERSION: 5.0.0 (2026-04-11)
 *
 * HYBRID APPROACH:
 *   - DETERMINISTIC: Search, navigation, job extraction, filtering, matching
 *   - LLM-DRIVEN: Apply flow only (button detection, questionnaires, confirmation)
 *
 * Usage: node agent.js --role "Developer" --location "Pune" --dailyLimit 5
 *        --matchThreshold 60 --skills "java,react" --groqApiKey "gsk_..."
 *        [--userDataDir ./browser-data] [--groqModel "model-name"]
 */

const SCRIPT_VERSION = '5.0.0';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { decideAction } = require('./llm-brain');

// ─── CLI Args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const CONFIG = {
    role: getArg('role', 'Software Developer'),
    location: getArg('location', 'India'),
    experience: getArg('experience', 'entry'),
    skills: getArg('skills', '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    dailyLimit: parseInt(getArg('dailyLimit', '5'), 10),
    matchThreshold: parseInt(getArg('matchThreshold', '20'), 10),
    userDataDir: getArg('userDataDir', path.join(__dirname, '..', 'browser-data')),
    groqApiKey: getArg('groqApiKey', process.env.GROQ_API_KEY || ''),
    groqModel: getArg('groqModel', 'meta-llama/llama-4-scout-17b-16e-instruct')
};

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'debug-screenshots');

// ─── Skill Synonyms ────────────────────────────────────────────────
const SKILL_SYNONYMS = {
    'javascript': ['javascript', 'js', 'ecmascript', 'es6'],
    'typescript': ['typescript', 'ts'],
    'java': ['java'],
    'python': ['python', 'py'],
    'c++': ['c++', 'cpp'],
    'react': ['react', 'reactjs', 'react.js'],
    'node': ['node', 'nodejs', 'node.js'],
    'spring boot': ['spring boot', 'springboot', 'spring-boot'],
    'restful api': ['restful api', 'rest api', 'rest', 'restful'],
    'mysql': ['mysql', 'sql', 'relational database'],
    'mongodb': ['mongodb', 'mongo', 'nosql'],
    'git': ['git', 'version control'],
    'html5': ['html5', 'html'],
    'css3': ['css3', 'css'],
    'angular': ['angular', 'angularjs'],
    'vue': ['vue', 'vuejs', 'vue.js'],
    'express': ['express', 'expressjs'],
    'django': ['django'],
    'docker': ['docker', 'containerization'],
    'kubernetes': ['kubernetes', 'k8s'],
    'aws': ['aws', 'amazon web services'],
    'azure': ['azure', 'microsoft azure'],
};

function expandSkills(skills) {
    const expanded = new Set();
    for (const skill of skills) {
        expanded.add(skill);
        for (const [canonical, synonyms] of Object.entries(SKILL_SYNONYMS)) {
            if (synonyms.includes(skill) || canonical === skill) {
                synonyms.forEach(s => expanded.add(s));
            }
        }
    }
    return [...expanded];
}
const EXPANDED_SKILLS = expandSkills(CONFIG.skills);

// ─── Role Allowlist ─────────────────────────────────────────────────
const ROLE_ALLOWLIST = {
    'software developer': ['software developer', 'software engineer', 'software dev', 'sde', 'jr software engineer', 'junior software engineer', 'software developer fresher', 'associate software engineer', 'associate software developer', 'trainee software engineer', 'trainee software developer'],
    'full stack developer': ['full stack developer', 'fullstack developer', 'full stack engineer', 'full-stack developer', 'software developer', 'software engineer'],
    'frontend developer': ['frontend developer', 'front end developer', 'frontend engineer', 'front-end developer', 'ui developer', 'ui engineer'],
    'backend developer': ['backend developer', 'back end developer', 'backend engineer', 'back-end developer', 'server side developer'],
    'java developer': ['java developer', 'java engineer', 'java software developer', 'java software engineer', 'software developer', 'software engineer', 'sde', 'software dev', 'jr software engineer', 'junior software engineer', 'associate software engineer', 'associate software developer', 'trainee software engineer', 'trainee software developer', 'software developer fresher', 'application developer', 'full stack developer', 'backend developer', 'back end developer'],
    'python developer': ['python developer', 'python engineer', 'software developer', 'software engineer'],
    'react developer': ['react developer', 'react engineer', 'reactjs developer', 'frontend developer', 'front end developer', 'ui developer'],
    'node developer': ['node developer', 'node engineer', 'nodejs developer', 'backend developer', 'software developer'],
    'data scientist': ['data scientist', 'data science engineer'],
    'data analyst': ['data analyst', 'data analytics'],
    'devops engineer': ['devops engineer', 'site reliability engineer', 'sre'],
    'mern stack developer': ['mern stack developer', 'mern developer', 'full stack developer', 'software developer'],
    'mean stack developer': ['mean stack developer', 'mean developer', 'full stack developer', 'software developer'],
};

const EXCLUSIONS = [
    'sales', 'marketing', 'hr', 'recruiter', 'bpo', 'call center',
    'customer support', 'telecall', 'receptionist', 'accountant',
    'medical', 'nurse', 'teacher', 'trainer', 'mechanical', 'civil',
    'electrician', 'technician', 'security', 'driver', 'delivery', 'chef'
];

// ─── Core Utilities ─────────────────────────────────────────────────
function normalize(text) {
    if (!text) return '';
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isRoleRelevant(title) {
    const titleNorm = normalize(title);
    const roleNorm = normalize(CONFIG.role);
    for (const ex of EXCLUSIONS) {
        if (titleNorm.includes(ex) && !roleNorm.includes(ex)) return false;
    }
    const allowedPhrases = ROLE_ALLOWLIST[roleNorm];
    if (allowedPhrases) return allowedPhrases.some(p => titleNorm.includes(p));
    return titleNorm.includes(roleNorm);
}

function calculateMatchScore(jobText, userSkills) {
    const jobNorm = normalize(jobText);
    if (!userSkills || userSkills.length === 0) return 100;
    let matched = 0;
    for (const skill of userSkills) {
        const skillNorm = normalize(skill);
        const synonyms = [skillNorm];
        for (const [canonical, syns] of Object.entries(SKILL_SYNONYMS)) {
            if (syns.includes(skillNorm) || canonical === skillNorm) {
                syns.forEach(s => { if (!synonyms.includes(normalize(s))) synonyms.push(normalize(s)); });
            }
        }
        if (synonyms.some(syn => jobNorm.includes(syn))) matched++;
    }
    return Math.min(matched * 20, 100);
}

function output(result) { console.log(JSON.stringify(result)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay(min = 2000, max = 5000) { return sleep(Math.floor(Math.random() * (max - min) + min)); }
function humanDelay(baseMs = 3000) {
    const u = Math.random();
    return Math.floor(Math.min(-Math.log(1 - u) * baseMs, baseMs * 2));
}

// ─── Watchdog ───────────────────────────────────────────────────────
let lastProgressTime = Date.now();
const WATCHDOG_TIMEOUT = 180000;
let watchdogInterval = setInterval(() => {
    if (Date.now() - lastProgressTime > WATCHDOG_TIMEOUT) {
        console.error(`\n[FATAL] Watchdog: No progress for ${WATCHDOG_TIMEOUT / 1000}s. Exiting.`);
        process.exit(1);
    }
}, 5000);
function resetWatchdog() { lastProgressTime = Date.now(); }

// ─── Screenshots ────────────────────────────────────────────────────
async function takeScreenshot(page, name) {
    resetWatchdog();
    try {
        if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        const filepath = path.join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`);
        await page.screenshot({ path: filepath, fullPage: false, timeout: 5000 });
        console.error(`[SCREENSHOT] ${filepath}`);
    } catch (e) {
        console.error(`[SCREENSHOT] Failed: ${e.message}`);
    }
}

// ─── Stealth ────────────────────────────────────────────────────────
function getRandomViewport() {
    const sizes = [[1366, 768], [1440, 900], [1536, 864], [1920, 1080], [1280, 720]];
    const [w, h] = sizes[Math.floor(Math.random() * sizes.length)];
    return { width: w, height: h };
}

async function humanizedMouseMove(page, targetX, targetY) {
    try {
        const start = await page.evaluate(() => ({
            x: window.innerWidth / 2, y: window.innerHeight / 2
        })).catch(() => ({ x: 640, y: 360 }));
        const steps = 12 + Math.floor(Math.random() * 8);
        const cp1 = { x: start.x + (Math.random() - 0.5) * 300, y: start.y + (Math.random() - 0.5) * 200 };
        const cp2 = { x: targetX + (Math.random() - 0.5) * 150, y: targetY + (Math.random() - 0.5) * 100 };
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = Math.pow(1 - t, 3) * start.x + 3 * Math.pow(1 - t, 2) * t * cp1.x + 3 * (1 - t) * Math.pow(t, 2) * cp2.x + Math.pow(t, 3) * targetX;
            const y = Math.pow(1 - t, 3) * start.y + 3 * Math.pow(1 - t, 2) * t * cp1.y + 3 * (1 - t) * Math.pow(t, 2) * cp2.y + Math.pow(t, 3) * targetY;
            await page.mouse.move(x, y);
            await sleep(8 + Math.random() * 15);
        }
    } catch {
        await page.mouse.move(targetX, targetY, { steps: 10 }).catch(() => { });
    }
}

async function applyStealthScripts(context) {
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                { name: 'Native Client', filename: 'internal-nacl-plugin' }
            ]
        });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en'] });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
        if (!window.chrome) {
            window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
        }
    });
}

async function simulateHumanBehavior(page) {
    resetWatchdog();
    try {
        for (let i = 0; i < 2; i++) {
            await humanizedMouseMove(page, Math.floor(Math.random() * 800) + 100, Math.floor(Math.random() * 600) + 100);
            await sleep(200 + Math.random() * 300);
        }
        await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 300) + 100));
        await sleep(500);
    } catch { }
}

async function warmUpSession(page) {
    console.error('[STEALTH] Warming up session...');
    resetWatchdog();
    try {
        await page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000 + humanDelay(3000));
        for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
            await humanizedMouseMove(page, 200 + Math.random() * 800, 150 + Math.random() * 500);
            await sleep(300 + Math.random() * 700);
        }
        await page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 400));
        await sleep(2000 + humanDelay(2000));
        console.error('[STEALTH] Session warmed up.');
    } catch (e) {
        console.error(`[STEALTH] Warmup warning: ${e.message}`);
    }
}

// ─── Navigation with Retry ─────────────────────────────────────────
async function gotoWithRetry(page, url, retries = 2) {
    resetWatchdog();
    for (let i = 0; i <= retries; i++) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            return;
        } catch (e) {
            console.error(`[NAV] Failed (${i + 1}/${retries + 1}): ${e.message}`);
            if (i === retries) throw e;
            await sleep(2000);
        }
    }
}

// ─── CAPTCHA Detection ─────────────────────────────────────────────
async function isCaptchaPresent(page) {
    try {
        // Skip check on known safe Naukri pages (search results, job listings)
        const currentUrl = page.url();
        const isKnownSafePage = /naukri\.com.*(jobs-in|k=|searchType=|-jobs-)/.test(currentUrl);
        if (isKnownSafePage) return false;

        // Signal 1: actual CAPTCHA iframe or element
        const captchaEl = await page.$('iframe[src*="captcha"], [class*="captcha"], #captcha, .recaptcha, [data-sitekey]');
        if (captchaEl) return true;

        // Signal 2: title is explicitly a block/security page
        const title = await page.title().catch(() => '');
        if (/security check|are you a human|captcha|bot detection|access denied/i.test(title)) return true;

        // Signal 3: body has STRONG bot-block language (specific phrases only)
        const bodyText = await page.textContent('body').catch(() => '');
        const strongBlockSignals = [
            /verify you are human/i,
            /prove you.re not a robot/i,
            /access denied/i,
            /unusual traffic/i,
            /automated access/i
        ];
        if (strongBlockSignals.some(pattern => pattern.test(bodyText))) return true;

        return false;
    } catch (e) {
        return false;
    }
}


async function waitForCaptchaClear(page, maxWait = 120000) {
    console.error(`[CAPTCHA] Detected! Waiting up to ${maxWait / 1000}s for solve...`);
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        resetWatchdog();
        await sleep(3000);
        if (!(await isCaptchaPresent(page))) {
            console.error(`[CAPTCHA] Cleared!`);
            return true;
        }
    }
    console.error(`[CAPTCHA] Timed out.`);
    return false;
}

// ─── Multi-Signal Login Check (DETERMINISTIC) ──────────────────────
async function checkLoggedIn(page) {
    resetWatchdog();
    try {
        const url = page.url().toLowerCase();
        if (url.includes('/nlogin') || url.includes('/login')) return false;
        const urlHasMnjuser = url.includes('mnjuser');
        const hasLogout = await page.$('a[href*="logout"], .nI-gNb-drawer__icon, [class*="logout"]').catch(() => null);
        const bodyText = await page.textContent('body').catch(() => '');
        const hasLoggedInText = /my naukri|view profile|edit profile|recommendations/i.test(bodyText);
        return urlHasMnjuser || !!hasLogout || hasLoggedInText;
    } catch { return false; }
}

// ─── Dismiss Chatbot Popup ─────────────────────────────────────────
async function dismissChatbot(page) {
    try {
        // Close the Naukri chatbot/assistant popup if present
        const closeBtn = await page.$('[class*="chatbot"] button[class*="close"], [class*="Chatbot"] button[class*="close"], [class*="chat-bot"] [class*="close"], button[aria-label="Close chat"], .chatbot_closeBtn');
        if (closeBtn) {
            await closeBtn.click().catch(() => { });
            await sleep(500);
            console.error('[STEALTH] Dismissed chatbot popup.');
        }
        // Also try the X button on the chatbot panel
        const xBtn = await page.$('[class*="chatbot"] svg, [class*="Chatbot"] [class*="cross"]');
        if (xBtn) {
            await xBtn.click().catch(() => { });
            await sleep(500);
        }
    } catch { }
}

// ═══════════════════════════════════════════════════════════════════
// DETERMINISTIC SEARCH (ported from apply.js v3.4)
// ═══════════════════════════════════════════════════════════════════

async function expandSearchOverlay(page) {
    const KEYWORD_INPUT_SELECTOR =
        'input.suggestor-input, ' +
        'input[placeholder*="Enter keyword"], ' +
        'input[placeholder*="skills"], ' +
        'input[placeholder*="designation"], ' +
        'input[placeholder*="company"], ' +
        'input[placeholder*="Search jobs here"], ' +
        '.nI-gNb-sb__main input[type="text"]';

    async function isOverlayOpen() {
        try {
            const input = await page.$(KEYWORD_INPUT_SELECTOR);
            if (!input) return false;
            return await input.isVisible().catch(() => false);
        } catch { return false; }
    }

    if (await isOverlayOpen()) return true;

    // Strategy 1: Click overlay container
    try {
        const overlay = await page.$('#ni-gnb-searchbar, .nI-gNb-sb__main');
        if (overlay) {
            await overlay.click({ timeout: 5000 });
            await sleep(2000 + Math.random() * 1000);
            if (await isOverlayOpen()) return true;
        }
    } catch { }

    // Strategy 2: JS dispatchEvent
    try {
        await page.evaluate(() => {
            const el = document.querySelector('input[placeholder*="Search jobs here"], input[placeholder*="Enter keyword"], .nI-gNb-sb__main input');
            if (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); el.focus(); }
        });
        await sleep(2000);
        if (await isOverlayOpen()) return true;
    } catch { }

    // Strategy 3: force click
    try {
        const inputs = await page.$$('input[placeholder*="Search jobs here"], .nI-gNb-sb__main input, input[placeholder*="Enter keyword"]');
        for (const inp of inputs) {
            try {
                await inp.click({ force: true, timeout: 3000 });
                await sleep(1500);
                if (await isOverlayOpen()) return true;
            } catch { }
        }
    } catch { }

    // Strategy 4: Tab navigation
    try {
        await page.click('body', { position: { x: 100, y: 100 } }).catch(() => { });
        await sleep(500);
        for (let t = 0; t < 15; t++) {
            await page.keyboard.press('Tab');
            await sleep(200);
            const focused = await page.evaluate(() => {
                const el = document.activeElement;
                return el && el.tagName === 'INPUT' ? el.placeholder || '' : '';
            }).catch(() => '');
            if (/search|keyword|skill|designation|company/i.test(focused)) return true;
        }
    } catch { }

    // Strategy 5: Direct evaluate focus
    try {
        const focused = await page.evaluate(() => {
            const sels = ['input[placeholder*="Search jobs here"]', 'input[placeholder*="Enter keyword"]', 'input[placeholder*="skills"]', '.nI-gNb-sb__main input[type="text"]'];
            for (const sel of sels) {
                const el = document.querySelector(sel);
                if (el) { el.click(); el.focus(); return true; }
            }
            return false;
        });
        if (focused) { await sleep(2000); return true; }
    } catch { }

    return false;
}

async function searchViaSearchBar(page, role, location) {
    resetWatchdog();
    try {
        console.error(`[SEARCH] Navigating to Naukri homepage...`);
        await page.goto('https://www.naukri.com', { waitUntil: 'load', timeout: 25000 });
        await sleep(3000 + Math.random() * 2000);
        await dismissChatbot(page);
        await simulateHumanBehavior(page);
        await sleep(1000 + Math.random() * 1000);

        const overlayOpened = await expandSearchOverlay(page);
        if (!overlayOpened) {
            console.error('[SEARCH] Could not expand search overlay.');
            return false;
        }
        await sleep(1000 + Math.random() * 500);

        // Type role into keyword field
        console.error(`[SEARCH] Typing role: "${role}"`);
        await page.evaluate(() => {
            const sels = ['input.suggestor-input', 'input[placeholder*="Enter keyword"]', 'input[placeholder*="skills"]', 'input[placeholder*="designation"]', 'input[placeholder*="Search jobs here"]', '.nI-gNb-sb__main input[type="text"]'];
            for (const sel of sels) {
                const el = document.querySelector(sel);
                if (el) { el.value = ''; el.focus(); el.dispatchEvent(new Event('input', { bubbles: true })); return true; }
            }
            return false;
        });
        await sleep(300);
        await page.keyboard.type(role, { delay: 60 + Math.random() * 80 });
        await sleep(2000 + Math.random() * 1000);
        await page.keyboard.press('Escape');
        await sleep(1000);

        // Fill location
        console.error(`[SEARCH] Looking for location input...`);
        const locationFound = await page.evaluate(() => {
            const sels = ['input#locationSugg', 'input[placeholder*="Enter location"]', 'input[placeholder*="Location"]', 'input[placeholder*="location"]'];
            for (const sel of sels) {
                const el = document.querySelector(sel);
                if (el) { el.value = ''; el.focus(); el.dispatchEvent(new Event('input', { bubbles: true })); return true; }
            }
            return false;
        });

        if (locationFound) {
            console.error(`[SEARCH] Typing location: "${location}"`);
            await sleep(300);
            await page.keyboard.type(location, { delay: 60 + Math.random() * 80 });
            await sleep(2000 + Math.random() * 1000);
            // Try to select suggestion
            try {
                const suggestion = await page.waitForSelector(
                    '.suggestor-container li, .suggester-container li, [class*="suggestor"] li, .dropdownMainContainer li, ul[class*="Dropdown"] li',
                    { state: 'visible', timeout: 4000 }
                ).catch(() => null);
                if (suggestion) {
                    await suggestion.click({ force: true }).catch(async () => {
                        await page.evaluate(() => {
                            const li = document.querySelector('.suggestor-container li, [class*="suggestor"] li, .dropdownMainContainer li');
                            if (li) li.click();
                        });
                    });
                    await sleep(800);
                } else {
                    await page.keyboard.press('Escape');
                    await sleep(500);
                }
            } catch {
                await page.keyboard.press('Escape');
                await sleep(500);
            }
        }

        // Click Search button
        console.error('[SEARCH] Submitting search...');
        let searchClicked = false;
        try {
            searchClicked = await page.evaluate(() => {
                const btns = document.querySelectorAll('button');
                for (const btn of btns) {
                    const text = btn.textContent.trim().toLowerCase();
                    if ((text === 'search' || text.includes('search')) && btn.offsetParent !== null) { btn.click(); return true; }
                }
                const submit = document.querySelector('.qsbSubmit, button[type="submit"]');
                if (submit) { submit.click(); return true; }
                return false;
            });
        } catch { }

        if (!searchClicked) {
            await page.keyboard.press('Enter');
        }

        console.error(`[SEARCH] Waiting for results...`);
        await sleep(5000 + Math.random() * 3000);

        const url = page.url();
        console.error(`[SEARCH] URL: ${url}`);
        if (url.includes('naukri.com') && (url.includes('jobs') || url.includes('job') || url.includes('search'))) {
            console.error(`[SEARCH] ✅ Search successful!`);
            return true;
        }
        console.error(`[SEARCH] URL did not change to results page. Search bar approach failed.`);
        return false;
    } catch (e) {
        console.error(`[SEARCH] Failed: ${e.message}`);
        return false;
    }
}

async function navigateToSearchUrlOrganically(page, searchUrl) {
    resetWatchdog();
    try {
        const currentUrl = page.url();
        if (!currentUrl.includes('naukri.com')) {
            await page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
            await sleep(3000 + Math.random() * 2000);
            await simulateHumanBehavior(page);
            await sleep(2000);
        }
        await page.evaluate((url) => { window.location.href = url; }, searchUrl);
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => { });
        await sleep(3000 + Math.random() * 2000);
        return true;
    } catch (e) {
        console.error(`[SEARCH] Organic fallback failed: ${e.message}. Using direct goto...`);
        await gotoWithRetry(page, searchUrl);
        return true;
    }
}

// ═══════════════════════════════════════════════════════════════════
// DETERMINISTIC JOB EXTRACTION (ported from apply.js)
// ═══════════════════════════════════════════════════════════════════

async function extractJobCards(page) {
    resetWatchdog();
    const cards = await page.$$('.srp-jobtuple-wrapper, .jobTuple, article.jobTuple, .cust-job-tuple');
    const jobs = [];
    for (let i = 0; i < cards.length; i++) {
        try {
            const card = cards[i];
            const title = await card.$eval('a.title, .row1 a, .jobTuple a', el => el.textContent.trim()).catch(() => 'Unknown Role');
            const company = await card.$eval('.comp-name, .subTitle a, .companyInfo a', el => el.textContent.trim()).catch(() => 'Unknown Company');
            const jobUrl = await card.$eval('a.title, .row1 a, .jobTuple a', el => el.href).catch(() => '');
            const cardText = await card.textContent().catch(() => '');
            jobs.push({ title, company, jobUrl, cardText });
        } catch { }
    }
    return jobs;
}

async function fetchJobDescription(context, jobUrl, cardText) {
    if (!jobUrl) return cardText;
    resetWatchdog();
    let descPage = null;
    try {
        descPage = await context.newPage();
        await descPage.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        const jdSelectors = ['.job-desc', '[class*="job-desc"]', '.jd-desc', '[class*="jd-desc"]', '.description', '[class*="styles_job-desc"]'];
        for (const sel of jdSelectors) {
            try {
                const el = await descPage.$(sel);
                if (el) {
                    const text = await el.textContent();
                    if (text && text.length > 100) return text;
                }
            } catch { }
        }
        const bodyText = await descPage.textContent('body').catch(() => '');
        return bodyText.length > cardText.length ? bodyText : cardText;
    } catch {
        return cardText;
    } finally {
        if (descPage) await descPage.close().catch(() => { });
    }
}

// ═══════════════════════════════════════════════════════════════════
// DETERMINISTIC RECRUITER QUESTIONS (fallback for LLM)
// ═══════════════════════════════════════════════════════════════════

function generateAnswer(question) {
    const q = (question || '').toLowerCase();
    if (/experience|years?|yrs/i.test(q)) {
        return CONFIG.skills.some(s => q.includes(s.toLowerCase())) ? '1' : '0';
    }
    if (/willing|ready|able|available|relocate|join immediately|can you/i.test(q)) return 'Yes';
    if (/notice period|notice/i.test(q)) return '0';
    if (/current ctc|current salary/i.test(q)) return '0';
    if (/expected ctc|expected salary/i.test(q)) return '4';
    if (/rate|rating|proficiency|scale/i.test(q)) {
        return CONFIG.skills.some(s => q.includes(s.toLowerCase())) ? '7' : '3';
    }
    return '1';
}

async function handleRecruiterQuestionsDeterministic(jobPage, maxQuestions = 5) {
    resetWatchdog();
    console.error(`[APPLY] Checking for recruiter questions (deterministic)...`);
    for (let q = 0; q < maxQuestions; q++) {
        resetWatchdog();
        await sleep(2000);
        const questionModal = await jobPage.$('[class*="chatbot"], [class*="Chatbot"], [class*="chatDialog"], [class*="chat-dialog"], [class*="questionnaire"], .chatbot_container').catch(() => null);
        if (!questionModal) break;

        const questionText = await jobPage.evaluate(() => {
            const msgs = document.querySelectorAll('[class*="chatbot"] [class*="msg"], [class*="chatbot"] [class*="message"], [class*="Chatbot"] [class*="msg"], [class*="chatDialog"] [class*="msg"]');
            for (let i = msgs.length - 1; i >= 0; i--) {
                const t = msgs[i].textContent.trim();
                if (t.includes('?') || t.includes('experience') || t.includes('skill')) return t;
            }
            return '';
        }).catch(() => '');

        if (questionText) console.error(`[APPLY] Question ${q + 1}: "${questionText}"`);

        const inputField = await jobPage.$('[class*="chatbot"] input[type="text"], [class*="chatbot"] textarea, [class*="Chatbot"] input[type="text"], [class*="Chatbot"] textarea, [class*="chatDialog"] input').catch(() => null);
        if (inputField) {
            const answer = generateAnswer(questionText);
            console.error(`[APPLY] Answering: "${answer}"`);
            await inputField.click();
            await sleep(300);
            await inputField.fill('');
            await sleep(200);
            await jobPage.keyboard.type(answer, { delay: 50 + Math.random() * 50 });
            await sleep(1000);
        }

        const saveBtn = await jobPage.$('[class*="chatbot"] button:has-text("Save"), [class*="Chatbot"] button:has-text("Save"), button:has-text("Save"), [class*="chatDialog"] button:has-text("Save")').catch(() => null);
        if (saveBtn && await saveBtn.isVisible().catch(() => false)) {
            console.error(`[APPLY] Clicking Save for question ${q + 1}...`);
            await saveBtn.click();
            await sleep(3000 + Math.random() * 2000);
        } else {
            break;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// LLM-DRIVEN APPLY (kept from agent.js v4)
// ═══════════════════════════════════════════════════════════════════

const INTERACTIVE_SELECTOR = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';

async function extractPageState(page) {
    resetWatchdog();
    const url = page.url();
    const title = await page.title().catch(() => 'Unknown');
    const elements = await page.evaluate((selector) => {
        const els = [...document.querySelectorAll(selector)];
        const results = [];
        for (const el of els) {
            const rect = el.getBoundingClientRect();
            if (rect.width < 5 || rect.height < 5) continue;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) continue;
            if (rect.top > window.innerHeight + 100 || rect.bottom < -100) continue;
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || '').trim().substring(0, 80).replace(/\s+/g, ' ');
            const placeholder = el.placeholder || '';
            const value = el.value || '';
            const type = el.type || '';
            const href = (tag === 'a' ? el.href : '') || '';
            const ariaLabel = el.getAttribute('aria-label') || '';
            if (!text && !placeholder && !ariaLabel && !value && !['input', 'select', 'textarea'].includes(tag)) continue;
            let desc = `<${tag}>`;
            if (type && type !== 'submit') desc += ` type="${type}"`;
            if (placeholder) desc += ` placeholder="${placeholder.substring(0, 60)}"`;
            if (value) desc += ` value="${value.substring(0, 40)}"`;
            if (ariaLabel) desc += ` aria-label="${ariaLabel.substring(0, 60)}"`;
            if (href) desc += ` href="${href.substring(0, 100)}"`;
            if (text) desc += ` "${text}"`;
            results.push(desc);
            if (results.length >= 50) break;
        }
        return results;
    }, INTERACTIVE_SELECTOR).catch(() => []);

    const visibleText = await page.evaluate(() => (document.body?.innerText || '').substring(0, 2500)).catch(() => '');
    let state = `URL: ${url}\nTitle: ${title}\n\n[INTERACTIVE ELEMENTS]\n`;
    elements.forEach((el, i) => { state += `[${i}] ${el}\n`; });
    state += `\n[VISIBLE TEXT (truncated)]\n${visibleText.substring(0, 1200)}`;
    return state;
}

async function getElementBox(page, index) {
    return page.evaluate(([selector, idx]) => {
        const els = [...document.querySelectorAll(selector)];
        const visible = els.filter(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width < 5 || rect.height < 5) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) return false;
            if (rect.top > window.innerHeight + 100 || rect.bottom < -100) return false;
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || '').trim();
            const placeholder = el.placeholder || '';
            const ariaLabel = el.getAttribute('aria-label') || '';
            const value = el.value || '';
            if (!text && !placeholder && !ariaLabel && !value && !['input', 'select', 'textarea'].includes(tag)) return false;
            return true;
        }).slice(0, 50);
        if (idx >= visible.length) return null;
        const el = visible[idx];
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const rect = el.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height, tag: el.tagName.toLowerCase(), type: el.type || '' };
    }, [INTERACTIVE_SELECTOR, index]);
}

async function executeAction(page, actionObj) {
    resetWatchdog();
    const { action, params = {} } = actionObj;
    switch (action) {
        case 'click': {
            const box = await getElementBox(page, params.elementIndex);
            if (!box) throw new Error(`Element [${params.elementIndex}] not found`);
            await sleep(300);
            const x = box.x + (Math.random() - 0.5) * box.w * 0.3;
            const y = box.y + (Math.random() - 0.5) * box.h * 0.3;
            await humanizedMouseMove(page, x, y);
            await sleep(200 + Math.random() * 300);
            await page.mouse.click(x, y);
            await sleep(1000 + Math.random() * 1000);
            break;
        }
        case 'type': {
            const box = await getElementBox(page, params.elementIndex);
            if (!box) throw new Error(`Element [${params.elementIndex}] not found`);
            await page.mouse.click(box.x, box.y);
            await sleep(300);
            await page.keyboard.type(params.text || '', { delay: 50 + Math.random() * 80 });
            await sleep(500);
            break;
        }
        case 'clear_and_type': {
            const box = await getElementBox(page, params.elementIndex);
            if (!box) throw new Error(`Element [${params.elementIndex}] not found`);
            await page.mouse.click(box.x, box.y, { clickCount: 3 });
            await sleep(200);
            await page.keyboard.press('Backspace');
            await sleep(200);
            await page.keyboard.type(params.text || '', { delay: 50 + Math.random() * 80 });
            await sleep(500);
            break;
        }
        case 'press_key':
            await page.keyboard.press(params.key || 'Escape');
            await sleep(500 + Math.random() * 500);
            break;
        case 'scroll':
            await page.evaluate((a) => window.scrollBy(0, a), params.direction === 'up' ? -400 : 400);
            await sleep(800);
            break;
        case 'wait':
            await sleep(Math.min(Math.max(params.seconds || 2, 1), 5) * 1000);
            break;
        case 'answer_question': {
            const box = await getElementBox(page, params.elementIndex);
            if (!box) throw new Error(`Element [${params.elementIndex}] not found`);
            await page.mouse.click(box.x, box.y, { clickCount: 3 });
            await sleep(200);
            await page.keyboard.press('Backspace');
            await sleep(200);
            await page.keyboard.type(params.answer || '1', { delay: 40 + Math.random() * 60 });
            await sleep(500);
            break;
        }
        case 'done':
            break;
        default:
            console.error(`[AGENT] Unknown action: ${action}`);
    }
}

async function runLLMApplyPhase(page, taskDescription, maxActions = 8) {
    let history = [];
    for (let step = 0; step < maxActions; step++) {
        resetWatchdog();
        // Throttle: 6s between LLM calls to avoid Groq rate limits
        if (step > 0) await sleep(6000 + Math.random() * 3000);

        const pageState = await extractPageState(page);
        console.error(`\n[AGENT] Step ${step + 1}/${maxActions} — asking LLM...`);

        const result = await decideAction(
            CONFIG.groqApiKey, pageState, taskDescription,
            history, CONFIG.groqModel, { skills: CONFIG.skills }
        );

        const { action: actionObj, historyEntries } = result;
        history = history.concat(historyEntries);
        console.error(`[AGENT] → ${actionObj.action} | ${actionObj.thought || ''}`);

        if (actionObj.action === 'done') return actionObj;

        try {
            await executeAction(page, actionObj);
        } catch (e) {
            console.error(`[AGENT] Action failed: ${e.message}`);
            history.push({ role: 'user', content: `[ERROR] "${actionObj.action}" failed: ${e.message}. Try different approach.` });
        }
        await sleep(500 + Math.random() * 1500);
    }
    console.error(`[AGENT] Max actions (${maxActions}) reached.`);
    return { action: 'done', params: { reason: 'max_actions_reached', success: false } };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN — HYBRID AGENT
// ═══════════════════════════════════════════════════════════════════

(async () => {
    let context;
    const results = [];
    const processedKeys = new Set();
    let appliedCount = 0;
    let limitReached = false;
    const useLLM = !!CONFIG.groqApiKey;

    try {
        if (!fs.existsSync(CONFIG.userDataDir)) {
            output([{
                company: 'SYSTEM', role: 'SESSION_MISSING', status: 'Session Expired',
                statusDetail: 'Browser profile not found. Connect Naukri first.', jobUrl: ''
            }]);
            return;
        }

        console.error(`[agent.js] ★ VERSION ${SCRIPT_VERSION} (HYBRID) ★`);
        console.error(`[agent.js] LLM: ${useLLM ? CONFIG.groqModel : 'DISABLED (no API key)'}`);
        console.error(`[agent.js] Config: role="${CONFIG.role}", location="${CONFIG.location}", limit=${CONFIG.dailyLimit}, threshold=${CONFIG.matchThreshold}%`);
        console.error(`[agent.js] Skills: [${CONFIG.skills.join(', ')}]`);

        resetWatchdog();

        // Clean up lock file
        const lockPath = path.join(CONFIG.userDataDir, 'SingletonLock');
        if (fs.existsSync(lockPath)) { try { fs.unlinkSync(lockPath); } catch { } }

        // Clear crash state
        const prefsPath = path.join(CONFIG.userDataDir, 'Default', 'Preferences');
        try {
            if (fs.existsSync(prefsPath)) {
                let prefs = fs.readFileSync(prefsPath, 'utf-8');
                prefs = prefs.replace(/"exit_type"\s*:\s*"Crashed"/g, '"exit_type":"Normal"');
                prefs = prefs.replace(/"exited_cleanly"\s*:\s*false/g, '"exited_cleanly":true');
                fs.writeFileSync(prefsPath, prefs, 'utf-8');
            }
        } catch { }

        const viewport = getRandomViewport();
        console.error(`[STEALTH] Viewport: ${viewport.width}x${viewport.height}`);

        context = await chromium.launchPersistentContext(CONFIG.userDataDir, {
            headless: false,
            viewport,
            locale: 'en-IN',
            timezoneId: 'Asia/Kolkata',
            args: [
                '--disable-notifications', '--disable-extensions', '--no-sandbox',
                '--disable-setuid-sandbox', '--disable-session-crashed-bubble',
                '--disable-infobars', '--no-default-browser-check',
                '--disable-blink-features=AutomationControlled'
            ],
            slowMo: 50,
            ignoreHTTPSErrors: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        });

        await applyStealthScripts(context);
        const page = context.pages()[0] || await context.newPage();

        // ─── Session Warmup ─────────────────────────────────────────
        await warmUpSession(page);
        resetWatchdog();

        // ─── Phase 1: Validate Session (DETERMINISTIC) ──────────────
        console.error('\n[PHASE 1] Validating session...');
        await gotoWithRetry(page, 'https://www.naukri.com/mnjuser/homepage');
        await sleep(5000);
        resetWatchdog();

        const isLoggedIn = await checkLoggedIn(page);
        if (!isLoggedIn) {
            await takeScreenshot(page, 'session-expired');
            console.error('[FATAL] SESSION_EXPIRED.');
            output([{
                company: 'NAUKRI', role: 'SESSION_EXPIRED', status: 'Session Expired',
                statusDetail: 'Login validation failed. Please reconnect.', jobUrl: ''
            }]);
            return;
        }
        console.error('[PHASE 1] ✅ Session valid!');

        // ─── Phase 2: Search & Process (DETERMINISTIC + LLM) ────────
        const locations = CONFIG.location.split(',').map(l => l.trim()).filter(Boolean);
        if (locations.length === 0) locations.push('India');

        for (const loc of locations) {
            resetWatchdog();
            if (limitReached) break;

            console.error(`\n[PHASE 2] 🔍 SEARCHING: "${CONFIG.role}" in ${loc.toUpperCase()}`);
            await sleep(3000 + humanDelay(4000));

            const searchUrl = `https://www.naukri.com/${CONFIG.role.toLowerCase().replace(/\s+/g, '-')}-jobs-in-${loc.toLowerCase().replace(/\s+/g, '-')}`;

            try {
                // DETERMINISTIC SEARCH
                let searchWorked = await searchViaSearchBar(page, CONFIG.role, loc);
                if (!searchWorked) {
                    console.error(`[SEARCH] Falling back to organic URL for ${loc}`);
                    await navigateToSearchUrlOrganically(page, searchUrl);
                }

                await sleep(5000 + Math.random() * 3000);
                await simulateHumanBehavior(page);

                // CAPTCHA check
                if (await isCaptchaPresent(page)) {
                    const solved = await waitForCaptchaClear(page, 120000);
                    if (!solved) {
                        console.error(`[CAPTCHA] Could not clear for ${loc}. Skipping.`);
                        continue;
                    }
                    await sleep(3000);
                }

                // Wait for job cards
                try {
                    await page.waitForSelector('.srp-jobtuple-wrapper, .jobTuple, .cust-job-tuple', { state: 'visible', timeout: 15000 });
                } catch {
                    console.error(`[SEARCH] No job cards found for ${loc}. Skipping.`);
                    await takeScreenshot(page, `no-jobs-${loc.replace(/\s/g, '-')}`);
                    continue;
                }
                resetWatchdog();

                // DETERMINISTIC EXTRACTION
                const jobs = await extractJobCards(page);
                console.error(`[STEP] Found ${jobs.length} jobs in ${loc}.`);
                await takeScreenshot(page, `search-results-${loc.replace(/\s/g, '-')}`);

                if (jobs.length === 0) continue;

                // DETERMINISTIC PROCESSING
                for (let i = 0; i < jobs.length; i++) {
                    resetWatchdog();
                    if (appliedCount >= CONFIG.dailyLimit) {
                        limitReached = true;
                        console.error(`[LIMIT] Daily limit reached (${appliedCount}/${CONFIG.dailyLimit}).`);
                        break;
                    }

                    const { title, company, jobUrl, cardText } = jobs[i];
                    console.error(`\n[JOB] Processing: "${title}" @ ${company}`);

                    // Step 1: Role Filter
                    if (!isRoleRelevant(title)) {
                        console.error(`[SKIP] Irrelevant role: "${title}"`);
                        results.push({ company, role: title, status: 'Skipped - Irrelevant Role', statusDetail: 'Role allowlist mismatch', jobUrl, location: loc });
                        continue;
                    }

                    // Step 2: Deduplication
                    const dedupKey = normalize(company + ':' + title);
                    if ((jobUrl && processedKeys.has(jobUrl)) || processedKeys.has(dedupKey)) {
                        console.error(`[SKIP] Duplicate: "${title}" @ ${company}`);
                        continue;
                    }
                    if (jobUrl) processedKeys.add(jobUrl);
                    processedKeys.add(dedupKey);

                    // Step 3: Skill Match (fetch full JD for accurate matching)
                    console.error(`[DEBUG] Fetching full JD for: ${title} @ ${company}`);
                    const fullJdText = await fetchJobDescription(context, jobUrl, cardText);
                    const matchScore = calculateMatchScore(title + ' ' + fullJdText, CONFIG.skills);

                    if (matchScore < CONFIG.matchThreshold) {
                        console.error(`[SKIP] Low match: ${matchScore}% < ${CONFIG.matchThreshold}%`);
                        results.push({ company, role: title, status: 'Skipped - Low Match', statusDetail: `${matchScore}% < ${CONFIG.matchThreshold}%`, jobUrl, location: loc, matchScore });
                        continue;
                    }

                    // Step 4: Apply
                    console.error(`[APPLY] ✅ MATCH: "${title}" @ ${company} | Score: ${matchScore}%`);

                    if (!jobUrl) {
                        results.push({ company, role: title, status: 'Failed', statusDetail: 'No job URL found', jobUrl: '', location: loc });
                        continue;
                    }

                    let jobPage = null;
                    try {
                        jobPage = await context.newPage();
                        await jobPage.goto(jobUrl, { waitUntil: 'load', timeout: 30000 });
                        await sleep(3000 + Math.random() * 2000);
                        await jobPage.evaluate(() => window.scrollBy(0, 200 + Math.random() * 300));
                        await sleep(1000 + Math.random() * 1000);

                        // CAPTCHA check on job page
                        if (await isCaptchaPresent(jobPage)) {
                            const solved = await waitForCaptchaClear(jobPage, 120000);
                            if (!solved) {
                                results.push({ company, role: title, status: 'Skipped - CAPTCHA', statusDetail: 'CAPTCHA on job page', jobUrl, location: loc });
                                continue;
                            }
                            await sleep(2000);
                        }

                        if (useLLM) {
                            // ── LLM-DRIVEN APPLY ────────────────────────
                            const applyResult = await runLLMApplyPhase(jobPage,
                                `Apply for this job on Naukri.com.
Steps:
1. Look for an "Apply" or "Apply Now" button on this job detail page
2. Click it
3. If a chatbot/questionnaire appears, answer questions:
   - Experience/years in a skill: "${CONFIG.skills.join(', ')}" → "1", others → "0"
   - Willingness/availability/relocation: "Yes"
   - Notice period: "0"
   - Current CTC: "0", Expected CTC: "4"
   - Rating (1-10) for user's skills: "7", others: "3"
   - Default: "1"
4. Click "Save" after answering each question
5. Look for confirmation: "applied", "application submitted", "successfully applied"
6. Use "done" with reason="applied", success=true if confirmed
7. "already applied" → done with reason="already_applied", success=true
8. No Apply button / external site → done with reason="external_apply", success=false
9. CAPTCHA → done with reason="captcha_detected", success=false

Job: "${title}" at "${company}"`, 8);

                            const reason = applyResult.params?.reason || 'unknown';
                            const success = applyResult.params?.success || false;

                            if (success && (reason === 'applied' || reason === 'already_applied')) {
                                appliedCount++;
                                const status = reason === 'already_applied' ? 'Already Applied' : 'Applied';
                                results.push({ company, role: title, status, statusDetail: `Score: ${matchScore}%`, jobUrl, location: loc, matchScore });
                                console.error(`[APPLY] ✅ ${status}: "${title}" @ ${company} (${appliedCount}/${CONFIG.dailyLimit})`);
                            } else if (reason === 'external_apply') {
                                results.push({ company, role: title, status: 'Skipped - External', statusDetail: 'External application site', jobUrl, location: loc });
                            } else if (reason === 'captcha_detected') {
                                results.push({ company, role: title, status: 'Skipped - CAPTCHA', statusDetail: 'CAPTCHA on job page', jobUrl, location: loc });
                            } else {
                                // LLM couldn't confirm — count as applied anyway since we tried
                                appliedCount++;
                                results.push({ company, role: title, status: 'Applied (Unconfirmed)', statusDetail: `Score: ${matchScore}%, reason: ${reason}`, jobUrl, location: loc, matchScore });
                                await takeScreenshot(jobPage, `apply-unclear-${normalize(company).replace(/\s/g, '-')}`);
                            }
                        } else {
                            // ── DETERMINISTIC APPLY (no LLM fallback) ───
                            const APPLY_SELECTOR = 'button#apply-button, button.apply-button, button[id*="apply"], button[class*="apply-btn"], button[class*="apply-button"], [class*="styles_jhc__apply"] button, button:has-text("Apply"), button:has-text("Apply Now")';
                            let applyBtn = null;
                            try {
                                applyBtn = await jobPage.waitForSelector(APPLY_SELECTOR, { state: 'visible', timeout: 10000 });
                            } catch { applyBtn = null; }

                            if (!applyBtn) {
                                const pageText = await jobPage.textContent('body').catch(() => '');
                                if (/already applied|application submitted/i.test(pageText)) {
                                    results.push({ company, role: title, status: 'Already Applied', statusDetail: `Score: ${matchScore}%`, jobUrl, location: loc, matchScore });
                                } else {
                                    results.push({ company, role: title, status: 'Failed', statusDetail: 'Apply button not found', jobUrl, location: loc });
                                }
                                continue;
                            }

                            const btnText = await applyBtn.textContent().catch(() => '');
                            const href = await applyBtn.evaluate(el => el.href || '').catch(() => '');
                            if (href && !href.includes('naukri.com')) {
                                results.push({ company, role: title, status: 'Skipped - External', statusDetail: 'External site', jobUrl, location: loc });
                                continue;
                            }

                            await applyBtn.click({ delay: 100 + Math.random() * 200 });
                            await sleep(4000 + Math.random() * 2000);
                            await handleRecruiterQuestionsDeterministic(jobPage);
                            await sleep(2000);

                            const bodyText = await jobPage.textContent('body').catch(() => '');
                            const isApplied = /applied to|application submitted|applied successfully|already applied|your application|successfully applied/i.test(bodyText);
                            appliedCount++;
                            results.push({
                                company, role: title,
                                status: isApplied ? 'Applied' : 'Applied (Unconfirmed)',
                                statusDetail: `Score: ${matchScore}%`,
                                jobUrl, location: loc, matchScore
                            });
                            console.error(`[APPLY] ✅ ${isApplied ? 'Applied' : 'Applied (Unconfirmed)'}: "${title}" @ ${company}`);
                        }
                    } catch (err) {
                        console.error(`[APPLY] Error: ${err.message}`);
                        results.push({ company, role: title, status: 'Failed', statusDetail: err.message, jobUrl, location: loc });
                    } finally {
                        if (jobPage) await jobPage.close().catch(() => { });
                    }

                    await sleep(3000 + Math.random() * 2000);
                }
            } catch (err) {
                console.error(`[SEARCH] Search failed for ${loc}: ${err.message}`);
            }
        }

        // ─── Output Results ─────────────────────────────────────────
        console.error(`\n[SUMMARY] Applied: ${appliedCount}/${CONFIG.dailyLimit} | Limit: ${limitReached} | Results: ${results.length}`);
        output(results.length > 0 ? results : [{
            company: 'NAUKRI', role: CONFIG.role, status: 'Failed',
            statusDetail: 'No jobs processed in any location.', jobUrl: ''
        }]);

    } catch (error) {
        console.error(`[agent.js] Fatal: ${error.message}`);
        output([{
            company: 'SYSTEM', role: 'ERROR', status: 'Failed',
            statusDetail: `Fatal: ${error.message}`, jobUrl: ''
        }]);
    } finally {
        if (watchdogInterval) clearInterval(watchdogInterval);
        if (context) {
            try {
                await Promise.race([
                    context.close(),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('close timeout')), 10000))
                ]);
            } catch (e) {
                console.error(`[DEBUG] Browser close: ${e.message}`);
            }
        }
    }
})();
