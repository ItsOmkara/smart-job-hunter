package com.omkar.jobhunter.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/resume")
@CrossOrigin(originPatterns = "*") // Allow frontend to call this API
public class ResumeController {

    private static final Logger log = LoggerFactory.getLogger(ResumeController.class);

    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    @Value("${groq.api.key}")
    private String groqApiKey;

    public ResumeController(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.baseUrl("https://api.groq.com/openai/v1").build();
        this.objectMapper = new ObjectMapper();
    }

    @PostMapping("/parse")
    public ResponseEntity<String> parseResume(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            log.error("Uploaded file is empty");
            return ResponseEntity.badRequest().body("{\"error\": \"File is empty\"}");
        }

        try {
            log.info("Received file: {}", file.getOriginalFilename());

            // 1. Extract text using PDFBox
            String pdfText = extractTextFromPdf(file);
            if (pdfText == null || pdfText.trim().isEmpty()) {
                return ResponseEntity.badRequest().body("{\"error\": \"Could not extract text from PDF\"}");
            }

            log.info("Extracted {} characters from PDF", pdfText.length());

            // 2. Call Groq API
            String parsedResult = callGroqApi(pdfText);

            // Validate if valid JSON was returned before sending
            try {
                objectMapper.readTree(parsedResult);
                return ResponseEntity.ok(parsedResult);
            } catch (JsonProcessingException e) {
                log.error("Groq returned malformed JSON: {}", parsedResult);
                return ResponseEntity.internalServerError().body("{\"error\": \"Failed to parse JSON from AI\"}");
            }

        } catch (Exception e) {
            log.error("Error parsing resume", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("{\"error\": \"Server error processing resume\"}");
        }
    }

    private String extractTextFromPdf(MultipartFile file) throws IOException {
        // Use PDFBox 3.x Loader pattern
        try (PDDocument document = Loader.loadPDF(file.getBytes())) {
            PDFTextStripper stripper = new PDFTextStripper();
            return stripper.getText(document);
        }
    }

    private String callGroqApi(String pdfText) {
        String promptContent = "Extract from this resume text and return ONLY valid JSON, no extra text, no markdown:\n"
                +
                "{\"name\": \"...\", \"detectedRole\": \"...\", \"experience\": \"0-2 years\", \"skills\": [\"skill1\", \"skill2\"]}\n\n"
                +
                "Resume text:\n" + pdfText;

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", "llama-3.3-70b-versatile");
        requestBody.put("max_tokens", 500);

        Map<String, String> message = new HashMap<>();
        message.put("role", "user");
        message.put("content", promptContent);
        requestBody.put("messages", List.of(message));

        log.info("Calling Groq API...");

        String response = webClient.post()
                .uri("/chat/completions")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + groqApiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(String.class)
                .block();

        // Parse Groq response to get just the 'content' field
        try {
            JsonNode rootNode = objectMapper.readTree(response);
            JsonNode choicesItem = rootNode.path("choices").get(0);
            if (choicesItem != null) {
                String aiContent = choicesItem.path("message").path("content").asText();
                // Sometimes AI still wraps in markdown ```json ... ``` despite instructions.
                // Clean it.
                return cleanJsonResponse(aiContent);
            }
        } catch (Exception e) {
            log.error("Failed to parse Groq API response: " + response, e);
        }

        return "{}"; // Fallback empty
    }

    // Helpler to clean out common markdown artifacts from LLMs
    private String cleanJsonResponse(String response) {
        String cleaned = response.trim();
        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.substring(7);
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.substring(3);
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substring(0, cleaned.length() - 3);
        }
        return cleaned.trim();
    }
}
