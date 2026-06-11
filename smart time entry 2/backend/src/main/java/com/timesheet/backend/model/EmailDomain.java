package com.timesheet.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Entity
@Table(name = "email_domains", indexes = {
    @Index(name = "idx_email_domains_name", columnList = "name")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class EmailDomain {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String name;
}
