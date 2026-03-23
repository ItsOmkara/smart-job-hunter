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
@Document(collection = "user_sessions")
public class UserSession {
    @Id
    private String id;
    private String platform; // e.g. "naukri"
    private String storageState; // JSON blob: Playwright storageState (cookies + localStorage)
    private LocalDateTime savedAt;
    private boolean isActive;
}
