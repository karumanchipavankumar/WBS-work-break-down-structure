package com.timesheet.backend.repository;

import com.timesheet.backend.model.Notification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {
    Page<Notification> findByRecipientEmpIdOrderByCreatedAtDesc(String recipientEmpId, Pageable pageable);
    
    long countByRecipientEmpIdAndIsRead(String recipientEmpId, boolean isRead);
    
    List<Notification> findByRecipientEmpIdAndIsRead(String recipientEmpId, boolean isRead);
    
    @Modifying
    @Transactional
    @Query("DELETE FROM Notification n WHERE n.createdAt < :cutoff")
    void deleteByCreatedAtBefore(@Param("cutoff") Instant cutoff);

    @Modifying
    @Transactional
    @Query("DELETE FROM Notification n WHERE n.recipientEmpId = :recipientEmpId")
    void deleteByRecipientEmpId(@Param("recipientEmpId") String recipientEmpId);

    @Modifying
    @Transactional
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.recipientEmpId = :recipientEmpId AND n.isRead = false")
    void markAllAsReadByRecipientEmpId(@Param("recipientEmpId") String recipientEmpId);
}
