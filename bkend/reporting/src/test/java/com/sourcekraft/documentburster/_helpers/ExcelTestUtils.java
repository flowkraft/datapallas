package com.sourcekraft.documentburster._helpers;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Date;
import java.util.List;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.poi.ss.SpreadsheetVersion;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CreationHelper;
import org.apache.poi.ss.usermodel.DataValidation;
import org.apache.poi.ss.usermodel.DataValidationConstraint;
import org.apache.poi.ss.usermodel.DataValidationHelper;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.ss.util.AreaReference;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.ss.util.CellRangeAddressList;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFTable;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.openxmlformats.schemas.spreadsheetml.x2006.main.CTTableColumn;
import org.openxmlformats.schemas.spreadsheetml.x2006.main.CTTableColumns;

import com.sourcekraft.documentburster.engine.AbstractBurster;
import com.sourcekraft.documentburster.engine.excel.ExcelUtils;
import com.sourcekraft.documentburster.unit.further.other.UtilsTest;

public class ExcelTestUtils {

	public static AbstractBurster doBurstAndAssertDefaultDistincValuesResults(String filePath, List<String> tokens,
			final String testName) throws Exception {

		AbstractBurster burster = new TestBursterFactory.PoiExcelBurster(StringUtils.EMPTY, testName);

		// a "temp" folder is required to be available
		FileUtils.forceMkdir(new File(TestsUtils.TESTS_OUTPUT_FOLDER + "/temp"));

		// Burst a copy: PoiExcelBurster evaluates the formulas and writes the workbook back to its input
		// path, which otherwise rewrites the tracked input files under src/ on every test run.
		File inputCopy = new File(TestsUtils.TESTS_OUTPUT_FOLDER + "/input-copies/" + testName,
				FilenameUtils.getName(filePath));
		FileUtils.copyFile(new File(filePath), inputCopy);

		burster.burst(inputCopy.getPath(), false, StringUtils.EMPTY, -1);
		ExcelTestUtils.assertDefaultDistincValuesResults(burster, tokens);

		return burster;
	}

	public static void assertDefaultDistincValuesResults(AbstractBurster burster, List<String> tokens)
			throws Exception {

		String extension = FilenameUtils.getExtension(burster.getCtx().inputDocumentFilePath);
		String outputFolder = burster.getCtx().outputFolder + "/";

		assertEquals(tokens.size(), new File(outputFolder).listFiles(UtilsTest.outputFilesFilter).length);

		// assert output reports
		for (String token : tokens) {

			String path = outputFolder + "/" + token + "." + extension;

			File outputReport = new File(path);
			assertTrue(outputReport.exists());

			InputStream input = new FileInputStream(outputReport);
			Workbook workBook = WorkbookFactory.create(input);

			// assert it has a single sheet and it is the correct sheet
			assertEquals(1, workBook.getNumberOfSheets());
			assertNotNull(workBook.getSheet("Customer List"));

			// assert the data to be correct
			assertTrue(isWorkbookDataValid(workBook, token));

			input.close();
		}

		TestsUtils.assertBackupStatsAndLogArchivesFiles(burster);

	}

	public static boolean isWorkbookDataValid(Workbook workBook, String valueToCheck) {

		Sheet sheet = workBook.getSheetAt(0);
		int columnIndex = sheet.getRow(0).getLastCellNum() - 1;

		for (Row row : sheet) {

			Cell cell = row.getCell(columnIndex);

			if (cell != null) {

				String cellValue = ExcelUtils.getCellValueAsString(cell);

				if (cellValue == null || cellValue.length() == 0)
					cellValue = "keep-row";

				if ((!cellValue.equals("keep-row")) && (!cellValue.equals(valueToCheck)))
					return false;

			}
		}

		return true;

	}

	public static void generateTestExcelFile(String filePath, boolean includeHeader, boolean includeFormulas,
			boolean includeMultipleSheets) {
		generateTestExcelFile(filePath, includeHeader, includeFormulas, includeMultipleSheets, false);
	}

	public static void generateTestExcelFile(String filePath, boolean includeHeader, boolean includeFormulas,
			boolean includeMultipleSheets, boolean includeWhitespace) {
		try (Workbook workbook = new XSSFWorkbook()) {
			// Create first sheet
			Sheet sheet = workbook.createSheet("Sheet1");
			int rowIndex = 0;

			// Add header if requested
			if (includeHeader) {
				Row headerRow = sheet.createRow(rowIndex++);
				headerRow.createCell(0).setCellValue("Column 1");
				headerRow.createCell(1).setCellValue("Column 2");
				headerRow.createCell(2).setCellValue("Column 3");
			}

			// Add data rows
			for (int i = 0; i < 5; i++) {
				Row row = sheet.createRow(rowIndex++);
				row.createCell(0).setCellValue("Data Row " + (i + 1));
				row.createCell(1).setCellValue(100 + i);
				row.createCell(2).setCellValue(200 + i);
			}

			// Add formulas if requested
			if (includeFormulas) {
				Row formulaRow = sheet.createRow(rowIndex++);
				formulaRow.createCell(0).setCellValue("Sum Row");
				formulaRow.createCell(1).setCellValue(500);

				Cell formulaCell = formulaRow.createCell(2);
				formulaCell.setCellFormula("SUM(C1:C5)");

				// Evaluate formulas
				FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();
				evaluator.evaluateFormulaCell(formulaCell);
			}

			// Add whitespace cells if requested
			if (includeWhitespace) {
				Row whitespaceRow = sheet.createRow(rowIndex++);
				whitespaceRow.createCell(0).setCellValue("No whitespace");

				Cell whitespaceCell = whitespaceRow.createCell(1);
				whitespaceCell.setCellValue("   Leading whitespace");

				Cell trailingWhitespaceCell = whitespaceRow.createCell(2);
				trailingWhitespaceCell.setCellValue("Trailing whitespace   ");
			}

			// Add additional sheets if requested
			if (includeMultipleSheets) {
				Sheet sheet2 = workbook.createSheet("Sheet2");
				Row row = sheet2.createRow(0);
				row.createCell(0).setCellValue("Sheet2");
				row.createCell(1).setCellValue("Data from second sheet");

				Sheet sheet3 = workbook.createSheet("Sheet3");
				row = sheet3.createRow(0);
				row.createCell(0).setCellValue("Sheet3");
				row.createCell(1).setCellValue("Data from third sheet");
			}

			// Write the workbook to file
			try (FileOutputStream fileOut = new FileOutputStream(filePath)) {
				workbook.write(fileOut);
			}
		} catch (Exception e) {
			throw new RuntimeException("Failed to create test Excel file", e);
		}
	}

	public static void generateComplexExcelFile(String filePath, boolean includeMergedCells, boolean includeTables,
			boolean includeDataValidation) {
		try (Workbook workbook = new XSSFWorkbook()) {
			Sheet sheet = workbook.createSheet("Complex Features");
			int rowNum = 0;

			// Create headers
			Row headerRow = sheet.createRow(rowNum++);

			// Create header cells
			Cell headerA = headerRow.createCell(0);
			headerA.setCellValue("Column 1");
			Cell headerB = headerRow.createCell(1);
			headerB.setCellValue("Column 2");
			Cell headerC = headerRow.createCell(2);
			headerC.setCellValue("Column 3");
			Cell headerD = headerRow.createCell(3);
			headerD.setCellValue("Column 4");

			// Add merged cells if requested
			if (includeMergedCells) {
				// Create a merged region for headers (first row, cells 1-2)
				CellRangeAddress mergedRegion = new CellRangeAddress(0, 0, 1, 2);
				sheet.addMergedRegion(mergedRegion);
				headerB.setCellValue("Merged Header");

				// Add some data rows with merged cells
				Row dataRow1 = sheet.createRow(rowNum++);
				dataRow1.createCell(0).setCellValue("First row data column 1");
				dataRow1.createCell(1).setCellValue("Merged Data");
				dataRow1.createCell(2).setCellValue("Merged Data"); // Will appear merged
				dataRow1.createCell(3).setCellValue("First row data column 4");

				// Add another merged region in the data (second row, cells 0-1)
				Row dataRow2 = sheet.createRow(rowNum++);
				dataRow2.createCell(0).setCellValue("Merged Multi-Cell Content");
				dataRow2.createCell(1).setCellValue("Merged Multi-Cell Content"); // Will appear merged
				dataRow2.createCell(2).setCellValue("Second row data column 3");
				dataRow2.createCell(3).setCellValue("Second row data column 4");

				CellRangeAddress dataRegion = new CellRangeAddress(rowNum - 1, rowNum - 1, 0, 1);
				sheet.addMergedRegion(dataRegion);

				// Add a few more regular rows
				for (int i = 0; i < 3; i++) {
					Row row = sheet.createRow(rowNum++);
					for (int j = 0; j < 4; j++) {
						row.createCell(j).setCellValue("Regular data " + (rowNum - 2) + "," + (j + 1));
					}
				}
			}

			// Add Excel Table if requested
			if (includeTables) {
				// First ensure we have some data for the table
				if (!includeMergedCells) {
					// Add data rows if we didn't already add them for merged cells
					for (int i = 0; i < 5; i++) {
						Row row = sheet.createRow(rowNum++);
						row.createCell(0).setCellValue("Table Row " + (i + 1));
						row.createCell(1).setCellValue(100 + i * 10);
						row.createCell(2).setCellValue("Category " + (char) ('A' + i));
						row.createCell(3).setCellValue(i % 2 == 0 ? "Yes" : "No");
					}
				}

				// Create the table
				XSSFTable table = ((XSSFSheet) sheet).createTable(null);
				AreaReference reference = new AreaReference(new CellReference(0, 0), new CellReference(rowNum - 1, 3),
						SpreadsheetVersion.EXCEL2007);
				table.setCellReferences(reference);

				// Set table style
				table.setName("TestTable");
				table.setDisplayName("TestTable");
				table.setStyleName("TableStyleMedium2");

				// Use the correct method for setting totals row shown
				table.getCTTable().setTotalsRowShown(false);

				// Define table columns
				CTTableColumns tableColumns = table.getCTTable().addNewTableColumns();
				tableColumns.setCount(4);

				// Add column definitions
				String[] reportColumnNames = { "Column 1", "Column 2", "Column 3", "Column 4" };
				for (int i = 0; i < 4; i++) {
					CTTableColumn column = tableColumns.addNewTableColumn();
					column.setId(i + 1);
					column.setName(reportColumnNames[i]);
				}
			}

			// Add data validation if requested
			if (includeDataValidation) {
				// Create a data validation for a dropdown list
				DataValidationHelper validationHelper = sheet.getDataValidationHelper();
				DataValidationConstraint constraint = validationHelper
						.createExplicitListConstraint(new String[] { "Option 1", "Option 2", "Option 3" });

				// Apply validation to a range
				CellRangeAddressList addressList = new CellRangeAddressList(rowNum, rowNum + 4, 2, 2);
				DataValidation validation = validationHelper.createValidation(constraint, addressList);
				validation.setShowErrorBox(true);
				sheet.addValidationData(validation);

				// Add rows for validation testing
				for (int i = 0; i < 5; i++) {
					Row row = sheet.createRow(rowNum++);
					row.createCell(0).setCellValue("Validation Row " + (i + 1));
					row.createCell(1).setCellValue(200 + i);
					row.createCell(2).setCellValue("Option " + ((i % 3) + 1));
					row.createCell(3).setCellValue("Validation Test");
				}
			}

			// Autosize columns for better readability
			for (int i = 0; i < 4; i++) {
				sheet.autoSizeColumn(i);
			}

			// Write the file
			try (FileOutputStream fileOut = new FileOutputStream(filePath)) {
				workbook.write(fileOut);
			}
		} catch (Exception e) {
			throw new RuntimeException("Failed to generate complex Excel test file", e);
		}
	}

	/**
	 * Generates an Excel file with formula-based ID column for testing
	 * 
	 * @param filePath Path to create the test file
	 */
	public static void generateFormulaIdExcelFile(String filePath) {
		try (Workbook workbook = new XSSFWorkbook()) {
			Sheet sheet = workbook.createSheet("FormulaIDTest");

			// Create header row
			Row headerRow = sheet.createRow(0);
			headerRow.createCell(0).setCellValue("First");
			headerRow.createCell(1).setCellValue("Last");
			headerRow.createCell(2).setCellValue("ID (Formula)");

			// Create data rows with formulas
			for (int i = 1; i <= 5; i++) {
				Row row = sheet.createRow(i);
				row.createCell(0).setCellValue("First" + i);
				row.createCell(1).setCellValue("Last" + i);

				// Create formula cell: =CONCATENATE(A[i+1],"-",B[i+1])
				Cell formulaCell = row.createCell(2);
				formulaCell.setCellFormula("CONCATENATE(A" + (i + 1) + ",\"-\",B" + (i + 1) + ")");
			}

			// Calculate formulas
			workbook.getCreationHelper().createFormulaEvaluator().evaluateAll();

			// Save the workbook
			try (FileOutputStream fileOut = new FileOutputStream(filePath)) {
				workbook.write(fileOut);
			}
		} catch (Exception e) {
			throw new RuntimeException("Failed to create formula ID test Excel file", e);
		}
	}

	/**
	 * Generates an Excel file with multiple sheets having different column widths
	 * 
	 * @param filePath Path to create the test file
	 */
	public static void generateVaryingColumnWidthsExcelFile(String filePath) {
		try (Workbook workbook = new XSSFWorkbook()) {
			
			// --- Create Date Style ---
            CellStyle dateCellStyle = workbook.createCellStyle();
            CreationHelper createHelper = workbook.getCreationHelper();
            dateCellStyle.setDataFormat(createHelper.createDataFormat().getFormat("MM/dd/yy"));
            
            
			// Create first sheet with 5 columns
			Sheet sheet1 = workbook.createSheet("Sheet1-5Columns");

			// Create header row
			Row headerRow1 = sheet1.createRow(0);
			headerRow1.createCell(0).setCellValue("Column 1");
			headerRow1.createCell(1).setCellValue("Column 2");
			headerRow1.createCell(2).setCellValue("Column 3");
			headerRow1.createCell(3).setCellValue("Column 4");
			headerRow1.createCell(4).setCellValue("Column 5");

			// Create data rows for first sheet
			for (int i = 1; i <= 3; i++) {
				Row row = sheet1.createRow(i);
				row.createCell(0).setCellValue("Sheet1-Row" + i + "-Col1");
				row.createCell(1).setCellValue("Sheet1-Row" + i + "-Col2");
				row.createCell(2).setCellValue("Sheet1-Row" + i + "-Col3");
				// --- Set Date Value for Column 4 (index 3) ---
                Cell dateCell1 = row.createCell(3);
                dateCell1.setCellValue(new Date()); // Use current date or a specific fixed date
                dateCell1.setCellStyle(dateCellStyle);
                // --- End Set Date Value ---
				row.createCell(4).setCellValue("Sheet1-Data" + i); // Last column has ID value
			}

			// Create second sheet with only 3 columns
			Sheet sheet2 = workbook.createSheet("Sheet2-3Columns");

			// Create header row for second sheet
			Row headerRow2 = sheet2.createRow(0);
			headerRow2.createCell(0).setCellValue("Column A");
			headerRow2.createCell(1).setCellValue("Column B");
			headerRow2.createCell(2).setCellValue("Column C");

			// Create data rows for second sheet
			for (int i = 1; i <= 3; i++) {
				Row row = sheet2.createRow(i);
				row.createCell(0).setCellValue("Sheet2-Row" + i + "-ColA");
				row.createCell(1).setCellValue("Sheet2-Row" + i + "-ColB");
				row.createCell(2).setCellValue("Sheet2-Data" + i); // Last column has ID value
			}

			// Save the workbook
			try (FileOutputStream fileOut = new FileOutputStream(filePath)) {
				workbook.write(fileOut);
			}
		} catch (Exception e) {
			throw new RuntimeException("Failed to create varying width columns test Excel file", e);
		}
	}
}