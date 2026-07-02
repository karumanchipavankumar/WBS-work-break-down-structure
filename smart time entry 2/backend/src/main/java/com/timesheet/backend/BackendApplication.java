package com.timesheet.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import jakarta.annotation.PostConstruct;
import java.util.TimeZone;

@SpringBootApplication
@EnableScheduling
@EnableAsync
public class BackendApplication {

	@PostConstruct
	public void init() {
		TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
	}

	public static void main(String[] args) {
		SpringApplication.run(BackendApplication.class, args);
	}

	@Bean
	public CommandLineRunner alterColumnsRunner(JdbcTemplate jdbcTemplate) {
		return args -> {
			try {
				jdbcTemplate.execute("ALTER TABLE timesheet_entries ALTER COLUMN rejection_reason TYPE VARCHAR(3000)");
				jdbcTemplate.execute("ALTER TABLE timesheet_entries ALTER COLUMN short_hours_reason TYPE VARCHAR(3000)");
				jdbcTemplate.execute("ALTER TABLE timesheet_entries ALTER COLUMN ot_reason TYPE VARCHAR(3000)");
				jdbcTemplate.execute("ALTER TABLE timesheet_entries ALTER COLUMN ot_remarks TYPE VARCHAR(3000)");
				jdbcTemplate.execute("ALTER TABLE timesheet_entries ALTER COLUMN ot_rejection_reason TYPE VARCHAR(3000)");
				jdbcTemplate.execute("ALTER TABLE timesheet_entries ALTER COLUMN ot_resubmission_message TYPE VARCHAR(3000)");
				System.out.println("Timesheet reason database columns altered successfully to VARCHAR(3000).");
			} catch (Exception e) {
				System.err.println("Database column update warning: " + e.getMessage());
			}
		};
	}

}
