package com.timesheet.backend;

import com.timesheet.backend.model.User;
import com.timesheet.backend.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class DataSeeder {

    @Value("${spring.security.user.name}")
    private String adminUsername;

    @Value("${spring.security.user.password}")
    private String adminPassword;

    @Bean
    public CommandLineRunner loadData(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        return args -> {
            // Update existing unencrypted passwords
            for (User u : userRepository.findAll()) {
                if (!u.getPassword().startsWith("$2a$")) {
                    u.setPassword(passwordEncoder.encode(u.getPassword()));
                    userRepository.save(u);
                }
            }

            // Delete Sreenath C (OFI-2024) and Ravi Kumar (OFI-2020) if they exist
            userRepository.findByEmpId("OFI-2020").ifPresent(u -> {
                userRepository.delete(u);
                System.out.println("Cleaned up and deleted dummy user OFI-2020");
            });
            userRepository.findByEmpId("OFI-2024").ifPresent(u -> {
                userRepository.delete(u);
                System.out.println("Cleaned up and deleted dummy user OFI-2024");
            });

            // Cleanup and Sync Admin
            for (User u : userRepository.findAll()) {
                if ("admin".equalsIgnoreCase(u.getRole())) {
                    if (!u.getEmpId().equalsIgnoreCase(adminUsername) && !u.getEmpId().equalsIgnoreCase("admin1")) {
                        // Remove old admin account to ensure ONLY the property-based admin and dummy admin can login
                        userRepository.delete(u);
                        System.out.println("Deleted old admin account: " + u.getEmpId());
                    }
                }
            }

            // Seed/Update Current Admin
            User admin = userRepository.findByEmpId(adminUsername).orElse(new User());
            admin.setEmpId(adminUsername);
            if (admin.getPassword() == null || !passwordEncoder.matches(adminPassword, admin.getPassword())) {
                admin.setPassword(passwordEncoder.encode(adminPassword));
            }
            admin.setName("Admin User");
            admin.setRole("admin");
            admin.setDept("Administration");
            admin.setEmail("time@idealfolks.com");
            admin.setInitials("AD");
            admin.setColor("#5a8f5a");
            admin.setDateOfJoining("2026-06-02");
            admin.setCountry("India (+91)");
            admin.setContactNumber("9000000000");
            admin.setEmpType("Full time");
            userRepository.save(admin);
            System.out.println("Admin synced: " + adminUsername + " / " + adminPassword);

            // Seed/Update Dummy Admin (admin1)
            User dummyAdmin = userRepository.findByEmpId("admin1").orElse(new User());
            dummyAdmin.setEmpId("admin1");
            if (dummyAdmin.getPassword() == null || !passwordEncoder.matches("admin1234", dummyAdmin.getPassword())) {
                dummyAdmin.setPassword(passwordEncoder.encode("admin1234"));
            }
            dummyAdmin.setName("Dummy Admin");
            dummyAdmin.setRole("admin");
            dummyAdmin.setDept("Administration");
            dummyAdmin.setEmail("c.sreenath.oryfolks@gmail.com");
            dummyAdmin.setInitials("DA");
            dummyAdmin.setColor("#d97706");
            dummyAdmin.setDateOfJoining("2026-08-04");
            dummyAdmin.setCountry("India (+91)");
            dummyAdmin.setContactNumber("9000000001");
            dummyAdmin.setEmpType("Full time");
            userRepository.save(dummyAdmin);
            System.out.println("Dummy Admin synced: admin1 / admin1234");
        };
    }
}
