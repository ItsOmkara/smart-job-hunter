/**
 * apply.js — Playwright persistent-context Naukri job application
 * VERSION: 3.0.0 (2026-03-27) — V2.2 core + V3.1 anti-detection
 *
 * Features:
 *   - Strict allowlist role filter + limit enforcement
 *   - CAPTCHA detection + wait-for-solve + retry
 *   - Full job description fetching for accurate skill matching
 *   - Skill synonyms for broader matching
 *   - Bezier curve mouse movements (anti-detection)
 *   - Stealth init scripts (webdriver=undefined, plugins, languages)
 *   - Random viewport per session
 *   - Session warmup before searching
 *   - Global watchdog to prevent infinite hangs
 *
 * Uses standard `playwright` only — no extra deps.
 *
 * Usage: node apply.js --role "Developer" --location "Pune" --dailyLimit 5
 *        --matchThreshold 60 [--userDataDir ./browser-data]
 * Output (stdout JSON): Array of application results
 */

const SCRIPT_VERSION = '3.4.0';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ─── Parse CLI args ────────────────────────────────────────────────
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
    userDataDir: getArg('userDataDir', path.join(__dirname, '..', 'browser-data'))
};

// ─── Skill Synonyms ────────────────────────────────────────────────
// Maps canonical skill names to alternate spellings/abbreviations.
const SKILL_SYNONYMS = {
    'javascript': ['javascript', 'js', 'ecmascript', 'es6', 'es2015'],
    'typescript': ['typescript', 'ts'],
    'java': ['java'],
    'python': ['python', 'py'],
    'c++': ['c++', 'cpp', 'c plus plus'],
    'react': ['react', 'reactjs', 'react.js'],
    'node': ['node', 'nodejs', 'node.js'],
    'spring boot': ['spring boot', 'springboot', 'spring-boot'],
    'restful api': ['restful api', 'rest api', 'rest', 'restful', 'api development'],
    'mysql': ['mysql', 'sql', 'relational database'],
    'mongodb': ['mongodb', 'mongo', 'nosql'],
    'git': ['git', 'version control'],
    'github': ['github', 'gitlab', 'bitbucket'],
    'html5': ['html5', 'html'],
    'css3': ['css3', 'css'],
    'bootstrap': ['bootstrap'],
    'tailwind css': ['tailwind css', 'tailwind'],
    'jquery': ['jquery'],
    'junit': ['junit', 'unit testing', 'testing'],
    'postman': ['postman', 'api testing'],
    'angular': ['angular', 'angularjs', 'angular.js'],
    'vue': ['vue', 'vuejs', 'vue.js'],
    'express': ['express', 'expressjs', 'express.js'],
    'django': ['django'],
    'flask': ['flask'],
    'docker': ['docker', 'containerization'],
    'kubernetes': ['kubernetes', 'k8s'],
    'aws': ['aws', 'amazon web services'],
    'azure': ['azure', 'microsoft azure'],
};

// Expand user skills using synonyms
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

// ─── Strict Role Allowlist ─────────────────────────────────────────
const ROLE_ALLOWLIST = {
    'software developer': ['software developer', 'software engineer', 'software dev'],
    'full stack developer': ['full stack developer', 'fullstack developer', 'full stack engineer', 'full-stack developer', 'full-stack engineer', 'fullstack engineer'],
    'frontend developer': ['frontend developer', 'front end developer', 'frontend engineer', 'front-end developer', 'front-end engineer'],
    'backend developer': ['backend developer', 'back end developer', 'backend engineer', 'back-end developer', 'back-end engineer'],
    'java developer': ['java developer', 'java engineer', 'java software developer', 'java software engineer'],
    'python developer': ['python developer', 'python engineer', 'python software developer', 'python software engineer'],
    'react developer': ['react developer', 'react engineer', 'reactjs developer', 'react.js developer'],
    'node developer': ['node developer', 'node engineer', 'nodejs developer', 'node.js developer'],
    'data scientist': ['data scientist', 'data science engineer'],
    'data analyst': ['data analyst', 'data analytics'],
    'devops engineer': ['devops engineer', 'dev ops engineer', 'site reliability engineer', 'sre'],
    'mern stack developer': ['mern stack developer', 'mern developer', 'mern stack engineer'],
    'mean stack developer': ['mean stack developer', 'mean developer', 'mean stack engineer'],
};

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'debug-screenshots');

const EXCLUSIONS = [
    'sales', 'marketing', 'hr', 'recruiter', 'recruitment', 'bpo', 'call center',
    'customer support', 'telecall', 'front desk', 'receptionist', 'accountant',
    'medical', 'nurse', 'doctor', 'teacher', 'trainer', 'mechanical', 'civil',
    'electrician', 'technician', 'security', 'driver', 'delivery', 'chef'
];

// ─── Anti-Detection Utilities (from V3.1) ───────────────────────────

// Random viewport per session (avoids fingerprint)
function getRandomViewport() {
    const widths = [1366, 1440, 1536, 1920, 1280];
    const heights = [768, 900, 864, 1080, 720];
    return {
        width: widths[Math.floor(Math.random() * widths.length)],
        height: heights[Math.floor(Math.random() * heights.length)]
    };
}

// Exponential delay — more human-like than uniform random
function humanDelay(baseMs = 3000) {
    const u = Math.random();
    const exp = -Math.log(1 - u) * baseMs;
    return Math.floor(Math.min(exp, baseMs * 2));
}

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
    if (allowedPhrases) {
        return allowedPhrases.some(phrase => titleNorm.includes(phrase));
    }
    return titleNorm.includes(roleNorm);
}

/**
 * Scores by counting how many ORIGINAL user skills match (via synonyms).
 * Each matched skill = 20%, capped at 100%.
 * e.g. 1 skill match = 20%, 2 = 40%, 3 = 60%, 5+ = 100%
 */
function calculateMatchScore(jobText, userSkills) {
    const jobTextNorm = normalize(jobText);
    if (!userSkills || userSkills.length === 0) return 100;

    let matchedCount = 0;
    const matchedSkills = [];

    for (const skill of userSkills) {
        const skillNorm = normalize(skill);
        // Get all synonyms for this skill
        const synonyms = [skillNorm];
        for (const [canonical, syns] of Object.entries(SKILL_SYNONYMS)) {
            if (syns.includes(skillNorm) || canonical === skillNorm) {
                syns.forEach(s => { if (!synonyms.includes(normalize(s))) synonyms.push(normalize(s)); });
            }
        }
        // If ANY synonym matches the job text, count this original skill as matched
        const found = synonyms.some(syn => jobTextNorm.includes(syn));
        if (found) {
            matchedCount++;
            matchedSkills.push(skill);
        }
    }

    // 20% per matched skill, capped at 100%
    const score = Math.min(matchedCount * 20, 100);
    console.error(`[DEBUG] Skill match: ${matchedCount} skills matched [${matchedSkills.join(', ')}] → ${score}%`);
    return score;
}

function output(result) {
    console.log(JSON.stringify(result));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = 3000, max = 6000) {
    return sleep(Math.floor(Math.random() * (max - min) + min));
}

// ─── Bezier Curve Mouse Movement (from V3.1) ───────────────────────
// Moves the mouse along a natural-looking curve instead of a straight line.
async function humanizedMouseMove(page, targetX, targetY) {
    try {
        const start = await page.evaluate(() => ({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        })).catch(() => ({ x: 640, y: 360 }));

        const steps = 15 + Math.floor(Math.random() * 10);
        const cp1 = { x: start.x + (Math.random() - 0.5) * 300, y: start.y + (Math.random() - 0.5) * 200 };
        const cp2 = { x: targetX + (Math.random() - 0.5) * 150, y: targetY + (Math.random() - 0.5) * 100 };

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = Math.pow(1 - t, 3) * start.x + 3 * Math.pow(1 - t, 2) * t * cp1.x + 3 * (1 - t) * Math.pow(t, 2) * cp2.x + Math.pow(t, 3) * targetX;
            const y = Math.pow(1 - t, 3) * start.y + 3 * Math.pow(1 - t, 2) * t * cp1.y + 3 * (1 - t) * Math.pow(t, 2) * cp2.y + Math.pow(t, 3) * targetY;
            await page.mouse.move(x, y);
            await sleep(8 + Math.random() * 15);
        }
    } catch (e) {
        // Fallback: simple move
        await page.mouse.move(targetX, targetY, { steps: 10 }).catch(() => { });
    }
}

/**
 * Human-like click: scroll into view, Bezier mouse move, mousedown/up.
 */
async function humanClick(page, element) {
    resetWatchdog();
    try {
        await element.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => { });
        await sleep(500 + humanDelay(800));

        const box = await element.boundingBox();
        if (box) {
            const x = box.x + box.width * (0.2 + Math.random() * 0.6);
            const y = box.y + box.height * (0.2 + Math.random() * 0.6);

            await humanizedMouseMove(page, x, y);
            await sleep(200 + Math.random() * 300);

            // mousedown + mouseup is more human than .click()
            await page.mouse.down();
            await sleep(30 + Math.random() * 80);
            await page.mouse.up();
            await sleep(200);
        } else {
            await element.click({ delay: 100 + Math.random() * 200 });
        }
    } catch (e) {
        await element.click({ delay: 100 + Math.random() * 200 }).catch(() => { });
    }
}

// ─── Watchdog (anti-hang) ───────────────────────────────────────────
let lastProgressTime = Date.now();
const WATCHDOG_TIMEOUT = 120000; // 120s
let watchdogInterval = null;

function resetWatchdog() {
    lastProgressTime = Date.now();
}

watchdogInterval = setInterval(() => {
    if (Date.now() - lastProgressTime > WATCHDOG_TIMEOUT) {
        console.error(`\n[FATAL] Watchdog triggered: No progress for ${WATCHDOG_TIMEOUT / 1000}s. Exiting.`);
        process.exit(1);
    }
}, 5000);

// ─── Screenshot ─────────────────────────────────────────────────────
async function takeScreenshot(page, name) {
    resetWatchdog();
    try {
        if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        const filepath = path.join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`);
        await page.screenshot({ path: filepath, fullPage: false, timeout: 5000 });
        console.error(`[DEBUG] Screenshot saved: ${filepath}`);
    } catch (e) {
        console.error(`[DEBUG] Screenshot failed: ${e.message}`);
    }
}

// ─── Navigation with Retry ─────────────────────────────────────────
async function gotoWithRetry(page, url, retries = 2) {
    resetWatchdog();
    for (let i = 0; i <= retries; i++) {
        try {
            console.error(`[STEP] Navigating to: ${url} (Attempt ${i + 1}/${retries + 1})`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const content = await page.content();
            if (content.length < 500) {
                console.error(`[DEBUG] Page seems blank (length: ${content.length}). Reloading...`);
                await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
            }
            return;
        } catch (e) {
            console.error(`[DEBUG] Navigation failed: ${e.message}`);
            if (i === retries) throw e;
            await sleep(2000);
        }
    }
}

async function waitForSelectorWithRetry(page, selector, timeout = 15000, retries = 1) {
    resetWatchdog();
    for (let i = 0; i <= retries; i++) {
        try {
            return await page.waitForSelector(selector, { state: 'visible', timeout });
        } catch (e) {
            console.error(`[DEBUG] Selector "${selector}" not found (Attempt ${i + 1}/${retries + 1})`);
            if (i === retries) throw e;
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
        }
    }
}

// ─── CAPTCHA Detection + Wait (from V2.2) ──────────────────────────
async function isCaptchaPresent(page) {
    try {
        const captchaEl = await page.$('iframe[src*="captcha"], [class*="captcha"], #captcha, .recaptcha, [data-sitekey]');
        if (captchaEl) return true;

        // Check page title (Naukri CAPTCHA pages often have specific titles)
        const title = await page.title().catch(() => '');
        if (/security check|are you a human|captcha|bot detection|access denied/i.test(title)) return true;

        const bodyText = await page.textContent('body').catch(() => '');
        if (/verify you are human|access denied|bot detection|challenge|security check|prove you.re not a robot/i.test(bodyText)) return true;

        // Check if the page has very little content (often a sign of a block page)
        const contentLength = bodyText.length;
        if (contentLength < 500 && /blocked|denied|error/i.test(bodyText)) return true;

        return false;
    } catch (e) {
        return false;
    }
}

async function waitForCaptchaClear(page, maxWait = 120000) {
    console.error(`[CAPTCHA] Detected! Waiting up to ${maxWait / 1000}s for user to solve...`);
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        resetWatchdog(); // Keep watchdog alive while waiting
        await sleep(3000);
        if (!(await isCaptchaPresent(page))) {
            console.error(`[CAPTCHA] Cleared! Resuming...`);
            return true;
        }
    }
    console.error(`[CAPTCHA] Timed out waiting for solve.`);
    return false;
}

// ─── Full JD Fetching (from V2.2) ──────────────────────────────────
async function fetchJobDescription(context, jobUrl, cardText) {
    if (!jobUrl) return cardText;
    resetWatchdog();
    let descPage = null;
    try {
        descPage = await context.newPage();
        await descPage.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);

        const jdSelectors = [
            '.job-desc',
            '[class*="job-desc"]',
            '.jd-desc',
            '[class*="jd-desc"]',
            '.description',
            'section.styles_job-desc-container__txpYf',
            '[class*="styles_job-desc"]',
        ];

        for (const sel of jdSelectors) {
            try {
                const el = await descPage.$(sel);
                if (el) {
                    const text = await el.textContent();
                    if (text && text.length > 100) {
                        console.error(`[DEBUG] JD fetched (${text.length} chars) from: ${sel}`);
                        return text;
                    }
                }
            } catch (e) { }
        }

        const bodyText = await descPage.textContent('body').catch(() => '');
        return bodyText.length > cardText.length ? bodyText : cardText;

    } catch (e) {
        console.error(`[DEBUG] JD fetch failed for ${jobUrl}: ${e.message}`);
        return cardText;
    } finally {
        if (descPage) await descPage.close().catch(() => { });
    }
}

// ─── Human-like Behavior Simulation ────────────────────────────────
async function simulateHumanBehavior(page) {
    resetWatchdog();
    try {
        // Random mouse movements with Bezier curves
        for (let i = 0; i < 2; i++) {
            const x = Math.floor(Math.random() * 800) + 100;
            const y = Math.floor(Math.random() * 600) + 100;
            await humanizedMouseMove(page, x, y);
            await sleep(200 + Math.random() * 300);
        }
        // Random scroll
        await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 300) + 100));
        await sleep(500);
    } catch (e) { }
}

// ─── Session Warmup (from V3.1) ────────────────────────────────────
// Visit the homepage and browse a bit before searching — builds cookie trust.
async function warmUpSession(page) {
    console.error('[STEALTH] Warming up session...');
    resetWatchdog();
    try {
        await page.goto('https://www.naukri.com', {
            waitUntil: 'domcontentloaded',
            timeout: 20000
        });
        await sleep(3000 + humanDelay(3000));

        // Simulate realistic browsing: random mouse movements
        for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
            const x = 200 + Math.floor(Math.random() * 800);
            const y = 150 + Math.floor(Math.random() * 500);
            await humanizedMouseMove(page, x, y);
            await sleep(300 + Math.random() * 700);
        }

        // Random scrolls — more of them, with pauses
        await page.evaluate(() => {
            return new Promise((resolve) => {
                let scrolls = 0;
                const maxScrolls = 4 + Math.floor(Math.random() * 3);
                const scroll = () => {
                    window.scrollBy(0, 80 + Math.random() * 200);
                    scrolls++;
                    if (scrolls < maxScrolls) {
                        setTimeout(scroll, 600 + Math.random() * 1200);
                    } else {
                        resolve();
                    }
                };
                scroll();
            });
        });

        await sleep(2000 + humanDelay(2000));

        // Optionally hover over a few links
        try {
            const links = await page.$$('a[href]');
            const hoverCount = Math.min(links.length, 2 + Math.floor(Math.random() * 2));
            for (let i = 0; i < hoverCount; i++) {
                const randomLink = links[Math.floor(Math.random() * links.length)];
                const box = await randomLink.boundingBox().catch(() => null);
                if (box) {
                    await humanizedMouseMove(page, box.x + box.width / 2, box.y + box.height / 2);
                    await sleep(400 + Math.random() * 800);
                }
            }
        } catch (e) { }

        await sleep(1500);
        console.error('[STEALTH] Session warmed up.');
    } catch (e) {
        console.error('[STEALTH] Warmup warning (continuing):', e.message);
    }
}

// ─── Search via Search Bar (human-like) ────────────────────────────
// VERSION 3.4: Multi-strategy approach to handle #ni-gnb-searchbar overlay
// intercepting all pointer events on inner elements.
//
// Strategy order:
//   1. Click the overlay container (#ni-gnb-searchbar) itself
//   2. JS dispatchEvent click on the search input
//   3. force:true click on any input found
//   4. Focus via keyboard Tab navigation
//   5. Direct page.evaluate focus()
//
// For typing, uses page.evaluate to focus+clear inputs, then keyboard.type()
// to avoid element interception issues on inner fields too.

/**
 * Attempts to expand the search overlay by clicking/focusing the search area.
 * Returns true if the overlay expanded (keyword input becomes available).
 */
async function expandSearchOverlay(page) {
    const KEYWORD_INPUT_SELECTOR =
        'input.suggestor-input, ' +
        'input[placeholder*="Enter keyword"], ' +
        'input[placeholder*="skills"], ' +
        'input[placeholder*="designation"], ' +
        'input[placeholder*="company"], ' +
        'input[placeholder*="Search jobs here"], ' +
        '.nI-gNb-sb__main input[type="text"]';

    // Helper: check if overlay expanded (keyword input visible)
    async function isOverlayOpen() {
        try {
            const input = await page.$(KEYWORD_INPUT_SELECTOR);
            if (!input) return false;
            return await input.isVisible().catch(() => false);
        } catch { return false; }
    }

    // If overlay is already open (e.g. from warmup), skip
    if (await isOverlayOpen()) {
        console.error('[SEARCH] Search overlay already open.');
        return true;
    }

    // Strategy 1: Click the intercepting overlay container itself
    console.error('[SEARCH] Strategy 1: Clicking #ni-gnb-searchbar container...');
    try {
        const overlay = await page.$('#ni-gnb-searchbar, .nI-gNb-sb__main').catch(() => null);
        if (overlay) {
            await overlay.click({ timeout: 5000 });
            await sleep(2000 + Math.random() * 1000);
            if (await isOverlayOpen()) return true;
        }
    } catch (e) { console.error(`[SEARCH] Strategy 1 failed: ${e.message}`); }

    // Strategy 2: JS dispatchEvent click on the input directly
    console.error('[SEARCH] Strategy 2: JS dispatchEvent click...');
    try {
        await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) {
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                el.focus();
            }
        }, 'input[placeholder*="Search jobs here"], input[placeholder*="Enter keyword"], .nI-gNb-sb__main input');
        await sleep(2000 + Math.random() * 1000);
        if (await isOverlayOpen()) return true;
    } catch (e) { console.error(`[SEARCH] Strategy 2 failed: ${e.message}`); }

    // Strategy 3: force:true click on any search input
    console.error('[SEARCH] Strategy 3: force:true click...');
    try {
        const inputs = await page.$$('input[placeholder*="Search jobs here"], input[placeholder*="search jobs"], .nI-gNb-sb__main input, input[placeholder*="Enter keyword"]');
        for (const inp of inputs) {
            try {
                await inp.click({ force: true, timeout: 3000 });
                await sleep(1500);
                if (await isOverlayOpen()) return true;
            } catch { }
        }
    } catch (e) { console.error(`[SEARCH] Strategy 3 failed: ${e.message}`); }

    // Strategy 4: Keyboard Tab navigation to focus the search field
    console.error('[SEARCH] Strategy 4: Tab navigation...');
    try {
        // Click body first to ensure page has focus
        await page.click('body', { position: { x: 100, y: 100 } }).catch(() => { });
        await sleep(500);
        // Tab through up to 15 elements looking for the search input to get focus
        for (let t = 0; t < 15; t++) {
            await page.keyboard.press('Tab');
            await sleep(200);
            const focused = await page.evaluate(() => {
                const el = document.activeElement;
                return el && el.tagName === 'INPUT' ? el.placeholder || '' : '';
            }).catch(() => '');
            if (/search|keyword|skill|designation|company/i.test(focused)) {
                console.error(`[SEARCH] Tab focused on search input: "${focused}"`);
                await sleep(1000);
                if (await isOverlayOpen()) return true;
                // Even if overlay didn't "open", we have focus — return true
                return true;
            }
        }
    } catch (e) { console.error(`[SEARCH] Strategy 4 failed: ${e.message}`); }

    // Strategy 5: Direct evaluate focus
    console.error('[SEARCH] Strategy 5: Direct evaluate focus...');
    try {
        const focused = await page.evaluate(() => {
            const selectors = [
                'input[placeholder*="Search jobs here"]',
                'input[placeholder*="Enter keyword"]',
                'input[placeholder*="skills"]',
                '.nI-gNb-sb__main input[type="text"]'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    el.click();
                    el.focus();
                    return el.placeholder || 'found';
                }
            }
            return '';
        });
        if (focused) {
            console.error(`[SEARCH] Strategy 5: Focused on "${focused}"`);
            await sleep(2000);
            return true;
        }
    } catch (e) { console.error(`[SEARCH] Strategy 5 failed: ${e.message}`); }

    console.error('[SEARCH] All 5 strategies failed to expand overlay.');
    return false;
}

async function searchViaSearchBar(page, role, location) {
    resetWatchdog();
    try {
        // Step 1: Go to homepage
        console.error(`[SEARCH] Navigating to Naukri homepage...`);
        await page.goto('https://www.naukri.com', { waitUntil: 'load', timeout: 25000 });
        await sleep(3000 + Math.random() * 2000);

        // Do some human-like browsing before interacting with search
        await simulateHumanBehavior(page);
        await sleep(1000 + Math.random() * 1000);

        // Step 2: Expand the search overlay using multi-strategy approach
        const overlayOpened = await expandSearchOverlay(page);
        if (!overlayOpened) {
            console.error('[SEARCH] Could not expand search overlay. Falling back.');
            return false;
        }

        await sleep(1000 + Math.random() * 500);

        // Step 3: Type the role into the keyword field
        // Use evaluate to clear any existing text, then keyboard.type for human-like input
        console.error(`[SEARCH] Typing role: "${role}"`);
        await page.evaluate(() => {
            const selectors = [
                'input.suggestor-input',
                'input[placeholder*="Enter keyword"]',
                'input[placeholder*="skills"]',
                'input[placeholder*="designation"]',
                'input[placeholder*="company"]',
                'input[placeholder*="Search jobs here"]',
                '.nI-gNb-sb__main input[type="text"]'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    el.value = '';
                    el.focus();
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                }
            }
            return false;
        });
        await sleep(300);
        await page.keyboard.type(role, { delay: 60 + Math.random() * 80 });
        await sleep(2000 + Math.random() * 1000);

        // Dismiss suggestion dropdown
        await page.keyboard.press('Escape');
        await sleep(1000);

        // Step 4: Find and fill location
        console.error(`[SEARCH] Looking for location input...`);
        const locationFilled = await page.evaluate((loc) => {
            const selectors = [
                'input#locationSugg',
                'input[placeholder*="Enter location"]',
                'input[placeholder*="Location"]',
                'input[placeholder*="location"]'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    el.value = '';
                    el.focus();
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                }
            }
            return false;
        }, location);

        if (locationFilled) {
            console.error(`[SEARCH] Found location input. Typing: "${location}"`);
            await sleep(300);
            await page.keyboard.type(location, { delay: 60 + Math.random() * 80 });
            await sleep(2000 + Math.random() * 1000);

            // Try to select the first location suggestion
            try {
                const suggestion = await page.waitForSelector(
                    '.suggestor-container li, .suggester-container li, [class*="suggestor"] li, [class*="suggester"] li, .dropdownMainContainer li, ul[class*="Dropdown"] li',
                    { state: 'visible', timeout: 4000 }
                ).catch(() => null);
                if (suggestion) {
                    console.error(`[SEARCH] Selecting location suggestion...`);
                    await suggestion.click({ force: true }).catch(async () => {
                        // If click is intercepted, use JS click
                        await page.evaluate(() => {
                            const li = document.querySelector('.suggestor-container li, [class*="suggestor"] li, .dropdownMainContainer li, ul[class*="Dropdown"] li');
                            if (li) li.click();
                        });
                    });
                    await sleep(800);
                } else {
                    await page.keyboard.press('Escape');
                    await sleep(500);
                }
            } catch (e) {
                await page.keyboard.press('Escape');
                await sleep(500);
            }
        } else {
            console.error(`[SEARCH] Location input not found, searching without location.`);
        }

        // Step 5: Click the Search button (try multiple approaches)
        console.error('[SEARCH] Submitting search...');
        let searchClicked = false;

        // Try JS click on the search/submit button first
        try {
            searchClicked = await page.evaluate(() => {
                // Look for visible search buttons
                const btns = document.querySelectorAll('button');
                for (const btn of btns) {
                    const text = btn.textContent.trim().toLowerCase();
                    if ((text === 'search' || text.includes('search')) && btn.offsetParent !== null) {
                        btn.click();
                        return true;
                    }
                }
                // Try submit buttons
                const submit = document.querySelector('.qsbSubmit, button[type="submit"]');
                if (submit) { submit.click(); return true; }
                return false;
            });
        } catch { }

        if (!searchClicked) {
            // Fallback: press Enter
            console.error('[SEARCH] No Search button found via JS. Pressing Enter...');
            await page.keyboard.press('Enter');
        }

        // Step 6: Wait for results
        console.error(`[SEARCH] Waiting for search results...`);
        await sleep(5000 + Math.random() * 3000);

        const url = page.url();
        console.error(`[SEARCH] Current URL: ${url}`);
        if (url.includes('naukri.com') && (url.includes('jobs') || url.includes('job') || url.includes('search'))) {
            console.error(`[SEARCH] ✅ Search successful!`);
            return true;
        }

        console.error(`[SEARCH] URL doesn't look like results page. Continuing anyway...`);
        return true; // Continue even if URL looks different
    } catch (e) {
        console.error(`[SEARCH] Search bar failed: ${e.message}`);
        return false;
    }
}

/**
 * Improved fallback: Navigate to search URL organically via page.evaluate
 * instead of a cold page.goto, to reduce CAPTCHA risk.
 */
async function navigateToSearchUrlOrganically(page, searchUrl) {
    resetWatchdog();
    console.error(`[SEARCH] Organic fallback: navigating via page.evaluate...`);
    try {
        // Make sure we're on naukri.com first
        const currentUrl = page.url();
        if (!currentUrl.includes('naukri.com')) {
            await page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
            await sleep(3000 + Math.random() * 2000);
            await simulateHumanBehavior(page);
            await sleep(2000 + Math.random() * 2000);
        }

        // Navigate via location.href (in-page navigation, not cold load)
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

// ─── Recruiter Questions Handler ────────────────────────────────
// After clicking Apply, Naukri may show a chatbot popup asking recruiter questions.
// Each question has an input field + "Save" button.
async function handleRecruiterQuestions(jobPage, maxQuestions = 5) {
    resetWatchdog();
    console.error(`[APPLY] Checking for recruiter questions...`);

    for (let q = 0; q < maxQuestions; q++) {
        resetWatchdog();
        await sleep(2000);

        // Check if a chatbot/question modal is present
        const questionModal = await jobPage.$(
            '[class*="chatbot"], [class*="Chatbot"], ' +
            '[class*="chatDialog"], [class*="chat-dialog"], ' +
            '[class*="recruiter"], [class*="questionnaire"], ' +
            '.chatbot_container'
        ).catch(() => null);

        if (!questionModal) {
            console.error(`[APPLY] No question modal found (attempt ${q + 1}). Proceeding...`);
            break;
        }

        // Find the question text
        const questionText = await jobPage.evaluate(() => {
            // Look for the last significant text message in the chat
            const msgs = document.querySelectorAll(
                '[class*="chatbot"] [class*="msg"], ' +
                '[class*="chatbot"] [class*="message"], ' +
                '[class*="chatDialog"] [class*="msg"], ' +
                '[class*="chat-dialog"] [class*="msg"], ' +
                '[class*="recruiter"] p, ' +
                '[class*="Chatbot"] [class*="msg"]'
            );
            for (let i = msgs.length - 1; i >= 0; i--) {
                const t = msgs[i].textContent.trim();
                if (t.includes('?') || t.includes('experience') || t.includes('skill')) {
                    return t;
                }
            }
            // Fallback: get any visible question-like text
            const allText = document.body.innerText;
            const match = allText.match(/(?:how much|how many|do you have|are you|what is|rate your).*?\?/i);
            return match ? match[0] : '';
        }).catch(() => '');

        if (!questionText) {
            console.error(`[APPLY] Could not find question text. Checking for Save button anyway...`);
        } else {
            console.error(`[APPLY] Question ${q + 1}: "${questionText}"`);
        }

        // Find the input field
        const inputField = await jobPage.$(
            '[class*="chatbot"] input[type="text"], ' +
            '[class*="chatbot"] textarea, ' +
            '[class*="chatbot"] input:not([type="hidden"]), ' +
            '[class*="chatDialog"] input, ' +
            '[class*="chat-dialog"] input, ' +
            '[class*="Chatbot"] input[type="text"], ' +
            '[class*="Chatbot"] textarea'
        ).catch(() => null);

        if (inputField) {
            // Generate a reasonable answer
            const answer = generateAnswer(questionText);
            console.error(`[APPLY] Answering: "${answer}"`);

            await inputField.click();
            await sleep(300);
            await inputField.fill('');
            await sleep(200);
            await jobPage.keyboard.type(answer, { delay: 50 + Math.random() * 50 });
            await sleep(1000);
        }

        // Click the Save button
        const saveBtn = await jobPage.$(
            '[class*="chatbot"] button:has-text("Save"), ' +
            '[class*="chatbot"] button:has-text("Submit"), ' +
            '[class*="chatbot"] button:has-text("Next"), ' +
            '[class*="Chatbot"] button:has-text("Save"), ' +
            '[class*="chatDialog"] button:has-text("Save"), ' +
            'button:has-text("Save"), ' +
            'button.chatbot_save'
        ).catch(() => null);

        if (saveBtn) {
            const isVisible = await saveBtn.isVisible().catch(() => false);
            if (isVisible) {
                console.error(`[APPLY] Clicking Save for question ${q + 1}...`);
                await saveBtn.click();
                await sleep(3000 + Math.random() * 2000);
            }
        } else {
            console.error(`[APPLY] No Save button found. Skipping question.`);
            break;
        }
    }
}

// Generate appropriate answer for recruiter questions
function generateAnswer(question) {
    const q = (question || '').toLowerCase();

    // Experience questions ("how much experience in X?")
    if (/experience|years?|yrs/i.test(q)) {
        // Check if the skill is in user's skill list
        const hasSkill = CONFIG.skills.some(s => q.includes(s.toLowerCase()));
        if (hasSkill) return '1';
        // Generic tech → 0 or 1
        return '0';
    }

    // Yes/No questions
    if (/willing|ready|able|available|relocate|join immediately|can you/i.test(q)) {
        return 'Yes';
    }

    // Notice period
    if (/notice period|notice/i.test(q)) {
        return '0';
    }

    // Current CTC / Expected CTC
    if (/current ctc|current salary/i.test(q)) {
        return '0';
    }
    if (/expected ctc|expected salary/i.test(q)) {
        return '4';
    }

    // Rating questions ("rate your skills in X")
    if (/rate|rating|proficiency|scale/i.test(q)) {
        const hasSkill = CONFIG.skills.some(s => q.includes(s.toLowerCase()));
        return hasSkill ? '7' : '3';
    }

    // Default: type "1" as a safe numeric answer
    return '1';
}

// ─── Stealth Init Scripts (from V3.1) ──────────────────────────────
// Patches navigator properties to avoid common bot detection.
async function applyStealthScripts(context) {
    await context.addInitScript(() => {
        // Hide webdriver flag
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });

        // Fake plugins (bots usually have 0)
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                { name: 'Native Client', filename: 'internal-nacl-plugin' }
            ]
        });

        // Set realistic languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-IN', 'en']
        });

        // Realistic hardware concurrency
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            get: () => 8
        });

        // Realistic device memory
        Object.defineProperty(navigator, 'deviceMemory', {
            get: () => 8
        });

        // Fake permissions query
        const originalQuery = window.navigator.permissions?.query;
        if (originalQuery) {
            window.navigator.permissions.query = (parameters) => {
                if (parameters.name === 'notifications') {
                    return Promise.resolve({ state: Notification.permission });
                }
                return originalQuery(parameters);
            };
        }

        // Chrome runtime check
        if (!window.chrome) {
            window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
        }
    });
}

// ─── Multi-Signal Login Check ──────────────────────────────────────
async function checkLoggedIn(page) {
    resetWatchdog();
    try {
        const url = page.url().toLowerCase();
        console.error(`[DEBUG] Validating session at: ${url} | Title: ${await page.title().catch(() => 'Unknown')}`);

        if (url.includes('/nlogin') || url.includes('/login')) return false;

        const urlHasMnjuser = url.includes('mnjuser');
        const hasLogout = await page.$('a[href*="logout"], .nI-gNb-drawer__icon, [class*="logout"]').catch(() => null);
        const bodyText = await page.textContent('body').catch(() => '');
        const hasLoggedInText = /my naukri|view profile|edit profile|recommendations/i.test(bodyText);

        const isLoggedIn = urlHasMnjuser || !!hasLogout || hasLoggedInText;
        console.error(`[DEBUG] Session signals: mnjuser=${urlHasMnjuser}, elements=${!!hasLogout}, text=${hasLoggedInText} -> Result: ${isLoggedIn}`);
        return isLoggedIn;
    } catch (e) {
        console.error(`[DEBUG] checkLoggedIn error: ${e.message}`);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
(async () => {
    let context;
    const results = [];
    const processedKeys = new Set();
    let appliedCount = 0;
    let limitReached = false;

    try {
        if (!fs.existsSync(CONFIG.userDataDir)) {
            output([{
                company: 'SYSTEM', role: 'SESSION_MISSING', status: 'Session Expired',
                statusDetail: `Browser profile not found: ${CONFIG.userDataDir}. Connect Naukri first.`, jobUrl: ''
            }]);
            return;
        }

        console.error(`[apply.js] ★ VERSION ${SCRIPT_VERSION} ★`);
        console.error(`[apply.js] Browser profile: ${CONFIG.userDataDir}`);
        console.error(`[apply.js] Config: role="${CONFIG.role}", locations="${CONFIG.location}", limit=${CONFIG.dailyLimit}, threshold=${CONFIG.matchThreshold}%, skills=[${CONFIG.skills.join(', ')}]`);
        console.error(`[apply.js] Expanded skills (with synonyms): [${EXPANDED_SKILLS.join(', ')}]`);

        resetWatchdog();
        console.error(`[STEP] Starting Smart Job Hunter Agent | Role: "${CONFIG.role}" | Limit: ${CONFIG.dailyLimit}`);

        // Clean up SingletonLock if it exists (prevents launch collision)
        const lockPath = path.join(CONFIG.userDataDir, 'SingletonLock');
        if (fs.existsSync(lockPath)) {
            try { fs.unlinkSync(lockPath); } catch (e) { }
        }

        // Clear browser crash state
        const prefsPath = path.join(CONFIG.userDataDir, 'Default', 'Preferences');
        try {
            if (fs.existsSync(prefsPath)) {
                let prefs = fs.readFileSync(prefsPath, 'utf-8');
                prefs = prefs.replace(/"exit_type"\s*:\s*"Crashed"/g, '"exit_type":"Normal"');
                prefs = prefs.replace(/"exited_cleanly"\s*:\s*false/g, '"exited_cleanly":true');
                fs.writeFileSync(prefsPath, prefs, 'utf-8');
                console.error(`[DEBUG] Cleared browser crash state in Preferences.`);
            }
        } catch (e) { }

        // Random viewport (from V3.1 — avoids fingerprint)
        const viewport = getRandomViewport();
        console.error(`[STEALTH] Using viewport: ${viewport.width}x${viewport.height}`);

        const browserArgs = [
            '--disable-notifications', '--disable-extensions', '--no-sandbox',
            '--disable-setuid-sandbox', '--disable-session-crashed-bubble',
            '--disable-infobars', '--no-default-browser-check',
            '--restore-last-session=false', '--disable-features=InfiniteSessionRestore',
            '--hide-crash-restore-bubble',
            '--disable-blink-features=AutomationControlled'  // from V3.1 — hides automation
        ];

        context = await chromium.launchPersistentContext(CONFIG.userDataDir, {
            headless: false,
            viewport: viewport,
            locale: 'en-IN',
            timezoneId: 'Asia/Kolkata',
            args: browserArgs,
            slowMo: 50,
            ignoreHTTPSErrors: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        });

        // Apply stealth scripts to all pages
        await applyStealthScripts(context);

        const page = context.pages()[0] || await context.newPage();

        // ─── Session Warmup (from V3.1) ────────────────────────────────
        await warmUpSession(page);
        resetWatchdog();

        // ─── Step 1: Validate session ────────────────────────────────
        await gotoWithRetry(page, 'https://www.naukri.com/mnjuser/homepage');
        await sleep(5000);
        resetWatchdog();

        const isLoggedIn = await checkLoggedIn(page);
        if (!isLoggedIn) {
            await takeScreenshot(page, 'debug-session-failed');
            console.error('[FATAL] SESSION_EXPIRED: Login validation failed.');
            output([{
                company: 'NAUKRI', role: 'SESSION_EXPIRED', status: 'Session Expired',
                statusDetail: `Redirected to login. Please reconnect.`, jobUrl: ''
            }]);
            return;
        }

        console.error('[STEP] Session valid! Proceeding to job search...');

        // ─── Step 2: Search by location ─────────────────────────────────
        const locations = CONFIG.location.split(',').map(l => l.trim()).filter(Boolean);
        if (locations.length === 0) locations.push('India');

        for (const loc of locations) {
            resetWatchdog();
            if (limitReached) break;

            console.error(`\n[STEP] 🔍 SEARCHING IN: ${loc.toUpperCase()}`);

            // Inter-location pause — longer, more human-like
            await sleep(3000 + humanDelay(4000));

            const searchUrl = `https://www.naukri.com/${CONFIG.role.toLowerCase().replace(/\s+/g, '-')}-jobs-in-${loc.toLowerCase().replace(/\s+/g, '-')}`;

            try {
                // Search bar first (avoids CAPTCHA), fallback to direct URL
                let searchWorked = await searchViaSearchBar(page, CONFIG.role, loc);

                if (!searchWorked) {
                    console.error(`[SEARCH] Falling back to organic URL navigation for ${loc}`);
                    await navigateToSearchUrlOrganically(page, searchUrl);
                }

                await sleep(5000 + Math.random() * 3000);
                await simulateHumanBehavior(page);

                // ── CAPTCHA check on search results page ──────────────
                if (await isCaptchaPresent(page)) {
                    const solved = await waitForCaptchaClear(page, 120000);
                    if (!solved) {
                        console.error(`[CAPTCHA] Could not clear on search page for ${loc}. Skipping location.`);
                        continue;
                    }
                    await sleep(3000);
                }

                await waitForSelectorWithRetry(page, '.srp-jobtuple-wrapper, .jobTuple, .cust-job-tuple', 15000);
                resetWatchdog();

                const jobCards = await page.$$('.srp-jobtuple-wrapper, .jobTuple, article.jobTuple, .cust-job-tuple');
                console.error(`[STEP] Found ${jobCards.length} jobs in ${loc}.`);

                if (jobCards.length === 0) continue;

                for (let i = 0; i < jobCards.length; i++) {
                    resetWatchdog();

                    // ═══════════════════════════════════════════════════
                    // PRE-CHECK: Hard limit before ANY interaction
                    // ═══════════════════════════════════════════════════
                    if (appliedCount >= CONFIG.dailyLimit) {
                        limitReached = true;
                        console.error(JSON.stringify({ status: 'LIMIT_REACHED', appliedCount, dailyLimit: CONFIG.dailyLimit }));
                        break;
                    }

                    try {
                        await randomDelay(2000, 4000);
                        const currentCards = await page.$$('.srp-jobtuple-wrapper, .jobTuple, article.jobTuple, .cust-job-tuple');
                        if (i >= currentCards.length) break;
                        const card = currentCards[i];

                        const title = await card.$eval('a.title, .row1 a, .jobTuple a', el => el.textContent.trim()).catch(() => 'Unknown Role');
                        const company = await card.$eval('.comp-name, .subTitle a, .companyInfo a', el => el.textContent.trim()).catch(() => 'Unknown Company');
                        const jobUrl = await card.$eval('a.title, .row1 a, .jobTuple a', el => el.href).catch(() => '');

                        // ═══════════════════════════════════════════════════
                        // STEP 1: ROLE FILTER — strict allowlist match
                        // ═══════════════════════════════════════════════════
                        const roleMatched = isRoleRelevant(title);
                        if (!roleMatched) {
                            console.error(JSON.stringify({ title, company, roleMatched: false, matchScore: 0, decision: 'SKIP', reason: 'IRRELEVANT_ROLE' }));
                            results.push({ company, role: title, status: 'Skipped - Irrelevant Role', statusDetail: 'Role allowlist mismatch.', jobUrl, location: loc });
                            continue;
                        }

                        // ═══════════════════════════════════════════════════
                        // STEP 2: DEDUPLICATION — dual-key check
                        // ═══════════════════════════════════════════════════
                        const dedupKeyUrl = jobUrl || '';
                        const dedupKeyCompanyTitle = normalize(company + ':' + title);
                        if ((dedupKeyUrl && processedKeys.has(dedupKeyUrl)) || processedKeys.has(dedupKeyCompanyTitle)) {
                            console.error(JSON.stringify({ title, company, roleMatched: true, matchScore: 0, decision: 'SKIP', reason: 'DUPLICATE' }));
                            continue;
                        }
                        if (dedupKeyUrl) processedKeys.add(dedupKeyUrl);
                        processedKeys.add(dedupKeyCompanyTitle);

                        // ═══════════════════════════════════════════════════
                        // STEP 3: FETCH FULL JD + CALCULATE MATCH SCORE
                        // ═══════════════════════════════════════════════════
                        const cardText = await card.textContent().catch(() => '');
                        console.error(`[DEBUG] Fetching full JD for: ${title} @ ${company}`);
                        const fullJdText = await fetchJobDescription(context, jobUrl, cardText);
                        const matchScore = calculateMatchScore(title + ' ' + fullJdText, CONFIG.skills);

                        if (matchScore < CONFIG.matchThreshold) {
                            console.error(JSON.stringify({ title, company, roleMatched: true, matchScore, decision: 'SKIP', reason: 'LOW_MATCH' }));
                            results.push({ company, role: title, status: 'Skipped - Low Match', statusDetail: `${matchScore}% < ${CONFIG.matchThreshold}%`, jobUrl, location: loc });
                            continue;
                        }

                        // ═══════════════════════════════════════════════════
                        // STEP 4: LIMIT CHECK — right before applying
                        // ═══════════════════════════════════════════════════
                        if (appliedCount >= CONFIG.dailyLimit) {
                            limitReached = true;
                            console.error(JSON.stringify({ title, company, roleMatched: true, matchScore, decision: 'SKIP', reason: 'LIMIT_REACHED' }));
                            break;
                        }

                        // ═══════════════════════════════════════════════════
                        // STEP 5: APPLY — open job in new tab and submit
                        // ═══════════════════════════════════════════════════
                        console.error(`[STEP] ✅ MATCH: ${title} @ ${company} | Score: ${matchScore}% | Attempting apply...`);

                        // Open job in a NEW TAB
                        let jobPage = null;
                        try {
                            if (!jobUrl) {
                                console.error(JSON.stringify({ title, company, roleMatched: true, matchScore, decision: 'SKIP', reason: 'NO_URL' }));
                                results.push({ company, role: title, status: 'Failed', statusDetail: 'No job URL found.', jobUrl, location: loc });
                                continue;
                            }

                            jobPage = await context.newPage();
                            console.error(`[DEBUG] Opening job page: ${jobUrl}`);
                            await jobPage.goto(jobUrl, { waitUntil: 'load', timeout: 30000 });
                            await sleep(3000 + Math.random() * 2000);

                            // Scroll down a bit like a human reading the JD
                            await jobPage.evaluate(() => window.scrollBy(0, 200 + Math.random() * 300));
                            await sleep(1000 + Math.random() * 1000);

                            // CAPTCHA check on job detail page
                            if (await isCaptchaPresent(jobPage)) {
                                const solved = await waitForCaptchaClear(jobPage, 120000);
                                if (!solved) {
                                    console.error(JSON.stringify({ title, company, roleMatched: true, matchScore, decision: 'SKIP', reason: 'CAPTCHA' }));
                                    results.push({ company, role: title, status: 'Skipped - CAPTCHA', jobUrl, location: loc });
                                    continue;
                                }
                                await sleep(2000);
                            }

                            // ── Find Apply button ──────────────────────────────
                            // Wait for the Apply button to render (Naukri loads it via JS)
                            const APPLY_SELECTOR = 'button#apply-button, button.apply-button, button[id*="apply"], button[class*="apply-btn"], button[class*="apply-button"], [class*="styles_jhc__apply"] button, button:has-text("Apply"), button:has-text("Apply Now"), a:has-text("Apply Now"), a:has-text("Apply on company site")';

                            let applyBtn = null;
                            let isExternal = false;

                            try {
                                // WAIT for the button to appear (up to 10s) instead of just checking once
                                applyBtn = await jobPage.waitForSelector(APPLY_SELECTOR, { state: 'visible', timeout: 10000 });
                                console.error(`[DEBUG] Apply button found and visible!`);

                                // Check if it's an external apply
                                const btnText = await applyBtn.textContent().catch(() => '');
                                const tagName = await applyBtn.evaluate(el => el.tagName.toLowerCase()).catch(() => 'button');
                                const href = await applyBtn.evaluate(el => el.href || '').catch(() => '');
                                console.error(`[DEBUG] Button text: "${btnText.trim()}" | tag: ${tagName} | href: ${href ? href.substring(0, 50) : 'none'}`);

                                if ((tagName === 'a' && href && !href.includes('naukri.com')) || /company site|external/i.test(btnText)) {
                                    isExternal = true;
                                }
                            } catch (e) {
                                console.error(`[DEBUG] Apply button not found after 10s wait: ${e.message}`);
                                applyBtn = null;
                            }

                            if (!applyBtn) {
                                // Take screenshot for debugging
                                await takeScreenshot(jobPage, `no-apply-btn-${normalize(company).replace(/\s+/g, '-')}`);
                                // Check if already applied
                                const pageText = await jobPage.textContent('body').catch(() => '');
                                if (/already applied|application submitted/i.test(pageText)) {
                                    console.error(JSON.stringify({ title, company, roleMatched: true, matchScore, decision: 'SKIP', reason: 'ALREADY_APPLIED' }));
                                    results.push({ company, role: title, status: 'Already Applied', statusDetail: `Score: ${matchScore}%`, jobUrl, location: loc });
                                } else {
                                    console.error(JSON.stringify({ title, company, roleMatched: true, matchScore, decision: 'SKIP', reason: 'NO_BUTTON' }));
                                    results.push({ company, role: title, status: 'Failed', statusDetail: 'Apply button not found.', jobUrl, location: loc });
                                }
                                continue;
                            }

                            if (isExternal) {
                                console.error(JSON.stringify({ title, company, roleMatched: true, matchScore, decision: 'SKIP', reason: 'EXTERNAL' }));
                                results.push({ company, role: title, status: 'Skipped - External', statusDetail: 'External application site.', jobUrl, location: loc });
                                continue;
                            }

                            // Click the Apply button
                            console.error(`[APPLY] Clicking Apply button...`);
                            await applyBtn.click({ delay: 100 + Math.random() * 200 });
                            await sleep(4000 + Math.random() * 2000);

                            // Handle recruiter questions if they appear
                            await handleRecruiterQuestions(jobPage);
                            await sleep(2000);

                            // Check if application was successful
                            const bodyText = await jobPage.textContent('body').catch(() => '');
                            const isApplied = /applied to|application submitted|applied successfully|already applied|your application|successfully applied/i.test(bodyText);

                            if (isApplied) {
                                appliedCount++;
                                console.error(JSON.stringify({ title, company, roleMatched: true, matchScore, decision: 'APPLY', reason: 'SUCCESS', appliedCount, dailyLimit: CONFIG.dailyLimit }));
                                results.push({ company, role: title, status: 'Applied', statusDetail: `Score: ${matchScore}%`, jobUrl, location: loc });

                                if (appliedCount >= CONFIG.dailyLimit) {
                                    limitReached = true;
                                    console.error(JSON.stringify({ status: 'LIMIT_REACHED_AFTER_APPLY', appliedCount, dailyLimit: CONFIG.dailyLimit }));
                                    break;
                                }
                            } else {
                                // Take screenshot for debugging
                                await takeScreenshot(jobPage, `post-apply-${normalize(company).replace(/\s+/g, '-')}`);
                                console.error(`[APPLY] Application status unclear. Page text snippet: "${bodyText.substring(0, 200)}"`);
                                console.error(JSON.stringify({ title, company, roleMatched: true, matchScore, decision: 'SKIP', reason: 'STATUS_UNCLEAR' }));
                                results.push({ company, role: title, status: 'Applied (Unconfirmed)', statusDetail: `Score: ${matchScore}% - could not confirm`, jobUrl, location: loc });
                                appliedCount++; // Count it anyway since we clicked Apply
                            }

                        } catch (err) {
                            console.error(JSON.stringify({ title, company, decision: 'SKIP', reason: 'APPLY_ERROR', error: err.message }));
                            results.push({ company, role: title, status: 'Failed', statusDetail: err.message, jobUrl, location: loc });
                        } finally {
                            if (jobPage) await jobPage.close().catch(() => { });
                        }

                        await sleep(3000 + Math.random() * 2000);

                    } catch (err) {
                        console.error(JSON.stringify({ title: 'Unknown', company: 'Unknown', decision: 'SKIP', reason: 'ERROR', error: err.message }));
                    }
                }
            } catch (err) {
                console.error(`[apply.js] Search failed for ${loc}: ${err.message}`);
            }
        }

        console.error(`\n[SUMMARY] Applied: ${appliedCount}/${CONFIG.dailyLimit} | Limit reached: ${limitReached} | Total results: ${results.length}`);

        output(results.length > 0 ? results : [{
            company: 'NAUKRI', role: CONFIG.role, status: 'Failed',
            statusDetail: 'No jobs processed in any location.', jobUrl: ''
        }]);

    } catch (error) {
        console.error(`[apply.js] Fatal: ${error.message}`);
        output([{
            company: 'SYSTEM', role: 'ERROR', status: 'Failed',
            statusDetail: `Fatal: ${error.message}`, jobUrl: ''
        }]);
    } finally {
        // Clear watchdog BEFORE cleanup — context.close() can be slow
        if (watchdogInterval) clearInterval(watchdogInterval);

        if (context) {
            // Race: close browser within 10s, force-exit if it hangs
            try {
                await Promise.race([
                    context.close(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), 10000))
                ]);
            } catch (e) {
                console.error(`[DEBUG] Browser close: ${e.message}. Force exiting.`);
            }
        }
    }
})();
