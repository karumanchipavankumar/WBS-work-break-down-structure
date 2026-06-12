package com.timesheet.backend.service;

import com.timesheet.backend.model.Notification;
import com.timesheet.backend.model.User;
import com.timesheet.backend.repository.NotificationRepository;
import com.timesheet.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@Transactional
public class NotificationService {

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EmailService emailService;

    @Value("${notification.retention.days:30}")
    private int retentionDays;

    public String formatMessage(String action, String empName, String empId, String dateOrWeek, String comment) {
        String timestamp = LocalDateTime.now(java.time.ZoneId.of("Asia/Kolkata")).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        StringBuilder sb = new StringBuilder();
        sb.append("Action: ").append(action)
          .append(" | Employee: ").append(empName).append(" (").append(empId).append(")")
          .append(" | Date: ").append(dateOrWeek)
          .append(" | Time: ").append(timestamp);
        if (comment != null && !comment.trim().isEmpty()) {
            sb.append(" | Details: ").append(comment.trim());
        }
        return sb.toString();
    }

    public void sendNotification(User recipient, String message) {
        Notification notification = new Notification();
        notification.setRecipientEmpId(recipient.getEmpId());
        notification.setMessage(message);
        notification.setRead(false);
        notification.setCreatedAt(java.time.Instant.now());
        notificationRepository.save(notification);
    }

    public void sendNotification(String recipientEmpId, String message) {
        java.util.Optional<User> userOpt = userRepository.findByEmpId(recipientEmpId);
        if (userOpt.isPresent()) {
            sendNotification(userOpt.get(), message);
        } else {
            Notification notification = new Notification();
            notification.setRecipientEmpId(recipientEmpId);
            notification.setMessage(message);
            notification.setRead(false);
            notification.setCreatedAt(java.time.Instant.now());
            notificationRepository.save(notification);
        }
    }

    public void notifyAllAdmins(String message) {
        List<User> admins = userRepository.findByRole("admin");
        for (User admin : admins) {
            sendNotification(admin, message);
        }
    }

    @Transactional(readOnly = true)
    public Page<Notification> getNotifications(String empId, int page, int size) {
        return notificationRepository.findByRecipientEmpIdOrderByCreatedAtDesc(empId, PageRequest.of(page, size));
    }

    @Transactional(readOnly = true)
    public long getUnreadCount(String empId) {
        return notificationRepository.countByRecipientEmpIdAndIsRead(empId, false);
    }

    public void markAsRead(Long notificationId, String empId) {
        notificationRepository.findById(notificationId).ifPresent(n -> {
            if (n.getRecipientEmpId().equals(empId)) {
                n.setRead(true);
                notificationRepository.save(n);
            }
        });
    }

    public void markAllAsRead(String empId) {
        notificationRepository.markAllAsReadByRecipientEmpId(empId);
    }

    // Weekly Reminders: Friday at 4:00 PM
    @Scheduled(cron = "0 0 16 * * FRI")
    public void sendWeeklyReminders() {
        List<User> employees = userRepository.findByRole("employee");
        for (User emp : employees) {
            if (emp.isEnabled()) {
                sendNotification(emp.getEmpId(), "Weekly Reminder: Please ensure your timesheets for this week are submitted and up to date.");
            }
        }
    }

    // Monthly Reminders: Last day of the month at 5:00 PM
    @Scheduled(cron = "0 0 17 L * ?")
    public void sendMonthlyReminders() {
        List<User> employees = userRepository.findByRole("employee");
        for (User emp : employees) {
            if (emp.isEnabled()) {
                sendNotification(emp.getEmpId(), "Monthly Reminder: Please ensure all your timesheets for this month are submitted and up to date.");
            }
        }
    }

    public void deleteNotification(Long notificationId, String empId) {
        notificationRepository.findById(notificationId).ifPresent(n -> {
            if (n.getRecipientEmpId().equals(empId)) {
                notificationRepository.deleteById(notificationId);
            }
        });
    }

    public void deleteAllNotifications(String empId) {
        notificationRepository.deleteByRecipientEmpId(empId);
    }

    public void deleteNotificationsByRecipientEmpId(String recipientEmpId) {
        notificationRepository.deleteByRecipientEmpId(recipientEmpId);
    }

    // Cleanup: Daily at midnight
    @Scheduled(cron = "0 0 0 * * ?")
    public void cleanOldNotifications() {
        java.time.Instant cutoff = java.time.Instant.now().minus(java.time.Duration.ofDays(retentionDays));
        notificationRepository.deleteByCreatedAtBefore(cutoff);
        System.out.println("Cleaned up notifications older than " + cutoff);
    }
}
