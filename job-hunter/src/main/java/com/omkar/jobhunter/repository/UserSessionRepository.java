package com.omkar.jobhunter.repository;

import com.omkar.jobhunter.model.UserSession;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserSessionRepository extends MongoRepository<UserSession, String> {

    Optional<UserSession> findFirstByPlatformAndIsActiveTrueOrderBySavedAtDesc(String platform);
}
