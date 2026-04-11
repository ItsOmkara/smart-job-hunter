/**
 * llm-brain.js — Groq LLM client for the browser automation agent
 * 
 * Provides:
 *   - callGroq: Raw API call to Groq chat completions
 *   - decideAction: Given page state + task, returns the next action
 *   - parseAction: Extracts JSON action from LLM response text
 */

const https = require('https');

const API_HOST = 'api.groq.com';
const API_PATH = '/openai/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30000;

// ─── System Prompt ──────────────────────────────────────────────────

function buildSystemPrompt(agentConfig = {}) {
    const skillsList = agentConfig.skills?.length
        ? `\nUser's skills: ${agentConfig.skills.join(', ')}`
        : '';

    return `You are a browser automation agent on a Naukri.com JOB DETAIL PAGE.
Your ONLY task is to APPLY for the job. You observe the page state and choose ONE action.

## Available Actions
Respond with EXACTLY ONE action as strict JSON (no markdown, no extra text):

1. click — Click an element by index
   {"thought":"...","action":"click","params":{"elementIndex":<n>}}

2. type — Type into a focused input (click it first)
   {"thought":"...","action":"type","params":{"elementIndex":<n>,"text":"..."}}

3. clear_and_type — Clear field then type new text
   {"thought":"...","action":"clear_and_type","params":{"elementIndex":<n>,"text":"..."}}

4. press_key — Press a key
   {"thought":"...","action":"press_key","params":{"key":"Enter|Escape|Tab|Backspace"}}

5. scroll — Scroll the page
   {"thought":"...","action":"scroll","params":{"direction":"down|up"}}

6. wait — Wait for content to load (1-5s)
   {"thought":"...","action":"wait","params":{"seconds":<1-5>}}

7. answer_question — Answer a recruiter question in an input field
   {"thought":"...","action":"answer_question","params":{"elementIndex":<n>,"answer":"..."}}

8. done — Task is complete
   {"thought":"...","action":"done","params":{"reason":"...","success":true|false}}

## Your Goal
1. Find the "Apply" or "Apply Now" button and CLICK it
2. If a chatbot/questionnaire popup appears, answer questions then click "Save"
3. Confirm the application was submitted

## Rules
1. ALWAYS respond with valid JSON only. No markdown, no commentary.
2. ONLY use element indices from [INTERACTIVE ELEMENTS]. Never guess.
3. Click a field before typing.
4. Use "wait" after clicks for the page to update.
5. CAPTCHA / "verify human" → done with reason="captcha_detected", success=false
6. "Already applied" / "application submitted" → done with reason="already_applied", success=true
7. After clicking Apply and seeing confirmation → done with reason="applied", success=true
8. No Apply button / external site link → done with reason="external_apply", success=false
9. Login page → done with reason="session_expired", success=false
10. Close popups/modals with X button or Escape BEFORE looking for Apply
11. Keep "thought" to 1 sentence max.
12. Do NOT navigate away from this page.
${skillsList}

## Answering Recruiter Questions
- Experience/years in a skill the user has: "1", otherwise: "0"
- Availability/willingness/relocation: "Yes"
- Notice period: "0"
- Current CTC: "0"
- Expected CTC: "4"
- Rating (1-10) for user's skills: "7", others: "3"
- Default unclear: "1"`;
}

// ─── Groq API Call ──────────────────────────────────────────────────

function callGroq(apiKey, messages, model = DEFAULT_MODEL) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model,
            messages,
            temperature: 0.1,
            max_completion_tokens: 2048,
        });

        const options = {
            hostname: API_HOST,
            path: API_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 429) {
                    reject(new Error('RATE_LIMITED'));
                    return;
                }
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.message?.content || '';
                        const usage = parsed.usage || {};
                        resolve({ content, usage });
                    } catch (e) {
                        reject(new Error(`Parse error: ${e.message}`));
                    }
                } else {
                    reject(new Error(`Groq ${res.statusCode}: ${data.substring(0, 300)}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy();
            reject(new Error(`Groq timeout (${REQUEST_TIMEOUT_MS}ms)`));
        });

        req.write(body);
        req.end();
    });
}

// ─── Response Parser ────────────────────────────────────────────────

function parseAction(responseText) {
    let text = (responseText || '').trim();

    // Strip markdown code fences
    text = text.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();

    // Try direct parse
    try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.action) return parsed;
    } catch { }

    // Try to extract balanced JSON from text
    const startIdx = text.indexOf('{');
    if (startIdx >= 0) {
        let depth = 0;
        let endIdx = -1;
        for (let i = startIdx; i < text.length; i++) {
            if (text[i] === '{') depth++;
            if (text[i] === '}') depth--;
            if (depth === 0) { endIdx = i + 1; break; }
        }
        if (endIdx > startIdx) {
            try {
                const parsed = JSON.parse(text.substring(startIdx, endIdx));
                if (parsed && parsed.action) return parsed;
            } catch { }
        }
    }

    // Fallback
    console.error(`[LLM] Could not parse: ${text.substring(0, 200)}`);
    return { thought: 'Parse failed, waiting...', action: 'wait', params: { seconds: 2 } };
}

// ─── Main Decision Function ─────────────────────────────────────────

async function decideAction(apiKey, pageState, taskDescription, history = [], model = DEFAULT_MODEL, agentConfig = {}) {
    const systemPrompt = buildSystemPrompt(agentConfig);
    const userMessage = {
        role: 'user',
        content: `## Current Task\n${taskDescription}\n\n## Current Page State\n${pageState}`
    };

    let messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        userMessage
    ];

    // Trim history aggressively — keep only last 4 messages (2 exchanges)
    // This keeps token usage at ~5-6K per call instead of growing to 15K+
    if (messages.length > 8) {
        messages = [messages[0], ...messages.slice(-6)];
    }

    let lastError = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const { content, usage } = await callGroq(apiKey, messages, model);
            console.error(`[LLM] Tokens: in=${usage.prompt_tokens || '?'} out=${usage.completion_tokens || '?'}`);

            const action = parseAction(content);
            return {
                action,
                rawResponse: content,
                historyEntries: [userMessage, { role: 'assistant', content }]
            };
        } catch (e) {
            lastError = e;
            const isRateLimit = e.message.includes('RATE_LIMITED');
            const waitMs = isRateLimit ? 10000 * (attempt + 1) : 2000 * (attempt + 1);
            console.error(`[LLM] Attempt ${attempt + 1}/${MAX_RETRIES} failed: ${e.message}. Retrying in ${waitMs}ms...`);
            await new Promise(r => setTimeout(r, waitMs));
        }
    }

    // All retries failed
    console.error(`[LLM] All retries failed. Last: ${lastError?.message}`);
    return {
        action: { thought: 'LLM API failed', action: 'done', params: { reason: 'llm_api_error', success: false } },
        rawResponse: '',
        historyEntries: []
    };
}

module.exports = { decideAction, callGroq, parseAction, buildSystemPrompt };
