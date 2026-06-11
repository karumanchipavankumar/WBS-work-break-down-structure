package com.timesheet.backend.service;

import com.timesheet.backend.model.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class EmailService {

    private static final Logger logger = LoggerFactory.getLogger(EmailService.class);

    @Autowired
    private JavaMailSender mailSender;

    @Value("${spring.mail.from}")
    private String fromEmail;

    @Value("${app.client.url}")
    private String clientUrl;

    @Async
    public void sendEmployeeCredentials(User employee, String rawPassword) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom("Ideal Folks Team <" + fromEmail + ">");
            message.setTo(employee.getEmail());
            message.setSubject("Your Smart Time Entry Credentials");
            message.setText("Welcome " + employee.getName() + ",\n\n" +
                    "Your account has been created successfully.\n\n" +
                    "Login ID: " + employee.getEmpId() + "\n" +
                    "Password: " + rawPassword + "\n\n" +
                    "Please login and change your password for security.\n\n" +
                    "Best Regards,\nSmart Time Entry Team");

            mailSender.send(message);
            logger.info("Credentials email sent successfully to employee: {} ({})", employee.getName(), employee.getEmail());
        } catch (Exception e) {
            logger.error("Failed to send credentials email to employee: {} ({}). Error: {}", employee.getName(), employee.getEmail(), e.getMessage(), e);
        }
    }

    @Async
    public void sendPasswordResetCode(String email, String code) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom("Ideal Folks Team <" + fromEmail + ">");
            message.setTo(email);
            message.setSubject("Password Reset Request - Smart Time Entry");
            message.setText("Hello,\n\n" +
                    "You requested to reset your password. Use the following 6-digit code to complete the process:\n\n" +
                    "Verification Code: " + code + "\n\n" +
                    "This code is valid for 15 minutes.\n\n" +
                    "If you did not request this, please ignore this email.\n\n" +
                    "Best Regards,\nSmart Time Entry Team");

            mailSender.send(message);
            logger.info("Password reset code email sent successfully to: {}", email);
        } catch (Exception e) {
            logger.error("Failed to send password reset code email to: {}. Error: {}", email, e.getMessage(), e);
        }
    }

    @Async
    public void sendOneTimePasswordResetLink(User employee, String rawPassword, String token) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom("Ideal Folks Team <" + fromEmail + ">");
            message.setTo(employee.getEmail());
            message.setSubject("Welcome to Ideal Folks - Your Account Credentials & Setup");
            
            String urlBase = clientUrl.endsWith("/") ? clientUrl : clientUrl + "/";
            message.setText("Welcome " + employee.getName() + ",\n\n" +
                    "Your account has been created successfully.\n\n" +
                    "Login ID: " + employee.getEmpId() + "\n" +
                    "Temporary Password: " + rawPassword + "\n\n" +
                    "As a new user, you must set up your password. Please use the following one-time secure link to set your password:\n" +
                    urlBase + "?resetToken=" + token + "\n\n" +
                    "Note: This secure link is single-use and will only work once until the password is reset by you.\n\n" +
                    "Best Regards,\nIdeal Folks Team");

            mailSender.send(message);
            logger.info("Onboarding credentials email sent successfully to newly created employee: {} ({})", employee.getName(), employee.getEmail());
        } catch (Exception e) {
            logger.error("Failed to send onboarding credentials email to newly created employee: {} ({}). Error: {}", employee.getName(), employee.getEmail(), e.getMessage(), e);
        }
    }

    @Async
    public void sendSimpleEmail(String to, String subject, String text) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom("Ideal Folks Team <" + fromEmail + ">");
            message.setTo(to);
            message.setSubject(subject);
            message.setText(text);
            mailSender.send(message);
            logger.info("Simple email sent successfully to: {} with subject: {}", to, subject);
        } catch (Exception e) {
            logger.error("Failed to send simple email to: {} with subject: {}. Error: {}", to, subject, e.getMessage(), e);
        }
    }

    @Async
    public void sendHtmlEmail(String to, String subject, String html) {
        try {
            jakarta.mail.internet.MimeMessage message = mailSender.createMimeMessage();
            org.springframework.mail.javamail.MimeMessageHelper helper = 
                new org.springframework.mail.javamail.MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail, "Ideal Folks Team");
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(html, true);
            mailSender.send(message);
            logger.info("HTML email sent successfully to: {} with subject: {}", to, subject);
        } catch (Exception e) {
            logger.error("Failed to send HTML email to: {} with subject: {}. Error: {}", to, subject, e.getMessage(), e);
            throw new RuntimeException(e);
        }
    }
}
