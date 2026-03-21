package com.omkar.jobhunter.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.omkar.jobhunter.dto.AgentRequest;
import com.omkar.jobhunter.model.ApplicationLog;
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

        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofMinutes(5));

        this.webClient = webClientBuilder
                .baseUrl(apiUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();

        this.objectMapper = new ObjectMapper();
    }

    // ========================================================================
    // DIRECT APPLY: Skip login, go straight to job search & apply
    // ========================================================================

    /**
     * Builds the goal prompt: Navigate directly to Naukri job search URL and apply.
     * No login step — user handles login manually or the agent applies as a guest.
     */
    private String buildDirectApplyGoal(AgentRequest request) {
        String searchUrl = String.format("https://www.naukri.com/%s-jobs-in-%s",
                request.getRole().toLowerCase().replace(" ", "-"),
                request.getLocation().toLowerCase().replace(" ", "-"));

        return String.format(
                """
                        === GLOBAL RULES (apply to ALL steps) ===
                        - Use the SAME browser tab/context for everything. Do NOT open new incognito windows.
                        - CRITICAL: Act like a real human user. Add random delays of 2-5 seconds between every action.
                        - When typing, type each character one by one with 200-600ms random delay per keystroke.
                        - After every page load, wait 3-5 seconds before doing anything.
                        - Occasionally scroll down slowly and scroll back up before interacting.
                        - Move the mouse cursor naturally to elements before clicking.
                        - Do NOT perform actions too quickly. Real humans pause and look around.

                        ======================================================
                        STEP 1: NAVIGATE TO JOB SEARCH RESULTS
                        ======================================================
                        IMPORTANT: Do NOT use the search bar. Navigate directly by URL.
                        Do NOT try to log in. Skip any login prompts.

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
                        2b. Wait 3-5 seconds for the job details page to load.
                        2c. Scroll down slowly to read the job description (about 500px). Wait 2-3 seconds.

                        2d. Skill matching (be LENIENT):
                         - If job title contains the target role OR skills from (%s) match: APPLY.
                         - Minimum match threshold: %d%%%% (when in doubt: APPLY).

                        2e. Click the Apply / "Apply on company site" / "Apply Now" button.
                        2f. Wait 3 seconds after clicking apply.

                        2g. LOGIN WALL HANDLING:
                         - If you see a "Login to apply" prompt, a login form, or get redirected to login:
                           → Try entering email: %s and password: %s
                           → If OTP appears, mark as "Skipped - Login Required"
                           → If CAPTCHA appears, mark as "Skipped - Captcha Detected"
                           → If login succeeds, proceed with application

                        2h. EXTERNAL APPLY DETECTION:
                         - If a NEW TAB opens to an external company site → close it, mark as "Skipped - External Apply".
                         - If the current page redirects to a domain other than naukri.com → mark as "Skipped - External Apply".
                         - Set statusDetail to include the external URL/domain name.

                        2i. CAPTCHA DETECTION:
                         - If CAPTCHA appears, wait 5 seconds and try refreshing.
                         - If CAPTCHA persists → Mark as 'Skipped - Captcha Detected'.

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
                            "status": "Applied | Skipped - External Apply | Skipped - Login Required | Skipped - Captcha Detected | Failed - Unverified | Failed",
                            "statusDetail": "URL: ..., what you saw on screen: ..., outcome: ...",
                            "jobUrl": "https://www.naukri.com/job-url"
                          }
                        ]

                        VALID STATUS VALUES (use EXACTLY one):
                        - "Applied" — you saw EXACT confirmation text like "Application Submitted" on naukri.com
                        - "Skipped - External Apply" — clicking Apply opened external company site or new tab
                        - "Skipped - Login Required" — login wall or OTP appeared
                        - "Skipped - Captcha Detected" — CAPTCHA appeared
                        - "Failed - Unverified" — clicked Apply but no confirmation text appeared
                        - "Failed" — could not click Apply or something else went wrong
                        """,
                searchUrl,
                request.getExperience(),
                request.getDailyLimit(),
                request.getSkills(),
                request.getMatchThreshold(),
                request.getNaukriEmail(),
                request.getNaukriPassword());
    }

    /**
     * Direct apply: Navigate to search results and apply to jobs.
     * No login phase — avoids CAPTCHA entirely.
     */
    public List<ApplicationLog> runDirectApply(AgentRequest request) {
        String goal = buildDirectApplyGoal(request);

        Map<String, String> body = new HashMap<>();
        body.put("url", "https://www.naukri.com");
        body.put("goal", goal);

        List<String> allEvents = executeTinyFishCall(body);

        if (allEvents == null || allEvents.isEmpty()) {
            log.warn("No SSE events received from TinyFish during direct apply.");
            return new ArrayList<>();
        }

        log.info("Direct apply received {} SSE event(s).", allEvents.size());

        for (String event : allEvents) {
            log.debug("SSE event: {}", event);
            if (event.contains("COMPLETE")) {
                return parseApplicationResults(event, request);
            }
        }

        log.warn("No COMPLETE event in direct apply phase.");
        return new ArrayList<>();
    }

    // ========================================================================
    // SHARED HELPERS
    // ========================================================================

    /**
     * Executes a TinyFish SSE call and returns collected events.
     */
    private List<String> executeTinyFishCall(Map<String, String> body) {
        return webClient.post()
                .header("X-API-Key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, response -> {
                    if (response.statusCode().value() == 403) {
                        log.error("403 Forbidden from TinyFish API. API key may be invalid or expired.");
                        return reactor.core.publisher.Mono.error(
                                new RuntimeException(
                                        "TinyFish API key invalid or expired. Please check application.properties"));
                    }
                    log.error("HTTP {} error from TinyFish API", response.statusCode().value());
                    return reactor.core.publisher.Mono.error(
                            new RuntimeException("TinyFish API error: HTTP " + response.statusCode().value()));
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
                log.info("Job: {} | Status: {} | Detail: {}",
                        appLog.getCompany(), appLog.getStatus(), appLog.getStatusDetail());
                results.add(appLog);
            }

            log.info("Parsed {} application log(s) from COMPLETE event.", results.size());

        } catch (IOException e) {
            log.error("Failed to parse COMPLETE event JSON. Raw data: {}", eventData, e);
        }

        return results;
    }
}
