package com.timesheet.backend;

import com.timesheet.backend.model.EmailDomain;
import com.timesheet.backend.repository.EmailDomainRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Component
public class DbCheckRunner implements CommandLineRunner {
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EmailDomainRepository emailDomainRepository;

    @Override
    public void run(String... args) throws Exception {
        System.out.println("--- DB SCHEMA CHECK ---");
        try {
            List<Map<String, Object>> columns = jdbcTemplate.queryForList("DESCRIBE timesheet_entries");
            for (Map<String, Object> col : columns) {
                System.out.println("Column: " + col.get("Field") + " | Type: " + col.get("Type"));
            }
        } catch (Exception e) {
            System.out.println("Error checking schema: " + e.getMessage());
        }
        System.out.println("-----------------------");

        System.out.println("--- SEEDING EMAIL DOMAINS ---");
        List<String> defaultDomains = Arrays.asList("@oryfolks.com", "@idealfolks.com", "@gmail.com");
        for (String domain : defaultDomains) {
            if (emailDomainRepository.findByNameIgnoreCase(domain).isEmpty()) {
                EmailDomain d = new EmailDomain();
                d.setName(domain);
                emailDomainRepository.save(d);
                System.out.println("Seeded domain: " + domain);
            }
        }
        System.out.println("-----------------------------");
    }
}
