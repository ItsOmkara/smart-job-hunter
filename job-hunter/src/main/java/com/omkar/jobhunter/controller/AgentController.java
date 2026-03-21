package com.omkar.jobhunter.controller;

import com.omkar.jobhunter.dto.AgentRequest;
import com.omkar.jobhunter.model.ApplicationLog;
import com.omkar.jobhunter.repository.ApplicationLogRepository;
import com.omkar.jobhunter.service.TinyFishService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/agent")
public class AgentController {

    private static final Logger log = LoggerFactory.getLogger(AgentController.class);

    private final TinyFishService tinyFishService;
    private final ApplicationLogRepository applicationLogRepository;

    public AgentController(TinyFishService tinyFishService,
            ApplicationLogRepository applicationLogRepository) {
        this.tinyFishService = tinyFishService;
        this.applicationLogRepository = applicationLogRepository;
    }

    /**
     * Direct apply: skips login, navigates to job search URL and applies.
     */
    @PostMapping("/start")
    public ResponseEntity<?> startAgent(@RequestBody AgentRequest request) {
        log.info("Starting direct apply agent for role={} location={}", request.getRole(), request.getLocation());

        try {
            List<ApplicationLog> results = tinyFishService.runDirectApply(request);
            List<ApplicationLog> saved = applicationLogRepository.saveAll(results);
            log.info("Agent completed. {} application(s) logged.", saved.size());
            return ResponseEntity.ok(saved);
        } catch (Exception e) {
            log.error("Agent execution failed", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", e.getMessage()));
        }
    }
}
