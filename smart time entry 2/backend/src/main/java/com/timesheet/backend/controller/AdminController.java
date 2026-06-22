package com.timesheet.backend.controller;

import com.timesheet.backend.model.TimesheetEntry;
import com.timesheet.backend.model.User;
import com.timesheet.backend.repository.TimesheetEntryRepository;
import com.timesheet.backend.repository.UserRepository;
import com.timesheet.backend.repository.AuditLogRepository;
import com.timesheet.backend.model.AuditLog;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import com.timesheet.backend.service.NotificationService;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@CrossOrigin(origins = "*")
public class AdminController {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TimesheetEntryRepository timesheetRepo;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private com.timesheet.backend.repository.EmailDomainRepository emailDomainRepository;

    @GetMapping("/employees")
    public ResponseEntity<List<User>> getAllEmployees() {
        return ResponseEntity.ok(userRepository.findAll());
    }

    @GetMapping("/employees/check-email")
    public ResponseEntity<?> checkEmail(@RequestParam String email, @RequestParam(required = false) Long excludeId) {
        String trimmedEmail = email.trim();
        java.util.Optional<User> userOpt = userRepository.findByEmail(trimmedEmail);
        if (userOpt.isPresent()) {
            User existingUser = userOpt.get();
            if (excludeId == null || !existingUser.getId().equals(excludeId)) {
                return ResponseEntity.ok(java.util.Map.of("exists", true));
            }
        }
        return ResponseEntity.ok(java.util.Map.of("exists", false));
    }

    @GetMapping("/employees/check-contact")
    public ResponseEntity<?> checkContact(
            @RequestParam String contactNumber,
            @RequestParam(required = false) String country,
            @RequestParam(required = false) Long excludeId) {
        String trimmed = contactNumber.trim().replaceAll("[^0-9]", ""); // keep only digits
        if (trimmed.isEmpty()) {
            return ResponseEntity.ok(java.util.Map.of("exists", false));
        }
        // Contact numbers are stored as "IN (+91) | 9876543210", so we search by the digit suffix
        java.util.List<User> matches = userRepository.findByContactNumberContaining(trimmed);
        for (User existing : matches) {
            if (excludeId == null || !existing.getId().equals(excludeId)) {
                if (isDuplicateContact(contactNumber, country, existing.getContactNumber())) {
                    return ResponseEntity.ok(java.util.Map.of("exists", true));
                }
            }
        }
        return ResponseEntity.ok(java.util.Map.of("exists", false));
    }



    @PostMapping("/employees/{id}/disable")
    public ResponseEntity<?> disableEmployee(@PathVariable Long id, @RequestBody(required = false) java.util.Map<String, String> body) {
        return userRepository.findById(id).map(user -> {
            if ("admin".equalsIgnoreCase(user.getRole())) {
                return ResponseEntity.badRequest().body("Admin users cannot be deactivated");
            }
            
            String reason = body != null ? body.get("reason") : null;
            String comments = body != null ? body.get("comments") : null;
            
            if (reason == null || reason.trim().isEmpty()) {
                return ResponseEntity.badRequest().body("Reason for disabling is mandatory");
            }
            
            if ("Other".equalsIgnoreCase(reason.trim()) && (comments == null || comments.trim().isEmpty())) {
                return ResponseEntity.badRequest().body("Comments are required when 'Other' reason is selected");
            }

            user.setEnabled(false);
            userRepository.save(user);

            // Notify all admins
            String disableMsg = notificationService.formatMessage("Employee Account Disabled", user.getName(), user.getEmpId(), "N/A", null);
            notificationService.notifyAllAdmins(disableMsg);

            // Log action in AuditLog
            String adminEmpId = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
            String adminName = adminEmpId;
            java.util.Optional<User> adminOpt = userRepository.findByEmpId(adminEmpId);
            if (adminOpt.isPresent()) {
                adminName = adminOpt.get().getName();
            }

            AuditLog log = new AuditLog();
            log.setAction("Account_Disabled");
            log.setAffectedEmpId(user.getEmpId());
            log.setAffectedName(user.getName());
            log.setPerformedByEmpId(adminEmpId);
            log.setPerformedByName(adminName);
            log.setReason(reason.trim());
            if (comments != null) {
                log.setComments(comments.trim());
            }
            log.setPreviousValues("Active");
            log.setNewValues("Disabled");
            auditLogRepository.save(log);

            return ResponseEntity.ok(user);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/employees/{id}/enable")
    public ResponseEntity<?> enableEmployee(@PathVariable Long id, @RequestBody(required = false) java.util.Map<String, String> body) {
        return userRepository.findById(id).map(user -> {
            String reason = body != null ? body.get("reason") : null;
            String comments = body != null ? body.get("comments") : null;
            
            if (reason == null || reason.trim().isEmpty()) {
                return ResponseEntity.badRequest().body("Reason for enabling is mandatory");
            }
            
            if ("Other".equalsIgnoreCase(reason.trim()) && (comments == null || comments.trim().isEmpty())) {
                return ResponseEntity.badRequest().body("Comments are required when 'Other' reason is selected");
            }

            user.setEnabled(true);
            userRepository.save(user);

            // Notify all admins
            String enableMsg = notificationService.formatMessage("Employee Account Enabled", user.getName(), user.getEmpId(), "N/A", null);
            notificationService.notifyAllAdmins(enableMsg);

            // Log action in AuditLog
            String adminEmpId = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
            String adminName = adminEmpId;
            java.util.Optional<User> adminOpt = userRepository.findByEmpId(adminEmpId);
            if (adminOpt.isPresent()) {
                adminName = adminOpt.get().getName();
            }

            AuditLog log = new AuditLog();
            log.setAction("Account_Enabled");
            log.setAffectedEmpId(user.getEmpId());
            log.setAffectedName(user.getName());
            log.setPerformedByEmpId(adminEmpId);
            log.setPerformedByName(adminName);
            log.setReason(reason.trim());
            if (comments != null) {
                log.setComments(comments.trim());
            }
            log.setPreviousValues("Disabled");
            log.setNewValues("Active");
            auditLogRepository.save(log);

            return ResponseEntity.ok(user);
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/audit-logs")
    public ResponseEntity<?> getAuditLogs() {
        return ResponseEntity.ok(auditLogRepository.findAllByOrderByIdDesc());
    }



    @Autowired
    private com.timesheet.backend.service.EmailService emailService;

    private void notifyEmpCreationFailure(String name, String empId, String reason) {
        String safeName = (name == null || name.trim().isEmpty()) ? "Unknown" : name.trim();
        String safeId = (empId == null || empId.trim().isEmpty()) ? "Unknown ID" : empId.trim();
        notificationService.notifyAllAdmins("Failed to create employee: " + safeName + " (" + safeId + "). Reason: " + reason + ".");
    }

    @GetMapping("/domains")
    public ResponseEntity<List<String>> getEmailDomains() {
        List<String> domains = emailDomainRepository.findAll().stream()
                .map(com.timesheet.backend.model.EmailDomain::getName)
                .collect(java.util.stream.Collectors.toList());
        return ResponseEntity.ok(domains);
    }

    @PostMapping("/domains")
    public ResponseEntity<?> addEmailDomain(@RequestBody Map<String, String> body) {
        String domain = body.get("name");
        if (domain == null || domain.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Domain name is required");
        }
        domain = domain.trim().toLowerCase();
        
        // Validation
        if (!domain.startsWith("@")) {
            return ResponseEntity.badRequest().body("Domain must start with '@'");
        }
        if (domain.contains(" ")) {
            return ResponseEntity.badRequest().body("Domain must not contain spaces");
        }
        if (domain.contains("..")) {
            return ResponseEntity.badRequest().body("Domain must not contain consecutive dots (..)");
        }
        String withoutAt = domain.substring(1);
        if (withoutAt.isEmpty()) {
            return ResponseEntity.badRequest().body("Domain name is required");
        }
        if (!withoutAt.matches("^[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$")) {
            return ResponseEntity.badRequest().body("Domain must contain a valid domain name and extension (e.g. .com, .org)");
        }

        if (emailDomainRepository.findByNameIgnoreCase(domain).isPresent()) {
            return ResponseEntity.ok(java.util.Map.of("message", "Domain already exists", "name", domain));
        }

        com.timesheet.backend.model.EmailDomain d = new com.timesheet.backend.model.EmailDomain();
        d.setName(domain);
        emailDomainRepository.save(d);
        return ResponseEntity.ok(d);
    }

    @PostMapping("/employees")
    public ResponseEntity<?> addEmployee(@RequestBody User employee) {
        // Trim inputs
        String empId = employee.getEmpId() != null ? employee.getEmpId().trim() : null;
        String email = employee.getEmail() != null ? employee.getEmail().trim() : null;
        String name = employee.getName() != null ? employee.getName().trim() : null;
        String manager = employee.getManager() != null ? employee.getManager().trim() : null;
        String projectName = employee.getProjectName() != null ? employee.getProjectName().trim() : null;
        String companyName = employee.getCompanyName() != null ? employee.getCompanyName().trim() : null;
        String dateOfJoining = employee.getDateOfJoining() != null ? employee.getDateOfJoining().trim() : null;

        String dept = employee.getDept() != null ? employee.getDept().trim() : null;
        String country = employee.getCountry() != null ? employee.getCountry().trim() : null;
        String contactNumber = employee.getContactNumber() != null ? employee.getContactNumber().trim() : null;

        // Backend Validations
        if (name == null || name.length() < 3 || name.length() > 32 || !name.matches("^[A-Za-z]+(?: [A-Za-z]+)*$")) {
            notifyEmpCreationFailure(name, empId, "Please enter a valid full name.");
            return ResponseEntity.badRequest().body("Please enter a valid full name.");
        }
        if (empId == null || empId.length() < 3 || empId.length() > 20) {
            notifyEmpCreationFailure(name, empId, "Please enter a valid Employee ID.");
            return ResponseEntity.badRequest().body("Please enter a valid Employee ID.");
        }
        java.util.List<String> allowedDepts = java.util.Arrays.asList("HR", "IT", "Marketing", "Operations", "Sales", "other", "Administration");
        if (dept == null || !allowedDepts.contains(dept)) {
            notifyEmpCreationFailure(name, empId, "Please select a department.");
            return ResponseEntity.badRequest().body("Please select a department.");
        }
        if (manager == null || manager.length() < 3 || manager.length() > 32 || !manager.matches("^[A-Za-z]+(?: [A-Za-z]+)*$")) {
            notifyEmpCreationFailure(name, empId, "Please enter a valid manager name.");
            return ResponseEntity.badRequest().body("Please enter a valid manager name.");
        }
        // Manager existence check removed — any valid formatted name is accepted

        // Country Validation
        if (country == null || country.isEmpty()) {
            notifyEmpCreationFailure(name, empId, "Please select a country.");
            return ResponseEntity.badRequest().body("Please select a country.");
        }
        if (!"India (+91)".equals(country) && !"Japan (+81)".equals(country) &&
            !"IN (+91)".equals(country) && !"JP (+81)".equals(country)) {
            notifyEmpCreationFailure(name, empId, "Please select a valid country.");
            return ResponseEntity.badRequest().body("Please select a valid country.");
        }

        // Contact Number Validation
        if (contactNumber == null || contactNumber.isEmpty()) {
            notifyEmpCreationFailure(name, empId, "Please enter a contact number.");
            return ResponseEntity.badRequest().body("Please enter a contact number.");
        }
        
        String rawNumber = extractRawNumber(contactNumber);
        
        if (country.contains("+91")) {
            if (rawNumber.length() != 10 || !rawNumber.matches("^\\d{10}$")) {
                notifyEmpCreationFailure(name, empId, "Please enter a valid 10-digit mobile number.");
                return ResponseEntity.badRequest().body("Please enter a valid 10-digit mobile number.");
            }
        } else if (country.contains("+81")) {
            if (rawNumber.length() != 11 || !rawNumber.matches("^\\d{11}$")) {
                notifyEmpCreationFailure(name, empId, "Please enter a valid 11-digit mobile number.");
                return ResponseEntity.badRequest().body("Please enter a valid 11-digit mobile number.");
            }
        }
        
        // Email Validation
        String rawEmail = employee.getEmail();
        if (rawEmail == null || rawEmail.trim().isEmpty()) {
            notifyEmpCreationFailure(name, empId, "Email is required");
            return ResponseEntity.badRequest().body("Email is required");
        }
        if (rawEmail.contains(" ")) {
            notifyEmpCreationFailure(name, empId, "Email address cannot contain spaces");
            return ResponseEntity.badRequest().body("Email address cannot contain spaces");
        }
        if (email.length() > 254) {
            notifyEmpCreationFailure(name, empId, "Email cannot exceed 254 characters");
            return ResponseEntity.badRequest().body("Email cannot exceed 254 characters");
        }
        
        long atCount = rawEmail.chars().filter(ch -> ch == '@').count();
        int atIndex = rawEmail.indexOf('@');
        if (atCount != 1 || atIndex == -1) {
            notifyEmpCreationFailure(name, empId, "Please enter a valid email address");
            return ResponseEntity.badRequest().body("Please enter a valid email address");
        }
        
        String username = rawEmail.substring(0, atIndex);
        String domainPart = rawEmail.substring(atIndex);

        // Username validation
        if (username.isEmpty()) {
            notifyEmpCreationFailure(name, empId, "Username part of email is required");
            return ResponseEntity.badRequest().body("Username part of email is required");
        }
        if (username.contains(" ")) {
            notifyEmpCreationFailure(name, empId, "Username cannot contain spaces");
            return ResponseEntity.badRequest().body("Username cannot contain spaces");
        }
        if (!username.matches("^[a-zA-Z0-9.]+$")) {
            notifyEmpCreationFailure(name, empId, "Only alphanumeric characters and dots are allowed in username");
            return ResponseEntity.badRequest().body("Only alphanumeric characters and dots are allowed in username");
        }
        if (username.startsWith(".")) {
            notifyEmpCreationFailure(name, empId, "Username must not start with a dot (.)");
            return ResponseEntity.badRequest().body("Username must not start with a dot (.)");
        }
        if (username.endsWith(".")) {
            notifyEmpCreationFailure(name, empId, "Username must not end with a dot (.)");
            return ResponseEntity.badRequest().body("Username must not end with a dot (.)");
        }
        if (username.contains("..")) {
            notifyEmpCreationFailure(name, empId, "Consecutive dots (..) are not allowed in username");
            return ResponseEntity.badRequest().body("Consecutive dots (..) are not allowed in username");
        }
        long dotCount = username.chars().filter(ch -> ch == '.').count();
        if (dotCount > 2) {
            notifyEmpCreationFailure(name, empId, "A maximum of 2 dots (.) are allowed in username");
            return ResponseEntity.badRequest().body("A maximum of 2 dots (.) are allowed in username");
        }
        if (!username.matches(".*[a-zA-Z0-9].*")) {
            notifyEmpCreationFailure(name, empId, "At least one alphanumeric character is required in username");
            return ResponseEntity.badRequest().body("At least one alphanumeric character is required in username");
        }

        // Domain validation
        if (domainPart.isEmpty() || !domainPart.startsWith("@")) {
            notifyEmpCreationFailure(name, empId, "Domain must start with '@'");
            return ResponseEntity.badRequest().body("Domain must start with '@'");
        }
        if (domainPart.contains(" ")) {
            notifyEmpCreationFailure(name, empId, "Domain must not contain spaces");
            return ResponseEntity.badRequest().body("Domain must not contain spaces");
        }
        if (domainPart.contains("..")) {
            notifyEmpCreationFailure(name, empId, "Domain must not contain consecutive dots (..)");
            return ResponseEntity.badRequest().body("Domain must not contain consecutive dots (..)");
        }
        String withoutAt = domainPart.substring(1);
        if (withoutAt.isEmpty()) {
            notifyEmpCreationFailure(name, empId, "Domain name is required");
            return ResponseEntity.badRequest().body("Domain name is required");
        }
        if (!withoutAt.matches("^[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$")) {
            notifyEmpCreationFailure(name, empId, "Domain must contain a valid domain name and extension (e.g. .com, .org)");
            return ResponseEntity.badRequest().body("Domain must contain a valid domain name and extension (e.g. .com, .org)");
        }

        if (!email.matches("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$")) {
            notifyEmpCreationFailure(name, empId, "Please enter a valid email address");
            return ResponseEntity.badRequest().body("Please enter a valid email address");
        }
        
        if (projectName == null || !projectName.matches("^[A-Za-z0-9 ()&@_-]{2,32}$")) {
            notifyEmpCreationFailure(name, empId, "Please enter a valid project name (only letters, numbers, spaces, and ()&@-_ allowed).");
            return ResponseEntity.badRequest().body("Please enter a valid project name (only letters, numbers, spaces, and ()&@-_ allowed).");
        }
        if (companyName == null || !companyName.matches("^[A-Za-z0-9 ()&@_-]{2,32}$")) {
            notifyEmpCreationFailure(name, empId, "Please enter a valid company name (only letters, numbers, spaces, and ()&@-_ allowed).");
            return ResponseEntity.badRequest().body("Please enter a valid company name (only letters, numbers, spaces, and ()&@-_ allowed).");
        }
        
        // Date of Joining Validation
        if (dateOfJoining == null || !dateOfJoining.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            notifyEmpCreationFailure(name, empId, "Please select a valid joining date.");
            return ResponseEntity.badRequest().body("Please select a valid joining date.");
        }
        java.time.LocalDate joiningDate;
        try {
            joiningDate = java.time.LocalDate.parse(dateOfJoining);
        } catch (Exception e) {
            notifyEmpCreationFailure(name, empId, "Please select a valid joining date.");
            return ResponseEntity.badRequest().body("Please select a valid joining date.");
        }
        java.time.LocalDate startRange = java.time.LocalDate.of(1999, 1, 1);
        java.time.LocalDate endRange = java.time.LocalDate.of(2099, 12, 30);
        if (joiningDate.isBefore(startRange) || joiningDate.isAfter(endRange)) {
            notifyEmpCreationFailure(name, empId, "Please select a valid joining date between 01-01-1999 and 30-12-2099.");
            return ResponseEntity.badRequest().body("Please select a valid joining date between 01-01-1999 and 30-12-2099.");
        }

        // Uniqueness Checks
        if (userRepository.findByEmpId(empId).isPresent()) {
            notifyEmpCreationFailure(name, empId, "Employee ID already exists");
            return ResponseEntity.badRequest().body("Employee ID already exists");
        }
        if (userRepository.findByEmail(email).isPresent()) {
            notifyEmpCreationFailure(name, empId, "Email already exists");
            return ResponseEntity.badRequest().body("Email already exists");
        }

        // Contact number uniqueness check
        String rawNumberForCheck = extractRawNumber(contactNumber);
        java.util.List<User> existingWithContact = userRepository.findByContactNumberContaining(rawNumberForCheck);
        boolean isDuplicate = false;
        for (User existing : existingWithContact) {
            if (isDuplicateContact(contactNumber, country, existing.getContactNumber())) {
                isDuplicate = true;
                break;
            }
        }
        if (isDuplicate) {
            notifyEmpCreationFailure(name, empId, "This contact number is already registered.");
            return ResponseEntity.badRequest().body("This contact number is already registered.");
        }

        String countryCode = country.contains("+91") ? "IN (+91)" : "JP (+81)";
        String finalContactNumber = countryCode + " | " + extractRawNumber(contactNumber);

        employee.setEmpId(empId);
        employee.setEmail(email);
        employee.setName(name);
        employee.setManager(manager);
        employee.setProjectName(projectName);
        employee.setCompanyName(companyName);
        employee.setDateOfJoining(dateOfJoining);
        employee.setDept(dept);
        employee.setCountry(countryCode);
        employee.setContactNumber(finalContactNumber);

        // Generate secure random 8-character password
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        java.security.SecureRandom random = new java.security.SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 8; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        String rawPassword = sb.toString();

        // Generate one-time reset token UUID
        String oneTimeToken = java.util.UUID.randomUUID().toString();
        employee.setOneTimeResetToken(oneTimeToken);

        employee.setPassword(passwordEncoder.encode(rawPassword));
        employee.setRole("employee");
        if (employee.getColor() == null) {
            employee.setColor("#2d8f7b");
        }
        if (employee.getInitials() == null && name != null) {
            employee.setInitials(name.substring(0, 1).toUpperCase());
        }
        
        User saved = userRepository.save(employee);

        // Save the domain to the domain master list if not present
        if (saved.getEmail() != null) {
            String savedEmail = saved.getEmail().trim();
            int atIdx = savedEmail.indexOf('@');
            if (atIdx != -1) {
                String savedDomainPart = savedEmail.substring(atIdx).toLowerCase();
                if (emailDomainRepository.findByNameIgnoreCase(savedDomainPart).isEmpty()) {
                    com.timesheet.backend.model.EmailDomain d = new com.timesheet.backend.model.EmailDomain();
                    d.setName(savedDomainPart);
                    emailDomainRepository.save(d);
                }
            }
        }
        
        // Log action in AuditLog
        String adminEmpId = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
        String adminName = adminEmpId;
        java.util.Optional<User> adminOpt = userRepository.findByEmpId(adminEmpId);
        if (adminOpt.isPresent()) {
            adminName = adminOpt.get().getName();
        }

        AuditLog creationLog = new AuditLog();
        creationLog.setAction("Employee Created");
        creationLog.setAffectedEmpId(saved.getEmpId());
        creationLog.setAffectedName(saved.getName());
        creationLog.setPerformedByEmpId(adminEmpId);
        creationLog.setPerformedByName(adminName);
        creationLog.setNewValues(String.format(
            "Name: %s, Email: %s, Dept: %s, Manager: %s, Project: %s, Company: %s, DateOfJoining: %s",
            saved.getName(), saved.getEmail(), saved.getDept(), saved.getManager(), saved.getProjectName(), saved.getCompanyName(), saved.getDateOfJoining()
        ));
        auditLogRepository.save(creationLog);
        
        try {
            emailService.sendOneTimePasswordResetLink(saved, rawPassword, oneTimeToken);
        } catch (Exception e) {
            System.err.println("Failed to send welcome credentials email: " + e.getMessage());
        }
        
        String creationMsg = notificationService.formatMessage("Employee Created", saved.getName(), saved.getEmpId(), "N/A", null);
        notificationService.notifyAllAdmins(creationMsg);
        
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/employees/{id}")
    public ResponseEntity<?> deleteEmployee(
            @PathVariable Long id,
            @RequestParam(value = "reason", required = false) String reason) {
        
        if (reason == null || reason.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Reason for deletion is mandatory");
        }

        return userRepository.findById(id).map(user -> {
            if ("admin".equalsIgnoreCase(user.getRole())) {
                return ResponseEntity.badRequest().body("Admin users cannot be deleted");
            }
            
            String name = user.getName();
            String empId = user.getEmpId();
            
            // Log action in AuditLog
            String adminEmpId = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
            String adminName = adminEmpId;
            java.util.Optional<User> adminOpt = userRepository.findByEmpId(adminEmpId);
            if (adminOpt.isPresent()) {
                adminName = adminOpt.get().getName();
            }

            AuditLog log = new AuditLog();
            log.setAction("Employee Deleted");
            log.setAffectedEmpId(empId);
            log.setAffectedName(name);
            log.setPerformedByEmpId(adminEmpId);
            log.setPerformedByName(adminName);
            log.setReason(reason.trim());
            log.setPreviousValues(String.format(
                "Name: %s, Email: %s, Dept: %s, Manager: %s, Project: %s, Company: %s, DateOfJoining: %s, Enabled: %s",
                user.getName(), user.getEmail(), user.getDept(), user.getManager(), user.getProjectName(), user.getCompanyName(), user.getDateOfJoining(), user.isEnabled()
            ));
            auditLogRepository.save(log);

            timesheetRepo.deleteByUserId(id);
            notificationService.deleteNotificationsByRecipientEmpId(empId);
            userRepository.delete(user);
            
            // Trigger admin notification on deletion
            String deletionMsg = notificationService.formatMessage("Employee Deleted", name, empId, "N/A", null);
            notificationService.notifyAllAdmins(deletionMsg);
            
            return ResponseEntity.ok().body(Map.of("message", "Employee deleted successfully"));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/timesheets/{id}/approve")
    public ResponseEntity<?> approveTimesheet(@PathVariable Long id) {
        return timesheetRepo.findById(id).map(entry -> {
            entry.setStatus("Approved");
            if (entry.getOtStatus() != null && !entry.getOtStatus().trim().isEmpty() && !entry.getOtStatus().equals("Approved")) {
                entry.setOtStatus("Approved");
            }
            TimesheetEntry saved = timesheetRepo.save(entry);
            String empId = saved.getUser().getEmpId();
            String empName = saved.getUser().getName();
            String dateStr = saved.getDate();

            if (saved.getShortHoursReason() != null && !saved.getShortHoursReason().trim().isEmpty()) {
                String approveMsg = notificationService.formatMessage("Short Hours Reason Approved", empName, empId, dateStr, null);
                notificationService.sendNotification(empId, approveMsg);
            } else {
                // Notify Timesheet Approved
                String approveMsg = notificationService.formatMessage("Timesheet Approved", empName, empId, dateStr, null);
                notificationService.sendNotification(empId, approveMsg);
            }

            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/timesheets/{id}/reject")
    public ResponseEntity<?> rejectTimesheet(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return timesheetRepo.findById(id).map(entry -> {
            String reason = body.get("reason");
            entry.setStatus("Rejected");
            entry.setRejectionReason(reason);
            if (entry.getOtStatus() != null && !entry.getOtStatus().trim().isEmpty() && !entry.getOtStatus().equals("Rejected")) {
                entry.setOtStatus("Rejected");
                entry.setOtRejectionReason(reason);
            }
            TimesheetEntry saved = timesheetRepo.save(entry);
            String empId = saved.getUser().getEmpId();
            String empName = saved.getUser().getName();
            String dateStr = saved.getDate();

            if (saved.getShortHoursReason() != null && !saved.getShortHoursReason().trim().isEmpty()) {
                String rejectMsg = notificationService.formatMessage("Short Hours Reason Rejected", empName, empId, dateStr, reason);
                notificationService.sendNotification(empId, rejectMsg);
            } else {
                // Notify Timesheet Rejected
                String rejectMsg = notificationService.formatMessage("Timesheet Rejected", empName, empId, dateStr, reason);
                notificationService.sendNotification(empId, rejectMsg);
            }

            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/timesheets/{id}/ot/approve")
    public ResponseEntity<?> approveOT(@PathVariable Long id) {
        return timesheetRepo.findById(id).map(entry -> {
            entry.setOtStatus("Approved");
            TimesheetEntry saved = timesheetRepo.save(entry);
            String empId = saved.getUser().getEmpId();
            String empName = saved.getUser().getName();
            String dateStr = saved.getDate();

            // Notify Timesheet Approved
            String approveMsg = notificationService.formatMessage("Timesheet Approved", empName, empId, dateStr, "OT request approved");
            notificationService.sendNotification(empId, approveMsg);

            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/timesheets/{id}/ot/grant-resubmit")
    public ResponseEntity<?> grantOtResubmit(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return timesheetRepo.findById(id).map(entry -> {
            String message = body.get("message");
            if (message == null || message.trim().isEmpty()) {
                message = "Granted access for Resubmit OT application";
            }
            entry.setOtResubmissionGranted(true);
            entry.setOtResubmissionUsed(false);
            entry.setOtResubmissionMessage(message.trim());
            TimesheetEntry saved = timesheetRepo.save(entry);
            String empId = saved.getUser().getEmpId();
            String empName = saved.getUser().getName();
            String dateStr = saved.getDate();

            // Single clean notification: Sent Back for Rework
            String grantMsg = notificationService.formatMessage("Timesheet Sent Back for Rework", empName, empId, dateStr, "OT Resubmission Granted");
            notificationService.sendNotification(empId, grantMsg);

            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/timesheets/{id}/ot/reject")
    public ResponseEntity<?> rejectOT(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return timesheetRepo.findById(id).map(entry -> {
            String reason = body.get("reason");
            entry.setOtStatus("Rejected");
            entry.setOtRejectionReason(reason);
            entry.setStatus("Resubmit OT");
            TimesheetEntry saved = timesheetRepo.save(entry);
            String empId = saved.getUser().getEmpId();
            String empName = saved.getUser().getName();
            String dateStr = saved.getDate();

            // Notify Timesheet Rejected
            String rejectMsg = notificationService.formatMessage("Timesheet Rejected", empName, empId, dateStr, "OT request rejected: " + reason);
            notificationService.sendNotification(empId, rejectMsg);

            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/employees/{id}")
    public ResponseEntity<?> updateEmployee(@PathVariable Long id, @RequestBody User employeeData) {
        return userRepository.findById(id).map(user -> {
            if ("admin".equalsIgnoreCase(user.getRole())) {
                return ResponseEntity.badRequest().body("Admin profiles cannot be modified here");
            }

            // Trim inputs
            String email = employeeData.getEmail() != null ? employeeData.getEmail().trim() : null;
            String name = employeeData.getName() != null ? employeeData.getName().trim() : null;
            String manager = employeeData.getManager() != null ? employeeData.getManager().trim() : null;
            String projectName = employeeData.getProjectName() != null ? employeeData.getProjectName().trim() : null;
            String companyName = employeeData.getCompanyName() != null ? employeeData.getCompanyName().trim() : null;
            String dept = employeeData.getDept() != null ? employeeData.getDept().trim() : null;
            String dateOfJoining = employeeData.getDateOfJoining() != null ? employeeData.getDateOfJoining().trim() : null;
            String country = employeeData.getCountry() != null ? employeeData.getCountry().trim() : null;
            String contactNumber = employeeData.getContactNumber() != null ? employeeData.getContactNumber().trim() : null;

            // Backend Validations
            if (name == null || name.length() < 3 || name.length() > 32 || !name.matches("^[A-Za-z]+(?: [A-Za-z]+)*$")) {
                return ResponseEntity.badRequest().body("Please enter a valid full name.");
            }
            
            // Email Validation
            String rawEmail = employeeData.getEmail();
            if (rawEmail == null || rawEmail.trim().isEmpty()) {
                return ResponseEntity.badRequest().body("Email is required");
            }
            if (rawEmail.contains(" ")) {
                return ResponseEntity.badRequest().body("Email address cannot contain spaces");
            }
            
            long atCount = rawEmail.chars().filter(ch -> ch == '@').count();
            int atIndex = rawEmail.indexOf('@');
            if (atCount != 1 || atIndex == -1) {
                return ResponseEntity.badRequest().body("Please enter a valid email address");
            }
            String afterAt = rawEmail.substring(atIndex + 1);
            if (!afterAt.contains(".")) {
                return ResponseEntity.badRequest().body("Please enter a valid email address");
            }

            if (email.length() > 254) {
                return ResponseEntity.badRequest().body("Email cannot exceed 254 characters");
            }
            if (!email.matches("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$")) {
                return ResponseEntity.badRequest().body("Please enter a valid email address");
            }
            
            if (projectName == null || !projectName.matches("^[A-Za-z0-9 ()&@_-]{2,32}$")) {
                return ResponseEntity.badRequest().body("Please enter a valid project name (only letters, numbers, spaces, and ()&@-_ allowed).");
            }
            if (companyName == null || !companyName.matches("^[A-Za-z0-9 ()&@_-]{2,32}$")) {
                return ResponseEntity.badRequest().body("Please enter a valid company name (only letters, numbers, spaces, and ()&@-_ allowed).");
            }
            java.util.List<String> allowedDepts = java.util.Arrays.asList("HR", "IT", "Marketing", "Operations", "Sales", "other", "Administration");
            if (dept == null || !allowedDepts.contains(dept)) {
                return ResponseEntity.badRequest().body("Please select a department.");
            }
            if (manager == null || manager.length() < 3 || manager.length() > 32 || !manager.matches("^[A-Za-z]+(?: [A-Za-z]+)*$")) {
                return ResponseEntity.badRequest().body("Please enter a valid manager name.");
            }
            // Manager existence check removed — any valid formatted name is accepted

            // Country and Contact Number Validation
            if (country == null || country.isEmpty()) {
                return ResponseEntity.badRequest().body("Please select a country.");
            }
            if (!"India (+91)".equals(country) && !"Japan (+81)".equals(country) &&
                !"IN (+91)".equals(country) && !"JP (+81)".equals(country)) {
                return ResponseEntity.badRequest().body("Please select a valid country.");
            }
            if (contactNumber == null || contactNumber.isEmpty()) {
                return ResponseEntity.badRequest().body("Please enter a contact number.");
            }
            
            String rawNumber = extractRawNumber(contactNumber);

            if (country.contains("+91")) {
                if (rawNumber.length() != 10 || !rawNumber.matches("^\\d{10}$")) {
                    return ResponseEntity.badRequest().body("Please enter a valid 10-digit mobile number.");
                }
            } else if (country.contains("+81")) {
                if (rawNumber.length() != 11 || !rawNumber.matches("^\\d{11}$")) {
                    return ResponseEntity.badRequest().body("Please enter a valid 11-digit mobile number.");
                }
            }
            
            // Date of Joining Validation
            if (dateOfJoining == null || !dateOfJoining.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
                return ResponseEntity.badRequest().body("Please select a valid joining date.");
            }
            java.time.LocalDate joiningDate;
            try {
                joiningDate = java.time.LocalDate.parse(dateOfJoining);
            } catch (Exception e) {
                return ResponseEntity.badRequest().body("Please select a valid joining date.");
            }
            java.time.LocalDate startRange = java.time.LocalDate.of(1999, 1, 1);
            java.time.LocalDate endRange = java.time.LocalDate.of(2099, 12, 30);
            if (joiningDate.isBefore(startRange) || joiningDate.isAfter(endRange)) {
                return ResponseEntity.badRequest().body("Please select a valid joining date between 01-01-1999 and 30-12-2099.");
            }

            // Uniqueness check for email (excluding current user)
            java.util.Optional<User> emailCheck = userRepository.findByEmail(email);
            if (emailCheck.isPresent() && !emailCheck.get().getId().equals(id)) {
                return ResponseEntity.badRequest().body("Email already exists");
            }

            // Uniqueness check for contact number (excluding current user)
            String rawNumCheck = extractRawNumber(contactNumber);
            java.util.List<User> contactMatches = userRepository.findByContactNumberContaining(rawNumCheck);
            boolean isDuplicateUpdate = false;
            for (User match : contactMatches) {
                if (!match.getId().equals(id)) {
                    if (isDuplicateContact(contactNumber, country, match.getContactNumber())) {
                        isDuplicateUpdate = true;
                        break;
                    }
                }
            }
            if (isDuplicateUpdate) {
                return ResponseEntity.badRequest().body("This contact number is already registered.");
            }

            // Update user properties & track changes
            StringBuilder prevVals = new StringBuilder();
            StringBuilder newValList = new StringBuilder();
            
            boolean nameChanged = !user.getName().equals(name);
            boolean emailChanged = !user.getEmail().equals(email);
            boolean managerChanged = !user.getManager().equals(manager);
            boolean projectChanged = !user.getProjectName().equals(projectName);
            boolean companyChanged = !user.getCompanyName().equals(companyName);
            boolean deptChanged = !user.getDept().equals(dept);
            boolean joiningDateChanged = !user.getDateOfJoining().equals(dateOfJoining);
            String countryCode = country.contains("+91") ? "IN (+91)" : "JP (+81)";
            String finalContactNumber = countryCode + " | " + extractRawNumber(contactNumber);

            boolean countryChanged = (user.getCountry() == null && country != null) || (user.getCountry() != null && !user.getCountry().equals(countryCode));
            boolean contactChanged = (user.getContactNumber() == null && finalContactNumber != null) || (user.getContactNumber() != null && !user.getContactNumber().equals(finalContactNumber));
            
            String oldRole = employeeData.getRole() != null ? employeeData.getRole().trim() : user.getRole();
            String newRole = employeeData.getRole() != null ? employeeData.getRole().trim() : oldRole;
            boolean roleChanged = !user.getRole().equalsIgnoreCase(newRole);

            if (nameChanged) {
                prevVals.append("Name: ").append(user.getName()).append("; ");
                newValList.append("Name: ").append(name).append("; ");
            }
            if (emailChanged) {
                prevVals.append("Email: ").append(user.getEmail()).append("; ");
                newValList.append("Email: ").append(email).append("; ");
            }
            if (managerChanged) {
                prevVals.append("Manager: ").append(user.getManager()).append("; ");
                newValList.append("Manager: ").append(manager).append("; ");
            }
            if (projectChanged) {
                prevVals.append("Project: ").append(user.getProjectName()).append("; ");
                newValList.append("Project: ").append(projectName).append("; ");
            }
            if (companyChanged) {
                prevVals.append("Company: ").append(user.getCompanyName()).append("; ");
                newValList.append("Company: ").append(companyName).append("; ");
            }
            if (deptChanged) {
                prevVals.append("Dept: ").append(user.getDept()).append("; ");
                newValList.append("Dept: ").append(dept).append("; ");
            }
            if (joiningDateChanged) {
                prevVals.append("DateOfJoining: ").append(user.getDateOfJoining()).append("; ");
                newValList.append("DateOfJoining: ").append(dateOfJoining).append("; ");
            }
            if (countryChanged) {
                prevVals.append("Country: ").append(user.getCountry()).append("; ");
                newValList.append("Country: ").append(countryCode).append("; ");
            }
            if (contactChanged) {
                prevVals.append("ContactNumber: ").append(user.getContactNumber()).append("; ");
                newValList.append("ContactNumber: ").append(finalContactNumber).append("; ");
            }
            if (roleChanged) {
                prevVals.append("Role: ").append(user.getRole()).append("; ");
                newValList.append("Role: ").append(newRole).append("; ");
                user.setRole(newRole);
            }

            user.setName(name);
            user.setEmail(email);
            user.setManager(manager);
            user.setProjectName(projectName);
            user.setCompanyName(companyName);
            user.setDept(dept);
            user.setDateOfJoining(dateOfJoining);
            user.setCountry(countryCode);
            user.setContactNumber(finalContactNumber);
            
            // Re-generate initials in case name changes
            user.setInitials(name.substring(0, 1).toUpperCase());

            User saved = userRepository.save(user);

            // Log action in AuditLog
            String adminEmpId = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
            String adminName = adminEmpId;
            java.util.Optional<User> adminOpt = userRepository.findByEmpId(adminEmpId);
            if (adminOpt.isPresent()) {
                adminName = adminOpt.get().getName();
            }

            boolean anyChanged = nameChanged || emailChanged || managerChanged || projectChanged ||
                                 companyChanged || deptChanged || joiningDateChanged ||
                                 countryChanged || contactChanged || roleChanged;

            if (anyChanged) {
                java.util.List<String> changedFields = new java.util.ArrayList<>();
                if (nameChanged) changedFields.add("Name");
                if (emailChanged) changedFields.add("Email");
                if (managerChanged) changedFields.add("Manager");
                if (projectChanged) changedFields.add("Project");
                if (companyChanged) changedFields.add("Company");
                if (deptChanged) changedFields.add("Department");
                if (joiningDateChanged) changedFields.add("Joining Date");
                if (countryChanged) changedFields.add("Country");
                if (contactChanged) changedFields.add("Contact Number");
                if (roleChanged) changedFields.add("Role");

                String changedFieldsStr = String.join(", ", changedFields);
                String reasonStr = String.format("Modified: %s | Previous: %s | Now: %s", 
                    changedFieldsStr, prevVals.toString().trim(), newValList.toString().trim());
                if (reasonStr.length() > 990) {
                    reasonStr = reasonStr.substring(0, 990) + "...";
                }

                AuditLog log = new AuditLog();
                log.setAction("EMP_Details_Updated");
                log.setAffectedEmpId(user.getEmpId());
                log.setAffectedName(name);
                log.setPerformedByEmpId(adminEmpId);
                log.setPerformedByName(adminName);
                log.setPreviousValues(prevVals.toString().trim());
                log.setNewValues(newValList.toString().trim());
                log.setReason(reasonStr);
                auditLogRepository.save(log);
            }

            // Trigger notification only for admins
            String updateMsg = notificationService.formatMessage("Employee Details Updated", saved.getName(), saved.getEmpId(), "N/A", null);
            notificationService.notifyAllAdmins(updateMsg);

            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    private String extractRawNumber(String contactNumber) {
        if (contactNumber == null) return "";
        String raw = contactNumber;
        if (contactNumber.contains(" | ")) {
            String[] parts = contactNumber.split(" \\| ");
            if (parts.length > 1) {
                raw = parts[1];
            }
        }
        return raw.replaceAll("\\s+", "").replaceAll("[^0-9]", "");
    }

    private boolean isDuplicateContact(String newContact, String newCountry, String existingContact) {
        if (existingContact == null || existingContact.trim().isEmpty()) {
            return false;
        }
        String newRaw = extractRawNumber(newContact);
        String existingRaw = extractRawNumber(existingContact);
        if (newRaw.isEmpty() || existingRaw.isEmpty()) {
            return false;
        }
        
        // Extract country code from existing contact if present
        String existingCountryCode = "";
        if (existingContact.contains(" | ")) {
            String[] parts = existingContact.split(" \\| ");
            if (parts.length > 0) {
                existingCountryCode = parts[0].trim();
            }
        }
        
        // Format new country code
        String newCountryCode = "";
        if (newCountry != null && !newCountry.trim().isEmpty()) {
            newCountryCode = newCountry.contains("+91") ? "IN (+91)" : (newCountry.contains("+81") ? "JP (+81)" : newCountry.trim());
        } else if (newContact.contains(" | ")) {
            String[] parts = newContact.split(" \\| ");
            if (parts.length > 0) {
                newCountryCode = parts[0].trim();
            }
        }
        
        // If both have country codes, they must match both country code and raw number
        if (!newCountryCode.isEmpty() && !existingCountryCode.isEmpty()) {
            return newCountryCode.equals(existingCountryCode) && newRaw.equals(existingRaw);
        }
        
        // If one of them does not have a country code, fallback to raw number match
        return newRaw.equals(existingRaw);
    }
}

