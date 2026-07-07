package com.timesheet.backend.service;

import com.timesheet.backend.model.TimesheetEntry;
import com.timesheet.backend.model.User;
import com.timesheet.backend.repository.TimesheetEntryRepository;
import com.timesheet.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class TimesheetSchedulerService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TimesheetEntryRepository timesheetEntryRepository;

    @Autowired
    private EmailService emailService;

    // 1. Employee Weekly Reminder Email
    // Cron: Friday 4:00 PM IST
    @Scheduled(cron = "0 0 16 * * FRI", zone = "Asia/Kolkata")
    public void sendWeeklyEmployeeReminders() {
        System.out.println("Starting Employee Weekly Reminder Email cron job...");
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        LocalDate monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate tuesday = monday.plusDays(1);
        LocalDate wednesday = monday.plusDays(2);
        LocalDate thursday = monday.plusDays(3);

        List<LocalDate> targetDates = Arrays.asList(monday, tuesday, wednesday, thursday);
        String startStr = monday.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String endStr = thursday.format(DateTimeFormatter.ISO_LOCAL_DATE);

        List<User> employees = userRepository.findByRole("employee");

        for (User emp : employees) {
            if (emp.getEmail() == null || emp.getEmail().trim().isEmpty() || !emp.isEnabled()) {
                continue;
            }

            List<TimesheetEntry> entries = timesheetEntryRepository.findByUserIdAndDateBetween(emp.getId(), startStr, endStr);
            List<String> unfilledDates = new ArrayList<>();

            for (LocalDate date : targetDates) {
                String dateStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
                Optional<TimesheetEntry> entryOpt = entries.stream()
                        .filter(e -> e.getDate().equals(dateStr))
                        .findFirst();

                if (entryOpt.isPresent()) {
                    TimesheetEntry entry = entryOpt.get();
                    String type = entry.getType();
                    // Skip Week Off, Holiday, Sick Leave, or Casual Leave.
                    // Only Working Day and WFH are subject to checks.
                    if ("Working Day".equalsIgnoreCase(type) || "WFH".equalsIgnoreCase(type) || type == null) {
                        if (entry.getAmIn() == null || entry.getAmIn().trim().isEmpty() ||
                            entry.getPmOut() == null || entry.getPmOut().trim().isEmpty()) {
                            unfilledDates.add(date.format(DateTimeFormatter.ofPattern("EEEE dd MMM yyyy", Locale.ENGLISH)));
                        }
                    }
                } else {
                    // Default to Working Day on Mon-Thu if no entry exists
                    unfilledDates.add(date.format(DateTimeFormatter.ofPattern("EEEE dd MMM yyyy", Locale.ENGLISH)));
                }
            }

            if (!unfilledDates.isEmpty()) {
                sendIndividualReminder(emp, unfilledDates);
            } else {
                sendWeeklyConfirmation(emp);
            }
        }
    }

    private void sendWeeklyConfirmation(User employee) {
        String subject = "[Smart Time Entry] Timesheet Submission Confirmation";
        String htmlBody = "<html><body>" +
                "<p>Hello " + employee.getName() + ",</p>" +
                "<p>Congratulations! You have successfully completed and submitted this week's timesheet on time. Thank you for keeping your timesheet up to date.</p>" +
                "<p>Best Regards,<br/>Smart Time Entry Team</p>" +
                "</body></html>";
        emailService.sendHtmlEmail(employee.getEmail(), subject, htmlBody);
    }

    private void sendIndividualReminder(User employee, List<String> unfilledDates) {
        String subject = "[Smart Time Entry] Timesheet Reminder - Please complete your entries for this week";
        
        StringBuilder datesList = new StringBuilder("<ul>");
        for (String d : unfilledDates) {
            datesList.append("<li>").append(d).append("</li>");
        }
        datesList.append("</ul>");

        String htmlBody = "<html><body>" +
                "<p>Hello " + employee.getName() + ",</p>" +
                "<p>This is a friendly reminder to complete your timesheet entries for this week.</p>" +
                "<p>According to our records, the following days have incomplete or unfilled hours:</p>" +
                datesList.toString() +
                "<p>Please log in to the Smart Time Entry portal to complete and submit your timesheet:<br/>" +
                "<a href=\"https://timesheet.idealfolks.com/\" style=\"color: #0066cc; text-decoration: underline;\">https://timesheet.idealfolks.com/</a></p>" +
                "<p>Submission Deadline: Please ensure all entries are updated by Friday end of day.</p>" +
                "<p>If you have already filled in your timesheet, please ignore this email.</p>" +
                "<p>Best Regards,<br/>Smart Time Entry Team</p>" +
                "</body></html>";

        emailService.sendHtmlEmail(employee.getEmail(), subject, htmlBody);
    }

    // 2. Admin Weekly Compliance Report Email
    // Cron: Monday 10:00 AM IST
    @Scheduled(cron = "0 0 10 * * MON", zone = "Asia/Kolkata")
    public void sendWeeklyAdminComplianceReport() {
        System.out.println("Starting Admin Weekly Compliance Report cron job...");
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        LocalDate prevMonday = today.minusWeeks(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate prevTuesday = prevMonday.plusDays(1);
        LocalDate prevWednesday = prevMonday.plusDays(2);
        LocalDate prevThursday = prevMonday.plusDays(3);
        LocalDate prevFriday = prevMonday.plusDays(4);

        List<LocalDate> targetDates = Arrays.asList(prevMonday, prevTuesday, prevWednesday, prevThursday, prevFriday);
        String startStr = prevMonday.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String endStr = prevFriday.format(DateTimeFormatter.ISO_LOCAL_DATE);

        List<User> employees = userRepository.findByRole("employee");
        List<User> admins = userRepository.findByRole("admin");

        if (admins.isEmpty()) {
            System.out.println("No admin users found. Skipping compliance report email.");
            return;
        }

        String[] adminEmails = admins.stream()
                .map(User::getEmail)
                .filter(email -> email != null && !email.trim().isEmpty())
                .toArray(String[]::new);

        if (adminEmails.length == 0) {
            System.out.println("No admin users with valid email addresses found. Skipping.");
            return;
        }

        int totalEmployees = employees.size();
        int incompleteCount = 0;
        List<Map<String, Object>> complianceList = new ArrayList<>();

        for (User emp : employees) {
            List<TimesheetEntry> entries = timesheetEntryRepository.findByUserIdAndDateBetween(emp.getId(), startStr, endStr);
            List<String> unfilledDates = new ArrayList<>();

            for (LocalDate date : targetDates) {
                String dateStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
                Optional<TimesheetEntry> entryOpt = entries.stream()
                        .filter(e -> e.getDate().equals(dateStr))
                        .findFirst();

                if (entryOpt.isPresent()) {
                    TimesheetEntry entry = entryOpt.get();
                    String type = entry.getType();
                    if ("Working Day".equalsIgnoreCase(type) || "WFH".equalsIgnoreCase(type) || type == null) {
                        if (entry.getAmIn() == null || entry.getAmIn().trim().isEmpty() ||
                            entry.getPmOut() == null || entry.getPmOut().trim().isEmpty()) {
                            unfilledDates.add(date.format(DateTimeFormatter.ofPattern("EEEE dd MMM yyyy", Locale.ENGLISH)));
                        }
                    }
                } else {
                    unfilledDates.add(date.format(DateTimeFormatter.ofPattern("EEEE dd MMM yyyy", Locale.ENGLISH)));
                }
            }

            if (!unfilledDates.isEmpty()) {
                incompleteCount++;
                Map<String, Object> empData = new HashMap<>();
                empData.put("name", emp.getName());
                empData.put("empId", emp.getEmpId());
                empData.put("dept", emp.getDept() != null ? emp.getDept() : "--");
                empData.put("dates", unfilledDates);
                complianceList.add(empData);
            }
        }

        sendAdminReport(adminEmails, prevMonday, prevFriday, totalEmployees, incompleteCount, complianceList);
    }

    private void sendAdminReport(String[] adminEmails, LocalDate start, LocalDate end, int total, int incomplete, List<Map<String, Object>> complianceList) {
        String weekRange = start.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH)) + " - " +
                end.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH));
        
        String subject = "[Smart Time Entry] Weekly Timesheet Compliance Report - Week of " + start.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH));

        StringBuilder html = new StringBuilder();
        html.append("<html><head><style>")
            .append("body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }")
            .append("h2 { color: #1f3360; }")
            .append("table { border-collapse: collapse; width: 100%; margin-top: 20px; }")
            .append("th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }")
            .append("th { background-color: #f2f2f2; color: #1f3360; font-weight: bold; }")
            .append(".highlight { font-weight: bold; color: #e11d48; }")
            .append(".btn { display: inline-block; background-color: #1f3360; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; font-weight: bold; }")
            .append("</style></head><body>")
            .append("<h2>Weekly Timesheet Compliance Report</h2>")
            .append("<p><strong>Week:</strong> ").append(weekRange).append("</p>")
            .append("<p class='highlight'>").append(incomplete).append(" of ").append(total).append(" employees have incomplete entries.</p>");

        if (!complianceList.isEmpty()) {
            html.append("<table>")
                .append("<thead><tr><th>Employee Name</th><th>Employee ID</th><th>Department</th><th>Unfilled Dates</th></tr></thead>")
                .append("<tbody>");

            for (Map<String, Object> emp : complianceList) {
                List<String> dates = (List<String>) emp.get("dates");
                String datesString = String.join("<br/>", dates);
                html.append("<tr>")
                    .append("<td>").append(emp.get("name")).append("</td>")
                    .append("<td>").append(emp.get("empId")).append("</td>")
                    .append("<td>").append(emp.get("dept")).append("</td>")
                    .append("<td>").append(datesString).append("</td>")
                    .append("</tr>");
            }
            html.append("</tbody></table>");
        } else {
            html.append("<p style='color: #0d9488; font-weight: bold;'>Excellent! All employees have completed their timesheet entries for this week.</p>");
        }

        html.append("<br/><a href='https://timesheet.idealfolks.com/' class='btn'>Go to Admin Dashboard</a>")
            .append("<br/><br/><p>Best Regards,<br/>Smart Time Entry Team</p>")
            .append("</body></html>");

        for (String email : adminEmails) {
            emailService.sendHtmlEmail(email, subject, html.toString());
        }
    }

    // 3. Employee Monthly Reminder Email
    // Cron: Last day of the month at 5:00 PM IST
    @Scheduled(cron = "0 0 17 L * ?", zone = "Asia/Kolkata")
    public void sendMonthlyEmployeeReminders() {
        System.out.println("Starting Employee Monthly Reminder Email cron job...");
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        LocalDate firstDay = today.withDayOfMonth(1);
        LocalDate lastDay = today.with(TemporalAdjusters.lastDayOfMonth());

        String startStr = firstDay.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String endStr = lastDay.format(DateTimeFormatter.ISO_LOCAL_DATE);

        List<User> employees = userRepository.findByRole("employee");

        for (User emp : employees) {
            if (emp.getEmail() == null || emp.getEmail().trim().isEmpty() || !emp.isEnabled()) {
                continue;
            }

            List<TimesheetEntry> entries = timesheetEntryRepository.findByUserIdAndDateBetween(emp.getId(), startStr, endStr);
            boolean hasUnfilled = false;

            LocalDate current = firstDay;
            while (!current.isAfter(lastDay)) {
                DayOfWeek dow = current.getDayOfWeek();
                boolean isWknd = dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;

                if (!isWknd) {
                    String dateStr = current.format(DateTimeFormatter.ISO_LOCAL_DATE);
                    Optional<TimesheetEntry> entryOpt = entries.stream()
                            .filter(e -> e.getDate().equals(dateStr))
                            .findFirst();

                    if (entryOpt.isPresent()) {
                        TimesheetEntry entry = entryOpt.get();
                        String type = entry.getType();
                        if ("Working Day".equalsIgnoreCase(type) || "WFH".equalsIgnoreCase(type) || type == null) {
                            if (entry.getAmIn() == null || entry.getAmIn().trim().isEmpty() ||
                                entry.getPmOut() == null || entry.getPmOut().trim().isEmpty()) {
                                hasUnfilled = true;
                                break;
                            }
                        }
                    } else {
                        hasUnfilled = true;
                        break;
                    }
                }
                current = current.plusDays(1);
            }

            if (hasUnfilled) {
                String subject = "[Smart Time Entry] Monthly Timesheet Reminder - Please complete your entries";
                String htmlBody = "<html><body>" +
                        "<p>Hello " + emp.getName() + ",</p>" +
                        "<p>This is a friendly reminder to complete your timesheet entries for this month.</p>" +
                        "<p>Please log in to the Smart Time Entry portal to complete and submit your timesheet:<br/>" +
                        "<a href=\"https://timesheet.idealfolks.com/\" style=\"color: #0066cc; text-decoration: underline;\">https://timesheet.idealfolks.com/</a></p>" +
                        "<p>Submission Deadline: Please ensure all entries are updated by the end of today.</p>" +
                        "<p>If you have already filled in your timesheet, please ignore this email.</p>" +
                        "<p>Best Regards,<br/>Smart Time Entry Team</p>" +
                        "</body></html>";
                emailService.sendHtmlEmail(emp.getEmail(), subject, htmlBody);
            } else {
                String subject = "[Smart Time Entry] Monthly Timesheet Submission Confirmation";
                String htmlBody = "<html><body>" +
                        "<p>Hello " + emp.getName() + ",</p>" +
                        "<p>Congratulations! You have successfully completed and submitted this month's timesheet on time. Thank you for maintaining your timesheet consistently.</p>" +
                        "<p>Best Regards,<br/>Smart Time Entry Team</p>" +
                        "</body></html>";
                emailService.sendHtmlEmail(emp.getEmail(), subject, htmlBody);
            }
        }
    }

    // 4. Admin Monthly Compliance Reminder Email
    // Cron: Last day of the month at 5:00 PM IST
    @Scheduled(cron = "0 0 17 L * ?", zone = "Asia/Kolkata")
    public void sendMonthlyAdminReminders() {
        System.out.println("Starting Admin Monthly Reminder Email cron job...");
        List<User> admins = userRepository.findByRole("admin");
        for (User admin : admins) {
            if (admin.isEnabled() && admin.getEmail() != null && !admin.getEmail().trim().isEmpty()) {
                String subject = "[Smart Time Entry] Monthly Timesheet Compliance Reminder";
                String htmlBody = "<html><body>" +
                        "<p>Hello " + admin.getName() + ",</p>" +
                        "<p>This is a monthly reminder to review timesheet compliance, check employee submissions, and finalize approvals for this month.</p>" +
                        "<p>Please log in to the Admin Dashboard to check timesheet statuses:<br/>" +
                        "<a href=\"https://timesheet.idealfolks.com/\" style=\"color: #0066cc; text-decoration: underline;\">https://timesheet.idealfolks.com/</a></p>" +
                        "<p>Best Regards,<br/>Smart Time Entry Team</p>" +
                        "</body></html>";
                emailService.sendHtmlEmail(admin.getEmail(), subject, htmlBody);
            }
        }
    }
}
