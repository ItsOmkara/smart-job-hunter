package com.omkar.jobhunter.dto;

import com.omkar.jobhunter.model.ApplicationLog;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AgentResponse {
    /**
     * Possible values:
     * - "OTP_REQUIRED" : OTP screen detected, waiting for user input
     * - "COMPLETED" : Agent finished (with or without successful applications)
     * - "FAILED" : Unrecoverable error
     */
    private String status;
    private String message;
    private List<ApplicationLog> applications;

    public static AgentResponse otpRequired(String message) {
        return new AgentResponse("OTP_REQUIRED", message, null);
    }

    public static AgentResponse completed(String message, List<ApplicationLog> applications) {
        return new AgentResponse("COMPLETED", message, applications);
    }

    public static AgentResponse failed(String message) {
        return new AgentResponse("FAILED", message, null);
    }
}
