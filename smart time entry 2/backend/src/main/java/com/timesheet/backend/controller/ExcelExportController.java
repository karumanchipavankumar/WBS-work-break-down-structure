package com.timesheet.backend.controller;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class ExcelExportController {

    // â”€â”€â”€ Export Employee List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    @PostMapping("/export/employees")
    public ResponseEntity<byte[]> exportEmployees(@RequestBody Map<String, Object> payload) {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("Employees");
            sheet.setZoom(75);

            // Configure Print Layout
            PrintSetup printSetup = sheet.getPrintSetup();
            printSetup.setLandscape(true);
            printSetup.setPaperSize(PrintSetup.A4_PAPERSIZE);
            sheet.setFitToPage(true);
            printSetup.setFitWidth((short) 1);
            printSetup.setFitHeight((short) 0);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> employees = (List<Map<String, Object>>) payload.get("employees");
            String filename = (String) payload.getOrDefault("filename", "Employees.xlsx");

            // â”€â”€ Header style â”€â”€
            CellStyle headerStyle = createHeaderStyle(workbook);
            CellStyle dataStyle = createDataStyle(workbook);
            CellStyle statusActiveStyle = createStatusStyle(workbook, new byte[]{(byte)46,(byte)125,(byte)50}, new byte[]{(byte)232,(byte)245,(byte)233});
            CellStyle statusInactiveStyle = createStatusStyle(workbook, new byte[]{(byte)198,(byte)40,(byte)40}, new byte[]{(byte)255,(byte)235,(byte)238});

            String[] headers = {"#", "Employee ID", "Name", "Email", "Department", "Manager", "Project", "Company", "Status"};
            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            // â”€â”€ Data rows â”€â”€
            if (employees != null) {
                for (int idx = 0; idx < employees.size(); idx++) {
                    Map<String, Object> emp = employees.get(idx);
                    Row row = sheet.createRow(idx + 1);
                    row.setHeight((short) -1);

                    createStyledCell(row, 0, String.valueOf(idx + 1), dataStyle);
                    createStyledCell(row, 1, str(emp.get("empId")), dataStyle);
                    createStyledCell(row, 2, str(emp.get("name")), dataStyle);
                    createStyledCell(row, 3, str(emp.get("email")), dataStyle);
                    createStyledCell(row, 4, str(emp.get("dept")), dataStyle);
                    createStyledCell(row, 5, str(emp.get("manager")), dataStyle);
                    createStyledCell(row, 6, str(emp.get("projectName")), dataStyle);
                    createStyledCell(row, 7, str(emp.get("companyName")), dataStyle);

                    boolean enabled = emp.get("enabled") == null || Boolean.TRUE.equals(emp.get("enabled"));
                    Cell statusCell = row.createCell(8);
                    statusCell.setCellValue(enabled ? "Active" : "Inactive");
                    statusCell.setCellStyle(enabled ? statusActiveStyle : statusInactiveStyle);
                }
            }

            // Set fixed column widths for instant export
            int[] colWidths = {2000, 4000, 6000, 8000, 5000, 5000, 5000, 5000, 3500};
            for (int i = 0; i < colWidths.length; i++) {
                sheet.setColumnWidth(i, colWidths[i]);
            }

            // Freeze the header row
            sheet.createFreezePane(0, 1);

            // Enable auto-filter
            sheet.setAutoFilter(new CellRangeAddress(0, 0, 0, headers.length - 1));

            return buildResponse(workbook, filename);

        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(("Export failed: " + e.getMessage()).getBytes());
        }
    }

    // â”€â”€â”€ Export Single Employee Timesheet (multi-month aware) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    @PostMapping("/export/timesheet")
    public ResponseEntity<byte[]> exportTimesheet(@RequestBody Map<String, Object> payload) {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            String empName = str(payload.get("empName"));
            String empId   = str(payload.get("empId"));
            String dept    = str(payload.getOrDefault("dept", ""));
            String manager = str(payload.getOrDefault("manager", ""));
            String projectName = str(payload.getOrDefault("projectName", ""));
            String companyName = str(payload.getOrDefault("companyName", ""));
            String empType = str(payload.getOrDefault("empType", "Full time"));
            String filename = (String) payload.getOrDefault("filename", empId + "_timesheet.xlsx");

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> months = (List<Map<String, Object>>) payload.get("months");

            if (months != null && !months.isEmpty()) {
                // â”€â”€ Multi-month: one worksheet tab per calendar month â”€â”€
                for (Map<String, Object> monthEntry : months) {
                    String monthLabel = str(monthEntry.get("monthLabel"));
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> rows = (List<Map<String, Object>>) monthEntry.get("rows");
                    String sheetName = monthLabel.length() > 28 ? monthLabel.substring(0, 28) + "..." : monthLabel;
                    buildTimesheetSheet(workbook, sheetName, empName, empId, dept, manager, projectName, companyName, monthLabel, empType, rows);
                }
            } else {
                // â”€â”€ Legacy single-sheet fallback (rows at top level) â”€â”€
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> rows = (List<Map<String, Object>>) payload.get("rows");
                String monthYear = str(payload.getOrDefault("monthYear", ""));
                String sheetLabel = (empName + " " + monthYear);
                if (sheetLabel.length() > 28) sheetLabel = sheetLabel.substring(0, 28) + "...";
                buildTimesheetSheet(workbook, sheetLabel, empName, empId, dept, manager, projectName, companyName, monthYear, empType, rows);
            }

            workbook.setForceFormulaRecalculation(true);
            return buildResponse(workbook, filename);

        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(("Export failed: " + e.getMessage()).getBytes());
        }
    }

    /**
     * Builds one complete timesheet worksheet (title banner, employee info,
     * timesheet table with colour-coded headers, totals row, monthly summary).
     */
    @SuppressWarnings("deprecation")
    private void buildTimesheetSheet(XSSFWorkbook workbook, String sheetName,
                                     String empName, String empId,
                                     String dept,   String manager,
                                     String projectName, String companyName,
                                     String monthLabel, String empType,
                                     List<Map<String, Object>> rows) {

        Sheet sheet = workbook.createSheet(sheetName);
        sheet.setZoom(75);

        // Configure Print Layout
        PrintSetup printSetup = sheet.getPrintSetup();
        printSetup.setLandscape(true);
        printSetup.setPaperSize(PrintSetup.A4_PAPERSIZE);
        sheet.setFitToPage(true);
        printSetup.setFitWidth((short) 1);
        printSetup.setFitHeight((short) 0);

        // â”€â”€ Exact UI colours â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        XSSFColor navyColor       = new XSSFColor(new byte[]{(byte)26, (byte)39, (byte)68},   null);
        XSSFColor darkGreenColor  = new XSSFColor(new byte[]{(byte)29, (byte)92, (byte)74},   null);
        XSSFColor midGreenColor   = new XSSFColor(new byte[]{(byte)35, (byte)107,(byte)85},   null);
        XSSFColor lunchGroupColor = new XSSFColor(new byte[]{(byte)58, (byte)79, (byte)138},  null);
        XSSFColor lunchSubColor   = new XSSFColor(new byte[]{(byte)69, (byte)95, (byte)160},  null);
        XSSFColor hoursColor      = new XSSFColor(new byte[]{(byte)31, (byte)51, (byte)96},   null);
        XSSFColor infoBorderColor = new XSSFColor(new byte[]{(byte)0,(byte)0,(byte)0},  null);
        XSSFColor infoCellBorder  = new XSSFColor(new byte[]{(byte)0,(byte)0,(byte)0},  null);

        // â”€â”€ Base styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        XSSFCellStyle titleStyle = workbook.createCellStyle();
        { Font f = workbook.createFont(); f.setBold(true); f.setColor(IndexedColors.WHITE.getIndex());
          f.setFontHeightInPoints((short)14); f.setFontName("Calibri"); titleStyle.setFont(f); }
        titleStyle.setFillForegroundColor(navyColor);
        titleStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        titleStyle.setAlignment(HorizontalAlignment.CENTER);
        titleStyle.setVerticalAlignment(VerticalAlignment.CENTER);

        CellStyle headerStyle           = createHeaderStyle(workbook);
        CellStyle subHdrMorningGroup    = createSubHeaderStyleXSSF(workbook, darkGreenColor);
        CellStyle subHdrMorningSub      = createSubHeaderStyleXSSF(workbook, midGreenColor);
        CellStyle subHdrLunchGroup      = createSubHeaderStyleXSSF(workbook, lunchGroupColor);
        CellStyle subHdrLunchSub        = createSubHeaderStyleXSSF(workbook, lunchSubColor);
        CellStyle subHdrHours           = createSubHeaderStyleXSSF(workbook, hoursColor);
        CellStyle dataStyle             = createDataStyle(workbook);
        CellStyle dataCenterStyle       = createDataCenterStyle(workbook);
        DataFormat df                   = workbook.createDataFormat();

        XSSFCellStyle dataDecimal = workbook.createCellStyle();
        dataDecimal.cloneStyleFrom(dataCenterStyle);
        dataDecimal.setDataFormat(df.getFormat("0.00"));

        // Row background colours
        XSSFColor wkndBg  = new XSSFColor(new byte[]{(byte)211,(byte)211,(byte)211},null);
        XSSFColor holBg   = new XSSFColor(new byte[]{(byte)234,(byte)243,(byte)234},null);
        XSSFColor leaveBg = new XSSFColor(new byte[]{(byte)255,(byte)248,(byte)225},null);
        XSSFColor wfhBg   = new XSSFColor(new byte[]{(byte)224,(byte)247,(byte)250},null);

        XSSFCellStyle wkndData    = cloneWithBg(workbook, dataStyle,   wkndBg);
        XSSFCellStyle wkndCenter  = cloneWithBg(workbook, dataCenterStyle, wkndBg);
        XSSFCellStyle wkndDecimal = cloneWithBg(workbook, dataDecimal,  wkndBg);
        XSSFCellStyle holData     = cloneWithBg(workbook, dataStyle,   holBg);
        XSSFCellStyle holCenter   = cloneWithBg(workbook, dataCenterStyle, holBg);
        XSSFCellStyle holDecimal  = cloneWithBg(workbook, dataDecimal,  holBg);
        XSSFCellStyle leaveData   = cloneWithBg(workbook, dataStyle,   leaveBg);
        XSSFCellStyle leaveCenter = cloneWithBg(workbook, dataCenterStyle, leaveBg);
        XSSFCellStyle leaveDecimal= cloneWithBg(workbook, dataDecimal,  leaveBg);
        XSSFCellStyle wfhData     = cloneWithBg(workbook, dataStyle,   wfhBg);
        XSSFCellStyle wfhCenter   = cloneWithBg(workbook, dataCenterStyle, wfhBg);
        XSSFCellStyle wfhDecimal  = cloneWithBg(workbook, dataDecimal,  wfhBg);

        CellStyle stApproved = createStatusStyle(workbook,
                new byte[]{(byte)46,(byte)125,(byte)50},  new byte[]{(byte)232,(byte)245,(byte)233});
        CellStyle stPending  = createStatusStyle(workbook,
                new byte[]{(byte)217,(byte)119,(byte)6},  new byte[]{(byte)254,(byte)243,(byte)199});
        CellStyle stRejected = createStatusStyle(workbook,
                new byte[]{(byte)198,(byte)40,(byte)40},  new byte[]{(byte)255,(byte)235,(byte)238});

        XSSFCellStyle totalsLabel = workbook.createCellStyle();
        { Font f = workbook.createFont(); f.setBold(true); f.setColor(IndexedColors.WHITE.getIndex());
          f.setFontHeightInPoints((short)10); f.setFontName("Calibri"); totalsLabel.setFont(f); }
        totalsLabel.setFillForegroundColor(navyColor); totalsLabel.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        totalsLabel.setAlignment(HorizontalAlignment.CENTER); totalsLabel.setVerticalAlignment(VerticalAlignment.CENTER);
        XSSFColor totalsBorderColor = new XSSFColor(new byte[]{(byte)0,(byte)0,(byte)0}, null);
        totalsLabel.setBorderBottom(BorderStyle.THIN); totalsLabel.setBottomBorderColor(totalsBorderColor);
        totalsLabel.setBorderTop(BorderStyle.THIN);    totalsLabel.setTopBorderColor(totalsBorderColor);
        totalsLabel.setBorderLeft(BorderStyle.THIN);   totalsLabel.setLeftBorderColor(totalsBorderColor);
        totalsLabel.setBorderRight(BorderStyle.THIN);  totalsLabel.setRightBorderColor(totalsBorderColor);

        XSSFCellStyle totalsDecimal = workbook.createCellStyle();
        totalsDecimal.cloneStyleFrom(totalsLabel);
        totalsDecimal.setDataFormat(df.getFormat("0.00"));
        totalsDecimal.setAlignment(HorizontalAlignment.CENTER);

        XSSFCellStyle sumHeaderStyle = workbook.createCellStyle();
        { Font f = workbook.createFont(); f.setBold(true); f.setColor(IndexedColors.WHITE.getIndex());
          f.setFontHeightInPoints((short)10); f.setFontName("Calibri"); sumHeaderStyle.setFont(f); }
        sumHeaderStyle.setFillForegroundColor(navyColor); sumHeaderStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        sumHeaderStyle.setAlignment(HorizontalAlignment.CENTER); sumHeaderStyle.setVerticalAlignment(VerticalAlignment.CENTER);
        sumHeaderStyle.setBorderBottom(BorderStyle.THIN); sumHeaderStyle.setBottomBorderColor(infoBorderColor);
        sumHeaderStyle.setBorderTop(BorderStyle.THIN);    sumHeaderStyle.setTopBorderColor(infoBorderColor);
        sumHeaderStyle.setBorderLeft(BorderStyle.THIN);   sumHeaderStyle.setLeftBorderColor(infoBorderColor);
        sumHeaderStyle.setBorderRight(BorderStyle.THIN);  sumHeaderStyle.setRightBorderColor(infoBorderColor);

        XSSFCellStyle sumLabelStyle = workbook.createCellStyle();
        { Font f = workbook.createFont(); f.setFontHeightInPoints((short)10); f.setFontName("Calibri"); sumLabelStyle.setFont(f); }
        sumLabelStyle.setFillForegroundColor(new XSSFColor(new byte[]{(byte)255,(byte)255,(byte)255},null));
        sumLabelStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        sumLabelStyle.setAlignment(HorizontalAlignment.LEFT); sumLabelStyle.setVerticalAlignment(VerticalAlignment.CENTER);
        sumLabelStyle.setBorderBottom(BorderStyle.THIN); sumLabelStyle.setBottomBorderColor(infoBorderColor);
        sumLabelStyle.setBorderTop(BorderStyle.THIN);    sumLabelStyle.setTopBorderColor(infoBorderColor);
        sumLabelStyle.setBorderLeft(BorderStyle.THIN);   sumLabelStyle.setLeftBorderColor(infoBorderColor);
        sumLabelStyle.setBorderRight(BorderStyle.THIN);  sumLabelStyle.setRightBorderColor(infoBorderColor);

        XSSFCellStyle sumValueStyle = workbook.createCellStyle();
        sumValueStyle.cloneStyleFrom(sumLabelStyle);
        sumValueStyle.setDataFormat(df.getFormat("0.00"));
        sumValueStyle.setAlignment(HorizontalAlignment.CENTER);
        { Font f = workbook.createFont(); f.setBold(true); f.setFontHeightInPoints((short)10); f.setFontName("Calibri"); sumValueStyle.setFont(f); }

        XSSFCellStyle infoLabelStyle = workbook.createCellStyle();
        { XSSFFont f = workbook.createFont(); f.setBold(true); f.setFontHeightInPoints((short)10);
          f.setFontName("Calibri"); f.setColor(navyColor); infoLabelStyle.setFont(f); }
        infoLabelStyle.setAlignment(HorizontalAlignment.RIGHT); infoLabelStyle.setVerticalAlignment(VerticalAlignment.CENTER);
        infoLabelStyle.setFillForegroundColor(new XSSFColor(new byte[]{(byte)241,(byte)245,(byte)249},null));
        infoLabelStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        infoLabelStyle.setBorderBottom(BorderStyle.THIN); infoLabelStyle.setBottomBorderColor(infoCellBorder);
        infoLabelStyle.setBorderTop(BorderStyle.THIN);    infoLabelStyle.setTopBorderColor(infoCellBorder);
        infoLabelStyle.setBorderLeft(BorderStyle.THIN);   infoLabelStyle.setLeftBorderColor(infoCellBorder);
        infoLabelStyle.setBorderRight(BorderStyle.THIN);  infoLabelStyle.setRightBorderColor(infoCellBorder);

        XSSFCellStyle infoValueStyle = workbook.createCellStyle();
        { XSSFFont f = workbook.createFont(); f.setFontHeightInPoints((short)10); f.setFontName("Calibri");
          f.setColor(new XSSFColor(new byte[]{(byte)51,(byte)65,(byte)85},null)); infoValueStyle.setFont(f); }
        infoValueStyle.setAlignment(HorizontalAlignment.LEFT); infoValueStyle.setVerticalAlignment(VerticalAlignment.CENTER);
        infoValueStyle.setFillForegroundColor(new XSSFColor(new byte[]{(byte)255,(byte)255,(byte)255},null));
        infoValueStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        infoValueStyle.setBorderBottom(BorderStyle.THIN); infoValueStyle.setBottomBorderColor(infoCellBorder);
        infoValueStyle.setBorderTop(BorderStyle.THIN);    infoValueStyle.setTopBorderColor(infoCellBorder);
        infoValueStyle.setBorderLeft(BorderStyle.THIN);   infoValueStyle.setLeftBorderColor(infoCellBorder);
        infoValueStyle.setBorderRight(BorderStyle.THIN);  infoValueStyle.setRightBorderColor(infoCellBorder);
        infoValueStyle.setWrapText(true);

        // ——— Row 0: Title Banner —————————————————————————————————————————————————
        Row r0 = sheet.createRow(0); r0.setHeightInPoints(28);
        for (int i = 0; i < 19; i++) { Cell c = r0.createCell(i); c.setCellStyle(titleStyle); }
        r0.getCell(0).setCellValue("TIMESHEET REPORT - " + monthLabel);
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 18));

        // ——— Row 1: Spacer ————————————————————————————————————————————————————————
        sheet.createRow(1).setHeightInPoints(15);

        // ——— Calculate No. of Working Days ———
        int workingDaysCount = 0;
        if (rows != null) {
            for (Map<String, Object> r : rows) {
                boolean isWeekend = "true".equalsIgnoreCase(str(r.get("isWeekend")));
                if (!isWeekend) {
                    String type = str(r.get("type")).trim();
                    String status = str(r.get("status")).trim();
                    
                    boolean isWorking = true;
                    if ("Holiday".equalsIgnoreCase(type)) {
                        if ("Draft".equalsIgnoreCase(status) || "Pending".equalsIgnoreCase(status) || "Rejected".equalsIgnoreCase(status)) {
                            isWorking = true;
                        } else {
                            isWorking = false;
                        }
                    } else if ("Week Off".equalsIgnoreCase(type) || "Paid Leave".equalsIgnoreCase(type) || "Unpaid Leave".equalsIgnoreCase(type)) {
                        if ("Draft".equalsIgnoreCase(status) || "Pending".equalsIgnoreCase(status) || "Rejected".equalsIgnoreCase(status)) {
                            isWorking = true;
                        } else {
                            isWorking = false;
                        }
                    }
                    
                    if (isWorking) {
                        workingDaysCount++;
                    }
                }
            }
        }

        // ── Row 2: Employee / Month / Manager ─────────────────────────
        Row ir1 = sheet.createRow(2); ir1.setHeightInPoints(20);
        infoLabel(ir1, 0, "Employee:",   infoLabelStyle);
        infoValue(ir1, 1, 4, empName,    infoValueStyle);
        sheet.addMergedRegion(new CellRangeAddress(2, 2, 1, 4));
        infoLabel(ir1, 5, "Month:",       infoLabelStyle);
        infoValue(ir1, 6, 8, monthLabel,  infoValueStyle);
        sheet.addMergedRegion(new CellRangeAddress(2, 2, 6, 8));
        infoLabel(ir1, 9, "Manager:",    infoLabelStyle);
        infoValue(ir1, 10, 13, manager,  infoValueStyle);
        sheet.addMergedRegion(new CellRangeAddress(2, 2, 10, 13));

        // ── Row 3: Employee ID / No. of Working Days / Reg Hrs/Day ─────────────────────
        Row ir2 = sheet.createRow(3); ir2.setHeightInPoints(20);
        infoLabel(ir2, 0, "Employee ID:", infoLabelStyle);
        infoValue(ir2, 1, 4, empId,        infoValueStyle);
        sheet.addMergedRegion(new CellRangeAddress(3, 3, 1, 4));
        infoLabel(ir2, 5, "No. of Working Days:", infoLabelStyle);
        for (int i = 6; i <= 8; i++) { Cell c = ir2.createCell(i); c.setCellStyle(infoValueStyle); }
        ir2.getCell(6).setCellValue(workingDaysCount);
        sheet.addMergedRegion(new CellRangeAddress(3, 3, 6, 8));
        infoLabel(ir2, 9, "Reg Hrs/Day:", infoLabelStyle);
        for (int i = 10; i <= 13; i++) { Cell c = ir2.createCell(i); c.setCellStyle(infoValueStyle); }
        ir2.getCell(10).setCellValue(8);
        sheet.addMergedRegion(new CellRangeAddress(3, 3, 10, 13));

        // ── Row 4: Spacer ──
        sheet.createRow(4).setHeightInPoints(15);

        // ── Rows 5 & 6: Table Headers ──
        Row mhr = sheet.createRow(5); mhr.setHeightInPoints(24);
        for (int i = 0; i < 14; i++) { Cell c = mhr.createCell(i); c.setCellStyle(headerStyle); }
        mhr.getCell(0).setCellValue("Date");
        mhr.getCell(1).setCellValue("Day");
        mhr.getCell(2).setCellValue("Day Type");
        mhr.getCell(3).setCellValue("Morning Session");   mhr.getCell(3).setCellStyle(subHdrMorningGroup); mhr.getCell(4).setCellStyle(subHdrMorningGroup);
        sheet.addMergedRegion(new CellRangeAddress(5, 5, 3, 4));
        mhr.getCell(5).setCellValue("Lunch Break");        mhr.getCell(5).setCellStyle(subHdrLunchGroup);   mhr.getCell(6).setCellStyle(subHdrLunchGroup);
        sheet.addMergedRegion(new CellRangeAddress(5, 5, 5, 6));
        mhr.getCell(7).setCellValue("Afternoon Session");  mhr.getCell(7).setCellStyle(subHdrMorningGroup); mhr.getCell(8).setCellStyle(subHdrMorningGroup);
        sheet.addMergedRegion(new CellRangeAddress(5, 5, 7, 8));
        mhr.getCell(9).setCellValue("Reg Hrs");   mhr.getCell(9).setCellStyle(subHdrHours);
        mhr.getCell(10).setCellValue("OT Hrs");  mhr.getCell(10).setCellStyle(subHdrHours);
        mhr.getCell(11).setCellValue("Total");   mhr.getCell(11).setCellStyle(subHdrHours);
        mhr.getCell(12).setCellValue("OT");      mhr.getCell(12).setCellStyle(subHdrLunchSub);
        mhr.getCell(13).setCellValue("Status");

        Row shr = sheet.createRow(6); shr.setHeightInPoints(24);
        for (int i = 0; i < 14; i++) { Cell c = shr.createCell(i); c.setCellStyle(headerStyle); }
        shr.getCell(3).setCellValue("AM In");     shr.getCell(3).setCellStyle(subHdrMorningSub);
        shr.getCell(4).setCellValue("AM Out");    shr.getCell(4).setCellStyle(subHdrMorningSub);
        shr.getCell(5).setCellValue("Lunch In"); shr.getCell(5).setCellStyle(subHdrLunchSub);
        shr.getCell(6).setCellValue("Lunch Out");  shr.getCell(6).setCellStyle(subHdrLunchSub);
        shr.getCell(7).setCellValue("PM In");     shr.getCell(7).setCellStyle(subHdrMorningSub);
        shr.getCell(8).setCellValue("PM Out");    shr.getCell(8).setCellStyle(subHdrMorningSub);
        shr.getCell(9).setCellStyle(subHdrHours); shr.getCell(10).setCellStyle(subHdrHours); shr.getCell(11).setCellStyle(subHdrHours);
        shr.getCell(12).setCellStyle(subHdrLunchSub);

        for (int c : new int[]{0,1,2,9,10,11,12,13}) sheet.addMergedRegion(new CellRangeAddress(5, 6, c, c));

        // ── Data Rows ─────────────────────────────────────────────────────
        int numRows = rows != null ? rows.size() : 0;
        if (rows != null) {
            for (int idx = 0; idx < numRows; idx++) {
                Map<String, Object> r = rows.get(idx);
                Row row = sheet.createRow(7 + idx); row.setHeight((short) -1);

                boolean isWknd = "true".equals(str(r.get("isWeekend")));
                String type    = str(r.get("type"));

                CellStyle cs, cc, cd;
                if (isWknd || "Week Off".equalsIgnoreCase(type)) {
                    cs = wkndData; cc = wkndCenter; cd = wkndDecimal;
                } else if ("Holiday".equalsIgnoreCase(type)) {
                    cs = holData; cc = holCenter; cd = holDecimal;
                } else if ("Paid Leave".equalsIgnoreCase(type) || "Unpaid Leave".equalsIgnoreCase(type)) {
                    cs = leaveData; cc = leaveCenter; cd = leaveDecimal;
                } else if ("WFH".equalsIgnoreCase(type)) {
                    cs = wfhData; cc = wfhCenter; cd = wfhDecimal;
                } else {
                    cs = dataStyle; cc = dataCenterStyle; cd = dataDecimal;
                }

                createStyledCell(row, 0, formatDateStr(str(r.get("date"))), cs);
                createStyledCell(row, 1, formatDayStr(str(r.get("day"))),   cs);
                createStyledCell(row, 2, type,                               cs);
                createStyledCell(row, 3, str(r.get("amIn")),    cc);
                createStyledCell(row, 4, str(r.get("amOut")),   cc);
                createStyledCell(row, 5, str(r.get("lunchOut")),cc);
                createStyledCell(row, 6, str(r.get("lunchIn")), cc);
                createStyledCell(row, 7, str(r.get("pmIn")),    cc);
                createStyledCell(row, 8, str(r.get("pmOut")),   cc);

                String otTxt = str(r.get("otStatus"));
                String stTxt = str(r.get("status"));

                // Show Reg Hrs, OT Hrs, Total for ALL rows that have valid timing data
                // (regardless of approval status — approved-only filter is in the summary table only)
                String totStr = str(r.get("totalHrs"));
                Cell cJ = row.createCell(9);  cJ.setCellStyle(cd);
                Cell cK = row.createCell(10); cK.setCellStyle(cd);
                Cell cL = row.createCell(11); cL.setCellStyle(cd);
                if (!totStr.trim().isEmpty() && !"--".equals(totStr.trim())) {
                    cJ.setCellValue(parseTimeToDecimal(str(r.get("regHrs"))));
                    cK.setCellValue(parseTimeToDecimal(str(r.get("otHrs"))));
                    cL.setCellValue(parseTimeToDecimal(totStr));
                }

                CellStyle otSt = cc;
                if ("Approved".equalsIgnoreCase(otTxt)) {
                    otSt = stApproved;
                } else if ("Rejected".equalsIgnoreCase(otTxt)) {
                    otSt = stRejected;
                } else if ("Filed".equalsIgnoreCase(otTxt) || "Filled".equalsIgnoreCase(otTxt) || "Refilled".equalsIgnoreCase(otTxt) || 
                           "Pending".equalsIgnoreCase(otTxt) || "Permission Granted".equalsIgnoreCase(otTxt) || 
                           "Resubmitted".equalsIgnoreCase(otTxt) || "OT Applied".equalsIgnoreCase(otTxt) || 
                           "Waiting for Resubmission".equalsIgnoreCase(otTxt)) {
                    otSt = stPending;
                }
                createStyledCell(row, 12, otTxt, otSt);

                CellStyle stSt = cc;
                if ("Approved".equalsIgnoreCase(stTxt)) {
                    stSt = stApproved;
                } else if ("Rejected".equalsIgnoreCase(stTxt)) {
                    stSt = stRejected;
                } else if ("Pending".equalsIgnoreCase(stTxt) || "Reapproval Pending".equalsIgnoreCase(stTxt) || 
                           "Permission Granted".equalsIgnoreCase(stTxt) || "Resubmission Allowed".equalsIgnoreCase(stTxt) || 
                           "Resubmitted".equalsIgnoreCase(stTxt) || "OT Applied".equalsIgnoreCase(stTxt) || 
                           "Waiting for Resubmission".equalsIgnoreCase(stTxt)) {
                    stSt = stPending;
                }
                createStyledCell(row, 13, stTxt, stSt);
            }
        }

        // — Totals Row —————————————————————————————————————————————————————
        int totIdx = 7 + numRows;
        Row totRow = sheet.createRow(totIdx); totRow.setHeightInPoints(24);
        for (int i = 0; i < 14; i++) { Cell c = totRow.createCell(i); c.setCellStyle(totalsLabel); }
        totRow.getCell(0).setCellValue("TOTAL - " + monthLabel);
        sheet.addMergedRegion(new CellRangeAddress(totIdx, totIdx, 0, 8));

        Cell tJ = totRow.getCell(9);  tJ.setCellStyle(totalsDecimal);
        Cell tK = totRow.getCell(10); tK.setCellStyle(totalsDecimal);
        Cell tL = totRow.getCell(11); tL.setCellStyle(totalsDecimal);
        if (numRows > 0) {
            long totalRegMins = 0;
            long totalOtMins = 0;
            long totalTotMins = 0;
            for (Map<String, Object> r : rows) {
                String totStrVal = str(r.get("totalHrs"));
                if (!totStrVal.trim().isEmpty() && !"--".equals(totStrVal.trim())) {
                    totalRegMins += parseTimeToMinutes(str(r.get("regHrs")));
                    totalOtMins += parseTimeToMinutes(str(r.get("otHrs")));
                    totalTotMins += parseTimeToMinutes(totStrVal);
                }
            }
            tJ.setCellValue(minutesToHHMM(totalRegMins));
            tK.setCellValue(minutesToHHMM(totalOtMins));
            tL.setCellValue(minutesToHHMM(totalTotMins));
        } else {
            tJ.setCellValue(0.0);
            tK.setCellValue(0.0);
            tL.setCellValue(0.0);
        }
        totRow.getCell(13).setCellValue("<- hrs");

        // ── Row-specific Summary Colors ──
        XSSFColor daysLoggedBg = new XSSFColor(new byte[]{(byte)241, (byte)245, (byte)249}, null); // Slate 100
        XSSFColor regularHrsBg = new XSSFColor(new byte[]{(byte)224, (byte)242, (byte)254}, null); // Sky 100
        XSSFColor otHrsBg      = new XSSFColor(new byte[]{(byte)254, (byte)243, (byte)199}, null); // Amber 100
        XSSFColor wkndHrsBg    = new XSSFColor(new byte[]{(byte)220, (byte)252, (byte)231}, null); // Green 100
        XSSFColor totHrsBg     = new XSSFColor(new byte[]{(byte)209, (byte)250, (byte)229}, null); // Emerald 100

        XSSFCellStyle sumLabelDays = cloneWithBg(workbook, sumLabelStyle, daysLoggedBg);
        XSSFCellStyle sumValueDays = cloneWithBg(workbook, sumValueStyle, daysLoggedBg);
        sumValueDays.setDataFormat(df.getFormat("0")); // Whole number for days

        XSSFCellStyle sumLabelReg = cloneWithBg(workbook, sumLabelStyle, regularHrsBg);
        XSSFCellStyle sumValueReg = cloneWithBg(workbook, sumValueStyle, regularHrsBg);

        XSSFCellStyle sumLabelOt = cloneWithBg(workbook, sumLabelStyle, otHrsBg);
        XSSFCellStyle sumValueOt = cloneWithBg(workbook, sumValueStyle, otHrsBg);

        XSSFCellStyle sumLabelWknd = cloneWithBg(workbook, sumLabelStyle, wkndHrsBg);
        XSSFCellStyle sumValueWknd = cloneWithBg(workbook, sumValueStyle, wkndHrsBg);

        XSSFCellStyle sumLabelTot = cloneWithBg(workbook, sumLabelStyle, totHrsBg);
        XSSFCellStyle sumValueTot = cloneWithBg(workbook, sumValueStyle, totHrsBg);

        // ─────────────────────────────────────────────────────────────────────
        // MONTHLY SUMMARY — separate FT / PT blocks + combined totals
        // Columns 15–18 (P–S)
        // ─────────────────────────────────────────────────────────────────────
        boolean isPartTime = "Part time".equalsIgnoreCase(empType.trim())
                          || "Part-time".equalsIgnoreCase(empType.trim())
                          || "part_time".equalsIgnoreCase(empType.trim());

        // ── Compute FT metrics ────────────────────────────────────────────────
        double ftDaysLogged    = 0;
        double ftWkndDays      = 0;
        long   ftRegMins       = 0;   // regular working-day hours
        long   ftWkdOtMins     = 0;   // weekday OT hours
        long   ftWkndMins      = 0;   // weekend/holiday hours

        // ── Compute PT metrics ────────────────────────────────────────────────
        double ptDaysLogged    = 0;
        double ptWkndDays      = 0;
        long   ptRegMins       = 0;   // regular weekday working hours
        long   ptWkndMins      = 0;   // weekend/holiday hours

        if (rows != null) {
            for (Map<String, Object> r : rows) {
                String status   = str(r.get("status")).trim();
                String otStatus = str(r.get("otStatus")).trim();
                String type     = str(r.get("type")).trim();
                String regHrs   = str(r.get("regHrs")).trim();
                String otHrs    = str(r.get("otHrs")).trim();
                boolean isWeekend = "true".equalsIgnoreCase(str(r.get("isWeekend")));

                // Determine if this specific day was worked as Part-Time
                String rowEmpType = r.containsKey("empType") ? str(r.get("empType")).trim() : empType;
                boolean isRowPartTime = "Part time".equalsIgnoreCase(rowEmpType)
                                     || "Part-time".equalsIgnoreCase(rowEmpType)
                                     || "part_time".equalsIgnoreCase(rowEmpType)
                                     || "Part-Time".equalsIgnoreCase(type);

                boolean isSubmitted = !status.isEmpty() && !"Draft".equalsIgnoreCase(status);
                // Only count entries approved by the admin (Approved or Permission Granted statuses)
                boolean isApproved  = "Approved".equalsIgnoreCase(status)
                                   || "Permission Granted".equalsIgnoreCase(status);

                boolean isWkndOrHol = isWeekend
                                   || "Week Off".equalsIgnoreCase(type)
                                   || "Holiday".equalsIgnoreCase(type);

                long rMins = 0;
                if (isApproved && !regHrs.isEmpty() && !"--".equals(regHrs)) {
                    rMins = parseTimeToMinutes(regHrs);
                }
                long oMins = 0;
                if (isApproved && !otHrs.isEmpty() && !"--".equals(otHrs)) {
                    oMins = parseTimeToMinutes(otHrs);
                }

                if (!isRowPartTime) {
                    // ── Full-Time ──
                    if (isSubmitted) {
                        ftDaysLogged++;
                        // Only count as weekend/holiday worked if approved and timings are filled
                        if (isWkndOrHol && isApproved && (rMins > 0 || oMins > 0)) {
                            ftWkndDays++;
                        }
                    }
                    if (isWkndOrHol) {
                        // For FT, all weekend/holiday hours count as OT
                        ftWkndMins += (rMins + oMins);
                    } else {
                        ftRegMins  += rMins;
                        ftWkdOtMins += oMins;
                    }
                } else {
                    // ── Part-Time ──
                    if (isSubmitted) {
                        ptDaysLogged++;
                        // Only count as weekend/holiday worked if approved and timings are filled
                        if (isWkndOrHol && isApproved && (rMins > 0 || oMins > 0)) {
                            ptWkndDays++;
                        }
                    }
                    if (isWkndOrHol) {
                        // For PT, weekend hours are regular (no OT)
                        ptWkndMins += (rMins + oMins);
                    } else {
                        ptRegMins += rMins;
                    }
                }
            }
        }

        // ── Derived FT values ─────────────────────────────────────────────────
        long   ftTotalOtMins  = ftWkdOtMins + ftWkndMins;
        double ftRegHrs       = minutesToHHMM(ftRegMins);
        double ftWkdOtHrs     = minutesToHHMM(ftWkdOtMins);  // Normal working-day OT hours
        double ftWkndHrs      = minutesToHHMM(ftWkndMins);
        double ftTotalOtHrs   = minutesToHHMM(ftTotalOtMins);
        double ftTotalHrs     = minutesToHHMM(ftRegMins + ftTotalOtMins);

        // ── Derived PT values ─────────────────────────────────────────────────
        double ptRegHrs       = minutesToHHMM(ptRegMins); // weekday regular only
        double ptWkndHrs      = minutesToHHMM(ptWkndMins);
        double ptTotalHrs     = minutesToHHMM(ptRegMins + ptWkndMins);

        // ── Combined totals ───────────────────────────────────────────────────
        double combinedDays   = ftDaysLogged + ptDaysLogged;
        double combinedHrs    = minutesToHHMM(ftRegMins + ftTotalOtMins + ptRegMins + ptWkndMins);

        // ── Integer formats ───────────────────────────────────────────────────
        XSSFCellStyle sumValueWkndHolInt = cloneWithBg(workbook, sumValueStyle, wkndHrsBg);
        sumValueWkndHolInt.setDataFormat(df.getFormat("0"));
        XSSFCellStyle sumValueDaysInt = cloneWithBg(workbook, sumValueStyle, daysLoggedBg);
        sumValueDaysInt.setDataFormat(df.getFormat("0"));

        // Additional style: gold header for FT/PT section labels
        XSSFColor goldColor = new XSSFColor(new byte[]{(byte)255, (byte)193, (byte)7}, null);
        XSSFCellStyle sectionLabelStyle = workbook.createCellStyle();
        { Font f = workbook.createFont(); f.setBold(true); f.setColor(IndexedColors.BLACK.getIndex());
          f.setFontHeightInPoints((short)10); f.setFontName("Calibri"); sectionLabelStyle.setFont(f); }
        sectionLabelStyle.setFillForegroundColor(goldColor);
        sectionLabelStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        sectionLabelStyle.setAlignment(HorizontalAlignment.CENTER);
        sectionLabelStyle.setVerticalAlignment(VerticalAlignment.CENTER);
        sectionLabelStyle.setBorderBottom(BorderStyle.THIN); sectionLabelStyle.setBorderTop(BorderStyle.THIN);
        sectionLabelStyle.setBorderLeft(BorderStyle.THIN);  sectionLabelStyle.setBorderRight(BorderStyle.THIN);
        XSSFColor blk = new XSSFColor(new byte[]{0,0,0}, null);
        sectionLabelStyle.setBottomBorderColor(blk); sectionLabelStyle.setTopBorderColor(blk);
        sectionLabelStyle.setLeftBorderColor(blk);   sectionLabelStyle.setRightBorderColor(blk);

        // Combined-totals label style (teal-ish)
        XSSFColor combinedBg = new XSSFColor(new byte[]{(byte)232, (byte)245, (byte)233}, null);
        XSSFCellStyle sumLabelComb = cloneWithBg(workbook, sumLabelStyle, combinedBg);
        XSSFCellStyle sumValueComb = cloneWithBg(workbook, sumValueStyle, combinedBg);

        // ── Build summary rows starting at row 1 ──────────────────────────────
        int sR = 1;

        // ── MONTHLY SUMMARY header ────────────────────────────────────────────
        Row sumHdr = sheet.getRow(sR); if (sumHdr == null) sumHdr = sheet.createRow(sR);
        for (int i = 15; i <= 18; i++) { Cell c = sumHdr.createCell(i); c.setCellStyle(sumHeaderStyle); }
        sumHdr.getCell(15).setCellValue("MONTHLY SUMMARY");
        sheet.addMergedRegion(new CellRangeAddress(sR, sR, 15, 18));

        int cur = sR + 1;

        if (!isPartTime) {
            // ─────────────── FULL TIME section ───────────────────────────────
            // Section label
            Row ftHdr = sheet.getRow(cur); if (ftHdr == null) ftHdr = sheet.createRow(cur);
            for (int i = 15; i <= 18; i++) { Cell c = ftHdr.createCell(i); c.setCellStyle(sectionLabelStyle); }
            ftHdr.getCell(15).setCellValue("Full Time");
            sheet.addMergedRegion(new CellRangeAddress(cur, cur, 15, 18));
            cur++;

            putSummaryRow(sheet, cur++, "Days logged",                          sumLabelDays, sumValueDaysInt,      null, ftDaysLogged);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Weekends/holidays worked",             sumLabelWknd, sumValueWkndHolInt,   null, ftWkndDays);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total regular Hours worked",           sumLabelReg,  sumValueReg,           null, ftRegHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));

            // OT Hours Worked sub-header: label (cols 15-17) + normal working-day OT value (col 18)
            Row otHdr = sheet.getRow(cur); if (otHdr == null) otHdr = sheet.createRow(cur);
            for (int i = 15; i <= 17; i++) { Cell c = otHdr.createCell(i); c.setCellStyle(sumLabelOt); }
            otHdr.getCell(15).setCellValue("OT Hours Worked");
            sheet.addMergedRegion(new CellRangeAddress(cur, cur, 15, 17));
            Cell otHdrVal = otHdr.createCell(18); otHdrVal.setCellStyle(sumValueOt);
            otHdrVal.setCellValue(ftWkdOtHrs);  // Normal working-day OT total
            cur++;

            putSummaryRow(sheet, cur++, "Total weekends & Holiday hours worked",sumLabelWknd, sumValueWknd,          null, ftWkndHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total OverTime Hours Worked",          sumLabelOt,   sumValueOt,            null, ftTotalOtHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total Hours worked.",                  sumLabelTot,  sumValueTot,           null, ftTotalHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));

            // Spacer
            Row sp = sheet.getRow(cur); if (sp == null) sp = sheet.createRow(cur);
            cur++;

            // ─────────────── PART TIME section (placeholder / NA since this is FT emp) ─
            Row ptHdr = sheet.getRow(cur); if (ptHdr == null) ptHdr = sheet.createRow(cur);
            for (int i = 15; i <= 18; i++) { Cell c = ptHdr.createCell(i); c.setCellStyle(sectionLabelStyle); }
            ptHdr.getCell(15).setCellValue("Part Time");
            sheet.addMergedRegion(new CellRangeAddress(cur, cur, 15, 18));
            cur++;

            putSummaryRow(sheet, cur++, "Days logged",                          sumLabelDays, sumValueDaysInt,      null, ptDaysLogged);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Weekends/holidays worked",             sumLabelWknd, sumValueWkndHolInt,   null, ptWkndDays);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total regular Hours worked",           sumLabelReg,  sumValueReg,           null, ptRegHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total weekends & Holiday hours worked",sumLabelWknd, sumValueWknd,          null, ptWkndHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total Hours worked.",                  sumLabelTot,  sumValueTot,           null, ptTotalHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));

        } else {
            // ─────────────── PART TIME section (primary) ─────────────────────
            Row ptHdr = sheet.getRow(cur); if (ptHdr == null) ptHdr = sheet.createRow(cur);
            for (int i = 15; i <= 18; i++) { Cell c = ptHdr.createCell(i); c.setCellStyle(sectionLabelStyle); }
            ptHdr.getCell(15).setCellValue("Part Time");
            sheet.addMergedRegion(new CellRangeAddress(cur, cur, 15, 18));
            cur++;

            putSummaryRow(sheet, cur++, "Days logged",                          sumLabelDays, sumValueDaysInt,      null, ptDaysLogged);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Weekends/holidays worked",             sumLabelWknd, sumValueWkndHolInt,   null, ptWkndDays);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total regular Hours worked",           sumLabelReg,  sumValueReg,           null, ptRegHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total weekends & Holiday hours worked",sumLabelWknd, sumValueWknd,          null, ptWkndHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total Hours worked.",                  sumLabelTot,  sumValueTot,           null, ptTotalHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));

            // Spacer
            Row sp = sheet.getRow(cur); if (sp == null) sp = sheet.createRow(cur);
            cur++;

            // ─────────────── FULL TIME section (placeholder for PT emp) ──────
            Row ftHdr = sheet.getRow(cur); if (ftHdr == null) ftHdr = sheet.createRow(cur);
            for (int i = 15; i <= 18; i++) { Cell c = ftHdr.createCell(i); c.setCellStyle(sectionLabelStyle); }
            ftHdr.getCell(15).setCellValue("Full Time");
            sheet.addMergedRegion(new CellRangeAddress(cur, cur, 15, 18));
            cur++;

            putSummaryRow(sheet, cur++, "Days logged",                          sumLabelDays, sumValueDaysInt,      null, ftDaysLogged);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Weekends/holidays worked",             sumLabelWknd, sumValueWkndHolInt,   null, ftWkndDays);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total regular Hours worked",           sumLabelReg,  sumValueReg,           null, ftRegHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));

            Row otHdr = sheet.getRow(cur); if (otHdr == null) otHdr = sheet.createRow(cur);
            for (int i = 15; i <= 17; i++) { Cell c = otHdr.createCell(i); c.setCellStyle(sumLabelOt); }
            otHdr.getCell(15).setCellValue("OT Hours Worked");
            sheet.addMergedRegion(new CellRangeAddress(cur, cur, 15, 17));
            Cell otHdrVal2 = otHdr.createCell(18); otHdrVal2.setCellStyle(sumValueOt);
            otHdrVal2.setCellValue(ftWkdOtHrs);  // Normal working-day OT total
            cur++;

            putSummaryRow(sheet, cur++, "Total weekends & Holiday hours worked",sumLabelWknd, sumValueWknd,          null, ftWkndHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total OverTime Hours Worked",          sumLabelOt,   sumValueOt,            null, ftTotalOtHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
            putSummaryRow(sheet, cur++, "Total Hours worked.",                  sumLabelTot,  sumValueTot,           null, ftTotalHrs);
            sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
        }

        // Spacer before combined totals
        Row sp2 = sheet.getRow(cur); if (sp2 == null) sp2 = sheet.createRow(cur);
        cur++;

        // ── Combined FT/PT Totals ─────────────────────────────────────────────
        putSummaryRow(sheet, cur++, "Total FT/PT Days Logged",              sumLabelComb, sumValueComb,          null, combinedDays);
        sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));
        putSummaryRow(sheet, cur++, "Total FT/PT Hours worked.",            sumLabelComb, sumValueComb,          null, combinedHrs);
        sheet.addMergedRegion(new CellRangeAddress(cur-1, cur-1, 15, 17));

        // â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        int footerIdx = totIdx + 2;
        Row footerRow = sheet.createRow(footerIdx); footerRow.setHeightInPoints(20);
        CellStyle footerStyle = workbook.createCellStyle();
        { Font f = workbook.createFont(); f.setItalic(true); f.setFontHeightInPoints((short)9);
          f.setFontName("Calibri"); f.setColor(IndexedColors.GREY_50_PERCENT.getIndex()); footerStyle.setFont(f); }
        footerStyle.setAlignment(HorizontalAlignment.LEFT); footerStyle.setVerticalAlignment(VerticalAlignment.CENTER);
        Cell fc = footerRow.createCell(0);
        fc.setCellValue("Enter AM Time In/Out -> Lunch In/Out -> PM Time In/Out in HH:MM format (e.g. 09:00). Leave rows blank for absent / holiday days. OT & Weekend hours calculate automatically.");
        fc.setCellStyle(footerStyle);
        sheet.addMergedRegion(new CellRangeAddress(footerIdx, footerIdx, 0, 18));

        // â”€â”€ Column sizing & freeze pane â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Set fixed column widths for instant export
        int[] colWidths = {
            3500, // Date
            2500, // Day
            4500, // Day Type
            3000, // AM In
            3000, // AM Out
            3000, // Lunch In
            3000, // Lunch Out
            3000, // PM In
            3000, // PM Out
            3000, // Reg Hrs
            3000, // OT Hrs
            3000, // Total
            4000, // OT status
            4500, // Status
            1000, // Spacer (Col 14)
            5000, // Monthly Summary Label Col 15
            3000, // Col 16
            3000, // Col 17
            4000  // Col 18 (Value)
        };
        for (int i = 0; i < colWidths.length; i++) {
            sheet.setColumnWidth(i, colWidths[i]);
        }
        // Freeze pane: cols 0-14 (left, always visible) + rows 0-6 (top, always visible).
        // This splits vertically before column 15 (summary table) and horizontally below row 6 (headers).
        // The timesheet data (rows 7+) scrolls vertically freely, while the headers remain visible.
        sheet.createFreezePane(15, 7);
    }

    /** Clone a CellStyle, replacing only its fill colour */
    private XSSFCellStyle cloneWithBg(XSSFWorkbook wb, CellStyle base, XSSFColor color) {
        XSSFCellStyle s = wb.createCellStyle();
        s.cloneStyleFrom(base);
        s.setFillForegroundColor(color);
        s.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        return s;
    }

    private void infoLabel(Row row, int col, String label, XSSFCellStyle style) {
        Cell c = row.createCell(col); c.setCellValue(label); c.setCellStyle(style);
    }
    private void infoValue(Row row, int from, int to, String value, XSSFCellStyle style) {
        for (int i = from; i <= to; i++) { Cell c = row.createCell(i); c.setCellStyle(style); }
        row.getCell(from).setCellValue(value);
    }

    private void putSummaryRow(Sheet sheet, int rowIdx, String label,
                               XSSFCellStyle labelStyle, XSSFCellStyle valueStyle,
                               String formula, Double directValue) {
        Row row = sheet.getRow(rowIdx); if (row == null) row = sheet.createRow(rowIdx);
        for (int i = 15; i <= 18; i++) { Cell c = row.createCell(i); c.setCellStyle(labelStyle); }
        row.getCell(15).setCellValue(label);
        Cell vc = row.getCell(18); vc.setCellStyle(valueStyle);
        if (formula != null) {
            vc.setCellFormula(formula);
        }
        if (directValue != null) {
            vc.setCellValue(directValue);
        }
    }


    // â”€â”€â”€ Utility Methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private ResponseEntity<byte[]> buildResponse(XSSFWorkbook workbook, String filename) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        workbook.write(out);
        byte[] bytes = out.toByteArray();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        // Use RFC 6266 disposition so all browsers trigger a Save-As dialog
        headers.set(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + filename.replace("\"", "\\\"") + "\"");
        headers.setContentLength(bytes.length);
        headers.add("Access-Control-Expose-Headers", "Content-Disposition");

        return ResponseEntity.ok().headers(headers).body(bytes);
    }

    private XSSFCellStyle createHeaderStyle(XSSFWorkbook workbook) {
        XSSFCellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        font.setColor(IndexedColors.WHITE.getIndex());
        font.setFontHeightInPoints((short) 11);
        font.setFontName("Calibri");
        style.setFont(font);
        style.setFillForegroundColor(new XSSFColor(new byte[]{(byte)26,(byte)39,(byte)68}, null));
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        XSSFColor borderColor = new XSSFColor(new byte[]{(byte)0,(byte)0,(byte)0}, null);
        style.setBottomBorderColor(borderColor);
        style.setTopBorderColor(borderColor);
        style.setLeftBorderColor(borderColor);
        style.setRightBorderColor(borderColor);
        return style;
    }

    private XSSFCellStyle createSubHeaderStyle(XSSFWorkbook workbook, byte[] rgb) {
        XSSFCellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        font.setColor(IndexedColors.WHITE.getIndex());
        font.setFontHeightInPoints((short) 10);
        font.setFontName("Calibri");
        style.setFont(font);
        style.setFillForegroundColor(new XSSFColor(rgb, null));
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        XSSFColor borderColor = new XSSFColor(new byte[]{(byte)0,(byte)0,(byte)0}, null);
        style.setBottomBorderColor(borderColor);
        style.setTopBorderColor(borderColor);
        style.setLeftBorderColor(borderColor);
        style.setRightBorderColor(borderColor);
        return style;
    }

    /** Overload that accepts a pre-built XSSFColor — avoids duplicate byte[] conversions */
    private XSSFCellStyle createSubHeaderStyleXSSF(XSSFWorkbook workbook, XSSFColor color) {
        XSSFCellStyle style = workbook.createCellStyle();
        XSSFFont font = workbook.createFont();
        font.setBold(true);
        font.setColor(IndexedColors.WHITE.getIndex());
        font.setFontHeightInPoints((short) 10);
        font.setFontName("Calibri");
        style.setFont(font);
        style.setFillForegroundColor(color);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        XSSFColor borderColor = new XSSFColor(new byte[]{(byte)0,(byte)0,(byte)0}, null);
        style.setBottomBorderColor(borderColor);
        style.setTopBorderColor(borderColor);
        style.setLeftBorderColor(borderColor);
        style.setRightBorderColor(borderColor);
        return style;
    }

    private CellStyle createTitleStyle(XSSFWorkbook workbook) {
        CellStyle style = workbook.createCellStyle();
        XSSFFont font = workbook.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 14);
        font.setFontName("Calibri");
        font.setColor(new XSSFColor(new byte[]{(byte)26,(byte)39,(byte)68}, null));
        style.setFont(font);
        style.setAlignment(HorizontalAlignment.LEFT);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        return style;
    }

    private CellStyle createDataStyle(XSSFWorkbook workbook) {
        XSSFCellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setFontHeightInPoints((short) 10);
        font.setFontName("Calibri");
        style.setFont(font);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setAlignment(HorizontalAlignment.LEFT);
        style.setWrapText(true);
        XSSFColor borderColor = new XSSFColor(new byte[]{(byte)0,(byte)0,(byte)0}, null);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBottomBorderColor(borderColor);
        style.setBorderTop(BorderStyle.THIN);
        style.setTopBorderColor(borderColor);
        style.setBorderLeft(BorderStyle.THIN);
        style.setLeftBorderColor(borderColor);
        style.setBorderRight(BorderStyle.THIN);
        style.setRightBorderColor(borderColor);
        return style;
    }

    private CellStyle createDataCenterStyle(XSSFWorkbook workbook) {
        CellStyle style = createDataStyle(workbook);
        style.setAlignment(HorizontalAlignment.CENTER);
        return style;
    }

    private CellStyle createWeekendStyle(XSSFWorkbook workbook) {
        CellStyle style = createDataCenterStyle(workbook);
        style.setFillForegroundColor(new XSSFColor(new byte[]{(byte)211,(byte)211,(byte)211}, null));
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        return style;
    }

    private CellStyle createStatusStyle(XSSFWorkbook workbook, byte[] fontRgb, byte[] bgRgb) {
        XSSFCellStyle style = workbook.createCellStyle();
        XSSFFont font = workbook.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 10);
        font.setFontName("Calibri");
        font.setColor(new XSSFColor(fontRgb, null));
        style.setFont(font);
        style.setFillForegroundColor(new XSSFColor(bgRgb, null));
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        XSSFColor borderColor = new XSSFColor(new byte[]{(byte)0,(byte)0,(byte)0}, null);
        style.setBottomBorderColor(borderColor);
        style.setTopBorderColor(borderColor);
        style.setLeftBorderColor(borderColor);
        style.setRightBorderColor(borderColor);
        return style;
    }

    private void createStyledCell(Row row, int col, String value, CellStyle style) {
        Cell cell = row.createCell(col);
        cell.setCellValue(value != null ? value : "");
        cell.setCellStyle(style);
    }

    private String str(Object o) {
        return o != null ? o.toString() : "";
    }

    private double parseTimeToDecimal(String timeStr) {
        if (timeStr == null || timeStr.trim().isEmpty() || "--".equals(timeStr.trim())) {
            return 0.0;
        }
        try {
            if (timeStr.contains(":")) {
                String[] parts = timeStr.trim().split(":");
                if (parts.length == 2) {
                    double hrs = Double.parseDouble(parts[0]);
                    double mins = Double.parseDouble(parts[1]);
                    return hrs + (mins / 100.0);
                }
            } else {
                return Double.parseDouble(timeStr);
            }
        } catch (Exception e) {
            // ignore
        }
        return 0.0;
    }

    private long parseTimeToMinutes(String timeStr) {
        if (timeStr == null || timeStr.trim().isEmpty() || "--".equals(timeStr.trim())) {
            return 0;
        }
        try {
            if (timeStr.contains(":")) {
                String[] parts = timeStr.trim().split(":");
                if (parts.length == 2) {
                    long hrs = Long.parseLong(parts[0]);
                    long mins = Long.parseLong(parts[1]);
                    return hrs * 60 + mins;
                }
            } else {
                double val = Double.parseDouble(timeStr);
                long hrs = (long) val;
                long mins = Math.round((val - hrs) * 100.0);
                return hrs * 60 + mins;
            }
        } catch (Exception e) {
            // ignore
        }
        return 0;
    }

    private double minutesToHHMM(long totalMinutes) {
        long hrs = totalMinutes / 60;
        long mins = totalMinutes % 60;
        return hrs + (mins / 100.0);
    }

    private String formatDateStr(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) return "";
        String[] parts = dateStr.trim().split(" ");
        if (parts.length >= 2) {
            return parts[0] + "-" + parts[1];
        }
        return dateStr;
    }

    private String formatDayStr(String dayStr) {
        if (dayStr == null || dayStr.trim().isEmpty()) return "";
        if (dayStr.length() > 3) {
            return dayStr.substring(0, 3);
        }
        return dayStr;
    }
}
