package com.timesheet.backend.repository;

import com.timesheet.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmpId(String empId);
    Optional<User> findByEmail(String email);
    Optional<User> findByEmailIgnoreCase(String email);
    Optional<User> findByOneTimeResetToken(String oneTimeResetToken);
    java.util.List<User> findByRole(String role);
    Optional<User> findByNameIgnoreCase(String name);
    Optional<User> findByContactNumber(String contactNumber);
    // Matches stored values like "IN (+91) | 9876543210" when searching for "9876543210"
    java.util.List<User> findByContactNumberContaining(String contactNumberPart);
}

