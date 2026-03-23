package com.omkar.jobhunter.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.omkar.jobhunter.dto.AgentRequest;
import com.omkar.jobhunter.model.ApplicationLog;
import com.omkar.jobhunter.model.UserSession;
import com.omkar.jobhunter.repository.UserSessionRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.io.IOException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class TinyFishService {

    private static final Logger log = LoggerFactory.getLogger(TinyFishService.class);

    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    @Value("${tinyfish.api.key}")
    private String apiKey;

    @PostConstruct
    public void init() {
        if (apiKey != null) {
            apiKey = apiKey.trim().replaceAll("^\"|\"$", "").replaceAll("^'|'$", "");
        }
        if (apiKey == null || apiKey.isBlank()) {
            log.error("TinyFish API key is NOT set! Check application.properties");
        } else {
            String masked = apiKey.length() >= 10 ? apiKey.substring(0, 10) + "..." : "***";
            log.info("TinyFish API key loaded: {} (length={})", masked, apiKey.length());
        }
    }

    public TinyFishService(WebClient.Builder webClientBuilder,
            @Value("${tinyfish.api.url}") String apiUrl) {

        // Strip any accidental quotes from the URL
        if (apiUrl != null) {
            apiUrl = apiUrl.trim().replaceAll("^\"|\"$", "").replaceAll("^'|'$", "");
        }

        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofMinutes(10));

        this.webClient = webClientBuilder
                .baseUrl(apiUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();

        this.objectMapper = new ObjectMapper();
    }

    // ========================================================================
    // SESSION CONNECT: Open Naukri login, wait for manual login, capture state
    // ========================================================================

    /**
     * Specialized response for the start of a connection flow.
     */
    public record ConnectionResponse(String streamUrl, String status) {
    }

    /**
     * Starts the Naukri connection flow.
     * Returns the streamUrl immediately so the user can login.
     * Continues listening for the session capture in the background.
     */
    public ConnectionResponse startNaukriConnection(UserSessionRepository repository) {
        String goal = """
                STEP 1: Navigate to https://www.naukri.com/nlogin/login
                STEP 2: Wait for the user to manually login (they will enter credentials, OTP, CAPTCHA, etc.).
                        Check every 10 seconds if the URL has changed from /nlogin/login.
                        Also check if the page shows a profile icon, user avatar, or dashboard elements.
                        Keep waiting for up to 5 minutes.
                STEP 3: Once the user is logged in (URL changed AND dashboard/profile visible), WAIT 5 seconds.
                STEP 4: Run the following JavaScript in the browser console and capture the output:

                        (function() {
                            var cookies = document.cookie;
                            var ls = {};
                            for (var i = 0; i < localStorage.length; i++) {
                                var key = localStorage.key(i);
                                ls[key] = localStorage.getItem(key);
                            }
                            return JSON.stringify({
                                status: 'success',
                                cookies: cookies,
                                localStorage: ls,
                                url: window.location.href,
                                timestamp: new Date().toISOString()
                            });
                        })()

                STEP 5: Return the COMPLETE output from Step 4 as the final result.
                        The result MUST contain the full cookies string and all localStorage entries.
                        Do NOT summarize or truncate — return the COMPLETE JSON.
                """;

        Map<String, String> body = new HashMap<>();
        body.put("url", "https://www.naukri.com/nlogin/login");
        body.put("goal", goal);

        log.info("Initiating asynchronous Naukri session connect flow via TinyFish...");
        log.info("Request body: url={}, goal length={}", body.get("url"), goal.length());

        java.util.concurrent.CompletableFuture<String> streamUrlFuture = new java.util.concurrent.CompletableFuture<>();
        StringBuilder errorMessage = new StringBuilder();
        AtomicInteger eventCounter = new AtomicInteger(0);

        // Single subscription to handle everything
        webClient.post()
                .header("X-API-Key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> {
                    int statusCode = response.statusCode().value();
                    log.error("TinyFish API returned error status: {}", statusCode);
                    return response.bodyToMono(String.class)
                            .defaultIfEmpty("(empty error body)")
                            .flatMap(errorBody -> {
                                log.error("TinyFish Error Body (HTTP {}): {}", statusCode, errorBody);
                                String userFriendlyMsg = buildErrorMessage(statusCode, errorBody);
                                errorMessage.append(userFriendlyMsg);
                                return reactor.core.publisher.Mono.error(new RuntimeException(userFriendlyMsg));
                            });
                })
                .bodyToFlux(String.class)
                .doOnSubscribe(sub -> log.info("Subscription started for TinyFish SSE stream."))
                .doOnNext(event -> {
                    int idx = eventCounter.incrementAndGet();
                    if (event == null || event.isBlank()) {
                        log.info("SSE Event #{}: [EMPTY/KEEP-ALIVE]", idx);
                        return;
                    }

                    // Log every event with index for diagnostics
                    log.info("SSE Event #{}: {}", idx,
                            event.length() > 500 ? event.substring(0, 500) + "...(truncated)" : event);

                    // Strip SSE "data: " prefix if present
                    String jsonPayload = event.trim();
                    if (jsonPayload.startsWith("data:")) {
                        jsonPayload = jsonPayload.substring(5).trim();
                    }

                    // Try to extract stream_url from any event that looks like JSON
                    if (jsonPayload.startsWith("{")) {
                        try {
                            JsonNode node = objectMapper.readTree(jsonPayload);

                            // Check for errors in the response
                            JsonNode errorNode = node.get("error");
                            if (errorNode != null && !errorNode.isNull()) {
                                String errorDetail = errorNode.isObject()
                                        ? errorNode.has("message") ? errorNode.get("message").asText()
                                                : errorNode.toString()
                                        : errorNode.asText();
                                log.error("SSE Event #{} contains ERROR: {}", idx, errorDetail);
                                errorMessage.append(errorDetail);
                                streamUrlFuture.completeExceptionally(new RuntimeException(errorDetail));
                                return;
                            }

                            // Try multiple field names for stream URL
                            String url = extractStreamUrl(node);
                            if (url != null && !url.isBlank()) {
                                log.info("SUCCESS: Captured streamUrl from event #{}: {}", idx, url);
                                streamUrlFuture.complete(url);
                                return;
                            }

                            // Log what fields ARE present for debugging
                            List<String> fieldNames = new ArrayList<>();
                            node.fieldNames().forEachRemaining(fieldNames::add);
                            log.info("SSE Event #{} fields: {} (no stream_url found)", idx, fieldNames);

                            // Check for COMPLETE event
                            String typeField = node.has("type") ? node.get("type").asText() : "";
                            if ("COMPLETE".equalsIgnoreCase(typeField) || event.contains("COMPLETE")) {
                                log.info("SSE Event #{}: COMPLETE event detected", idx);
                                String storageState = extractStorageState(jsonPayload);
                                if (storageState != null) {
                                    saveSession(repository, storageState);
                                }
                            }

                        } catch (Exception e) {
                            log.error("SSE Event #{}: Failed to parse as JSON: {}", idx, e.getMessage());
                        }
                    } else {
                        log.info("SSE Event #{}: Non-JSON content: {}", idx, jsonPayload);
                    }
                })
                .doOnError(error -> {
                    log.error("Connect flow stream error: {}", error.getMessage(), error);
                    if (!streamUrlFuture.isDone()) {
                        if (errorMessage.length() == 0) {
                            errorMessage.append(error.getMessage());
                        }
                        streamUrlFuture.completeExceptionally(error);
                    }
                })
                .doOnComplete(() -> {
                    log.info("TinyFish SSE stream completed normally. Total events: {}", eventCounter.get());
                    if (!streamUrlFuture.isDone()) {
                        String msg = eventCounter.get() == 0
                                ? "No events received from TinyFish (API key may be invalid or no credits)"
                                : "Stream completed without stream_url after " + eventCounter.get() + " events";
                        log.warn(msg);
                        streamUrlFuture.complete("");
                        if (errorMessage.length() == 0) {
                            errorMessage.append(msg);
                        }
                    }
                })
                .doOnTerminate(() -> {
                    log.info("TinyFish SSE stream terminated. Total events received: {}", eventCounter.get());
                })
                .subscribe(); // Run in background

        String streamUrl = "";
        try {
            log.info("Waiting up to 120 seconds for streamUrl...");
            streamUrl = streamUrlFuture.get(120, java.util.concurrent.TimeUnit.SECONDS);
        } catch (java.util.concurrent.ExecutionException e) {
            String msg = errorMessage.length() > 0 ? errorMessage.toString() : e.getCause().getMessage();
            log.error("Connection failed with execution error: {}", msg);
            return new ConnectionResponse("", "failed: " + msg);
        } catch (java.util.concurrent.TimeoutException e) {
            int received = eventCounter.get();
            String msg = received == 0
                    ? "No response from TinyFish API after 120s. Check API key and credits."
                    : "Timeout after 120s (" + received
                            + " events received but no stream_url). Check TinyFish dashboard.";
            log.error(msg);
            return new ConnectionResponse("", "failed: " + msg);
        } catch (Exception e) {
            log.error("Unexpected error waiting for streamUrl", e);
            return new ConnectionResponse("", "failed: " + e.getMessage());
        }

        if (streamUrl.isBlank()) {
            String msg = errorMessage.length() > 0 ? errorMessage.toString() : "no stream_url received";
            return new ConnectionResponse("", "failed: " + msg);
        }
        return new ConnectionResponse(streamUrl, "started");
    }

    /**
     * Extract stream URL from a JSON node, trying multiple field names.
     * TinyFish sends the live view URL in a STREAMING_URL event with field name
     * "streamingUrl".
     */
    private String extractStreamUrl(JsonNode node) {
        // Try all known field names — TinyFish uses "streamingUrl" in STREAMING_URL
        // events
        String[] fieldNames = { "streamingUrl", "streaming_url", "stream_url", "streamUrl",
                "liveViewUrl", "live_view_url", "viewUrl", "url" };
        for (String field : fieldNames) {
            JsonNode urlNode = node.get(field);
            if (urlNode != null && !urlNode.isNull() && !urlNode.asText().isBlank()) {
                log.info("Found stream URL in field '{}': {}", field, urlNode.asText());
                return urlNode.asText();
            }
        }
        // Try nested under "data"
        JsonNode dataNode = node.get("data");
        if (dataNode != null && dataNode.isObject()) {
            for (String field : fieldNames) {
                JsonNode urlNode = dataNode.get(field);
                if (urlNode != null && !urlNode.isNull() && !urlNode.asText().isBlank()) {
                    log.info("Found stream URL in data.{}: {}", field, urlNode.asText());
                    return urlNode.asText();
                }
            }
        }
        return null;
    }

    /**
     * Build a user-friendly error message from HTTP status and response body.
     */
    private String buildErrorMessage(int statusCode, String errorBody) {
        if (statusCode == 401 || statusCode == 403) {
            if (errorBody.contains("Insufficient credits") || errorBody.contains("0 credits")) {
                return "TinyFish API: Insufficient credits. Please top up at agent.tinyfish.ai";
            }
            return "TinyFish API: Invalid or expired API key (HTTP " + statusCode + "). Check application.properties";
        }
        if (statusCode == 429) {
            return "TinyFish API: Rate limited. Please wait and try again.";
        }
        if (statusCode >= 500) {
            return "TinyFish API: Server error (HTTP " + statusCode + "). Service may be down. Try again later.";
        }
        // Include raw error body for unknown errors
        String detail = errorBody.length() > 200 ? errorBody.substring(0, 200) + "..." : errorBody;
        return "TinyFish API error (HTTP " + statusCode + "): " + detail;
    }

    private void saveSession(UserSessionRepository repository, String storageState) {
        // Deactivate any existing active sessions
        repository.findFirstByPlatformAndIsActiveTrueOrderBySavedAtDesc("naukri")
                .ifPresent(session -> {
                    session.setActive(false);
                    repository.save(session);
                });

        // Save new session
        UserSession newSession = new UserSession();
        newSession.setPlatform("naukri");
        newSession.setStorageState(storageState);
        newSession.setSavedAt(LocalDateTime.now());
        newSession.setActive(true);
        repository.save(newSession);
        log.info("Asynchronously saved new Naukri session.");
    }

    /**
     * Old blocking method - maintained for compatibility or removal later
     * 
     * @deprecated Use startNaukriConnection for better UI experience
     */
    @Deprecated
    public String connectNaukri() {
        // This is now just a wrapper or can be removed
        return null;
    }

    /**
     * Extracts storageState JSON from a COMPLETE event.
     */
    private String extractStorageState(String eventData) {
        try {
            JsonNode rootNode = objectMapper.readTree(eventData);
            JsonNode resultNode = rootNode.get("result");
            if (resultNode == null) {
                log.warn("No 'result' field in COMPLETE event for session connect.");
                return null;
            }

            JsonNode storageStateNode = resultNode.get("storageState");
            if (storageStateNode != null && !storageStateNode.isNull()) {
                String storageState = objectMapper.writeValueAsString(storageStateNode);
                log.info("StorageState extracted from 'storageState' field (length={} chars).", storageState.length());
                if (storageState.length() < 300) {
                    log.warn("StorageState seems too small ({} chars). May not contain valid session data.",
                            storageState.length());
                }
                return storageState;
            }

            // Try cookies + localStorage fields (our new JavaScript extraction format)
            JsonNode cookiesNode = resultNode.get("cookies");
            JsonNode localStorageNode = resultNode.get("localStorage");
            if (cookiesNode != null || localStorageNode != null) {
                Map<String, Object> sessionData = new HashMap<>();
                if (cookiesNode != null)
                    sessionData.put("cookies", cookiesNode.asText());
                if (localStorageNode != null)
                    sessionData.put("localStorage", objectMapper.convertValue(localStorageNode, Map.class));
                if (resultNode.has("url"))
                    sessionData.put("url", resultNode.get("url").asText());
                if (resultNode.has("timestamp"))
                    sessionData.put("timestamp", resultNode.get("timestamp").asText());
                String storageState = objectMapper.writeValueAsString(sessionData);
                log.info("StorageState extracted from cookies+localStorage fields (length={} chars).",
                        storageState.length());
                if (storageState.length() < 300) {
                    log.warn("StorageState seems too small ({} chars). May not contain valid session data.",
                            storageState.length());
                }
                return storageState;
            }

            // Try to find storageState nested in other fields
            var fieldNames = resultNode.fieldNames();
            while (fieldNames.hasNext()) {
                String key = fieldNames.next();
                JsonNode candidate = resultNode.get(key);
                if (candidate != null && candidate.isObject()) {
                    JsonNode nestedStorage = candidate.get("storageState");
                    if (nestedStorage != null && !nestedStorage.isNull()) {
                        String storageState = objectMapper.writeValueAsString(nestedStorage);
                        log.info("StorageState found under '{}' (length={} chars).", key,
                                storageState.length());
                        return storageState;
                    }
                }
            }

            // Fallback: return the entire result as storageState
            String fallback = objectMapper.writeValueAsString(resultNode);
            log.info("Using full result as storageState fallback (length={} chars).", fallback.length());
            return fallback;

        } catch (IOException e) {
            log.error("Failed to parse storageState from COMPLETE event.", e);
            return null;
        }
    }

    // ========================================================================
    // SESSION-BASED APPLY: Load session, then search & apply to jobs
    // ========================================================================

    /**
     * Builds the goal prompt with session reuse (storageState) and job application.
     * No credential-based login — session must already exist.
     */
    private String buildSessionApplyGoal(AgentRequest request, String storageState) {
        String searchUrl = String.format("https://www.naukri.com/%s-jobs-in-%s",
                request.getRole().toLowerCase().replace(" ", "-"),
                request.getLocation().toLowerCase().replace(" ", "-"));

        return String.format(
                """
                        === GLOBAL RULES (apply to ALL steps) ===
                        - Use the SAME browser tab/context for everything.
                        - CRITICAL: Act like a real human user. Add random delays of 2-5 seconds between every action.
                        - When typing, type each character one by one with 200-600ms random delay per keystroke.
                        - After every page load, wait 3-5 seconds before doing anything.
                        - Occasionally scroll down slowly and scroll back up before interacting.
                        - Move the mouse cursor naturally to elements before clicking.
                        - Do NOT perform actions too quickly (avoid detection).
                        - Do NOT attempt to bypass CAPTCHA or OTP. If they appear, STOP and report.

                        ======================================================
                        STEP 0: SESSION RESTORATION (Set cookies + localStorage via JavaScript)
                        ======================================================
                        CRITICAL: Before doing anything else, run the following JavaScript to restore the session.

                        Run this JavaScript in the browser console on https://www.naukri.com:

                        // First navigate to naukri.com, then run this script:
                        (function() {
                            var sessionData = %s;
                            // Set cookies
                            if (sessionData.cookies) {
                                var cookieParts = sessionData.cookies.split('; ');
                                cookieParts.forEach(function(c) {
                                    document.cookie = c + '; path=/; domain=.naukri.com';
                                });
                            }
                            // Set localStorage
                            if (sessionData.localStorage) {
                                Object.keys(sessionData.localStorage).forEach(function(key) {
                                    localStorage.setItem(key, sessionData.localStorage[key]);
                                });
                            }
                            return 'Session restored';
                        })()

                        After running the JavaScript:
                        0a. Reload the page (press F5 or navigate to https://www.naukri.com).
                        0b. Wait 5 seconds for the page to fully load.
                        0c. Verify user is still logged in (Session Valid) by looking for:
                            - Profile icon or user avatar in the top-right
                            - "My Naukri" menu item
                            - User name displayed anywhere on the home page
                        0d. If Session Valid: proceed to STEP 1.
                        0e. If Redirected to Login / No profile icon (Session Expired):
                            → STOP IMMEDIATELY
                            → Return this EXACT JSON:
                            [{"company":"NAUKRI","role":"SESSION_EXPIRED","status":"Session Expired","statusDetail":"Reconnect Required: Session has expired or is invalid.","jobUrl":""}]
                            → Do NOT attempt to login.

                        ======================================================
                        STEP 1: NAVIGATE TO JOB SEARCH RESULTS
                        ======================================================
                        IMPORTANT: Do NOT use the search bar. Navigate directly to results by URL.
                        Avoid aggressive navigation or rapid clicks.

                        1a. Navigate directly to: %s
                        1b. Wait 5-7 seconds for the page to fully load.
                        1c. Scroll down slowly (about 500px). Wait 3 seconds. Scroll back up slowly.
                        1d. If there is an experience filter visible, set it to: %s
                        1e. Wait 3 seconds after applying any filter.
                        1f. If a login popup/modal appears, close it by clicking the X button or clicking outside.

                        ======================================================
                        STEP 2: APPLY TO JOBS
                        ======================================================
                        Look at the first %d job listings from search results, one by one. For EACH job:

                        IMPORTANT: Wait 3-5 seconds between processing each job. Do NOT rush.

                        2a. Scroll down to see the job listing. Wait 2 seconds. Click on it.
                        2b. Wait 5 seconds for the job details page to load.
                        2c. Scroll down slowly to read the job description (about 500px). Wait 3 seconds.

                        2d. Skill matching (be LENIENT):
                         - If job title contains the target role OR skills from (%s) match: APPLY.
                         - Minimum match threshold: %d%%%% (when in doubt: APPLY).

                        2e. Click the Apply / "Apply on company site" / "Apply Now" button.
                        2f. Wait 5 seconds after clicking apply.

                        2g. SESSION EXPIRY DETECTION:
                         - If you get redirected to the login page at ANY point during applying:
                           → STOP applying immediately
                           → Mark current job as "Session Expired" (Reconnect Required)
                           → Mark all remaining jobs as "Paused - Session Expired"
                           → Return results immediately

                        2h. EXTERNAL APPLY DETECTION:
                         - If a NEW TAB opens to an external company site → close it, mark as "Skipped - External Apply".
                         - If the current page redirects to a domain other than naukri.com → mark as "Skipped - External Apply".
                         - Set statusDetail to include the external URL/domain name.

                        2i. CAPTCHA DETECTION:
                         - If CAPTCHA or robot verification appears → STOP immediately.
                         - Mark current job as "Paused - Manual Action Required".
                         - Return all results so far.

                        2j. APPLICATION FLOW ON NAUKRI (if staying on naukri.com after clicking Apply):
                         - If profile confirmation page: click Confirm/Continue.
                         - If questions are asked: answer as fresher/entry-level.
                         - Click the final Submit button.
                         - Wait 5 seconds for confirmation.
                         - ONLY mark as "Applied" if you see one of these EXACT texts on the page:
                           * "Application Submitted"
                           * "Applied Successfully"
                           * "You have already applied"
                           * "Your application has been submitted"
                           * A green checkmark with confirmation text
                         - If you do NOT see any of these exact confirmation messages after 5 seconds:
                           → Mark as "Failed - Unverified" (do NOT assume it worked)
                         - NEVER mark "Applied" based on just clicking a button. You MUST see confirmation text.


                        2k. After each application, wait 3-5 seconds before moving to next job.
                        2l. Navigate back to search results. Wait 3 seconds.

                        ======================================================
                        STEP 3: RETURN RESULTS
                        ======================================================
                        Return a JSON array with results for EVERY job you looked at:
                        [
                          {
                            "company": "Company Name",
                            "role": "Job Title",
                            "status": "Applied | Skipped - External Apply | Skipped - Login Required | Paused - Manual Action Required | Session Expired | Failed - Unverified | Failed",
                            "statusDetail": "URL: ..., what you saw on screen: ..., outcome: ...",
                            "jobUrl": "https://www.naukri.com/job-url"
                          }
                        ]

                        VALID STATUS VALUES (use EXACTLY one):
                        - "Applied" — you saw EXACT confirmation text like "Application Submitted" on naukri.com
                        - "Skipped - External Apply" — clicking Apply opened external company site or new tab
                        - "Skipped - Login Required" — login wall appeared after session load
                        - "Paused - Manual Action Required" — CAPTCHA or human verification appeared
                        - "Session Expired" — session cookies expired, got redirected to login
                        - "Failed - Unverified" — clicked Apply but no confirmation text appeared
                        - "Failed" — could not click Apply or something else went wrong
                        """,
                storageState,
                searchUrl,
                request.getExperience(),
                request.getDailyLimit(),
                request.getSkills(),
                request.getMatchThreshold());
    }

    /**
     * Session-based apply: Load storageState, then navigate to search results and
     * apply.
     * No login phase — uses pre-captured session.
     */
    public List<ApplicationLog> runSessionApply(AgentRequest request, String storageState) {
        String goal = buildSessionApplyGoal(request, storageState);

        Map<String, String> body = new HashMap<>();
        body.put("url", "https://www.naukri.com");
        body.put("goal", goal);

        log.info("Starting session-based apply for role={}, location={}", request.getRole(), request.getLocation());

        List<String> allEvents = executeTinyFishCall(body);

        if (allEvents == null || allEvents.isEmpty()) {
            log.warn("No SSE events received from TinyFish during session apply.");
            return new ArrayList<>();
        }

        log.info("Session apply received {} SSE event(s).", allEvents.size());

        for (String event : allEvents) {
            log.debug("SSE event: {}", event);
            if (event.contains("COMPLETE")) {
                return parseApplicationResults(event, request);
            }
        }

        log.warn("No COMPLETE event in session apply phase.");
        return new ArrayList<>();
    }

    // ========================================================================
    // SHARED HELPERS
    // ========================================================================

    /**
     * Executes a TinyFish SSE call and returns collected events.
     */
    private List<String> executeTinyFishCall(Map<String, String> body) {
        log.info("Executing TinyFish call with body keys: {}", body.keySet());
        return webClient.post()
                .header("X-API-Key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> {
                    int statusCode = response.statusCode().value();
                    log.error("HTTP {} from TinyFish API", statusCode);
                    return response.bodyToMono(String.class)
                            .defaultIfEmpty("(empty body)")
                            .flatMap(errorBody -> {
                                String msg = buildErrorMessage(statusCode, errorBody);
                                log.error("TinyFish error detail: {}", msg);
                                return reactor.core.publisher.Mono.error(new RuntimeException(msg));
                            });
                })
                .bodyToFlux(String.class)
                .collectList()
                .onErrorResume(ex -> {
                    if (ex instanceof RuntimeException) {
                        return reactor.core.publisher.Mono.error(ex);
                    }
                    if (isConnectionResetError(ex)) {
                        log.warn(
                                "Connection reset by TinyFish (expected after COMPLETE). Processing collected events.");
                        return reactor.core.publisher.Mono.just(new ArrayList<>());
                    }
                    log.error("Unexpected error during SSE stream", ex);
                    return reactor.core.publisher.Mono.just(new ArrayList<>());
                })
                .block();
    }

    private boolean isConnectionResetError(Throwable ex) {
        String message = ex.getMessage() != null ? ex.getMessage().toLowerCase() : "";
        if (message.contains("connection reset") || message.contains("premature close")) {
            return true;
        }
        Throwable cause = ex.getCause();
        if (cause != null) {
            String causeMsg = cause.getMessage() != null ? cause.getMessage().toLowerCase() : "";
            return causeMsg.contains("connection reset") || causeMsg.contains("premature close");
        }
        return false;
    }

    private JsonNode findFirstObjectArray(JsonNode resultNode) {
        var fieldNames = resultNode.fieldNames();
        while (fieldNames.hasNext()) {
            String key = fieldNames.next();
            JsonNode candidate = resultNode.get(key);
            if (candidate != null && candidate.isArray() && !candidate.isEmpty()) {
                if (candidate.get(0).isObject()) {
                    return candidate;
                }
            }
        }
        return null;
    }

    /**
     * Parses application results from a COMPLETE event.
     */
    private List<ApplicationLog> parseApplicationResults(String eventData, AgentRequest request) {
        List<ApplicationLog> results = new ArrayList<>();

        try {
            log.info("Parsing COMPLETE event data...");

            JsonNode rootNode = objectMapper.readTree(eventData);
            JsonNode resultNode = rootNode.get("result");
            if (resultNode == null) {
                log.warn("No 'result' field in COMPLETE event. Raw: {}", eventData);
                return results;
            }

            JsonNode arrayNode = findFirstObjectArray(resultNode);

            if (arrayNode == null) {
                log.warn("No array field found under 'result'. Raw: {}", eventData);
                return results;
            }

            List<Map<String, Object>> parsed = objectMapper.convertValue(
                    arrayNode, new TypeReference<>() {
                    });

            for (Map<String, Object> entry : parsed) {
                ApplicationLog appLog = new ApplicationLog();
                appLog.setCompany((String) entry.getOrDefault("company", "Unknown"));
                appLog.setRole((String) entry.getOrDefault("role", request.getRole()));
                appLog.setLocation(request.getLocation());
                appLog.setStatus((String) entry.getOrDefault("status", "Failed"));
                appLog.setStatusDetail((String) entry.getOrDefault("statusDetail", ""));
                appLog.setMatchScore("Applied".equals(appLog.getStatus()) ? request.getMatchThreshold()
                        : (request.getMatchThreshold() / 2));
                appLog.setAppliedAt(LocalDateTime.now());
                log.info("Job: {} @ {} | Status: {} | Detail: {}",
                        appLog.getRole(), appLog.getCompany(), appLog.getStatus(), appLog.getStatusDetail());
                results.add(appLog);
            }

            log.info("Parsed {} application log(s) from COMPLETE event.", results.size());

        } catch (IOException e) {
            log.error("Failed to parse COMPLETE event JSON. Raw data: {}", eventData, e);
        }

        return results;
    }
}
