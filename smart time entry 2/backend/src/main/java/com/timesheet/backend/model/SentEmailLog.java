package com.timesheet.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDate;
import java.time.Instant;

@Entity
@Table(name = "sent_email_logs", uniqueConstraints = {
    @UniqueConstraint(name = "uk_sent_email_logs", columnNames = {"recipient_email", "email_type", "sent_date"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SentEmailLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recipient_email", nullable = false)
    private String recipientEmail;

    @Column(name = "email_type", nullable = false)
    private String emailType;

    @Column(name = "sent_date", nullable = false)
    private LocalDate sentDate;

    @Column(name = "sent_at", nullable = false)
    private Instant sentAt = Instant.now();
}
