package com.omkar.jobhunter.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OtpSubmitRequest {
    private String otp;
    // Carry forward the original agent request fields for Phase 2
    private String role;
    private String location;
    private String experience;
    private String skills;
    private String naukriEmail;
    private String naukriPassword;
    private int dailyLimit = 5;
    private int matchThreshold = 25;
}
