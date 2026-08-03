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
public class TimesheetController {

    @Autowired
    private TimesheetEntryRepository timesheetRepo;

    @Autowired
    private UserRepository userRepo;

    @Autowired
    private NotificationService notificationService;

    private String cleanText(String val) {
        if (val == null) return null;
        String cleaned = val.replaceAll("<[^>]*>", "");
        String[] lines = cleaned.split("\n");
        StringBuilder sb = new StringBuilder();
        for (String line : lines) {
            String cleanLine = line.replaceAll("[ \\t]+", " ").trim();
            sb.append(cleanLine).append("\n");
        }
        return sb.toString().trim();
    }

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
        if (entry.getShortHoursReason() != null) {
            entry.setShortHoursReason(cleanText(entry.getShortHoursReason()));
        }
        if (entry.getOtReason() != null) {
            entry.setOtReason(cleanText(entry.getOtReason()));
        }
        if (entry.getOtRemarks() != null) {
            entry.setOtRemarks(cleanText(entry.getOtRemarks()));
        }
        if (entry.getRejectionReason() != null) {
            entry.setRejectionReason(cleanText(entry.getRejectionReason()));
        }
        if (entry.getOtRejectionReason() != null) {
            entry.setOtRejectionReason(cleanText(entry.getOtRejectionReason()));
        }

        if (entry.getUser() != null && entry.getUser().getId() != null) {
            userRepo.findById(entry.getUser().getId()).ifPresent(entry::setUser);
        }

        // Joining Date Validation: Cannot submit timesheet before joining date
        if (entry.getUser() != null && entry.getUser().getDateOfJoining() != null && !entry.getUser().getDateOfJoining().trim().isEmpty()) {
            String dojStr = entry.getUser().getDateOfJoining().trim();
            if (entry.getDate() != null && !entry.getDate().trim().isEmpty()) {
                try {
                    java.time.LocalDate doj = java.time.LocalDate.parse(dojStr);
                    java.time.LocalDate entryDate = java.time.LocalDate.parse(entry.getDate());
                    if (entryDate.isBefore(doj)) {
                        return ResponseEntity.badRequest().body("Entries for dates prior to the employee's joining date (" + dojStr + ") are not allowed.");
                    }
                } catch (Exception e) {
                    // ignore format mismatch
                }
            }
        }

        String type = entry.getType();
        if (type == null || type.trim().isEmpty()) {
            boolean checkWknd = false;
            if (entry.getDate() != null) {
                try {
                    java.time.LocalDate d = java.time.LocalDate.parse(entry.getDate());
                    int day = d.getDayOfWeek().getValue();
                    checkWknd = day == 6 || day == 7;
                } catch (Exception e) {
                    // ignore
                }
            }
            if (!checkWknd && entry.getDayOfWeek() != null) {
                checkWknd = entry.getDayOfWeek() == 0 || entry.getDayOfWeek() == 6;
            }

            if (checkWknd) {
                type = "Week Off";
            } else {
                type = "Working Day";
            }
        }

        boolean isWknd = false;
        if (entry.getDate() != null) {
            try {
                java.time.LocalDate d = java.time.LocalDate.parse(entry.getDate());
                int day = d.getDayOfWeek().getValue(); // 1 = Monday, 7 = Sunday
                isWknd = day == 6 || day == 7;
            } catch (Exception e) {
                // ignore
            }
        }
        if (!isWknd && entry.getDayOfWeek() != null) {
            isWknd = entry.getDayOfWeek() == 0 || entry.getDayOfWeek() == 6;
        }
        boolean isWeekendOrHoliday = isWknd || "Holiday".equalsIgnoreCase(type);

        System.out.println("DEBUG TIMESHEET: date=" + entry.getDate() + ", type=" + type + ", dayOfWeek=" + entry.getDayOfWeek() + ", isWknd=" + isWknd + ", isWeekendOrHoliday=" + isWeekendOrHoliday);

        boolean isPartTimeEmp = false;
        User empForPT = entry.getUser();
        if (empForPT != null && empForPT.getId() != null) {
            empForPT = userRepo.findById(empForPT.getId()).orElse(null);
        }
        if (empForPT == null) {
            String actorEmpId = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
            empForPT = userRepo.findByEmpId(actorEmpId).orElse(null);
        }
        if (empForPT != null) {
            isPartTimeEmp = "Part time".equalsIgnoreCase(empForPT.getEmpType());
        }

        if (isPartTimeEmp) {
            entry.setLunchOut("00:00");
            entry.setLunchIn("00:00");
        }

        if (entry.getPmIn() != null && !entry.getPmIn().trim().isEmpty()) {
            Integer pmIn = parseTime(entry.getPmIn());
            if (pmIn != null && pmIn < 720) {
                return ResponseEntity.badRequest().body("PM In must be at or after 12:00");
            }
        }
        if (entry.getPmOut() != null && !entry.getPmOut().trim().isEmpty()) {
            Integer pmOut = parseTime(entry.getPmOut());
            if (pmOut != null && pmOut < 720) {
                return ResponseEntity.badRequest().body("PM Out must be at or after 12:00");
            }
        }

        boolean isLeaveOrWeekOff = "Paid Leave".equalsIgnoreCase(type) || "Unpaid Leave".equalsIgnoreCase(type) || "Week Off".equalsIgnoreCase(type);
        if (isPartTimeEmp && !isLeaveOrWeekOff) {
            boolean isAmInEmpty = entry.getAmIn() == null || entry.getAmIn().trim().isEmpty() || "00:00".equals(entry.getAmIn().trim());
            boolean isAmOutEmpty = entry.getAmOut() == null || entry.getAmOut().trim().isEmpty() || "00:00".equals(entry.getAmOut().trim());
            boolean isPmInEmpty = entry.getPmIn() == null || entry.getPmIn().trim().isEmpty() || "00:00".equals(entry.getPmIn().trim());
            boolean isPmOutEmpty = entry.getPmOut() == null || entry.getPmOut().trim().isEmpty() || "00:00".equals(entry.getPmOut().trim());
            boolean isAllEmptyOrZero = isAmInEmpty && isAmOutEmpty && isPmInEmpty && isPmOutEmpty;

            if (isWeekendOrHoliday && isAllEmptyOrZero && !"Part-Time".equalsIgnoreCase(type)) {
                // Allowed to be empty on weekends or holidays
            } else {
                if (isAllEmptyOrZero) {
                    return ResponseEntity.badRequest().body("Please enter working hours in either the Morning or Afternoon session before submitting the timesheet.");
                }

                boolean hasAmSection = !isAmInEmpty && !isAmOutEmpty;
                boolean hasPmSection = !isPmInEmpty && !isPmOutEmpty;

                if ((!isAmInEmpty && isAmOutEmpty) || (isAmInEmpty && !isAmOutEmpty)) {
                    return ResponseEntity.badRequest().body("Both AM In and AM Out must be entered, or both left blank/00:00");
                }
                if ((!isPmInEmpty && isPmOutEmpty) || (isPmInEmpty && !isPmOutEmpty)) {
                    return ResponseEntity.badRequest().body("Both PM In and PM Out must be entered, or both left blank/00:00");
                }

                if (!hasAmSection && !hasPmSection) {
                    return ResponseEntity.badRequest().body("Please enter working hours in either the Morning or Afternoon session before submitting the timesheet.");
                }

                Integer amInVal = !isAmInEmpty ? parseTime(entry.getAmIn()) : null;
                Integer amOutVal = !isAmOutEmpty ? parseTime(entry.getAmOut()) : null;
                Integer pmInVal = !isPmInEmpty ? parseTime(entry.getPmIn()) : null;
                Integer pmOutVal = !isPmOutEmpty ? parseTime(entry.getPmOut()) : null;

                if (hasAmSection && amInVal != null && amOutVal != null && amOutVal <= amInVal) {
                    return ResponseEntity.badRequest().body("AM Out must be later than AM In");
                }
                if (hasPmSection && pmInVal != null && pmOutVal != null && pmOutVal <= pmInVal) {
                    return ResponseEntity.badRequest().body("PM Out must be later than PM In");
                }
                if (hasAmSection && hasPmSection && amOutVal != null && pmInVal != null && pmInVal < amOutVal) {
                    return ResponseEntity.badRequest().body("PM In must be at or after AM Out");
                }
            }
        } else {
            if ("Working Day".equalsIgnoreCase(type) || "WFH".equalsIgnoreCase(type) || "Holiday".equalsIgnoreCase(type)) {
                boolean hasAmIn = entry.getAmIn() != null && !entry.getAmIn().trim().isEmpty();
                boolean hasAmOut = entry.getAmOut() != null && !entry.getAmOut().trim().isEmpty();
                boolean hasLunchOut = entry.getLunchOut() != null && !entry.getLunchOut().trim().isEmpty();
                boolean hasLunchIn = entry.getLunchIn() != null && !entry.getLunchIn().trim().isEmpty();
                boolean hasPmIn = entry.getPmIn() != null && !entry.getPmIn().trim().isEmpty();
                boolean hasPmOut = entry.getPmOut() != null && !entry.getPmOut().trim().isEmpty();
                boolean hasAny = hasAmIn || hasAmOut || hasLunchOut || hasLunchIn || hasPmIn || hasPmOut;

                if (isWeekendOrHoliday) {
                    if ("Holiday".equalsIgnoreCase(type) && !hasAny) {
                        // Holiday with no times is allowed
                    } else {
                        boolean hasAm = hasAmIn && hasAmOut;
                        boolean hasPm = hasPmIn && hasPmOut;
                        if (!hasAm && !hasPm) {
                            return ResponseEntity.badRequest().body("Either AM In/Out or PM In/Out must be completely filled to submit working hours");
                        }
                        
                        if ((hasAmIn && !hasAmOut) || (!hasAmIn && hasAmOut)) {
                            return ResponseEntity.badRequest().body("Both AM In and AM Out must be entered, or both left blank");
                        }
                        if ((hasPmIn && !hasPmOut) || (!hasPmIn && hasPmOut)) {
                            return ResponseEntity.badRequest().body("Both PM In and PM Out must be entered, or both left blank");
                        }
                        if (!isPartTimeEmp) {
                            if ((hasLunchOut && !hasLunchIn) || (!hasLunchOut && hasLunchIn)) {
                                return ResponseEntity.badRequest().body("Both Lunch In and Lunch Out must be entered, or both left blank");
                            }
                        }

                        Integer amIn = hasAmIn ? parseTime(entry.getAmIn()) : null;
                        Integer amOut = hasAmOut ? parseTime(entry.getAmOut()) : null;
                        Integer lunchOut = hasLunchOut ? parseTime(entry.getLunchOut()) : null;
                        Integer lunchIn = hasLunchIn ? parseTime(entry.getLunchIn()) : null;
                        Integer pmIn = hasPmIn ? parseTime(entry.getPmIn()) : null;
                        Integer pmOut = hasPmOut ? parseTime(entry.getPmOut()) : null;

                        if (hasAmIn && amIn == null) return ResponseEntity.badRequest().body("Invalid AM In format");
                        if (hasAmOut && amOut == null) return ResponseEntity.badRequest().body("Invalid AM Out format");
                        if (!isPartTimeEmp) {
                            if (hasLunchOut && lunchOut == null) return ResponseEntity.badRequest().body("Invalid Lunch In format");
                            if (hasLunchIn && lunchIn == null) return ResponseEntity.badRequest().body("Invalid Lunch Out format");
                        }
                        if (hasPmIn && pmIn == null) return ResponseEntity.badRequest().body("Invalid PM In format");
                        if (hasPmOut && pmOut == null) return ResponseEntity.badRequest().body("Invalid PM Out format");

                        if (hasAm && amOut <= amIn) {
                            return ResponseEntity.badRequest().body("AM Out must be later than AM In");
                        }
                        if (hasPm && pmOut <= pmIn) {
                            return ResponseEntity.badRequest().body("PM Out must be later than PM In");
                        }
                        if (!isPartTimeEmp) {
                            if (hasLunchOut && hasLunchIn && lunchIn <= lunchOut) {
                                return ResponseEntity.badRequest().body("Lunch Out must be later than Lunch In");
                            }
                        }
                        if (hasAmIn && hasPmOut && pmOut <= amIn) {
                            return ResponseEntity.badRequest().body("PM Out must be later than AM In");
                        }
                        if (hasAmOut && hasPmIn && pmIn < amOut) {
                            return ResponseEntity.badRequest().body("PM In must be at or after AM Out");
                        }
                        if (!isPartTimeEmp) {
                            if (hasLunchOut && hasAmIn && lunchOut < amIn) {
                                return ResponseEntity.badRequest().body("Lunch In must be at or after AM In");
                            }
                            if (hasLunchIn && hasPmOut && pmOut < lunchIn) {
                                return ResponseEntity.badRequest().body("PM Out must be at or after Lunch Out");
                            }
                            if (hasLunchOut && hasAmOut && lunchOut < amOut) {
                                return ResponseEntity.badRequest().body("Lunch In must be at or after AM Out");
                            }
                            if (hasLunchIn && hasPmIn && pmIn < lunchIn) {
                                return ResponseEntity.badRequest().body("PM In must be at or after Lunch Out");
                            }
                        }
                    }
                } else {
                    if (!hasAmIn || !hasAmOut || !hasLunchOut || !hasLunchIn || !hasPmIn || !hasPmOut) {
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
                        return ResponseEntity.badRequest().body("There should be no time gap between AM Out and Lunch In");
                    }
                    if (lunchIn - lunchOut != 60) {
                        return ResponseEntity.badRequest().body("Lunch break must be exactly one hour");
                    }
                    if (!lunchIn.equals(pmIn)) {
                        return ResponseEntity.badRequest().body("Lunch Out and PM In should not have any time gap");
                    }
                    if (pmOut <= pmIn) {
                        return ResponseEntity.badRequest().body("PM Out must be later than PM In");
                    }
                }
            }
        }

        // ── 28-hour weekly cap for Part-Time employees (submission only) ────────
        // Only applies when the employee is actually submitting (status == "Pending").
        // Draft entries (status == "Draft" or null) are never counted toward the limit.
        if (isPartTimeEmp && "Pending".equalsIgnoreCase(entry.getStatus()) && !isLeaveOrWeekOff) {
            final int PT_WEEKLY_LIMIT_MINS = 28 * 60; // 1680 minutes
            java.util.Set<String> submittedStatuses = new java.util.HashSet<>(
                java.util.Arrays.asList("Pending", "Approved", "Reapproval Pending")
            );

            // Determine Monday and Sunday of the entry's ISO week (Mon–Sun)
            java.time.LocalDate entryLocalDate = java.time.LocalDate.parse(entry.getDate());
            java.time.DayOfWeek dow = entryLocalDate.getDayOfWeek();
            // Monday=1 … Sunday=7
            java.time.LocalDate weekMonday = entryLocalDate.minusDays(dow.getValue() - 1);
            java.time.LocalDate weekSunday = weekMonday.plusDays(6);
            String mondayStr = weekMonday.toString();
            String sundayStr = weekSunday.toString();

            // Fetch all persisted entries for this user in the current week
            Long userId = empForPT.getId();
            java.util.List<TimesheetEntry> weekEntries =
                timesheetRepo.findByUserIdAndDateBetween(userId, mondayStr, sundayStr);

            // Sum minutes from OTHER days that are already submitted
            // (exclude the row being saved — same id or same date)
            int submittedOtherMins = 0;
            for (TimesheetEntry we : weekEntries) {
                // Skip if this is the same record (re-submission of the same day)
                boolean isSameRecord = (entry.getId() != null && entry.getId().equals(we.getId()))
                    || (we.getDate() != null && we.getDate().equals(entry.getDate()));
                if (isSameRecord) continue;
                if (we.getStatus() != null && submittedStatuses.contains(we.getStatus())) {
                    submittedOtherMins += computeWorkingMins(we);
                }
            }

            // Minutes the employee is trying to submit for today
            int currentDayMins = computeWorkingMins(entry);
            int totalIfSubmitted = submittedOtherMins + currentDayMins;

            if (totalIfSubmitted > PT_WEEKLY_LIMIT_MINS) {
                int remainingMins = Math.max(0, PT_WEEKLY_LIMIT_MINS - submittedOtherMins);
                int remainHrs = remainingMins / 60;
                int remainMin = remainingMins % 60;
                String remainStr = remainMin > 0
                    ? remainHrs + "h " + remainMin + "m"
                    : remainHrs + "h";
                return ResponseEntity.badRequest().body(
                    "Weekly 28-hour limit exceeded for Part-Time employees. " +
                    "Remaining available hours this week: " + remainStr + ". " +
                    "Please reduce your working hours to fit within the limit."
                );
            }
        }
        // ────────────────────────────────────────────────────────────────────────

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
            java.util.Optional<TimesheetEntry> existingOpt = timesheetRepo.findById(entry.getId());
            if (existingOpt.isPresent()) {
                TimesheetEntry oldEntry = existingOpt.get();
                oldStatus = oldEntry.getStatus();
                
                String oldOtStatus = oldEntry.getOtStatus();
                boolean isOldPending = (oldStatus != null && oldStatus.toLowerCase().contains("pending")) ||
                                       (oldOtStatus != null && oldOtStatus.toLowerCase().contains("pending")) ||
                                       "Filed".equalsIgnoreCase(oldOtStatus) ||
                                       "Refilled".equalsIgnoreCase(oldOtStatus);
                if (isOldPending) {
                    // Check if any read-only data fields were modified
                    boolean isDataModified = 
                        !safeCompare(oldEntry.getType(), entry.getType()) ||
                        !safeCompare(oldEntry.getAmIn(), entry.getAmIn()) ||
                        !safeCompare(oldEntry.getAmOut(), entry.getAmOut()) ||
                        !safeCompare(oldEntry.getLunchOut(), entry.getLunchOut()) ||
                        !safeCompare(oldEntry.getLunchIn(), entry.getLunchIn()) ||
                        !safeCompare(oldEntry.getPmIn(), entry.getPmIn()) ||
                        !safeCompare(oldEntry.getPmOut(), entry.getPmOut()) ||
                        !safeCompare(oldEntry.getOtReason(), entry.getOtReason()) ||
                        !safeCompare(oldEntry.getOtRemarks(), entry.getOtRemarks()) ||
                        !safeCompare(oldEntry.getClientApproved(), entry.getClientApproved()) ||
                        !safeCompare(oldEntry.getClientApprovalFile(), entry.getClientApprovalFile());
                    if (isDataModified) {
                        return ResponseEntity.badRequest().body("This timesheet entry is currently under review and cannot be modified.");
                    }
                }
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

    /**
     * Computes total working minutes from an entry's AM and PM time fields.
     * Used for the Part-Time 28-hour weekly cap calculation.
     * Lunch break is not counted (Part-Time employees have no lunch break).
     */
    private int computeWorkingMins(TimesheetEntry entry) {
        int amMins = 0, pmMins = 0;
        Integer amIn  = parseTime(entry.getAmIn());
        Integer amOut = parseTime(entry.getAmOut());
        Integer pmIn  = parseTime(entry.getPmIn());
        Integer pmOut = parseTime(entry.getPmOut());
        if (amIn != null && amOut != null && amOut > amIn) amMins = amOut - amIn;
        if (pmIn != null && pmOut != null && pmOut > pmIn) pmMins = pmOut - pmIn;
        return amMins + pmMins;
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

    private boolean safeCompare(Object a, Object b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) {
            if (a instanceof String && ((String) a).isEmpty() && b == null) return true;
            if (b instanceof String && ((String) b).isEmpty() && a == null) return true;
            return false;
        }
        return a.equals(b);
    }

    @PostMapping("/{id}/leave/resubmit")
    public ResponseEntity<?> resubmitLeave(@PathVariable Long id) {
        return timesheetRepo.findById(id).map(entry -> {
            String type = entry.getType();
            if (type == null || (!type.equalsIgnoreCase("Paid Leave") && !type.equalsIgnoreCase("Unpaid Leave"))) {
                return ResponseEntity.badRequest().body("This is not a leave request");
            }
            
            boolean isRejected = "Rejected".equalsIgnoreCase(entry.getStatus());
            boolean isApprovedWithResubmit = "Approved".equalsIgnoreCase(entry.getStatus()) 
                && entry.getOtResubmissionGranted() != null && entry.getOtResubmissionGranted()
                && (entry.getOtResubmissionUsed() == null || !entry.getOtResubmissionUsed());
                
            if (!isRejected && !isApprovedWithResubmit) {
                return ResponseEntity.badRequest().body("Only rejected leave requests or approved leave requests with resubmission permission can be resubmitted");
            }
            
            if (entry.getLeaveReapplyCount() != null && entry.getLeaveReapplyCount() >= 1) {
                return ResponseEntity.badRequest().body("Leave request can only be resubmitted once");
            }
            
            entry.setStatus("Pending");
            entry.setSubmitted(true);
            entry.setRejectionReason(null);
            if (isApprovedWithResubmit) {
                entry.setOtResubmissionUsed(true);
            }
            entry.setLeaveReapplyCount((entry.getLeaveReapplyCount() == null ? 0 : entry.getLeaveReapplyCount()) + 1);
            
            TimesheetEntry saved = timesheetRepo.save(entry);
            
            // Notify admins
            String empId = saved.getUser().getEmpId();
            String empName = saved.getUser().getName();
            String dateStr = saved.getDate();
            String resubmitMsg = notificationService.formatMessage("Timesheet Leave Resubmitted", empName, empId, dateStr, null);
            notificationService.notifyAllAdmins(resubmitMsg);
            
            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }
}
