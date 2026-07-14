package com.timesheet.backend.service;

import com.timesheet.backend.model.SentEmailLog;
import com.timesheet.backend.repository.SentEmailLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.Instant;

@Service
public class EmailLogService {

    @Autowired
    private SentEmailLogRepository sentEmailLogRepository;

    /**
     * Checks if an email of the given type has already been sent to the recipient on the sentDate.
     * If not, saves a log entry and returns true. If yes (or on concurrent conflict), returns false.
     * Runs in a new transaction to ensure changes are committed immediately and visible to other threads/instances.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean checkAndLogEmailSent(String recipientEmail, String emailType, LocalDate sentDate) {
        if (sentEmailLogRepository.existsByRecipientEmailAndEmailTypeAndSentDate(recipientEmail, emailType, sentDate)) {
            return false;
        }
        try {
            SentEmailLog log = new SentEmailLog();
            log.setRecipientEmail(recipientEmail);
            log.setEmailType(emailType);
            log.setSentDate(sentDate);
            log.setSentAt(Instant.now());
            sentEmailLogRepository.saveAndFlush(log);
            return true;
        } catch (Exception e) {
            // Handle database constraint violations gracefully due to concurrent threads/instances
            return false;
        }
    }
}
