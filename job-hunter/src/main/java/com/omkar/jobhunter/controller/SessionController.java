package com.omkar.jobhunter.controller;

import com.omkar.jobhunter.model.UserSession;
import com.omkar.jobhunter.repository.UserSessionRepository;
import com.omkar.jobhunter.service.PlaywrightService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/session")
public class SessionController {

    private static final Logger log = LoggerFactory.getLogger(SessionController.class);

    private final PlaywrightService playwrightService;
    private final UserSessionRepository userSessionRepository;

    public SessionController(PlaywrightService playwrightService,
            UserSessionRepository userSessionRepository) {
        this.playwrightService = playwrightService;
        this.userSessionRepository = userSessionRepository;
    }

    /**
     * POST /api/session/connect/naukri
     * Opens Naukri login page via Playwright (visible browser).
     * Waits for manual login, saves storageState to file.
     */
    @PostMapping("/connect/naukri")
    public ResponseEntity<?> connectNaukri() {
        log.info("Session connect request received for Naukri.com");

        try {
            PlaywrightService.ConnectionResult result = playwrightService.startNaukriConnection(userSessionRepository);

            return switch (result.status()) {
                case "success" -> {
                    log.info("Session Saved via persistent browser context");
                    yield ResponseEntity.ok(Map.of(
                            "status", "connected",
                            "message", result.message()));
                }
                case "timeout" -> {
                    log.warn("Login timeout");
                    yield ResponseEntity.badRequest().body(Map.of(
                            "status", "failed",
                            "errorType", "TIMEOUT",
                            "message", result.message()));
                }
                default -> {
                    log.error("Login failed: {}", result.message());
                    yield ResponseEntity.badRequest().body(Map.of(
                            "status", "failed",
                            "errorType", "ERROR",
                            "message", result.message()));
                }
            };
        } catch (Exception e) {
            log.error("Failed to initiate Naukri connection", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("status", "failed", "errorType", "INTERNAL", "message", e.getMessage()));
        }
    }

    /**
     * GET /api/session/status/naukri
     * Check if an active Naukri session exists.
     */
    @GetMapping("/status/naukri")
    public ResponseEntity<?> getNaukriStatus() {
        Optional<UserSession> session = userSessionRepository
                .findFirstByPlatformAndIsActiveTrueOrderBySavedAtDesc("naukri");

        if (session.isPresent()) {
            UserSession s = session.get();
            return ResponseEntity.ok(Map.of(
                    "connected", true,
                    "sessionId", s.getId(),
                    "savedAt", s.getSavedAt().toString()));
        }

        return ResponseEntity.ok(Map.of("connected", false));
    }
}
