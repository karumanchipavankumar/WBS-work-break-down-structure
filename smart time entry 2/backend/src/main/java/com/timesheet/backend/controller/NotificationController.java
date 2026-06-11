package com.timesheet.backend.controller;

import com.timesheet.backend.model.Notification;
import com.timesheet.backend.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
@CrossOrigin(origins = "*")
public class NotificationController {

    @Autowired
    private NotificationService notificationService;

    @GetMapping
    public ResponseEntity<?> getNotifications(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        String empId = SecurityContextHolder.getContext().getAuthentication().getName();
        Page<Notification> notifications = notificationService.getNotifications(empId, page, size);
        long unreadCount = notificationService.getUnreadCount(empId);
        
        return ResponseEntity.ok(Map.of(
            "notifications", notifications,
            "unreadCount", unreadCount
        ));
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<?> markAsRead(@PathVariable Long id) {
        String empId = SecurityContextHolder.getContext().getAuthentication().getName();
        notificationService.markAsRead(id, empId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/read-all")
    public ResponseEntity<?> markAllAsRead() {
        String empId = SecurityContextHolder.getContext().getAuthentication().getName();
        notificationService.markAllAsRead(empId);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteNotification(@PathVariable Long id) {
        String empId = SecurityContextHolder.getContext().getAuthentication().getName();
        notificationService.deleteNotification(id, empId);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/all")
    public ResponseEntity<?> deleteAllNotifications() {
        String empId = SecurityContextHolder.getContext().getAuthentication().getName();
        notificationService.deleteAllNotifications(empId);
        return ResponseEntity.ok().build();
    }
}
