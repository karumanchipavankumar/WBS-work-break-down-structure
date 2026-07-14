package com.timesheet.backend.repository;

import com.timesheet.backend.model.SentEmailLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;

@Repository
public interface SentEmailLogRepository extends JpaRepository<SentEmailLog, Long> {
    boolean existsByRecipientEmailAndEmailTypeAndSentDate(String recipientEmail, String emailType, LocalDate sentDate);
}
