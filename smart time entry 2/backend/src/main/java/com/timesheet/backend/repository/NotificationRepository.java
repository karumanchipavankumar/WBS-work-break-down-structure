package com.timesheet.backend.repository;

import com.timesheet.backend.model.Notification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {
    Page<Notification> findByRecipientEmpIdOrderByCreatedAtDesc(String recipientEmpId, Pageable pageable);
    
    long countByRecipientEmpIdAndIsRead(String recipientEmpId, boolean isRead);
    
    List<Notification> findByRecipientEmpIdAndIsRead(String recipientEmpId, boolean isRead);
    
    void deleteByCreatedAtBefore(Instant cutoff);

    @Modifying
    @Transactional
    void deleteByRecipientEmpId(String recipientEmpId);
}
