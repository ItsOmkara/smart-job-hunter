/**
 * login.js — Playwright persistent-context Naukri login
 *
 * Uses launchPersistentContext so the REAL browser profile is preserved.
 * Navigates to mnjuser/homepage to force login prompt.
 * Uses multiple checks (logout button, URL, profile elements) for detection.
 *
 * Usage: node login.js [--userDataDir ./browser-data]
 * Output (stdout JSON): { status, message }
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
function getArg(name, defaultVal) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const USER_DATA_DIR = getArg('userDataDir', path.join(__dirname, '..', 'browser-data'));
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'debug-screenshots');
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function output(result) {
    console.log(JSON.stringify(result));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function takeScreenshot(page, name) {
    try {
        if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        const filepath = path.join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`);
        await page.screenshot({ path: filepath, fullPage: false });
        console.error(`[login.js] Screenshot saved: ${filepath}`);
    } catch (e) {
        console.error(`[login.js] Screenshot failed: ${e.message}`);
    }
}

(async () => {
    let context;
    try {
        if (!fs.existsSync(USER_DATA_DIR)) {
            fs.mkdirSync(USER_DATA_DIR, { recursive: true });
        }

        console.error(`[login.js] Browser profile: ${USER_DATA_DIR}`);

        // Launch VISIBLE browser with persistent context
        context = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: false,
            args: ['--start-maximized'],
            viewport: null,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        const page = context.pages()[0] || await context.newPage();

        // Navigate to mnjuser/homepage — this forces login if not authenticated
        console.error('[login.js] Navigating to Naukri profile page (forces login if needed)...');
        await page.goto('https://www.naukri.com/mnjuser/homepage', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(3000);
        await takeScreenshot(page, 'initial-load');

        const initialUrl = page.url();
        console.error(`[login.js] Initial URL: ${initialUrl}`);

        // Check if already logged in
        const alreadyLoggedIn = await checkLoggedIn(page);
        if (alreadyLoggedIn) {
            console.error('[login.js] Already logged in! Session is valid.');
            await takeScreenshot(page, 'already-logged-in');
            output({ status: 'success', message: 'Already logged in. Session is valid.' });
            return;
        }

        // Not logged in — wait for user to complete login manually
        console.error('[login.js] Not logged in. Waiting for manual login (OTP/CAPTCHA)...');
        console.error('[login.js] You have 5 minutes to complete login.');

        // Poll every 5 seconds to check login state (not relying on URL change alone)
        const startTime = Date.now();
        let loggedIn = false;

        while (Date.now() - startTime < LOGIN_TIMEOUT_MS) {
            await sleep(5000);

            loggedIn = await checkLoggedIn(page);
            if (loggedIn) {
                console.error('[login.js] Login detected!');
                break;
            }

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.error(`[login.js] Still waiting... (${elapsed}s elapsed). URL: ${page.url()}`);
        }

        if (loggedIn) {
            // Wait for cookies to fully settle
            await sleep(3000);
            await takeScreenshot(page, 'login-success');

            // Navigate to profile page to confirm
            await page.goto('https://www.naukri.com/mnjuser/homepage', { waitUntil: 'domcontentloaded', timeout: 15000 });
            await sleep(3000);

            const confirmed = await checkLoggedIn(page);
            if (confirmed) {
                console.error('[login.js] Login CONFIRMED on profile page!');
                output({ status: 'success', message: 'Login confirmed. Session saved in browser profile.' });
            } else {
                console.error('[login.js] Login detected but profile page not accessible. Saving anyway.');
                await takeScreenshot(page, 'login-unconfirmed');
                output({ status: 'success', message: 'Login detected but profile verification unclear. Session saved.' });
            }
        } else {
            console.error('[login.js] Timeout: No login detected after 5 minutes.');
            await takeScreenshot(page, 'login-timeout');
            output({ status: 'timeout', message: 'Login timeout (5 min). Please try again.' });
        }

    } catch (error) {
        console.error(`[login.js] Error: ${error.message}`);
        output({ status: 'error', message: error.message });
    } finally {
        if (context) {
            await context.close().catch(() => { });
        }
    }
})();

/**
 * Check if user is actually logged in using multiple signals.
 * Returns true only if we have strong evidence of login.
 */
async function checkLoggedIn(page) {
    try {
        const url = page.url().toLowerCase();
        console.error(`[login.js] checkLoggedIn URL: ${url}`);

        // Signal 1: URL contains mnjuser (profile pages only accessible when logged in)
        const urlHasMnjuser = url.includes('mnjuser');

        // Signal 2: Logout button/link exists
        const logoutEl = await page.$('a[href*="logout"], [class*="logout"], a:has-text("Logout"), a:has-text("Sign out")').catch(() => null);

        // Signal 3: Profile/user elements
        const profileEl = await page.$([
            '[class*="nI-gNb-drawer__icon"]',
            'a[href*="mnjuser"]',
            '[class*="user-details"]',
            'img[class*="avatar"]',
            '.nI-gNb-header__right',
            'a[href*="myNaukri"]',
            '[class*="view-profile"]'
        ].join(', ')).catch(() => null);

        // Signal 4: Page body text
        const bodyText = await page.textContent('body').catch(() => '');
        const hasLoggedInText = /my naukri|view profile|edit profile|my jobs|inbox|recommendations for you/i.test(bodyText);

        // Signal 5: NOT on login page
        const onLoginPage = url.includes('/nlogin') || url.includes('/login');

        console.error(`[login.js] Signals — url_mnjuser:${urlHasMnjuser}, logout:${!!logoutEl}, profile:${!!profileEl}, text:${hasLoggedInText}, on_login:${onLoginPage}`);

        // Logged in if: (mnjuser in URL OR logout button exists OR profile element exists OR logged-in text) AND NOT on login page
        if (onLoginPage) return false;
        return urlHasMnjuser || !!logoutEl || !!profileEl || hasLoggedInText;

    } catch (e) {
        console.error(`[login.js] checkLoggedIn error: ${e.message}`);
        return false;
    }
}
