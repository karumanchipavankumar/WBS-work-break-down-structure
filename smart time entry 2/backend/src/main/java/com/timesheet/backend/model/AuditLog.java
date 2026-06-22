package com.timesheet.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.Instant;

@Entity
@Table(name = "audit_logs", indexes = {
    @Index(name = "idx_audit_logs_timestamp", columnList = "timestamp")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuditLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String action; // DISABLE_ACCOUNT, ENABLE_ACCOUNT

    @Column(name = "affected_emp_id", nullable = false)
    private String affectedEmpId;

    @Column(name = "affected_name", nullable = false)
    private String affectedName;

    @Column(name = "performed_by_emp_id", nullable = false)
    private String performedByEmpId;

    @Column(name = "performed_by_name", nullable = false)
    private String performedByName;

    @Column(name = "previous_values", length = 1000)
    private String previousValues;

    @Column(name = "new_values", length = 1000)
    private String newValues;

    @Column(name = "reason", length = 1000)
    private String reason;

    @Column(name = "comments", length = 1000)
    private String comments;

    @Column(name = "timestamp", nullable = false)
    private Instant timestamp = Instant.now();
}
