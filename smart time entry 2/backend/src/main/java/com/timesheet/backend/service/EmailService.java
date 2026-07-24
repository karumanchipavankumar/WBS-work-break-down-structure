package com.timesheet.backend.service;

import com.timesheet.backend.model.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class EmailService {

    private static final Logger logger = LoggerFactory.getLogger(EmailService.class);

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${BREVO_API_KEY}")
    private String brevoApiKey;

    @Value("${app.client.url}")
    private String clientUrl;

    private static final String BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
    private static final String SENDER_NAME = "Ideal Folks Team";
    private static final String SENDER_EMAIL = "time@idealfolks.com";

    /**
     * Centralized helper method to send emails via Brevo HTTPS REST API.
     * Returns true on success (2xx response), false otherwise.
     */
    private boolean sendViaBrevo(String to, String toName, String subject, String bodyContent, boolean isHtml) {
        try {
            if (brevoApiKey == null || brevoApiKey.trim().isEmpty()) {
                logger.error("Failed to send email: BREVO_API_KEY is not configured or empty.");
                return false;
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("api-key", brevoApiKey);

            Map<String, Object> payload = new HashMap<>();
            
            // Sender info
            Map<String, String> sender = new HashMap<>();
            sender.put("name", SENDER_NAME);
            sender.put("email", SENDER_EMAIL);
            payload.put("sender", sender);

            // Recipient info
            Map<String, String> recipient = new HashMap<>();
            recipient.put("email", to);
            if (toName != null && !toName.trim().isEmpty()) {
                recipient.put("name", toName);
            }
            payload.put("to", List.of(recipient));

            // Subject and content
            payload.put("subject", subject);
            if (isHtml) {
                payload.put("htmlContent", bodyContent);
            } else {
                payload.put("textContent", bodyContent);
            }

            HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(payload, headers);

            logger.info("Sending email to {} via Brevo REST API...", to);
            ResponseEntity<String> response = restTemplate.postForEntity(BREVO_API_URL, requestEntity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                logger.info("Email sent successfully via Brevo to {}. Response: {}", to, response.getBody());
                return true;
            } else {
                logger.error("Failed to send email via Brevo. Status: {}, Response: {}", response.getStatusCode(), response.getBody());
                return false;
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            logger.error("API error during Brevo call (4xx): Status: {}, Body: {}", e.getStatusCode(), e.getResponseBodyAsString(), e);
            return false;
        } catch (org.springframework.web.client.HttpServerErrorException e) {
            logger.error("Brevo server error (5xx): Status: {}, Body: {}", e.getStatusCode(), e.getResponseBodyAsString(), e);
            return false;
        } catch (Exception e) {
            logger.error("Unexpected error or network failure during Brevo API call: {}", e.getMessage(), e);
            return false;
        }
    }

    @Async
    public void sendEmployeeCredentials(User employee, String rawPassword) {
        String subject = "Your Smart Time Entry Credentials";
        String text = "Welcome " + employee.getName() + ",\n\n" +
                "Your account has been created successfully.\n\n" +
                "Login ID: " + employee.getEmpId() + "\n" +
                "Password: " + rawPassword + "\n\n" +
                "Please login and change your password for security.\n\n" +
                "Best Regards,\nSmart Time Entry Team";

        sendViaBrevo(employee.getEmail(), employee.getName(), subject, text, false);
    }

    @Async
    public void sendPasswordResetCode(String email, String code) {
        String subject = "Password Reset Request - Smart Time Entry";
        String text = "Hello,\n\n" +
                "You requested to reset your password. Use the following 6-digit code to complete the process:\n\n" +
                "Verification Code: " + code + "\n\n" +
                "This code is valid for 15 minutes.\n\n" +
                "If you did not request this, please ignore this email.\n\n" +
                "Best Regards,\nSmart Time Entry Team";

        sendViaBrevo(email, null, subject, text, false);
    }

    @Async
    public void sendOneTimePasswordResetLink(User employee, String rawPassword, String token) {
        String subject = "Welcome to Ideal Folks - Your Account Credentials & Setup";
        String urlBase = clientUrl.endsWith("/") ? clientUrl : clientUrl + "/";
        String linkUrl = urlBase + "?resetToken=" + token;

        String htmlContent = "<html><body>" +
                "<p>Welcome " + employee.getName() + ",</p>" +
                "<p>Your account has been created successfully.</p>" +
                "<p><strong>Login ID:</strong> " + employee.getEmpId() + "<br/>" +
                "<strong>Temporary Password:</strong> " + rawPassword + "</p>" +
                "<p>As a new user, you must set up your password. Please use the following one-time secure link to set your password:<br/>" +
                "<a href=\"" + linkUrl + "\" style=\"color: #0066cc; text-decoration: underline;\">" + linkUrl + "</a></p>" +
                "<p><em>Note: This secure link is single-use and will only work once until the password is reset by you.</em></p>" +
                "<p>Best Regards,<br/>Ideal Folks Team</p>" +
                "</body></html>";

        sendViaBrevo(employee.getEmail(), employee.getName(), subject, htmlContent, true);
    }

    @Async
    public void sendSimpleEmail(String to, String subject, String text) {
        sendViaBrevo(to, null, subject, text, false);
    }

    @Async
    public void sendHtmlEmail(String to, String subject, String html) {
        sendViaBrevo(to, null, subject, html, true);
    }

    @Async
    public void sendPartTimeWelcomeEmail(User employee) {
        String subject = "Welcome to the Organization – Part-Time Employment Details";
        String htmlContent = "<html><body>" +
                "<p>Hello " + employee.getName() + ",</p>" +
                "<p>Welcome to our organization! You have been successfully registered as a <strong>Part-Time Employee</strong>.</p>" +
                "<p>Here are your employment details:</p>" +
                "<table style='border-collapse: collapse; width: 100%; max-width: 500px;'>" +
                "  <tr><td style='padding: 8px; border: 1px solid #ddd;'><strong>Start Date:</strong></td><td style='padding: 8px; border: 1px solid #ddd;'>" + (employee.getPartTimeStartDate() != null ? employee.getPartTimeStartDate() : employee.getDateOfJoining()) + "</td></tr>" +
                "  <tr><td style='padding: 8px; border: 1px solid #ddd;'><strong>End Date:</strong></td><td style='padding: 8px; border: 1px solid #ddd;'>" + employee.getPartTimeEndDate() + "</td></tr>" +
                "  <tr><td style='padding: 8px; border: 1px solid #ddd;'><strong>Weekly Hours Limit:</strong></td><td style='padding: 8px; border: 1px solid #ddd; font-weight: bold; color: #b45309;'>28 hours per week</td></tr>" +
                "</table>" +
                "<p><strong>Instructions for Timesheet Completion:</strong></p>" +
                "<ul>" +
                "  <li>Please log in to the timesheet portal weekly to submit your hours.</li>" +
                "  <li>Ensure that your total hours logged across all days of the week (Monday to Sunday) do not exceed the 28-hour limit.</li>" +
                "  <li>Lunch break periods are automatically set to 0 hours and are not editable.</li>" +
                "</ul>" +
                "<p>Best Regards,<br/>Ideal Folks Team</p>" +
                "</body></html>";
        sendViaBrevo(employee.getEmail(), employee.getName(), subject, htmlContent, true);
    }

    @Async
    public void sendPartTimeExtensionEmail(User employee, String previousEndDate, String newEndDate) {
        String subject = "Your Part-Time Employment Duration Has Been Extended";
        String htmlContent = "<html><body>" +
                "<p>Hello " + employee.getName() + ",</p>" +
                "<p>This is to inform you that your Part-Time employment duration has been successfully extended.</p>" +
                "<p>Here are the details of the extension:</p>" +
                "<table style='border-collapse: collapse; width: 100%; max-width: 500px;'>" +
                "  <tr><td style='padding: 8px; border: 1px solid #ddd;'><strong>Previous End Date:</strong></td><td style='padding: 8px; border: 1px solid #ddd;'>" + previousEndDate + "</td></tr>" +
                "  <tr><td style='padding: 8px; border: 1px solid #ddd;'><strong>New Extended End Date:</strong></td><td style='padding: 8px; border: 1px solid #ddd; font-weight: bold; color: #1e3a8a;'>" + newEndDate + "</td></tr>" +
                "</table>" +
                "<p>You will continue under Part-Time employment until your new end date (" + newEndDate + ") under the same terms and conditions, including the 28-hour weekly working hour limit.</p>" +
                "<p>Best Regards,<br/>Ideal Folks Team</p>" +
                "</body></html>";
        sendViaBrevo(employee.getEmail(), employee.getName(), subject, htmlContent, true);
    }

    @Async
    public void sendConversionConfirmationEmail(User employee, String effectiveDate) {
        String subject = "Congratulations! Your Employment Status Has Been Updated to Full-Time";
        String htmlContent = "<html><body>" +
                "<p>Hello " + employee.getName() + ",</p>" +
                "<p><strong>Congratulations!</strong> Your employment status has been successfully updated to <strong>Full-Time</strong>.</p>" +
                "<p>Here are the transition details:</p>" +
                "<table style='border-collapse: collapse; width: 100%; max-width: 500px;'>" +
                "  <tr><td style='padding: 8px; border: 1px solid #ddd;'><strong>Effective Conversion Date:</strong></td><td style='padding: 8px; border: 1px solid #ddd; font-weight: bold; color: #15803d;'>" + effectiveDate + "</td></tr>" +
                "  <tr><td style='padding: 8px; border: 1px solid #ddd;'><strong>New Employment Status:</strong></td><td style='padding: 8px; border: 1px solid #ddd;'>Full-Time Employee</td></tr>" +
                "</table>" +
                "<p>From the effective date onward, all Part-Time rules and restrictions (including the 28-hour weekly hour cap and disabled lunch breaks) will no longer apply to your timesheet entries. You will follow the standard Full-Time working day guidelines.</p>" +
                "<p>Thank you for your commitment to our organization. We wish you continued success in your Full-Time role!</p>" +
                "<p>Best Regards,<br/>Ideal Folks Team</p>" +
                "</body></html>";
        sendViaBrevo(employee.getEmail(), employee.getName(), subject, htmlContent, true);
    }
}
