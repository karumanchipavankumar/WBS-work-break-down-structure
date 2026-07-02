package com.timesheet.backend.controller;

import com.timesheet.backend.model.User;
import com.timesheet.backend.repository.UserRepository;
import com.timesheet.backend.security.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;
import java.util.List;
import java.time.LocalDateTime;
import org.springframework.beans.factory.annotation.Value;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private com.timesheet.backend.service.EmailService emailService;

    private String decodePasswordIfEncoded(String password) {
        if (password != null && password.startsWith("base64:")) {
            try {
                byte[] decoded = java.util.Base64.getDecoder().decode(password.substring(7));
                return new String(decoded, java.nio.charset.StandardCharsets.UTF_8);
            } catch (Exception e) {
                return password;
            }
        }
        return password;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> credentials) {
        String empId = credentials.get("empId");
        String password = decodePasswordIfEncoded(credentials.get("password"));

        if (empId != null) {
            empId = empId.trim();
        }

        Optional<User> userOpt = userRepository.findByEmpId(empId);
        if (userOpt.isEmpty()) {
            userOpt = userRepository.findByEmailIgnoreCase(empId);
        }
        
        if (userOpt.isPresent() && passwordEncoder.matches(password, userOpt.get().getPassword())) {
            User user = userOpt.get();
            if (!user.isEnabled()) {
                return ResponseEntity.status(403).body(Map.of("message", "Your account has been deactivated. Please contact support."));
            }
            String token = jwtUtil.generateToken(user.getEmpId(), user.getRole());
            
            return ResponseEntity.ok(Map.of(
                "token", token,
                "user", user
            ));
        }
        return ResponseEntity.status(401).body(Map.of("message", "Invalid credentials"));
    }

    @Value("${otp.expiry.minutes:15}")
    private int otpExpiryMinutes;

    @Value("${otp.max.attempts:5}")
    private int otpMaxAttempts;

    @Value("${otp.max.resends:3}")
    private int otpMaxResends;

    private static class ParsedPhone {
        String countryCode; // "+91", "+81", or null
        String rawNumber;   // digits only
        boolean isValid;
    }

    private ParsedPhone parsePhone(String input) {
        ParsedPhone res = new ParsedPhone();
        if (input == null) {
            res.isValid = false;
            return res;
        }
        
        String cleaned = input.replaceAll("\\s+", "");
        // Extract country code if present
        if (cleaned.contains("IN(+91)") || cleaned.startsWith("+91") || (cleaned.startsWith("91") && cleaned.length() == 12)) {
            res.countryCode = "+91";
            if (cleaned.contains("IN(+91)")) {
                res.rawNumber = cleaned.substring(cleaned.indexOf(")") + 1).replaceAll("[^0-9]", "");
            } else if (cleaned.startsWith("+91")) {
                res.rawNumber = cleaned.substring(3);
            } else {
                res.rawNumber = cleaned.substring(2);
            }
            res.isValid = res.rawNumber.length() == 10;
        } else if (cleaned.contains("JP(+81)") || cleaned.startsWith("+81") || (cleaned.startsWith("81") && (cleaned.length() == 11 || cleaned.length() == 12 || cleaned.length() == 13))) {
            res.countryCode = "+81";
            if (cleaned.contains("JP(+81)")) {
                res.rawNumber = cleaned.substring(cleaned.indexOf(")") + 1).replaceAll("[^0-9]", "");
            } else if (cleaned.startsWith("+81")) {
                res.rawNumber = cleaned.substring(3);
            } else {
                res.rawNumber = cleaned.substring(2);
            }
            int len = res.rawNumber.length();
            res.isValid = (len >= 9 && len <= 11);
        } else {
            // No clear country code prefix
            String digits = cleaned.replaceAll("[^0-9]", "");
            res.rawNumber = digits;
            res.countryCode = null;
            res.isValid = (digits.length() == 10 || digits.length() == 9 || digits.length() == 11);
        }
        return res;
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

    private String extractCountryCode(String contactNumber) {
        if (contactNumber == null) return null;
        if (contactNumber.contains(" | ")) {
            String[] parts = contactNumber.split(" \\| ");
            if (parts.length > 0) {
                return parts[0].trim();
            }
        }
        return null;
    }

    private Optional<User> findUserByEmailOrMobile(String input) {
        if (input == null || input.trim().isEmpty()) {
            return Optional.empty();
        }
        String trimmed = input.trim();
        if (trimmed.contains("@")) {
            return userRepository.findByEmailIgnoreCase(trimmed);
        }
        
        ParsedPhone parsed = parsePhone(trimmed);
        if (!parsed.isValid) {
            return Optional.empty();
        }
        
        List<User> all = userRepository.findAll();
        for (User u : all) {
            if (u.getContactNumber() != null) {
                String storedRaw = extractRawNumber(u.getContactNumber());
                if (storedRaw.equals(parsed.rawNumber)) {
                    if (parsed.countryCode != null) {
                        String storedCountry = extractCountryCode(u.getContactNumber());
                        if (storedCountry != null && !storedCountry.contains(parsed.countryCode.replace("+", ""))) {
                            continue;
                        }
                    }
                    return Optional.of(u);
                }
            }
        }
        return Optional.empty();
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body) {
        String input = body.get("input");
        if (input == null || input.trim().isEmpty()) {
            input = body.get("email"); // fallback
        }
        if (input == null || input.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email address is required."));
        }

        String trimmed = input.trim();

        // Email-only validation
        if (!trimmed.contains("@")) {
            return ResponseEntity.badRequest().body(Map.of("message", "Please enter a valid email address."));
        }
        String emailRegex = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";
        if (!trimmed.matches(emailRegex)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Please enter a valid email address."));
        }

        Optional<User> userOpt = userRepository.findByEmailIgnoreCase(trimmed);
        if (userOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email address not found. Please check and try again."));
        }

        User user = userOpt.get();

        // Check resend limits
        LocalDateTime now = LocalDateTime.now();
        if (user.getOtpLastSentAt() != null) {
            // Rate limit: 1 minute minimum between requests
            if (user.getOtpLastSentAt().plusMinutes(1).isAfter(now)) {
                return ResponseEntity.badRequest().body(Map.of("message", "Please wait before requesting another OTP."));
            }
            // Reset resend count if the last sent time was more than 1 hour ago
            if (user.getOtpLastSentAt().plusHours(1).isBefore(now)) {
                user.setOtpResendCount(0);
            }
        }

        int maxResends = otpMaxResends;
        if (user.getOtpResendCount() != null && user.getOtpResendCount() >= maxResends) {
            return ResponseEntity.badRequest().body(Map.of("message", "Too many OTP requests. Please try again later."));
        }

        // Generate 6-digit OTP
        String code = String.valueOf((int)((Math.random() * 900000) + 100000));
        user.setResetCode(code);
        user.setResetCodeExpiry(now.plusMinutes(otpExpiryMinutes));
        user.setOtpAttempts(0);
        user.setOtpLastSentAt(now);
        user.setOtpResendCount((user.getOtpResendCount() == null ? 0 : user.getOtpResendCount()) + 1);
        userRepository.save(user);

        // Send OTP email in a background thread to prevent blocking the HTTP response
        java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                emailService.sendPasswordResetCode(user.getEmail(), code);
            } catch (Exception e) {
                System.err.println("Error sending password reset email: " + e.getMessage());
            }
        });

        return ResponseEntity.ok(Map.of("message", "Reset code sent to your registered email address."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> body) {
        String input = body.get("input");
        if (input == null || input.trim().isEmpty()) {
            input = body.get("email"); // fallback
        }
        String code = body.get("code");
        String newPassword = decodePasswordIfEncoded(body.get("newPassword"));

        if (input == null || input.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email address is required."));
        }
        if (code == null || code.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "OTP code is required."));
        }
        if (newPassword == null || newPassword.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "New password is required."));
        }

        Optional<User> userOpt = userRepository.findByEmailIgnoreCase(input.trim());
        if (userOpt.isEmpty()) {
            // fallback: try findUserByEmailOrMobile for compatibility
            userOpt = findUserByEmailOrMobile(input.trim());
        }
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("message", "User not found."));
        }

        User user = userOpt.get();

        // Check if reset code exists and is not expired
        if (user.getResetCode() == null || user.getResetCodeExpiry() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "No active reset request found. Please request a new OTP."));
        }

        if (user.getResetCodeExpiry().isBefore(LocalDateTime.now())) {
            user.setResetCode(null);
            user.setResetCodeExpiry(null);
            userRepository.save(user);
            return ResponseEntity.badRequest().body(Map.of("message", "OTP has expired. Please request a new OTP."));
        }

        // Check attempts
        int maxAttempts = otpMaxAttempts;
        if (user.getOtpAttempts() != null && user.getOtpAttempts() >= maxAttempts) {
            user.setResetCode(null);
            user.setResetCodeExpiry(null);
            userRepository.save(user);
            return ResponseEntity.badRequest().body(Map.of("message", "Maximum OTP attempts exceeded. Please request a new OTP."));
        }

        if (!user.getResetCode().equals(code.trim())) {
            user.setOtpAttempts((user.getOtpAttempts() == null ? 0 : user.getOtpAttempts()) + 1);
            userRepository.save(user);
            
            // Check if they just hit the limit
            if (user.getOtpAttempts() >= maxAttempts) {
                user.setResetCode(null);
                user.setResetCodeExpiry(null);
                userRepository.save(user);
                return ResponseEntity.badRequest().body(Map.of("message", "Maximum OTP attempts exceeded. Please request a new OTP."));
            }
            return ResponseEntity.badRequest().body(Map.of("message", "Invalid OTP. Please try again."));
        }

        // Success! Reset password
        if (isPasswordReused(user, newPassword)) {
            return ResponseEntity.badRequest().body(Map.of("message", "You cannot reuse any of your last 3 passwords."));
        }
        updatePasswordHistory(user);
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setResetCode(null);
        user.setResetCodeExpiry(null);
        user.setOtpAttempts(0);
        user.setOtpResendCount(0);
        user.setPasswordChangedAt(LocalDateTime.now()); // invalidate old tokens
        userRepository.save(user);

        return ResponseEntity.ok(Map.of("message", "Password reset successfully."));
    }

    @GetMapping("/verify-reset-token")
    public ResponseEntity<?> verifyResetToken(@RequestParam String token) {
        if (token == null || token.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("valid", false, "message", "Token is required."));
        }
        Optional<User> userOpt = userRepository.findByOneTimeResetToken(token);
        if (userOpt.isPresent()) {
            return ResponseEntity.ok(Map.of(
                "valid", true,
                "name", userOpt.get().getName(),
                "empId", userOpt.get().getEmpId(),
                "email", userOpt.get().getEmail()
            ));
        }
        return ResponseEntity.ok(Map.of("valid", false, "message", "Invalid, expired, or already used link."));
    }

    @PostMapping("/reset-one-time-password")
    public ResponseEntity<?> resetOneTimePassword(@RequestBody Map<String, String> body) {
        String token = body.get("token");
        String oldPassword = decodePasswordIfEncoded(body.get("oldPassword"));
        String newPassword = decodePasswordIfEncoded(body.get("newPassword"));

        if (token == null || token.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Token is required."));
        }
        if (oldPassword == null || oldPassword.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Old password is required."));
        }
        if (newPassword == null || newPassword.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "New password is required."));
        }

        Optional<User> userOpt = userRepository.findByOneTimeResetToken(token);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (passwordEncoder.matches(oldPassword, user.getPassword())) {
                if (isPasswordReused(user, newPassword)) {
                    return ResponseEntity.badRequest().body(Map.of("message", "You cannot reuse any of your last 3 passwords."));
                }
                updatePasswordHistory(user);
                user.setPassword(passwordEncoder.encode(newPassword));
                user.setOneTimeResetToken(null); // SINGLE-USE! Clear the token immediately!
                // Invalidate all active sessions issued with the old/temporary password
                user.setPasswordChangedAt(java.time.LocalDateTime.now());
                userRepository.save(user);
                return ResponseEntity.ok(Map.of("message", "Password reset successfully! You can now log in."));
            }
            return ResponseEntity.badRequest().body(Map.of("message", "Incorrect old/temporary password."));
        }
        return ResponseEntity.badRequest().body(Map.of("message", "Invalid, expired, or already used link."));
    }

    private boolean isPasswordReused(User user, String newPassword) {
        // 1. Check current password
        if (user.getPassword() != null && passwordEncoder.matches(newPassword, user.getPassword())) {
            return true;
        }

        // 2. Check history (last 2 previous passwords)
        String history = user.getPasswordHistory();
        if (history != null && !history.trim().isEmpty()) {
            String[] hashes = history.split(";");
            int count = 0;
            for (String hash : hashes) {
                if (hash != null && !hash.trim().isEmpty()) {
                    if (passwordEncoder.matches(newPassword, hash.trim())) {
                        return true;
                    }
                    count++;
                    if (count >= 2) {
                        break; // Checked current + 2 history = 3 passwords total
                    }
                }
            }
        }
        return false;
    }

    private void updatePasswordHistory(User user) {
        String currentPasswordHash = user.getPassword();
        if (currentPasswordHash == null || currentPasswordHash.trim().isEmpty()) {
            return;
        }

        String history = user.getPasswordHistory();
        if (history == null) {
            history = "";
        }
        history = history.trim();

        java.util.List<String> list = new java.util.ArrayList<>();
        list.add(currentPasswordHash);

        if (!history.isEmpty()) {
            String[] hashes = history.split(";");
            for (String hash : hashes) {
                if (hash != null && !hash.trim().isEmpty()) {
                    list.add(hash.trim());
                }
            }
        }

        // Store up to 3 in history (since we need to check current + last 2, storing 3 is safe and provides a buffer)
        if (list.size() > 3) {
            list = list.subList(0, 3);
        }

        String newHistory = String.join(";", list);
        user.setPasswordHistory(newHistory);
    }
}
