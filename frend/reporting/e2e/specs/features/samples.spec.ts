import * as path from 'path';
const slash = require('slash');

import { Page, test } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { SamplesTestHelper } from '../../helpers/samples-test-helper';
import { assertDashboardRendersCorrectly } from '../../helpers/dashboard-test-helper';
import { SelfServicePortalsTestHelper } from '../../helpers/areas/self-service-portals-test-helper';
import { Helpers } from '../../utils/helpers';

//DONE2
test.describe('', async () => {

  electronBeforeAfterAllTest(
    'should work correctly (01_monthly_payslips_split_only)',
    async ({ beforeAfterEach: firstPage }) => {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '.pdf';
        },
      );

      let ft = new FluentTester(firstPage);

      // First navigate to samples page and make the sample visible
      await ft
        .click('#leftMenuSamples')
        .waitOnElementToContainText(
          '#tdMONTHLY-PAYSLIPS-SPLIT-ONLY',
          'Monthly Payslips',
        );

      // Now verify the Learn More modal
      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'MONTHLY-PAYSLIPS-SPLIT-ONLY',
        //['config/samples/split-only/settings.xml'],
        'Payslips.pdf',
        'kyle.butford@northridgehealth.org.pdf',
      );

      // Continue with the test workflow
      await ft
        .click('#trMONTHLY-PAYSLIPS-SPLIT-ONLY')
        .click('#btnSampleTryItMONTHLY-PAYSLIPS-SPLIT-ONLY')
        .clickNoDontDoThis()
        .click('#btnSampleTryItMONTHLY-PAYSLIPS-SPLIT-ONLY')
        .clickYesDoThis()
        .click('#btnBurst')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_LOGS)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles)
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (02_excel_distinct_sheets_split_only)',
    async ({ beforeAfterEach: firstPage }) => {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = Constants.PAYSLIPS_XLS_BURST_TOKENS.map(
        function (burstToken) {
          return burstToken + '.xls';
        },
      );

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .waitOnElementToContainText(
          '#tdEXCEL-DISTINCT-SHEETS-SPLIT-ONLY',
          'Monthly Payslips Excel',
        );

      // Now verify the Learn More modal
      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'EXCEL-DISTINCT-SHEETS-SPLIT-ONLY',
        //['config/samples/split-only/settings.xml'],
        'Payslips-Distinct-Sheets.xls',
        'alfreda.waldback@northridgehealth.org.xls',
      );

      await ft
        .click('#trEXCEL-DISTINCT-SHEETS-SPLIT-ONLY')
        .click('#btnSamplesLearnModeEXCEL-DISTINCT-SHEETS-SPLIT-ONLY')
        .waitOnElementToContainText(
          '#divEXCEL-DISTINCT-SHEETS-SPLIT-ONLY',
          'When processing your actual reports',
        )
        .click('#btnCloseSamplesLearnMoreModal')
        .click('#btnSampleTryItEXCEL-DISTINCT-SHEETS-SPLIT-ONLY')
        .clickNoDontDoThis()
        .click('#btnSampleTryItEXCEL-DISTINCT-SHEETS-SPLIT-ONLY')
        .clickYesDoThis()
        .click('#btnBurst')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_LOGS)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles, 'xls')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (03_split_excel_file_by_distinct_column_values_split_only)',
    async ({ beforeAfterEach: firstPage }) => {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = [
        'Germany.xls',
        'USA.xls',
        'UK.xls',
        'Sweden.xls',
        'France.xls',
        'Spain.xls',
        'Canada.xls',
        'Argentina.xls',
        'Switzerland.xls',
        'Brazil.xls',
        'Austria.xls',
        'Italy.xls',
        'Portugal.xls',
        'Mexico.xls',
        'Venezuela.xls',
        'Ireland.xls',
        'Belgium.xls',
        'Norway.xls',
        'Denmark.xls',
        'Finland.xls',
        'Poland.xls',
      ];

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .waitOnElementToContainText(
          '#tdEXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY',
          'Customer List/Country Excel',
        );

      // Now verify the Learn More modal
      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'EXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY',
        //['config/samples/split-only/settings.xml'],
        'Customers-Distinct-Column-Values.xls',
        'Canada.xls',
      );

      await ft
        .click('#trEXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY')
        .click('#btnSamplesLearnModeEXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY')
        .waitOnElementToContainText(
          '#divEXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY',
          'When processing your actual reports',
        )
        .click('#btnCloseSamplesLearnMoreModal')
        .click('#btnSampleTryItEXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY')
        .clickNoDontDoThis()
        .click('#btnSampleTryItEXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY')
        .clickYesDoThis()
        .click('#btnBurst')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles, 'xls')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (04_invoices_split_once_more_split_only)',
    async ({ beforeAfterEach: firstPage }) => {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = [
        '10.pdf',
        '9.pdf',
        '8.pdf',
        '7.pdf',
        '6.pdf',
        '5.pdf',
        '4.pdf',
        '3.pdf',
        '2.pdf',
        'accounting@alphainsurance.biz.pdf',
        'accounting@betainsurance.biz.pdf',
        'accounting@gammahealth.biz.pdf',
      ];

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trINVOICES-SPLIT-ONCE-MORE-SPLIT-ONLY')
        .waitOnElementToContainText(
          '#tdINVOICES-SPLIT-ONCE-MORE-SPLIT-ONLY',
          'Customers with Multiple Invoices',
        )
        .click('#trINVOICES-SPLIT-ONCE-MORE-SPLIT-ONLY');

      // Now verify the Learn More modal
      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'INVOICES-SPLIT-ONCE-MORE-SPLIT-ONLY',
        //['config/samples/split-only/settings.xml'],
        'Split2Times.pdf',
        '6.pdf',
      );

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trINVOICES-SPLIT-ONCE-MORE-SPLIT-ONLY')
        .waitOnElementToContainText(
          '#tdINVOICES-SPLIT-ONCE-MORE-SPLIT-ONLY',
          'Customers with Multiple Invoices',
        )
        .click('#trINVOICES-SPLIT-ONCE-MORE-SPLIT-ONLY')
        .click('#btnSampleTryItINVOICES-SPLIT-ONCE-MORE-SPLIT-ONLY')
        .clickNoDontDoThis()
        .click('#btnSampleTryItINVOICES-SPLIT-ONCE-MORE-SPLIT-ONLY')
        .clickYesDoThis()
        .click('#btnBurst')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles)
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (05_invoices_merge_then_split_only)',
    async ({ beforeAfterEach: firstPage }) => {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = [
        '0011.pdf',
        '0012.pdf',
        '0013.pdf',
        '0014.pdf',
        '0015.pdf',
        '0016.pdf',
        '0017.pdf',
        '0018.pdf',
        '0019.pdf',
        'merged.pdf',
      ];

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trINVOICES-MERGE-THEN-SPLIT')
        .waitOnElementToContainText('#tdINVOICES-MERGE-THEN-SPLIT', 'Merge and')
        .click('#trINVOICES-MERGE-THEN-SPLIT');

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'INVOICES-MERGE-THEN-SPLIT',
        //['config/samples/split-only/settings.xml'],
        'Invoices-Nov.pdf',
        '0018.pdf customer invoice',
      );

      await ft
        .scrollIntoViewIfNeeded('#trINVOICES-MERGE-THEN-SPLIT')
        .waitOnElementToContainText('#tdINVOICES-MERGE-THEN-SPLIT', 'Merge and')
        .click('#trINVOICES-MERGE-THEN-SPLIT')
        .click('#btnSampleTryItINVOICES-MERGE-THEN-SPLIT')
        .clickNoDontDoThis()
        .click('#btnSampleTryItINVOICES-MERGE-THEN-SPLIT')
        .clickYesDoThis()
        .click('#btnRun')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles)
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (06_generate_payslips_docx)',
    async ({ beforeAfterEach: firstPage }) => {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-PAYSLIPS-DOCX')
        .waitOnElementToContainText(
          '#tdGENERATE-PAYSLIPS-DOCX',
          'Generate Monthly Payslips (csv2docx)',
        )
        .click('#trGENERATE-PAYSLIPS-DOCX');

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-PAYSLIPS-DOCX',
        //['config/samples/split-only/settings.xml'],
        'Payslips.csv',
        'kyle.butford@northridgehealth.org.docx employee payslip',
        'payslips-template.docx',
      );

      await ft
        .scrollIntoViewIfNeeded('#trGENERATE-PAYSLIPS-DOCX')
        .waitOnElementToContainText(
          '#tdGENERATE-PAYSLIPS-DOCX',
          'Generate Monthly Payslips (csv2docx)',
        )
        .click('#trGENERATE-PAYSLIPS-DOCX')
        .click('#btnSampleTryItGENERATE-PAYSLIPS-DOCX')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-PAYSLIPS-DOCX')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(
          ['0.docx', '1.docx', '2.docx'],
          'docx',
        )
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (07_generate_payslips_html)',
    async ({ beforeAfterEach: firstPage }) => {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-PAYSLIPS-HTML')
        .waitOnElementToContainText(
          '#tdGENERATE-PAYSLIPS-HTML',
          'Generate Monthly Payslips (csv2html)',
        )
        .click('#trGENERATE-PAYSLIPS-HTML');

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-PAYSLIPS-HTML',
        //['config/samples/split-only/settings.xml'],
        'Payslips.csv',
        'kyle.butford@northridgehealth.org.html employee payslip',
        undefined,
        'class="company-info"',
      );

      await ft
        .scrollIntoViewIfNeeded('#trGENERATE-PAYSLIPS-HTML')
        .waitOnElementToContainText(
          '#tdGENERATE-PAYSLIPS-HTML',
          'Generate Monthly Payslips (csv2html)',
        )
        .click('#trGENERATE-PAYSLIPS-HTML')
        .click('#btnSampleTryItGENERATE-PAYSLIPS-HTML')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-PAYSLIPS-HTML')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(
          ['0.html', '1.html', '2.html'],
          'html',
        )
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (08_generate_payslips_pdf)',
    async ({ beforeAfterEach: firstPage }) => {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-PAYSLIPS-PDF')
        .waitOnElementToContainText(
          '#tdGENERATE-PAYSLIPS-PDF',
          'Generate Monthly Payslips (csv2pdf)',
        );

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-PAYSLIPS-PDF',
        //['config/samples/split-only/settings.xml'],
        'Payslips.csv',
        'kyle.butford@northridgehealth.org.pdf employee payslip',
        undefined,
        'class="company-info"',
      );

      await ft
        .scrollIntoViewIfNeeded('#trGENERATE-PAYSLIPS-PDF')
        .waitOnElementToContainText(
          '#tdGENERATE-PAYSLIPS-PDF',
          'Generate Monthly Payslips (csv2pdf)',
        )
        .click('#btnSampleTryItGENERATE-PAYSLIPS-PDF')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-PAYSLIPS-PDF')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(
          ['0.pdf', '1.pdf', '2.pdf'],
          'pdf',
        )
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (09_generate_payslips_excel)',
    async ({ beforeAfterEach: firstPage }) => {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-PAYSLIPS-EXCEL')
        .waitOnElementToContainText(
          '#tdGENERATE-PAYSLIPS-EXCEL',
          'Generate Monthly Payslips (csv2xlsx)',
        )
        .click('#trGENERATE-PAYSLIPS-EXCEL');

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-PAYSLIPS-EXCEL',
        //['config/samples/split-only/settings.xml'],
        'Payslips.csv',
        'kyle.butford@northridgehealth.org.xlsx employee payslip',
        undefined,
        'data-text-cell',
      );

      await ft
        .scrollIntoViewIfNeeded('#trGENERATE-PAYSLIPS-EXCEL')
        .waitOnElementToContainText(
          '#tdGENERATE-PAYSLIPS-EXCEL',
          'Generate Monthly Payslips (csv2xlsx)',
        )
        .click('#trGENERATE-PAYSLIPS-EXCEL')
        .click('#btnSampleTryItGENERATE-PAYSLIPS-EXCEL')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-PAYSLIPS-EXCEL')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(
          ['0.xlsx', '1.xlsx', '2.xlsx'],
          'xlsx',
        )
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (10_generate_xlsx_from_xlsx_ds)',
    async ({ beforeAfterEach: firstPage }) => {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-PAYSLIPS-EXCEL-XLSX-DS')
        .waitOnElementToContainText(
          '#tdGENERATE-PAYSLIPS-EXCEL-XLSX-DS',
          'Generate Monthly Payslips (xlsx2xlsx)',
        )
        .click('#trGENERATE-PAYSLIPS-EXCEL-XLSX-DS');

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-PAYSLIPS-EXCEL-XLSX-DS',
        //['config/samples/split-only/settings.xml'],
        'Payslips.xlsx',
        'kyle.butford@northridgehealth.org.xlsx employee payslip',
        undefined,
        'data-text-cell',
      );

      await ft
        .scrollIntoViewIfNeeded('#trGENERATE-PAYSLIPS-EXCEL-XLSX-DS')
        .waitOnElementToContainText(
          '#tdGENERATE-PAYSLIPS-EXCEL-XLSX-DS',
          'Generate Monthly Payslips (xlsx2xlsx)',
        )
        .click('#trGENERATE-PAYSLIPS-EXCEL-XLSX-DS')
        .click('#btnSampleTryItGENERATE-PAYSLIPS-EXCEL-XLSX-DS')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-PAYSLIPS-EXCEL-XLSX-DS')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(
          ['0.xlsx', '1.xlsx', '2.xlsx'],
          'xlsx',
        )
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );
  
  electronBeforeAfterAllTest(
    'should work correctly (11_generate_student_profiles_sql2foppdf)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = ['Andrew-Fuller.pdf', 'Janet-Leverling.pdf', 'Nancy-Davolio.pdf'];

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-STUDENT-PROFILES-SQL2PDF')
        .waitOnElementToContainText(
          '#tdGENERATE-STUDENT-PROFILES-SQL2PDF',
          'Student Profiles',
        );

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-STUDENT-PROFILES-SQL2PDF',
        'northwind.db',
        'Andrew-Fuller.pdf',
        '',
        'fo:layout-master-set',
      );

      await ft
        .click('#trGENERATE-STUDENT-PROFILES-SQL2PDF')
        .click('#btnSampleTryItGENERATE-STUDENT-PROFILES-SQL2PDF')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-STUDENT-PROFILES-SQL2PDF')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles, 'pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (12_generate_customer_statements_sql2html)',
    async ({ beforeAfterEach: firstPage }) => {
      // long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = [
        'ALFKI.html',
        'ANATR.html',
        'ANTON.html',
        'AROUT.html',
        'BERGS.html',
        'BLAUS.html',
        'BONAP.html',
        'CACTU.html',
        'DRACD.html',
        'DUMON.html',
        'ERNSH.html',
        'FOLKO.html',
        'FRANK.html',
        'GREAL.html',
        'HILAA.html',
        'ISLAT.html',
        'KOENE.html',
        'LEHMS.html',
        'LILAS.html',
        'MAGAA.html',
        'MORGK.html',
        'OTTIK.html',
        'QUICK.html',
        'TOMSP.html',
        'WANDK.html',
      ];

      let ft = new FluentTester(firstPage);

      // Navigate to samples and locate the new sample
      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-CUSTOMER-STATEMENTS-SQL2HTML')
        .waitOnElementToContainText(
          '#tdGENERATE-CUSTOMER-STATEMENTS-SQL2HTML',
          'Customer Statements',
        );

      // Verify Learn More modal content briefly (title + example file)
      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-CUSTOMER-STATEMENTS-SQL2HTML',
        'northwind.db',
        'ALFKI.html',
        '',
        'Total Freight',
      );

      // Run the sample "Try It" -> Generate
      await ft
        .click('#trGENERATE-CUSTOMER-STATEMENTS-SQL2HTML')
        .click('#btnSampleTryItGENERATE-CUSTOMER-STATEMENTS-SQL2HTML')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-CUSTOMER-STATEMENTS-SQL2HTML')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles, 'html')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (13_generate_customer_sales_summary_sql2xlsx)',
    async ({ beforeAfterEach: firstPage }) => {
      // long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = ['CustomerSalesSummary.xlsx'];

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-CUSTOMER-SALES-SUMMARY-SQL2XLSX')
        .waitOnElementToContainText(
          '#tdGENERATE-CUSTOMER-SALES-SUMMARY-SQL2XLSX',
          'Customer Sales Summary',
        );

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-CUSTOMER-SALES-SUMMARY-SQL2XLSX',
        'northwind.db',
        'CustomerSalesSummary.xlsx',
        '',
        'Top customers by sales'
      );

      await ft
        .click('#trGENERATE-CUSTOMER-SALES-SUMMARY-SQL2XLSX')
        .click('#btnSampleTryItGENERATE-CUSTOMER-SALES-SUMMARY-SQL2XLSX')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-CUSTOMER-SALES-SUMMARY-SQL2XLSX')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles, 'xlsx')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (14_generate_customer_invoices_master_detail_sql2html)',
    async ({ beforeAfterEach: firstPage }) => {
      // long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = [
        'invoice_1.html',
        'invoice_2.html',
        'invoice_4.html',
        'invoice_5.html',
        'invoice_8.html',
        'invoice_9.html',
        'invoice_33.html',
        'invoice_34.html',
        'invoice_58.html',
        'invoice_59.html',
      ];

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-CUSTOMER-INVOICES-MASTER-DETAILS-SCRIPT2HTML')
        .waitOnElementToContainText(
          '#tdGENERATE-CUSTOMER-INVOICES-MASTER-DETAILS-SCRIPT2HTML',
          'Customer Invoices',
        );

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-CUSTOMER-INVOICES-MASTER-DETAILS-SCRIPT2HTML',
        'northwind.db',
        'invoice_4.html',
        '',
        'Line Total',
      );

      await ft
        .click('#trGENERATE-CUSTOMER-INVOICES-MASTER-DETAILS-SCRIPT2HTML')
        .click('#btnSampleTryItGENERATE-CUSTOMER-INVOICES-MASTER-DETAILS-SCRIPT2HTML')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-CUSTOMER-INVOICES-MASTER-DETAILS-SCRIPT2HTML')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles, 'html')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );


  electronBeforeAfterAllTest(
    'should work correctly (15_generate_category_region_crosstab_script2html)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = ['CategoryRegionCrosstab.html'];

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-CATEGORY-REGION-CROSSTAB-SCRIPT2HTML')
        .waitOnElementToContainText(
          '#tdGENERATE-CATEGORY-REGION-CROSSTAB-SCRIPT2HTML',
          'Category-Region Crosstab',
        );

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-CATEGORY-REGION-CROSSTAB-SCRIPT2HTML',
        'northwind.db',
        'CategoryRegionCrosstab.html',
        '',
        'Category Sales by Region'
      );

      await ft
        .click('#trGENERATE-CATEGORY-REGION-CROSSTAB-SCRIPT2HTML')
        .click('#btnSampleTryItGENERATE-CATEGORY-REGION-CROSSTAB-SCRIPT2HTML')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-CATEGORY-REGION-CROSSTAB-SCRIPT2HTML')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles, 'html')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (16_generate_monthly_sales_trend_script2html)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = ['MonthlySalesTrend.html'];

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-MONTHLY-SALES-TREND-SCRIPT2HTML')
        .waitOnElementToContainText(
          '#tdGENERATE-MONTHLY-SALES-TREND-SCRIPT2HTML',
          'Monthly Sales Trend',
        );

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-MONTHLY-SALES-TREND-SCRIPT2HTML',
        'northwind.db',
        'MonthlySalesTrend.html',
        '',
        'Monthly Sales Trend',
      );

      await ft
        .click('#trGENERATE-MONTHLY-SALES-TREND-SCRIPT2HTML')
        .click('#btnSampleTryItGENERATE-MONTHLY-SALES-TREND-SCRIPT2HTML')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-MONTHLY-SALES-TREND-SCRIPT2HTML')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles, 'html')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

electronBeforeAfterAllTest(
    'should work correctly (17_generate_supplier_scorecards_script2html)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = [
        'supplier_1_scorecard.html',
        'supplier_2_scorecard.html',
        'supplier_3_scorecard.html',
        'supplier_4_scorecard.html',
        'supplier_5_scorecard.html',
        'supplier_6_scorecard.html',
      ];

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trGENERATE-SUPPLIER-SCORECARDS-SCRIPT2HTML')
        .waitOnElementToContainText(
          '#tdGENERATE-SUPPLIER-SCORECARDS-SCRIPT2HTML',
          'Supplier Scorecards',
        );

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-SUPPLIER-SCORECARDS-SCRIPT2HTML',
        'northwind.db',
        'supplier_1_scorecard.html',
        '',
        'Supplier Scorecard',
      );

      await ft
        .click('#trGENERATE-SUPPLIER-SCORECARDS-SCRIPT2HTML')
        .click('#btnSampleTryItGENERATE-SUPPLIER-SCORECARDS-SCRIPT2HTML')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-SUPPLIER-SCORECARDS-SCRIPT2HTML')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#qaReminderLink')
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles, 'html')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (18_northwind_sales_dashboard)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trNORTHWIND-SALES-DASHBOARD')
        .waitOnElementToContainText(
          '#tdNORTHWIND-SALES-DASHBOARD',
          'Sales Dashboard',
        );

      // Verify the Learn More modal
      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'NORTHWIND-SALES-DASHBOARD',
        'northwind.db',
      );

      // Dashboard "Try It" opens directly in the browser (no burst/generate flow).
      // Open external browser and assert dashboard renders correctly.
      let externalBrowser = null;

      await ft
        .scrollIntoViewIfNeeded('#trNORTHWIND-SALES-DASHBOARD')
        .click('#trNORTHWIND-SALES-DASHBOARD')
        .click('#btnSampleTryItNORTHWIND-SALES-DASHBOARD');

      try {
        const { browser, context, page } = await SelfServicePortalsTestHelper.createExternalBrowser();
        externalBrowser = browser;

        // A dashboard page is a report a signed-in user opens. This browser is brand new, so on a
        // Server it carries no session and SignInRedirectEntryPoint would send it to /#/login —
        // the Angular shell would load instead of the dashboard. Sign it in the way every other
        // external-browser test does; on a desktop installation the local caller is already an
        // administrator and this returns without doing anything.
        await Helpers.signInBrowserContext(context);

        const dashboardUrl = 'http://localhost:9090/dashboard/g-dashboard';

        await SelfServicePortalsTestHelper.waitForServerReady(
          page,
          dashboardUrl,
          30,
          2000,
        );

        await page.goto(dashboardUrl, {
          timeout: 30000,
          waitUntil: 'networkidle',
        });

        // Assert rb-dashboard web component is present
        const { expect } = await import('@playwright/test');
        await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 10000 });

        // Run shared dashboard assertions — default "-- All --" (unfiltered)
        await assertDashboardRendersCorrectly(page, 'g-dashboard');

        // Exercise the country parameter filter — select "Germany"
        await page.selectOption('#country', 'Germany');
        await page.click('#btnReloadDashboard');
        await expect(page.locator('#btnConfirmReload')).toBeVisible({ timeout: 5000 });
        await page.click('#btnConfirmReload');
        await page.waitForTimeout(5000);

        // Assert Germany-filtered data across all components
        await assertDashboardRendersCorrectly(page, 'g-dashboard', 'Germany');
      } finally {
        if (externalBrowser) {
          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
        }
      }
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (19_northwind_sales_pivottable)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trNORTHWIND-SALES-PIVOTTABLE')
        .waitOnElementToContainText(
          '#tdNORTHWIND-SALES-PIVOTTABLE',
          'Sales PivotTable',
        );

      // Verify the Learn More modal
      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'NORTHWIND-SALES-PIVOTTABLE',
        'northwind.duckdb',
      );

      // Dashboard "Try It" opens directly in the browser
      let externalBrowser = null;

      await ft
        .scrollIntoViewIfNeeded('#trNORTHWIND-SALES-PIVOTTABLE')
        .click('#trNORTHWIND-SALES-PIVOTTABLE')
        .click('#btnSampleTryItNORTHWIND-SALES-PIVOTTABLE');

      try {
        const { browser, context, page } = await SelfServicePortalsTestHelper.createExternalBrowser();
        externalBrowser = browser;

        // A dashboard page is a report a signed-in user opens. This browser is brand new, so on a
        // Server it carries no session and SignInRedirectEntryPoint would send it to /#/login —
        // the Angular shell would load instead of the dashboard. Sign it in the way every other
        // external-browser test does; on a desktop installation the local caller is already an
        // administrator and this returns without doing anything.
        await Helpers.signInBrowserContext(context);

        const dashboardUrl = 'http://localhost:9090/dashboard/g-pivottable';

        await SelfServicePortalsTestHelper.waitForServerReady(
          page,
          dashboardUrl,
          30,
          2000,
        );

        await page.goto(dashboardUrl, {
          timeout: 30000,
          waitUntil: 'networkidle',
        });

        const { expect } = await import('@playwright/test');

        // Assert rb-dashboard web component is present
        await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 10000 });

        // Assert pivot table header and component are visible
        await expect(page.locator('text=Northwind Sales PivotTable')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('rb-pivot-table')).toHaveCount(1, { timeout: 15000 });
      } finally {
        if (externalBrowser) {
          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
        }
      }
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (20_generate_adhoc_employee_profile_script2pdf)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      const expectedOutputFiles = ['E001-John-Doe.pdf'];

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded(
          '#trGENERATE-ADHOC-EMPLOYEE-PROFILE-SCRIPT2PDF',
        )
        .waitOnElementToContainText(
          '#tdGENERATE-ADHOC-EMPLOYEE-PROFILE-SCRIPT2PDF',
          'Ad-hoc Employee Profile',
        );

      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'GENERATE-ADHOC-EMPLOYEE-PROFILE-SCRIPT2PDF',
        'Adhoc (user provided data)',
        'E001-John-Doe.pdf',
        '',
        'fo:layout-master-set',
      );

      await ft
        .click('#trGENERATE-ADHOC-EMPLOYEE-PROFILE-SCRIPT2PDF')
        .click('#btnSampleTryItGENERATE-ADHOC-EMPLOYEE-PROFILE-SCRIPT2PDF')
        .clickNoDontDoThis()
        .click('#btnSampleTryItGENERATE-ADHOC-EMPLOYEE-PROFILE-SCRIPT2PDF')
        .clickYesDoThis()
        .waitOnElementToBecomeEnabled('#btnGenerateReports')
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles, 'pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

});
