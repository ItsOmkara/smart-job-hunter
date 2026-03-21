package com.omkar.jobhunter.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "application_logs")
public class ApplicationLog {
    @Id
    private String id;
    private String company;
    private String role;
    private String location;
    // Valid statuses: "Applied", "Skipped - External Apply", "Skipped - Login
    // Failed",
    // "Skipped - Session Expired", "Skipped - Captcha Detected", "Failed"
    private String status;
    private String statusDetail; // Debug info: URL, detected elements, outcome
    private int matchScore;
    private LocalDateTime appliedAt;
}
