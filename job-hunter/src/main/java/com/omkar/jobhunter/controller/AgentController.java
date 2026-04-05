package com.omkar.jobhunter.controller;

import com.omkar.jobhunter.dto.AgentRequest;
import com.omkar.jobhunter.model.ApplicationLog;
import com.omkar.jobhunter.model.UserSession;
import com.omkar.jobhunter.repository.ApplicationLogRepository;
import com.omkar.jobhunter.repository.UserSessionRepository;
import com.omkar.jobhunter.service.PlaywrightService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/agent")
public class AgentController {

    private static final Logger log = LoggerFactory.getLogger(AgentController.class);

    private final PlaywrightService playwrightService;
    private final ApplicationLogRepository applicationLogRepository;
    private final UserSessionRepository userSessionRepository;

    public AgentController(PlaywrightService playwrightService,
            ApplicationLogRepository applicationLogRepository,
            UserSessionRepository userSessionRepository) {
        this.playwrightService = playwrightService;
        this.applicationLogRepository = applicationLogRepository;
        this.userSessionRepository = userSessionRepository;
    }

    /**
     * POST /api/agent/start
     * Session-based apply: loads stored session file path, runs Playwright apply
     * script.
     * Requires an active Naukri session (use POST /api/session/connect/naukri
     * first).
     */
    @PostMapping("/start")
    public ResponseEntity<?> startAgent(@RequestBody AgentRequest request) {
        log.info("Starting session-based agent for role={} location={}", request.getRole(), request.getLocation());

        // Fetch active Naukri session
        Optional<UserSession> sessionOpt = userSessionRepository
                .findFirstByPlatformAndIsActiveTrueOrderBySavedAtDesc("naukri");

        if (sessionOpt.isEmpty()) {
            log.warn("No active Naukri session found. User needs to connect first.");
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Please connect Naukri first. No active session found."));
        }

        UserSession session = sessionOpt.get();
        log.info("Using Naukri session: id={}, savedAt={}, path={}", session.getId(), session.getSavedAt(),
                session.getStorageState());

        try {
            // storageState now contains the FILE PATH, not the JSON blob
            List<ApplicationLog> results = playwrightService.runSessionApply(request, session.getStorageState());

            // Check if session expired during run
            boolean sessionExpired = results.stream()
                    .anyMatch(r -> "Session Expired".equals(r.getStatus()));

            if (sessionExpired) {
                log.warn("Session expired during agent run. Marking session as inactive.");
                session.setActive(false);
                userSessionRepository.save(session);
            }

            List<ApplicationLog> saved = applicationLogRepository.saveAll(results);
            log.info("Agent completed. {} application(s) logged. sessionExpired={}", saved.size(), sessionExpired);
            return ResponseEntity.ok(saved);
        } catch (Exception e) {
            log.error("Agent execution failed", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * DELETE /api/agent/logs
     * Clear all application logs from the database.
     * Use before re-running the agent to start with a fresh log view.
     */
    @DeleteMapping("/logs")
    public ResponseEntity<?> clearLogs() {
        long count = applicationLogRepository.count();
        applicationLogRepository.deleteAll();
        log.info("Cleared {} application log(s) from database.", count);
        return ResponseEntity.ok(Map.of("cleared", count));
    }
}
