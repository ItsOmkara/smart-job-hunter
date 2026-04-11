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
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class PlaywrightService {

    private static final Logger log = LoggerFactory.getLogger(PlaywrightService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${playwright.scripts.dir:scripts}")
    private String scriptsDir;

    @Value("${playwright.browser.datadir:browser-data}")
    private String browserDataDir;

    @Value("${groq.api.key:}")
    private String groqApiKey;

    @Value("${groq.model:meta-llama/llama-4-scout-17b-16e-instruct}")
    private String groqModel;

    private Path scriptsPath;
    private Path userDataPath;

    @PostConstruct
    public void init() {
        scriptsPath = Paths.get(scriptsDir).toAbsolutePath();
        userDataPath = Paths.get(browserDataDir).toAbsolutePath();

        log.info("Playwright scripts dir: {}", scriptsPath);
        log.info("Playwright browser data dir: {}", userDataPath);

        // Ensure browser data directory exists
        File dataDir = userDataPath.toFile();
        if (!dataDir.exists()) {
            dataDir.mkdirs();
            log.info("Created browser data directory: {}", userDataPath);
        }
    }

    // ========================================================================
    public record ConnectionResult(String status, String message) {
    }
    // ========================================================================

    /**
     * LOGIN: Runs login.js with persistent browser context.
     * Browser profile is saved to userDataDir (shared with apply.js).
     */
    public ConnectionResult startNaukriConnection(UserSessionRepository repository) {
        log.info("Starting Naukri connection via Playwright (persistent context)...");

        String scriptPath = scriptsPath.resolve("login.js").toString();

        try {
            // Run: node login.js --userDataDir <browserDataDir>
            String output = runNodeScript(scriptPath, "--userDataDir", userDataPath.toString());
            log.info("login.js output: {}", output);

            JsonNode result = objectMapper.readTree(output);
            String status = result.has("status") ? result.get("status").asText() : "error";
            String message = result.has("message") ? result.get("message").asText() : "";

            if ("success".equals(status)) {
                log.info("Session Saved in browser profile: {}", userDataPath);

                // Deactivate old sessions
                repository.findFirstByPlatformAndIsActiveTrueOrderBySavedAtDesc("naukri")
                        .ifPresent(old -> {
                            old.setActive(false);
                            repository.save(old);
                            log.info("Deactivated old session: {}", old.getId());
                        });

                // Save session record (userDataDir path + timestamp)
                UserSession session = new UserSession();
                session.setPlatform("naukri");
                session.setStorageState(userDataPath.toString()); // Store DIR PATH
                session.setSavedAt(LocalDateTime.now());
                session.setActive(true);
                repository.save(session);

                log.info("Session recorded in database.");
                return new ConnectionResult("success", message);
            } else if ("timeout".equals(status)) {
                log.warn("Login timeout: {}", message);
                return new ConnectionResult("timeout", message);
            } else {
                log.error("Login failed: {}", message);
                return new ConnectionResult("error", message);
            }

        } catch (Exception e) {
            log.error("Failed to run login.js", e);
            return new ConnectionResult("error", "Failed to launch browser: " + e.getMessage());
        }
    }

    // ========================================================================

    /**
     * APPLY: Runs apply.js with the SAME persistent browser context.
     * No need to pass storageState — both scripts share userDataDir.
     */
    public List<ApplicationLog> runSessionApply(AgentRequest request, String userDataDir) {
        log.info("Starting LLM-driven agent for role={}, location={}", request.getRole(), request.getLocation());

        String scriptPath = scriptsPath.resolve("agent.js").toString();

        try {
            String output = runNodeScript(scriptPath,
                    "--role", request.getRole(),
                    "--location", request.getLocation(),
                    "--experience", request.getExperience() != null ? request.getExperience() : "entry",
                    "--skills", request.getSkills() != null ? request.getSkills() : "",
                    "--dailyLimit", String.valueOf(request.getDailyLimit()),
                    "--matchThreshold", String.valueOf(request.getMatchThreshold()),
                    "--groqApiKey", groqApiKey,
                    "--groqModel", groqModel,
                    "--userDataDir", userDataDir);

            log.info("apply.js output: {}", output);

            List<Map<String, Object>> rawResults = objectMapper.readValue(output, new TypeReference<>() {
            });
            List<ApplicationLog> logs = new ArrayList<>();

            for (Map<String, Object> raw : rawResults) {
                ApplicationLog appLog = new ApplicationLog();
                appLog.setCompany((String) raw.getOrDefault("company", "Unknown"));
                appLog.setRole((String) raw.getOrDefault("role", request.getRole()));
                appLog.setStatus((String) raw.getOrDefault("status", "Failed"));
                appLog.setStatusDetail((String) raw.getOrDefault("statusDetail", ""));

                // Use location from result if script provided it, otherwise fallback to request
                String jobLoc = (String) raw.get("location");
                appLog.setLocation(jobLoc != null ? jobLoc : request.getLocation());

                if (raw.containsKey("matchScore")) {
                    appLog.setMatchScore(((Number) raw.get("matchScore")).intValue());
                }

                appLog.setAppliedAt(LocalDateTime.now());
                logs.add(appLog);

                log.info("Job: {} @ {} | Status: {} | Detail: {}", appLog.getRole(), appLog.getCompany(),
                        appLog.getStatus(), appLog.getStatusDetail());
            }

            return logs;

        } catch (Exception e) {
            log.error("Failed to run apply.js", e);
            ApplicationLog errorLog = new ApplicationLog();
            errorLog.setCompany("SYSTEM");
            errorLog.setRole("ERROR");
            errorLog.setStatus("Failed");
            errorLog.setStatusDetail("Playwright error: " + e.getMessage());
            errorLog.setAppliedAt(LocalDateTime.now());
            return List.of(errorLog);
        }
    }

    // ========================================================================
    // Process runner
    // ========================================================================

    private String runNodeScript(String scriptPath, String... args) throws Exception {
        List<String> command = new ArrayList<>();
        command.add("node");
        command.add(scriptPath);
        for (String arg : args) {
            command.add(arg);
        }

        log.info("Running: {}", String.join(" ", command));

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(scriptsPath.toFile());
        pb.redirectErrorStream(false);

        Process process = pb.start();

        // CRITICAL: Read stdout and stderr CONCURRENTLY to prevent I/O deadlock.
        // Sequential reads cause deadlock when stderr buffer (~64KB) fills up —
        // Node blocks on console.error(), Java blocks waiting for stdout to finish.
        StringBuilder stdout = new StringBuilder();
        StringBuilder stderr = new StringBuilder();

        Thread stderrThread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getErrorStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    stderr.append(line).append("\n");
                    log.debug("[Node] {}", line);
                }
            } catch (Exception e) {
                log.warn("Error reading Node stderr: {}", e.getMessage());
            }
        }, "node-stderr-reader");
        stderrThread.setDaemon(true);
        stderrThread.start();

        // Read stdout in the main thread
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                stdout.append(line);
            }
        }

        // Wait for process to finish (5 min hard limit)
        boolean finished = process.waitFor(15, TimeUnit.MINUTES);
        if (!finished) {
            process.destroyForcibly();
            throw new RuntimeException("Node script timed out after 15 minutes");
        }

        // Wait for stderr thread to finish draining
        stderrThread.join(5000);

        int exitCode = process.exitValue();
        if (stderr.length() > 0) {
            log.info("Node stderr:\n{}", stderr);
        }

        String result = stdout.toString().trim();
        if (result.isEmpty()) {
            throw new RuntimeException("No output from Node script (exit code " + exitCode + ")");
        }

        return result;
    }

}
