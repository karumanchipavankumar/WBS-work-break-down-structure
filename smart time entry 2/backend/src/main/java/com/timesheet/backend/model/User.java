package com.timesheet.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_users_role", columnList = "role"),
    @Index(name = "idx_users_email", columnList = "email"),
    @Index(name = "idx_users_one_time_reset_token", columnList = "one_time_reset_token"),
    @Index(name = "idx_users_name", columnList = "name")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String empId;

    @Column(nullable = false)
    private String password;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String role = "employee"; // employee, admin

    @Column(nullable = false, columnDefinition = "boolean default true")
    private boolean enabled = true;

    private String dept;
    private String email;
    private String manager;
    private String initials;
    private String color;
    private String projectName;
    private String companyName;
    private String country;
    private String contactNumber;

    private String resetCode;
    private LocalDateTime resetCodeExpiry;
    
    @Column(name = "one_time_reset_token")
    private String oneTimeResetToken;

    @Column(name = "date_of_joining")
    private String dateOfJoining;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();

    /**
     * Timestamp of the last password change.
     * JWT tokens issued BEFORE this timestamp are considered invalid (stale session).
     * Set to now() on every successful password reset.
     */
    @Column(name = "otp_attempts")
    private Integer otpAttempts = 0;

    @Column(name = "otp_resend_count")
    private Integer otpResendCount = 0;

    @Column(name = "otp_last_sent_at")
    private LocalDateTime otpLastSentAt;

    @Column(name = "password_changed_at")
    private LocalDateTime passwordChangedAt;

    @Column(name = "password_history", columnDefinition = "TEXT")
    private String passwordHistory;

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
