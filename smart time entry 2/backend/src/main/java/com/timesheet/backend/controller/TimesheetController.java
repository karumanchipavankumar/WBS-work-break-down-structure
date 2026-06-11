package com.timesheet.backend.controller;

import com.timesheet.backend.model.TimesheetEntry;
import com.timesheet.backend.model.User;
import com.timesheet.backend.repository.TimesheetEntryRepository;
import com.timesheet.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.timesheet.backend.service.NotificationService;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/timesheets")
@CrossOrigin(origins = "*")
public class TimesheetController {

    @Autowired
    private TimesheetEntryRepository timesheetRepo;

    @Autowired
    private UserRepository userRepo;

    @Autowired
    private NotificationService notificationService;

    @GetMapping("/{empId}/{year}/{month}")
    public ResponseEntity<?> getTimesheets(@PathVariable String empId, @PathVariable String year, @PathVariable String month) {
        User user = userRepo.findByEmpId(empId).orElse(null);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }
        
        // Month padded
        String paddedMonth = month.length() == 1 ? "0" + month : month;
        String yearMonth = year + "-" + paddedMonth;
        
        List<TimesheetEntry> entries = timesheetRepo.findByUserIdAndDateStartingWith(user.getId(), yearMonth);
        return ResponseEntity.ok(entries);
    }
    
    @PostMapping("/save")
    public ResponseEntity<?> saveTimesheet(@RequestBody TimesheetEntry entry) {
        if (entry.getUser() != null && entry.getUser().getId() != null) {
            userRepo.findById(entry.getUser().getId()).ifPresent(entry::setUser);
        }

        String type = entry.getType();
        if (type == null || type.trim().isEmpty()) {
            if (entry.getDayOfWeek() != null && (entry.getDayOfWeek() == 0 || entry.getDayOfWeek() == 6)) {
                type = "Week Off";
            } else {
                type = "Working Day";
            }
        }

        if ("Working Day".equalsIgnoreCase(type) || "WFH".equalsIgnoreCase(type)) {
            if (entry.getAmIn() == null || entry.getAmIn().trim().isEmpty() ||
                entry.getAmOut() == null || entry.getAmOut().trim().isEmpty() ||
                entry.getLunchOut() == null || entry.getLunchOut().trim().isEmpty() ||
                entry.getLunchIn() == null || entry.getLunchIn().trim().isEmpty() ||
                entry.getPmIn() == null || entry.getPmIn().trim().isEmpty() ||
                entry.getPmOut() == null || entry.getPmOut().trim().isEmpty()) {
                return ResponseEntity.badRequest().body("All time fields must be filled");
            }

            Integer amIn = parseTime(entry.getAmIn());
            Integer amOut = parseTime(entry.getAmOut());
            Integer lunchOut = parseTime(entry.getLunchOut());
            Integer lunchIn = parseTime(entry.getLunchIn());
            Integer pmIn = parseTime(entry.getPmIn());
            Integer pmOut = parseTime(entry.getPmOut());

            if (amIn == null || amOut == null || lunchOut == null || lunchIn == null || pmIn == null || pmOut == null) {
                return ResponseEntity.badRequest().body("Invalid time format");
            }

            if (amOut <= amIn) {
                return ResponseEntity.badRequest().body("AM Out must be later than AM In");
            }
            if (!amOut.equals(lunchOut)) {
                return ResponseEntity.badRequest().body("There should be no time gap between AM Out and Lunch Out");
            }
            if (lunchIn - lunchOut != 60) {
                return ResponseEntity.badRequest().body("Lunch break must be exactly one hour");
            }
            if (!lunchIn.equals(pmIn)) {
                return ResponseEntity.badRequest().body("Lunch In and PM In should not have any time gap");
            }
            if (pmOut <= pmIn) {
                return ResponseEntity.badRequest().body("PM Out must be later than PM In");
            }
        }

        // Determine the actor and role
        String actorEmpId = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
        User actor = userRepo.findByEmpId(actorEmpId).orElse(null);
        boolean isActorAdmin = actor != null && "admin".equalsIgnoreCase(actor.getRole());

        if (isActorAdmin) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN)
                    .body("Administrators are not permitted to modify employee timesheets.");
        }

        if (entry.getDate() != null && isPastDeadline(entry.getDate())) {
            return ResponseEntity.badRequest().body("Timesheets for this month are locked. No further modifications are permitted after the 15th of the following month.");
        }

        // Determine if it is a submission or resubmission
        String oldStatus = null;
        if (entry.getId() != null) {
            java.util.Optional<TimesheetEntry> existing = timesheetRepo.findById(entry.getId());
            if (existing.isPresent()) {
                oldStatus = existing.get().getStatus();
            }
        }
        
        TimesheetEntry saved = timesheetRepo.save(entry);
        
        User targetEmp = saved.getUser() != null ? saved.getUser() : actor;
        String empName = targetEmp != null ? targetEmp.getName() : "Unknown";
        String empId = targetEmp != null ? targetEmp.getEmpId() : "Unknown";
        String dateStr = saved.getDate();
        String newStatus = saved.getStatus();

        if (isActorAdmin) {
            // Admin modified timesheet
            String modifyMsg = notificationService.formatMessage("Timesheet Modified by Admin", empName, empId, dateStr, null);
            notificationService.sendNotification(empId, modifyMsg);

            // If status changed
            if (oldStatus != null && !oldStatus.equals(newStatus)) {
                String statusMsg = notificationService.formatMessage("Timesheet Status Updated", empName, empId, dateStr, "Status updated to " + newStatus);
                notificationService.sendNotification(empId, statusMsg);
            }
        } else {
            // Employee performed action
            if ("Pending".equals(newStatus) || "Reapproval Pending".equals(newStatus)) {
                if (saved.getShortHoursReason() != null && !saved.getShortHoursReason().trim().isEmpty()) {
                    String shortHrsMsg = notificationService.formatMessage("Short Hours Reason Submitted", empName, empId, dateStr, "Reason: " + saved.getShortHoursReason());
                    notificationService.notifyAllAdmins(shortHrsMsg);
                } else if (oldStatus != null && (oldStatus.equals("Rejected") || oldStatus.equals("Resubmit OT"))) {
                    String msg = notificationService.formatMessage("Timesheet Resubmitted", empName, empId, dateStr, null);
                    notificationService.notifyAllAdmins(msg);
                } else {
                    String msg = notificationService.formatMessage("Timesheet Submitted", empName, empId, dateStr, null);
                    notificationService.notifyAllAdmins(msg);
                }
            } else if ("Draft".equals(newStatus)) {
                if (oldStatus != null && (oldStatus.equals("Pending") || oldStatus.equals("Reapproval Pending"))) {
                    // Withdrawn / Recalled — single notification
                    String withdrawMsg = notificationService.formatMessage("Timesheet Withdrawn", empName, empId, dateStr, null);
                    notificationService.notifyAllAdmins(withdrawMsg);
                } else {
                    // Updated / Edited — single notification
                    String updateMsg = notificationService.formatMessage("Timesheet Updated", empName, empId, dateStr, null);
                    notificationService.notifyAllAdmins(updateMsg);
                }
            }
        }

        return ResponseEntity.ok(saved);
    }

    private boolean isPastDeadline(String dateStr) {
        try {
            java.time.LocalDate entryDate = java.time.LocalDate.parse(dateStr, java.time.format.DateTimeFormatter.ISO_LOCAL_DATE);
            java.time.LocalDate deadline = entryDate.plusMonths(1).withDayOfMonth(15);
            java.time.LocalDate today = java.time.LocalDate.now();
            return today.isAfter(deadline);
        } catch (Exception e) {
            return false;
        }
    }

    private Integer parseTime(String t) {
        if (t == null || t.trim().isEmpty() || !t.contains(":")) return null;
        try {
            String[] parts = t.split(":");
            int h = Integer.parseInt(parts[0]);
            int m = Integer.parseInt(parts[1]);
            return h * 60 + m;
        } catch (Exception e) {
            return null;
        }
    }
}
