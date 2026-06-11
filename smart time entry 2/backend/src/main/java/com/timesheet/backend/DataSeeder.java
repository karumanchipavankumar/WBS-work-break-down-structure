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

            // Seed Manager Ravi Kumar
            if (userRepository.findByEmpId("OFI-2020").isEmpty()) {
                User mgr = new User();
                mgr.setEmpId("OFI-2020");
                mgr.setPassword(passwordEncoder.encode("password"));
                mgr.setName("Ravi Kumar");
                mgr.setRole("employee");
                mgr.setDept("IT");
                mgr.setEmail("k.ravi@oryfolks.com");
                mgr.setManager("Admin User");
                mgr.setInitials("RK");
                mgr.setColor("#3a8dc5");
                mgr.setDateOfJoining("2020-01-01");
                mgr.setCountry("India (+91)");
                mgr.setContactNumber("9199999999");
                userRepository.save(mgr);
                System.out.println("Dummy Manager created: OFI-2020 / password");
            }

            // Seed Employee
            if (userRepository.findByEmpId("OFI-2024").isEmpty()) {
                User emp = new User();
                emp.setEmpId("OFI-2024");
                emp.setPassword(passwordEncoder.encode("password"));
                emp.setName("Sreenath C");
                emp.setRole("employee");
                emp.setDept("IT");
                emp.setEmail("c.sreenath@oryfolks.com");
                emp.setManager("Ravi Kumar");
                emp.setInitials("SC");
                emp.setColor("#2d8f7b");
                emp.setDateOfJoining("2024-01-01");
                emp.setCountry("India (+91)");
                emp.setContactNumber("9876543210");
                userRepository.save(emp);
                System.out.println("Dummy Employee created: OFI-2024 / password");
            }

            // Cleanup and Sync Admin
            for (User u : userRepository.findAll()) {
                if ("admin".equalsIgnoreCase(u.getRole())) {
                    if (!u.getEmpId().equalsIgnoreCase(adminUsername)) {
                        // Remove old admin account to ensure ONLY the property-based admin can login
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
            userRepository.save(admin);
            System.out.println("Admin synced: " + adminUsername + " / " + adminPassword);
        };
    }
}
