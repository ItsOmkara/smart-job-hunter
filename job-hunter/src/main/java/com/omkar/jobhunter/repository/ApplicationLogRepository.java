package com.omkar.jobhunter.repository;

import com.omkar.jobhunter.model.ApplicationLog;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ApplicationLogRepository extends MongoRepository<ApplicationLog, String> {
}
