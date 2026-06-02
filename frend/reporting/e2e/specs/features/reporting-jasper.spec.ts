import * as path from 'path';
import * as fs from 'fs';

import { test } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { ConfTemplatesTestHelper } from '../../helpers/areas/conf-templates-test-helper';
import { ConfigurationTestHelper } from '../../helpers/areas/configuration-test-helper';
import _ from 'lodash';
import { ConnectionsTestHelper } from '../../helpers/areas/connections-test-helper';

/**
 * Copies a JasperReport sample from config/samples-jasper/ to config/reports-jasper/
 * so the backend scanner discovers it.
 */
function copyJasperSampleToReportsDir(sampleFolderName: string) {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  const src = path.resolve(portableDir, 'config', 'samples-jasper', sampleFolderName);
  const dest = path.resolve(portableDir, 'config', 'reports-jasper', sampleFolderName);

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const files = fs.readdirSync(src);
  for (const file of files) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
  }
}


test.describe('DataPallas - JasperReports Integration', async () => {

  FluentTester.setGlobalClickWaitMs(Constants.DELAY_ONE_SECOND);

  // ─── Test 1: Ad-hoc employee badge card — no database, just fill in the form and print ───
  // Technical: Direct execution, no DB — parameters entered manually in the UI form,
  // passed to a pre-built .jrxml that renders a single PDF from form values alone.
  electronBeforeAfterAllTest(
    'should generate an ad-hoc employee badge card from form values alone (no database needed)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      // Copy sample .jrxml to reports-jasper/ so scanner finds it
      copyJasperSampleToReportsDir('employee-detail');

      let ft = new FluentTester(firstPage);

      // Navigate away from Processing so that returning triggers a fresh config reload
      ft = ft
        .click('#topMenuConfiguration')
        .click('#topConfigurationCrud')
        .sleep(Constants.DELAY_ONE_SECOND)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("employee_detail")',
        )
        .click(
          'span.ng-option-label:has-text("employee_detail")',
        );

      // Fill in the employee details for the badge
      ft = ft
        .waitOnElementToBecomeVisible('#formReportParameters')
        .waitOnElementToBecomeEnabled('#EmployeeID')
        .setValue('#EmployeeID', '1')
        .setValue('#FirstName', 'Nancy')
        .setValue('#LastName', 'Davolio')
        .setValue('#Title', 'Sales Representative')
        .setValue('#City', 'Seattle')
        .setValue('#Country', 'USA')
        .sleep(Constants.DELAY_ONE_SECOND);

      // Generate the badge card — expect 1 PDF
      ft = ft
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedNFilesHavingSuffix(1, '.pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      return ft;
    },
  );

  // ─── Test 1b: Employee roster exported as Excel (.xlsx) ───
  // Technical: Tabular .jrxml designed for spreadsheet output, with burstfilename set to .xlsx.
  // Verifies JasperReports Excel export path (Apache POI) has no jar conflicts.
  electronBeforeAfterAllTest(
    'should generate an employee roster as Excel (.xlsx) from form values alone (no database needed)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      // Copy the Excel-oriented sample .jrxml to reports-jasper/ so scanner finds it
      copyJasperSampleToReportsDir('employee-roster');

      let ft = new FluentTester(firstPage);

      // Step 1: Trigger jrxml discovery — first visit to config page starts backend scan,
      // sleep gives it time to auto-generate settings.xml, then second visit (inside
      // loadConfiguration) reloads the list and finds the employee-roster entry.
      ft = ft
        .gotoConfigurationReports()
        .sleep(Constants.DELAY_ONE_SECOND);
      ft = ConfigurationTestHelper.loadConfiguration(ft, 'employee-roster');
      ft = ft
        .waitOnElementToBecomeVisible('#burstFileName')
        .setValue('#burstFileName', '${burst_token}.xlsx')
        .sleep(3 * Constants.DELAY_ONE_SECOND);

      // Step 2: Go to report generation, select the report, fill params, generate
      ft = ft
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("employee_roster")',
        )
        .click(
          'span.ng-option-label:has-text("employee_roster")',
        );

      // Fill in the employee details
      ft = ft
        .waitOnElementToBecomeVisible('#formReportParameters')
        .waitOnElementToBecomeEnabled('#EmployeeID')
        .setValue('#EmployeeID', '1')
        .setValue('#FirstName', 'Nancy')
        .setValue('#LastName', 'Davolio')
        .setValue('#Title', 'Sales Representative')
        .setValue('#City', 'Seattle')
        .setValue('#Country', 'USA')
        .sleep(Constants.DELAY_ONE_SECOND);

      // Generate the roster — expect 1 XLSX
      ft = ft
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedNFilesHavingSuffix(1, '.xlsx')
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      return ft;
    },
  );

  // ─── Test 2: List all customers in a country ───
  // Technical: Direct execution with DB connection — .jrxml has its own SQL query + a "country" parameter
  electronBeforeAfterAllTest(
    '(sqlite) should list all customers for a given country',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const dbVendor = 'sqlite';

      copyJasperSampleToReportsDir('customer-by-country');

      let ft = new FluentTester(firstPage);

      // Connect to the database so the report can look up customers
      const dbConn = createDbConnection(ft, 'JasperCustByCountry', 'dbcon-plain-schema-only', dbVendor, false);
      ft = dbConn.ft;

      ft = ConnectionsTestHelper.useForJasperReports(
        ft,
        `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}\\.xml`,
      );

      // Assert datasource.properties was created with the correct connectionCode.
      // Without this check the test would still pass via Tier 3 (default connection)
      // fallback, never proving that "Use For JasperReports" actually wrote the file.
      // The file is written async by the backend API, so poll until it appears.
      const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
      const dsPropsPath = path.resolve(portableDir, 'config', 'reports-jasper', 'datasource.properties');
      const expectedConnCode = `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}`;
      ft = ft
        .fileShouldExist(dsPropsPath)
        .fileContentShouldContain(dsPropsPath, `connectionCode=${expectedConnCode}`);

      // Pick the "customers by country" report
      ft = ft
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("customer_by_country")',
        )
        .click(
          'span.ng-option-label:has-text("customer_by_country")',
        );

      // Enter the country we want to see customers for
      ft = ft
        .waitOnElementToBecomeVisible('#formReportParameters')
        .waitOnElementToBecomeEnabled('#country')
        .setValue('#country', 'Germany')
        .sleep(Constants.DELAY_ONE_SECOND);

      // Generate the customer list — expect 1 PDF with all German customers
      ft = ft
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedNFilesHavingSuffix(1, '.pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      // Cleanup
      ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft,
        `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}\\.xml`,
        dbVendor,
      );

      return ft;
    },
  );

  // ─── Test 3: Employee profile cards — one card per person ───
  // Technical: Wrapper report with SQL datasource → picks pre-built .jrxml from reports-jasper/
  electronBeforeAfterAllTest(
    '(sqlite) should generate one employee profile card per person in the company',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const dbVendor = 'sqlite';
      const TEST_NAME = 'JasperEmployeeCards';

      copyJasperSampleToReportsDir('employee-detail');

      let ft = new FluentTester(firstPage);

      const dbConn = createDbConnection(ft, TEST_NAME, 'dbcon-plain-schema-only', dbVendor, false);
      ft = dbConn.ft;

      ft = ConnectionsTestHelper.useForJasperReports(
        ft,
        `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}\\.xml`,
      );

      ft = ConfTemplatesTestHelper.createNewTemplate(ft, TEST_NAME, 'enableMailMergeCapability');

      // Pull the list of all employees from the database
      // (Already on the config page after createNewTemplate)
      ft = ft
        .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
        .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .click('#leftMenuReportingSettings')
        .waitOnElementToBecomeVisible('#dsTypes')
        .waitOnElementToBecomeEnabled('#dsTypes')
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.sqlquery');

      const sqlQuery = `
SELECT
    "EmployeeID",
    "FirstName",
    "LastName",
    "Title",
    "City",
    "Country"
FROM "Employees"
ORDER BY "EmployeeID"
`;

      ft = ft
        .waitOnElementToBecomeVisible('#sqlQueryEditor')
        .setCodeJarContentSingleShot('#sqlQueryEditor', sqlQuery);

      // Verify we see 3 employees: Nancy, Andrew, Janet
      ft = ft
        .waitOnElementToContainText('#databaseConnection', '(default)')
        .waitOnElementToBecomeVisible('#btnTestSqlQuery')
        .click('#btnTestSqlQuery')
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#btnClearLogs')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#btnTestSqlQuery')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#tab-btn-reportingTabulatorTab')
        .waitOnTabulatorToBecomeVisible()
        .waitOnTabulatorToHaveRowCount(3)
        .tabulatorCellShouldHaveText(0, 'FirstName', 'Nancy')
        .tabulatorCellShouldHaveText(1, 'FirstName', 'Andrew')
        .tabulatorCellShouldHaveText(2, 'FirstName', 'Janet');

      // Choose the employee profile card template
      ft = ft
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#tab-btn-reportingTemplateOutputTab')
        .waitOnElementToBecomeVisible('#reportOutputType')
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.jasper');

      // Pick the pre-built employee_detail card
      ft = ft
        .waitOnElementToBecomeVisible('#selectJasperReport')
        .click('#selectJasperReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("employee_detail")',
        )
        .click(
          'span.ng-option-label:has-text("employee_detail")',
        )
        .sleep(Constants.DELAY_ONE_SECOND);

      // Generate — 3 employees → 3 profile card PDFs
      ft = ft
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          `span.ng-option-label:has-text("${TEST_NAME} (input SQL Query)")`,
        )
        .click(
          `span.ng-option-label:has-text("${TEST_NAME} (input SQL Query)")`,
        );

      ft = ft
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedNFilesHavingSuffix(3, '.pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      // Cleanup
      ft = ConfTemplatesTestHelper.deleteTemplate(ft, _.kebabCase(TEST_NAME));

      ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft,
        `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}\\.xml`,
        dbVendor,
      );

      return ft;
    },
  );

  // ─── Test 4: Employee directory cards — template written directly in the editor ───
  // Technical: Inline .jrxml (written in code editor, not pre-built), receives data via fields ($F{})
  electronBeforeAfterAllTest(
    '(sqlite) should generate employee directory cards using a custom template written in the editor',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const dbVendor = 'sqlite';
      const TEST_NAME = 'JasperStaffDirectory';

      let ft = new FluentTester(firstPage);

      const dbConn = createDbConnection(ft, TEST_NAME, 'dbcon-plain-schema-only', dbVendor, false);
      ft = dbConn.ft;

      ft = ConfTemplatesTestHelper.createNewTemplate(ft, TEST_NAME, 'enableMailMergeCapability');

      // Pull the list of all employees from the database
      // (Already on the config page after createNewTemplate)
      ft = ft
        .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
        .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .click('#leftMenuReportingSettings')
        .waitOnElementToBecomeVisible('#dsTypes')
        .waitOnElementToBecomeEnabled('#dsTypes')
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.sqlquery');

      const sqlQuery = `
SELECT
    "EmployeeID",
    "FirstName",
    "LastName",
    "Title",
    "City",
    "Country"
FROM "Employees"
ORDER BY "EmployeeID"
`;

      ft = ft
        .waitOnElementToBecomeVisible('#sqlQueryEditor')
        .setCodeJarContentSingleShot('#sqlQueryEditor', sqlQuery);

      // Verify we see 3 employees: Nancy, Andrew, Janet
      ft = ft
        .waitOnElementToContainText('#databaseConnection', '(default)')
        .waitOnElementToBecomeVisible('#btnTestSqlQuery')
        .click('#btnTestSqlQuery')
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#btnClearLogs')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#btnTestSqlQuery')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#tab-btn-reportingTabulatorTab')
        .waitOnTabulatorToBecomeVisible()
        .waitOnTabulatorToHaveRowCount(3)
        .tabulatorCellShouldHaveText(0, 'FirstName', 'Nancy')
        .tabulatorCellShouldHaveText(1, 'FirstName', 'Andrew')
        .tabulatorCellShouldHaveText(2, 'FirstName', 'Janet');

      // Write a custom directory card template directly in the editor
      ft = ft
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#tab-btn-reportingTemplateOutputTab')
        .waitOnElementToBecomeVisible('#reportOutputType')
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.jasper');

      ft = ft
        .waitOnElementToBecomeVisible('#selectJasperReport')
        .click('#selectJasperReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("Write .jrxml code inline")',
        )
        .click(
          'span.ng-option-label:has-text("Write .jrxml code inline")',
        )
        .sleep(Constants.DELAY_ONE_SECOND);

      // Directory card shows: full name, title, and city/country
      const inlineJrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="inline-employee" pageWidth="595" pageHeight="842" columnWidth="555"
              leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
    <field name="EmployeeID" class="java.lang.Object"/>
    <field name="FirstName" class="java.lang.Object"/>
    <field name="LastName" class="java.lang.Object"/>
    <field name="Title" class="java.lang.Object"/>
    <field name="City" class="java.lang.Object"/>
    <field name="Country" class="java.lang.Object"/>
    <detail>
        <band height="30">
            <element kind="textField" x="0" y="0" width="100" height="30">
                <expression><![CDATA[$F{FirstName} + " " + $F{LastName}]]></expression>
            </element>
            <element kind="textField" x="100" y="0" width="150" height="30">
                <expression><![CDATA[$F{Title}]]></expression>
            </element>
            <element kind="textField" x="250" y="0" width="100" height="30">
                <expression><![CDATA[$F{City} + ", " + $F{Country}]]></expression>
            </element>
        </band>
    </detail>
</jasperReport>`;

      ft = ft
        .waitOnElementToBecomeVisible('#codeJarJrxmlTemplateEditor')
        .setCodeJarContentSingleShot('#codeJarJrxmlTemplateEditor', inlineJrxml)
        .sleep(Constants.DELAY_ONE_SECOND);

      // Generate — 3 employees → 3 directory card PDFs
      ft = ft
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          `span.ng-option-label:has-text("${TEST_NAME} (input SQL Query)")`,
        )
        .click(
          `span.ng-option-label:has-text("${TEST_NAME} (input SQL Query)")`,
        );

      ft = ft
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedNFilesHavingSuffix(3, '.pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      // Cleanup
      ft = ConfTemplatesTestHelper.deleteTemplate(ft, _.kebabCase(TEST_NAME));

      ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft,
        `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}\\.xml`,
        dbVendor,
      );

      return ft;
    },
  );

  // ─── Test 5: Sales rep order history — each rep gets their own order listing ───
  // Technical: Inline .jrxml declares its own parameters + has its own SQL queryString
  // that fetches orders via REPORT_CONNECTION. Tests param coercion and query dispatch.
  electronBeforeAfterAllTest(
    '(sqlite) should generate a personalized order history report for each sales rep',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const dbVendor = 'sqlite';
      const TEST_NAME = 'JasperOrderHistory';

      let ft = new FluentTester(firstPage);

      // Connect to the database — the template needs it to look up each rep's orders
      const dbConn = createDbConnection(ft, TEST_NAME, 'dbcon-plain-schema-only', dbVendor, false);
      ft = dbConn.ft;

      ft = ConnectionsTestHelper.useForJasperReports(
        ft,
        `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}\\.xml`,
      );

      ft = ConfTemplatesTestHelper.createNewTemplate(ft, TEST_NAME, 'enableMailMergeCapability');

      // One row per sales rep from the database
      // (Already on the config page after createNewTemplate)
      ft = ft
        .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
        .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .click('#leftMenuReportingSettings')
        .waitOnElementToBecomeVisible('#dsTypes')
        .waitOnElementToBecomeEnabled('#dsTypes')
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.sqlquery');

      ft = ft
        .waitOnElementToBecomeVisible('#sqlQueryEditor')
        .setCodeJarContentSingleShot('#sqlQueryEditor', `
SELECT "EmployeeID", "FirstName", "LastName"
FROM "Employees"
ORDER BY "EmployeeID"
`);

      ft = ft
        .waitOnElementToContainText('#databaseConnection', '(default)')
        .waitOnElementToBecomeVisible('#btnTestSqlQuery')
        .click('#btnTestSqlQuery')
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#btnClearLogs')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#btnTestSqlQuery')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#tab-btn-reportingTabulatorTab')
        .waitOnTabulatorToBecomeVisible()
        .waitOnTabulatorToHaveRowCount(3);

      // Write a template that receives the employee info and fetches their recent orders
      ft = ft
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#tab-btn-reportingTemplateOutputTab')
        .waitOnElementToBecomeVisible('#reportOutputType')
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.jasper');

      ft = ft
        .waitOnElementToBecomeVisible('#selectJasperReport')
        .click('#selectJasperReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("Write .jrxml code inline")',
        )
        .click(
          'span.ng-option-label:has-text("Write .jrxml code inline")',
        )
        .sleep(Constants.DELAY_ONE_SECOND);

      // Title shows "Orders for Nancy (ID: 1)", detail lists up to 5 recent orders
      const inlineJrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="order-history" pageWidth="595" pageHeight="842" columnWidth="555"
              leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
    <parameter name="EmployeeID" class="java.lang.Integer"/>
    <parameter name="FirstName" class="java.lang.String"/>
    <query language="SQL"><![CDATA[SELECT "OrderID", "CustomerID", "ShipCountry"
FROM "Orders"
WHERE "EmployeeID" = $P{EmployeeID}
ORDER BY "OrderID"
LIMIT 5]]></query>
    <field name="OrderID" class="java.lang.Object"/>
    <field name="CustomerID" class="java.lang.Object"/>
    <field name="ShipCountry" class="java.lang.Object"/>
    <title height="30">
        <element kind="textField" x="0" y="0" width="555" height="30" fontSize="14.0" bold="true" hTextAlign="Center">
            <expression><![CDATA["Orders for " + $P{FirstName} + " (ID: " + $P{EmployeeID} + ")"]]></expression>
        </element>
    </title>
    <detail>
        <band height="20">
            <element kind="textField" x="0" y="0" width="150" height="20">
                <expression><![CDATA[$F{OrderID}]]></expression>
            </element>
            <element kind="textField" x="150" y="0" width="200" height="20">
                <expression><![CDATA[$F{CustomerID}]]></expression>
            </element>
            <element kind="textField" x="350" y="0" width="200" height="20">
                <expression><![CDATA[$F{ShipCountry}]]></expression>
            </element>
        </band>
    </detail>
</jasperReport>`;

      ft = ft
        .waitOnElementToBecomeVisible('#codeJarJrxmlTemplateEditor')
        .setCodeJarContentSingleShot('#codeJarJrxmlTemplateEditor', inlineJrxml)
        .sleep(Constants.DELAY_ONE_SECOND);

      // Generate — 3 sales reps → 3 personalized order history PDFs
      ft = ft
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          `span.ng-option-label:has-text("${TEST_NAME} (input SQL Query)")`,
        )
        .click(
          `span.ng-option-label:has-text("${TEST_NAME} (input SQL Query)")`,
        );

      ft = ft
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedNFilesHavingSuffix(3, '.pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      ft = ConfTemplatesTestHelper.deleteTemplate(ft, _.kebabCase(TEST_NAME));

      ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft,
        `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}\\.xml`,
        dbVendor,
      );

      return ft;
    },
  );

  // ─── Test 6: Invoices with line items — accounting prints invoices from ERP data ───
  // Technical: Groovy script datasource returns nested master-detail data (invoice → lines[]).
  // flattenNestedData expands nested lists into flat rows for JR. Tests the master-detail pipeline.
  electronBeforeAfterAllTest(
    '(sqlite) should generate invoices — each with its own line items — from ERP export data',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const dbVendor = 'sqlite';
      const TEST_NAME = 'JasperInvoices';

      let ft = new FluentTester(firstPage);

      const dbConn = createDbConnection(ft, TEST_NAME, 'dbcon-plain-schema-only', dbVendor, false);
      ft = dbConn.ft;

      ft = ConfTemplatesTestHelper.createNewTemplate(ft, TEST_NAME, 'enableMailMergeCapability');

      // Simulate an ERP export: Groovy script builds 3 invoices with varying line items
      // (Already on the config page after createNewTemplate)
      ft = ft
        .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
        .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .click('#leftMenuReportingSettings')
        .waitOnElementToBecomeVisible('#dsTypes')
        .waitOnElementToBecomeEnabled('#dsTypes')
        .dropDownSelectOptionHavingValue('#dsTypes', 'ds.scriptfile');

      // 3 invoices: Acme Corp (3 items), Beta Industries (2 items), Gamma Trading (1 item)
      const groovyScript = `
import java.util.LinkedHashMap

def result = []

def inv1 = new LinkedHashMap<String,Object>()
inv1.put('InvoiceID', 'INV-2025-001')
inv1.put('Customer', 'Acme Corp')
inv1.put('InvoiceDate', '2025-03-01')
inv1.put('lines', [
  [Product: 'Industrial Widget A', Qty: '50', UnitPrice: '12.50'],
  [Product: 'Heavy-Duty Gadget B', Qty: '20', UnitPrice: '45.00'],
  [Product: 'Precision Sprocket C', Qty: '100', UnitPrice: '3.75']
])
result.add(inv1)

def inv2 = new LinkedHashMap<String,Object>()
inv2.put('InvoiceID', 'INV-2025-002')
inv2.put('Customer', 'Beta Industries')
inv2.put('InvoiceDate', '2025-03-05')
inv2.put('lines', [
  [Product: 'Hydraulic Press Model X', Qty: '1', UnitPrice: '8500.00'],
  [Product: 'Installation Service', Qty: '1', UnitPrice: '1200.00']
])
result.add(inv2)

def inv3 = new LinkedHashMap<String,Object>()
inv3.put('InvoiceID', 'INV-2025-003')
inv3.put('Customer', 'Gamma Trading Ltd')
inv3.put('InvoiceDate', '2025-03-07')
inv3.put('lines', [
  [Product: 'Bulk Fastener Pack (10,000 pcs)', Qty: '5', UnitPrice: '89.00']
])
result.add(inv3)

ctx.reportData = result
ctx.reportColumnNames = ['InvoiceID', 'Customer', 'InvoiceDate', 'lines']
log.info("Invoice data ready: {} invoices", ctx.reportData.size())
`;

      ft = ft
        .waitOnElementToBecomeVisible('#groovyScriptEditor')
        .setCodeJarContentSingleShot('#groovyScriptEditor', groovyScript);

      // Verify we see 3 invoices
      ft = ft
        .waitOnElementToContainText('#databaseConnection', '(default)')
        .waitOnElementToBecomeVisible('#btnTestScript')
        .click('#btnTestScript')
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#btnClearLogs')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#btnTestScript')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#tab-btn-reportingTabulatorTab')
        .waitOnTabulatorToBecomeVisible()
        .waitOnTabulatorToHaveRowCount(3);

      // Write an invoice template: header + line item table
      ft = ft
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('#tab-btn-reportingTemplateOutputTab')
        .waitOnElementToBecomeVisible('#reportOutputType')
        .dropDownSelectOptionHavingValue('#reportOutputType', 'output.jasper');

      ft = ft
        .waitOnElementToBecomeVisible('#selectJasperReport')
        .click('#selectJasperReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("Write .jrxml code inline")',
        )
        .click(
          'span.ng-option-label:has-text("Write .jrxml code inline")',
        )
        .sleep(Constants.DELAY_ONE_SECOND);

      // Each invoice PDF shows: product name, quantity, and unit price per line item
      const inlineJrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="invoice" pageWidth="595" pageHeight="842" columnWidth="555"
              leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
    <field name="InvoiceID" class="java.lang.Object"/>
    <field name="Customer" class="java.lang.Object"/>
    <field name="InvoiceDate" class="java.lang.Object"/>
    <field name="Product" class="java.lang.Object"/>
    <field name="Qty" class="java.lang.Object"/>
    <field name="UnitPrice" class="java.lang.Object"/>
    <columnHeader height="25">
        <element kind="staticText" x="0" y="0" width="250" height="25" mode="Opaque" backcolor="#E0E0E0" fontSize="9.0" bold="true" hTextAlign="Center" vTextAlign="Middle">
            <box><pen lineWidth="0.5"/></box>
            <text><![CDATA[Product]]></text>
        </element>
        <element kind="staticText" x="250" y="0" width="100" height="25" mode="Opaque" backcolor="#E0E0E0" fontSize="9.0" bold="true" hTextAlign="Center" vTextAlign="Middle">
            <box><pen lineWidth="0.5"/></box>
            <text><![CDATA[Qty]]></text>
        </element>
        <element kind="staticText" x="350" y="0" width="205" height="25" mode="Opaque" backcolor="#E0E0E0" fontSize="9.0" bold="true" hTextAlign="Center" vTextAlign="Middle">
            <box><pen lineWidth="0.5"/></box>
            <text><![CDATA[Unit Price]]></text>
        </element>
    </columnHeader>
    <detail>
        <band height="20">
            <element kind="textField" x="0" y="0" width="250" height="20" fontSize="8.0" vTextAlign="Middle">
                <box leftPadding="4"><pen lineWidth="0.25"/></box>
                <expression><![CDATA[$F{Product}]]></expression>
            </element>
            <element kind="textField" x="250" y="0" width="100" height="20" fontSize="8.0" hTextAlign="Center" vTextAlign="Middle">
                <box><pen lineWidth="0.25"/></box>
                <expression><![CDATA[$F{Qty}]]></expression>
            </element>
            <element kind="textField" x="350" y="0" width="205" height="20" fontSize="8.0" hTextAlign="Right" vTextAlign="Middle">
                <box rightPadding="4"><pen lineWidth="0.25"/></box>
                <expression><![CDATA[$F{UnitPrice}]]></expression>
            </element>
        </band>
    </detail>
</jasperReport>`;

      ft = ft
        .waitOnElementToBecomeVisible('#codeJarJrxmlTemplateEditor')
        .setCodeJarContentSingleShot('#codeJarJrxmlTemplateEditor', inlineJrxml)
        .sleep(Constants.DELAY_ONE_SECOND);

      // Generate — 3 invoices → 3 invoice PDFs (with 3, 2, and 1 line items)
      ft = ft
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          `span.ng-option-label:has-text("${TEST_NAME} (input Script File)")`,
        )
        .click(
          `span.ng-option-label:has-text("${TEST_NAME} (input Script File)")`,
        );

      ft = ft
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedNFilesHavingSuffix(3, '.pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      ft = ConfTemplatesTestHelper.deleteTemplate(ft, _.kebabCase(TEST_NAME));

      ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft,
        `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}\\.xml`,
        dbVendor,
      );

      return ft;
    },
  );

});

// ─── Helper: Create DB Connection (same pattern as reporting.spec.ts) ───

function createDbConnection(
  ft: FluentTester,
  testName: string,
  dbConnectionType: 'dbcon-no-schema' | 'dbcon-plain-schema-only' | 'dbcon-domaingrouped-schema' | 'dbcon-all-features' = 'dbcon-no-schema',
  dbVendor: string = 'sqlite',
  clearLogs: boolean = true,
): { ft: FluentTester; connectionName: string; dbConnectionType: string } {
  const connectionName = `${testName}-${dbVendor}-${dbConnectionType}`;

  ft = ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
    ft,
    connectionName,
    dbVendor,
  );

  if (dbConnectionType !== 'dbcon-no-schema') {
    ft = ft
      .clickAndSelectTableRow(`#db-${_.kebabCase(connectionName)}-${dbVendor}\\.xml`)
      .waitOnElementToBecomeEnabled('#btnEdit')
      .click('#btnEdit')
      .waitOnElementToBecomeEnabled('#btnTestDbConnection')
      .click('#btnTestDbConnection');

    if (clearLogs) {
      ft = ft
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#btnClearLogsDbConnection')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#btnTestDbConnection');
    }

    ft = ft
      .confirmDialogShouldBeVisible()
      .clickYesDoThis()
      .waitOnElementToBecomeDisabled('#btnTestDbConnection')
      .waitOnElementToHaveClass('#btnTestDbConnectionIcon', 'animate-spin')
      .waitOnElementNotToHaveClass('#btnTestDbConnectionIcon', 'animate-spin')
      .waitOnToastToBecomeVisible(
        'success',
        'Successfully connected to the database',
        Constants.DELAY_HUNDRED_SECONDS,
      )
      .click('#btnCloseDbConnectionModal')
      .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');
  }

  return { ft, connectionName, dbConnectionType };
}

