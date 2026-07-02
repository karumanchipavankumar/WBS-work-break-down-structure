package com.timesheet.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "timesheet_entries", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"user_id", "entry_date"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TimesheetEntry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "entry_date", nullable = false)
    private String date; // format: YYYY-MM-DD

    private Integer dayOfWeek; // 0 for Sunday, 6 for Saturday
    private String type; // Working Day, WFH, Week Off, Holiday, Paid Leave, Unpaid Leave

    private String amIn;
    private String amOut;
    private String lunchOut;
    private String lunchIn;
    private String pmIn;
    private String pmOut;

    private String status; // Pending, Approved, Rejected, Draft, Reapproval Pending, Resubmit OT
    private Boolean submitted = false;
    
    @Column(name = "rejection_reason", length = 3000)
    private String rejectionReason;

    @Column(name = "short_hours_reason", length = 3000)
    private String shortHoursReason;

    // OT Fields
    @Column(name = "ot_status")
    private String otStatus;

    @Column(name = "ot_reason", length = 3000)
    private String otReason;

    @Column(name = "ot_remarks", length = 3000)
    private String otRemarks;

    @Column(name = "ot_rejection_reason", length = 3000)
    private String otRejectionReason;

    @Column(name = "client_approved")
    private Boolean clientApproved;
    
    @Column(name = "client_approval_file", columnDefinition = "TEXT")
    private String clientApprovalFile;

    @Column(name = "ot_reapply_count")
    private Integer otReapplyCount = 0;

    @Column(name = "leave_reapply_count")
    private Integer leaveReapplyCount = 0;

    @Column(name = "ot_resubmission_granted")
    private Boolean otResubmissionGranted = false;

    @Column(name = "ot_resubmission_message", length = 3000)
    private String otResubmissionMessage;

    @Column(name = "ot_resubmission_used")
    private Boolean otResubmissionUsed = false;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
