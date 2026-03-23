package com.omkar.jobhunter.controller;

import com.omkar.jobhunter.model.UserSession;
import com.omkar.jobhunter.repository.UserSessionRepository;
import com.omkar.jobhunter.service.TinyFishService;
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

    private final TinyFishService tinyFishService;
    private final UserSessionRepository userSessionRepository;

    public SessionController(TinyFishService tinyFishService,
            UserSessionRepository userSessionRepository) {
        this.tinyFishService = tinyFishService;
        this.userSessionRepository = userSessionRepository;
    }

    /**
     * POST /api/session/connect/naukri
     * Opens Naukri login page via TinyFish, captures storageState in background.
     * Returns the streamUrl immediately.
     */
    @PostMapping("/connect/naukri")
    public ResponseEntity<?> connectNaukri() {
        log.info("Session connect request received for Naukri.com");

        try {
            TinyFishService.ConnectionResponse response = tinyFishService.startNaukriConnection(userSessionRepository);

            if (response.streamUrl() == null || response.streamUrl().isBlank()) {
                String status = response.status() != null ? response.status() : "unknown error";
                log.warn("No streamUrl returned from TinyFish connect flow: {}", status);

                // Classify the error for the frontend
                String errorType = "UNKNOWN";
                String userMessage;
                if (status.contains("Insufficient credits") || status.contains("top up")) {
                    errorType = "CREDITS";
                    userMessage = "Your TinyFish account has no credits remaining. Please top up at agent.tinyfish.ai";
                } else if (status.contains("Invalid") || status.contains("expired") || status.contains("401")
                        || status.contains("403")) {
                    errorType = "AUTH";
                    userMessage = "Your TinyFish API key is invalid or expired. Please check application.properties";
                } else if (status.contains("Rate limited") || status.contains("429")) {
                    errorType = "RATE_LIMIT";
                    userMessage = "Too many requests. Please wait a moment and try again.";
                } else if (status.contains("timeout") || status.contains("Timeout") || status.contains("No response")) {
                    errorType = "TIMEOUT";
                    userMessage = "TinyFish API did not respond in time. Please check your internet connection and try again.";
                } else if (status.contains("Server error") || status.contains("500")) {
                    errorType = "SERVER_ERROR";
                    userMessage = "TinyFish service is currently down. Please try again later.";
                } else {
                    userMessage = "Could not initiate connection: " + status;
                }

                return ResponseEntity.badRequest()
                        .body(Map.of("status", "failed", "errorType", errorType, "message", userMessage));
            }

            return ResponseEntity.ok(Map.of(
                    "status", "connecting",
                    "streamUrl", response.streamUrl(),
                    "message", "Please open the browser and login to Naukri."));
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
