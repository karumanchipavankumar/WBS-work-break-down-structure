package com.timesheet.backend.repository;

import com.timesheet.backend.model.TimesheetEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface TimesheetEntryRepository extends JpaRepository<TimesheetEntry, Long> {
    List<TimesheetEntry> findByUserIdAndDateStartingWith(Long userId, String yearMonth);
    List<TimesheetEntry> findByUserIdAndDateBetween(Long userId, String startDate, String endDate);

    @Modifying
    @Transactional
    void deleteByUserId(Long userId);
}
