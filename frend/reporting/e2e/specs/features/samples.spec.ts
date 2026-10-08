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
import {
  CUBE_STORIES_PAGE_CARDS,
  cardOf,
  checksOf,
  difference,
  drawnRows,
  openCardsPanel,
  waitForCard,
} from '../../helpers/cube-stories-test-helper';
import {
  DEMOS,
  GALLERY_REPORT_ID,
} from '../../helpers/dashboard-demos/demo-catalog';
import {
  assertDemoDashboard,
  scrollCardIntoView,
  watchForErrors,
} from '../../helpers/dashboard-demos/published-dashboard-checks';
import { assertStoriesAreOffered } from '../../helpers/dashboard-demos-test-helper';

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

        // Assert pivot table header and component are visible. The heading says what the page
        // is for rather than naming the data behind it (D2).
        await expect(page.locator('.dash-title')).toHaveText('Sales Explorer', { timeout: 30000 });
        await expect(page.locator('.dash-subtitle'))
          .toContainText('Ask your own question of the sales', { timeout: 10000 });
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

  electronBeforeAfterAllTest(
    'should work correctly (21_cube_stories)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trCUBE-STORIES')
        .waitOnElementToContainText('#tdCUBE-STORIES', 'Cube Stories');

      // Verify the Learn More modal
      ft = SamplesTestHelper.verifyLearnMoreModal(ft, 'CUBE-STORIES', 'northwind.db');

      // A dashboard sample's "Try It" opens the page in the browser, as sample 19 does.
      let externalBrowser = null;

      await ft
        .scrollIntoViewIfNeeded('#trCUBE-STORIES')
        .click('#trCUBE-STORIES')
        .click('#btnSampleTryItCUBE-STORIES');

      try {
        const { browser, context, page } = await SelfServicePortalsTestHelper.createExternalBrowser();
        externalBrowser = browser;

        // A brand new browser carries no session; on a Server the dashboard would otherwise be
        // the login page. On a desktop installation this returns without doing anything.
        await Helpers.signInBrowserContext(context);

        const dashboardUrl = 'http://localhost:9090/dashboard/g-cube-stories';

        await SelfServicePortalsTestHelper.waitForServerReady(page, dashboardUrl, 30, 2000);

        await page.goto(dashboardUrl, { timeout: 30000, waitUntil: 'networkidle' });

        const { expect } = await import('@playwright/test');
        const frame = page.mainFrame();

        // The sample is the page: every cube DataPallas ships, each card with the questions its
        // cube was written to answer.
        await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 10000 });
        // Its own title already says what the page is for, and stays as it is (D2).
        await expect(page.locator('.dash-title')).toHaveText('Cube Stories', { timeout: 30000 });
        await expect(page.locator('.dash-subtitle')).toContainText('tick a field', { timeout: 10000 });
        await expect(frame.locator('.rb-cube-stories-root .card'))
          .toHaveCount(CUBE_STORIES_PAGE_CARDS.length, { timeout: 60000 });
        for (const cubeId of CUBE_STORIES_PAGE_CARDS) {
          // A card in a closed industry panel is not visible; open its panel the way a reader does.
          await openCardsPanel(frame, cubeId);
          await expect(frame.locator(`#cube-${cubeId} #cubeHints .rb-hint`).first())
            .toBeVisible({ timeout: 60000 });
        }

        // And it is live: the Deals card answers its own first question with the rows the vendor
        // loop checks that cube's SQL against. That check counts every deal and adds up what they
        // are worth, so it is the same on any day the demo data was seeded.
        const deals = cardOf('sales-pipeline');
        await waitForCard(frame, deals.id, 60000);
        const dealsAndValue = checksOf(deals.id).get('deals-and-value');
        expect(dealsAndValue, 'the Deals cube has a check for its first hint').toBeTruthy();
        const wrong = difference(dealsAndValue.rows, await drawnRows(frame, deals.id), false);
        expect(wrong, `the Deals card: ${wrong ?? ''}`).toBeNull();

        // ── D10: the dashboard is the same product as the application that published it ──
        // The owner met this defect as two screenshots side by side: the application in its dark
        // theme, and the dashboard it had just published in light colours. So the assertion is the
        // two pages together - whatever theme the application is on, the dashboard opens on it.
        const appTheme = await firstPage.locator('html').getAttribute('data-theme');
        expect(appTheme, 'the application is on a theme of its own').toBeTruthy();
        await expect(page.locator('html'), 'and the dashboard it published is on the same one')
          .toHaveAttribute('data-theme', appTheme as string);

        // The palettes that theme name refers to are served next to the bundle, from the same
        // daisyUI the application compiles its own themes with.
        await expect(page.locator('link[href="/rb-webcomponents/themes.css"]'),
          'the page links the theme palettes').toHaveCount(1);
        const palettes = await page.request.get('http://localhost:9090/rb-webcomponents/themes.css');
        expect(palettes.ok(), 'and they are really served').toBe(true);
        // The served file is minified: its attribute selector may or may not keep the quotes.
        expect(await palettes.text(), 'including the theme this application is on')
          .toMatch(new RegExp(`\\[data-theme="?${appTheme}"?\\]`));

        // And the colours follow: the page's own background is the theme's, not the light one this
        // template used to carry. The probe asks the browser what the variable resolves to here,
        // so the test says nothing about any single theme's colours.
        const [background, base200, oldLightDefault] = await page.evaluate(() => {
          const probe = document.createElement('div');
          probe.style.background = 'var(--color-base-200)';
          document.body.appendChild(probe);
          const resolved = getComputedStyle(probe).backgroundColor;
          probe.style.background = 'rgb(248, 250, 252)';
          const light = getComputedStyle(probe).backgroundColor;
          const root = getComputedStyle(document.querySelector('.rb-cube-stories-root')!).backgroundColor;
          probe.remove();
          return [root, resolved, light];
        });
        expect(background, "the dashboard's background is the theme's").toBe(base200);
        expect(background, 'and never the light one the template used to hard-code')
          .not.toBe(oldLightDefault);

        // The other half of the same change: a component embedded on somebody else's site has no
        // theme and no palettes, and must look exactly as it did. That is what every fallback in
        // the bundle is for, so none of them may be missing.
        const bundle = await page.request.get(
          'http://localhost:9090/rb-webcomponents/rb-webcomponents.umd.js');
        expect(bundle.ok(), 'the bundle is served').toBe(true);
        const noFallback = (await bundle.text()).match(/var\(--color-[a-z0-9-]+\)/g) ?? [];
        expect(noFallback, 'every theme variable in the bundle carries the old colour as a fallback')
          .toEqual([]);
      } finally {
        if (externalBrowser) {
          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
        }
      }
    },
  );

  electronBeforeAfterAllTest(
    'should work correctly (22_cube_country_sales_dashboard)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trCUBE-COUNTRY-SALES-DASHBOARD')
        .waitOnElementToContainText(
          '#tdCUBE-COUNTRY-SALES-DASHBOARD',
          'Country Sales Dashboard',
        );

      // Verify the Learn More modal
      ft = SamplesTestHelper.verifyLearnMoreModal(
        ft,
        'CUBE-COUNTRY-SALES-DASHBOARD',
        'northwind.duckdb',
      );

      // A dashboard sample's "Try It" opens the page in the browser, as sample 18 does.
      let externalBrowser = null;

      await ft
        .scrollIntoViewIfNeeded('#trCUBE-COUNTRY-SALES-DASHBOARD')
        .click('#trCUBE-COUNTRY-SALES-DASHBOARD')
        .click('#btnSampleTryItCUBE-COUNTRY-SALES-DASHBOARD');

      try {
        const { browser, context, page } = await SelfServicePortalsTestHelper.createExternalBrowser();
        externalBrowser = browser;

        // A brand new browser carries no session; on a Server the dashboard would otherwise be
        // the login page. On a desktop installation this returns without doing anything.
        await Helpers.signInBrowserContext(context);

        const dashboardUrl = 'http://localhost:9090/dashboard/g-cube-country-sales';

        await SelfServicePortalsTestHelper.waitForServerReady(page, dashboardUrl, 30, 2000);

        await page.goto(dashboardUrl, { timeout: 30000, waitUntil: 'networkidle' });

        const { expect } = await import('@playwright/test');

        // The page the story describes: two numbers, one chart, one table, and one country
        // parameter above them all.
        await expect(page.locator('rb-dashboard')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('rb-value')).toHaveCount(2, { timeout: 15000 });
        await expect(page.locator('rb-chart')).toHaveCount(1, { timeout: 15000 });
        // The live shop cube beside them draws its answer with a tabulator of its own, so the
        // page's one table is the tile that is bound to the categories.
        await expect(page.locator('rb-tabulator[component-id="tabulator_net-category"]'))
          .toHaveCount(1, { timeout: 15000 });
        await expect(page.locator('rb-parameters')).toHaveCount(1, { timeout: 15000 });

        // The page opens with what it is: a reader who arrives by a share link has no sample
        // list around them to tell them (D2). The page is published from its canvas, which puts
        // the parameter bar above the grid, so the title is the first thing in the grid: above
        // every tile that answers.
        await expect(page.locator('.text-block h1')).toHaveText('Country Sales', { timeout: 15000 });
        await expect(page.locator('.text-block p'))
          .toContainText('What the country you picked sold', { timeout: 10000 });
        const titleAboveTiles = await page.evaluate(() => {
          const title = document.querySelector('.text-block h1');
          const tiles = Array.from(document.querySelectorAll('rb-value, rb-chart, rb-tabulator, rb-cube-renderer'));
          if (!title || tiles.length === 0) return false;
          return tiles.every((tile) => title.getBoundingClientRect().bottom <= tile.getBoundingClientRect().top);
        });
        expect(titleAboveTiles, 'the title is above every tile').toBe(true);

        // And the chart draws something: the published chart config carries a dataset on a
        // column the tile's own SQL returns, and its title where Chart.js reads it. Shipped as
        // it was, it had no dataset at all and the four channel names stood on an empty axis
        // (D3).
        const chart = await page.evaluate(async () => {
          const resp = await fetch('/api/reports/g-cube-country-sales/config');
          const config = await resp.json();
          return config.namedChartOptions?.['chart_channel_channel'] ?? null;
        });
        expect(chart, 'the dashboard publishes a chart config for the channels').toBeTruthy();
        expect(chart.labelField, 'the bars are labelled by the channel').toBe('Channel');
        expect(
          (chart.datasets ?? []).map((dataset: Record<string, unknown>) => dataset.field),
          'and one dataset plots the orders',
        ).toEqual(['Orders']);
        expect(chart.options?.plugins?.title?.text, 'the chart own title')
          .toBe('Orders by Channel');
        // And it is drawn: the chart component really put a canvas on the page.
        const drawn = await page.evaluate(() => {
          const host = document.querySelector('rb-chart') as HTMLElement & { shadowRoot?: ShadowRoot };
          const canvas = host?.shadowRoot?.querySelector('canvas') ?? host?.querySelector('canvas');
          return canvas ? 1 : 0;
        });
        expect(drawn, 'the chart is drawn at all').toBe(1);

        // Every tile is bound to the same parameter, so asking the data API for a tile with and
        // without a country is asking the story's two questions.
        const ask = async (componentId: string, country?: string) =>
          page.evaluate(async ({ cid, c }) => {
            const q = c ? `&country=${encodeURIComponent(c)}` : '';
            const resp = await fetch(`/api/reports/g-cube-country-sales/data?componentId=${cid}${q}`);
            return resp.json();
          }, { cid: componentId, c: country });

        // ── The whole shop ──
        const allNet = await ask('number_netsales_net');
        expect(Number(allNet.data[0].NetSales), 'the shop, in money').toBeCloseTo(3571889.64, 1);
        const allUnits = await ask('number_units_units');
        expect(Number(allUnits.data[0].Units), 'the shop, in units').toBe(14438);

        const allByChannel = new Map<string, number>(
          (await ask('chart_channel_channel')).data.map(
            (row: Record<string, unknown>) => [String(row.Channel), Number(row.Orders)],
          ),
        );
        expect(allByChannel.get('Web'), "the shop's Web orders").toBe(1141);
        expect(allByChannel.get('Mobile App'), "the shop's Mobile App orders").toBe(683);
        expect(allByChannel.get('Marketplace'), "the shop's Marketplace orders").toBe(390);
        expect(allByChannel.get('Phone'), "the shop's Phone orders").toBe(182);

        // ── One country ──
        const germanyNet = await ask('number_netsales_net', 'Germany');
        expect(Number(germanyNet.data[0].NetSales), "Germany, in money").toBeCloseTo(859422.88, 1);
        const germanyUnits = await ask('number_units_units', 'Germany');
        expect(Number(germanyUnits.data[0].Units), 'Germany, in units').toBe(3508);

        const germanyByChannel = new Map<string, number>(
          (await ask('chart_channel_channel', 'Germany')).data.map(
            (row: Record<string, unknown>) => [String(row.Channel), Number(row.Orders)],
          ),
        );
        expect(germanyByChannel.get('Web'), "Germany's Web orders").toBe(295);
        expect(germanyByChannel.get('Mobile App'), "Germany's Mobile App orders").toBe(164);
        expect(germanyByChannel.get('Marketplace'), "Germany's Marketplace orders").toBe(94);
        expect(germanyByChannel.get('Phone'), "Germany's Phone orders").toBe(43);

        // The table is the same answer, category by category, and it adds up to the number above
        // it — Germany's total, not the shop's.
        const germanyRows = (await ask('tabulator_net-category', 'Germany')).data as Record<string, unknown>[];
        expect(germanyRows.length, "Germany's categories").toBe(8);
        const germanyByCategory = new Map<string, number>(
          germanyRows.map((row) => [String(row.Category), Number(row.NetSales)]),
        );
        expect(germanyByCategory.get('Displays'), "Germany's Displays").toBeCloseTo(261897.29, 1);
        expect(germanyByCategory.get('Video'), "Germany's Video").toBeCloseTo(204407.62, 1);
        expect(germanyByCategory.get('Cables & Power'), "Germany's Cables & Power").toBeCloseTo(12210.33, 1);
        expect(
          germanyRows.reduce((sum, row) => sum + Number(row.NetSales), 0),
          "the categories add up to Germany",
        ).toBeCloseTo(859422.88, 1);

        // The negative half: a bound tile is not an unbound one. If the binding were dropped, the
        // country would change nothing and these two answers would be the same number.
        expect(
          Number(germanyNet.data[0].NetSales),
          'the country is what the tile asks about',
        ).not.toBeCloseTo(Number(allNet.data[0].NetSales), 1);
        expect(
          Number(germanyNet.data[0].NetSales) < Number(allNet.data[0].NetSales),
          'and one country is less than every country',
        ).toBe(true);

        // What the live cube is asked from here on, and what it answered, is kept for the check on
        // its rows below.
        const liveCubeAsks: Array<{ url: string; headers: Record<string, string>; body: any; answer: any }> = [];
        page.on('response', async (response) => {
          const asked = response.request();
          if (asked.method() !== 'POST' || !/\/cube\/tabulator_live-shop\/query$/.test(response.url())) return;
          try {
            liveCubeAsks.push({
              url: response.url(),
              headers: asked.headers(),
              body: JSON.parse(asked.postData() ?? '{}'),
              answer: await response.json(),
            });
          } catch (anAbortedAskHasNoAnswer) { /* it is asked again */ }
        });

        // And the same through the parameter bar the viewer actually uses: pick Germany, reload,
        // and the drawn number is Germany's.
        await page.selectOption('#country', 'Germany');
        await page.click('#btnReloadDashboard');
        await expect(page.locator('#btnConfirmReload')).toBeVisible({ timeout: 5000 });
        await page.click('#btnConfirmReload');
        await expect
          .poll(async () => (await page.locator('rb-value').first().innerText()).replace(/[^0-9]/g, ''),
            { timeout: 60000 })
          .toContain('859');

        // ── The live Shop cube beside them (R8, TODO 21a) ──
        // The fifth tile is the cube itself: the same country manager ticks their own
        // breakdowns in it, and the one country at the top must reach it like every other tile.
        await expect(page.locator('rb-cube-renderer'), 'the dashboard carries one live cube')
          .toHaveCount(1, { timeout: 15000 });

        // Germany is picked (the reload above), so the cube says so where its own filters are
        // said. The chip has no ×: this filter belongs to the bar at the top of the page.
        await expect(page.locator('#chipDashFilter-Country'), "the dashboard's filter, on the cube")
          .toContainText('Country: Germany (dashboard)', { timeout: 60000 });
        await expect(page.locator('#btnChipRemove-Country'), 'and it is not the viewer\'s to remove')
          .toHaveCount(0);

        // And the panel that carries them is headed by the cube, not by the word `Cube`: the
        // reader is told which of the shop's cubes they are about to ask (D5).
        await expect(page.locator('#cubePanelHeader'), 'the tile names its cube and its filter')
          .toHaveText('\u25be Online Sales \u00b7 Country: Germany (dashboard); Status: not Cancelled, Returned',
            { timeout: 60000 });

        // The chip says `not`, and the rows are the answer to NOT IN - not to IN. The cube is asked
        // what the chip says; asked again directly it gives the rows the card drew; and asked the
        // other way round (IN) it gives other rows, so the operator is what decides them.
        await expect.poll(() => liveCubeAsks.length, { timeout: 60000 }).toBeGreaterThan(0);
        const liveCubeDrawn = liveCubeAsks[liveCubeAsks.length - 1];
        const withoutLength = (headers: Record<string, string>) => Object.fromEntries(
          Object.entries(headers).filter(([name]) => !['content-length', 'host', 'cookie'].includes(name.toLowerCase())));
        expect((liveCubeDrawn.body.filters ?? []).filter((f: any) => f.member === 'Status'),
          'the cube is asked to leave the cancelled and returned orders out')
          .toEqual([{ member: 'Status', operator: 'notIn', values: ['Cancelled', 'Returned'] }]);
        const askedAgain = await page.request.post(liveCubeDrawn.url,
          { headers: withoutLength(liveCubeDrawn.headers), data: liveCubeDrawn.body });
        expect(askedAgain.ok(), 'the same question, asked directly').toBe(true);
        expect((await askedAgain.json()).rows, 'gives the rows the card drew').toEqual(liveCubeDrawn.answer.rows);
        const theOtherWay = await page.request.post(liveCubeDrawn.url, {
          headers: withoutLength(liveCubeDrawn.headers),
          data: {
            ...liveCubeDrawn.body,
            filters: liveCubeDrawn.body.filters.map((f: any) => (f.member === 'Status' ? { ...f, operator: 'in' } : f)),
          },
        });
        expect(theOtherWay.ok(), 'and the question the other way round').toBe(true);
        expect((await theOtherWay.json()).rows, 'is another set of orders').not.toEqual(liveCubeDrawn.answer.rows);

        // The cube says what it is, once, where the reader looks for it (D6).
        await expect(page.locator('.rb-cube-about'))
          .toHaveText('Orders, shipping fees and sales, by country and by product category');
        await expect(page.locator('.rb-cube-desc'), 'not in the class of the small notes')
          .toHaveCount(0);

        // ── D11: the page's database picker, and a page with nothing to pick for ──
        // The dashboard carries the picker once, at the top right of the page, and never inside a
        // tile. This tile does not show its SQL, so there is nothing to write for any database and
        // the picker shows nothing at all: the element is the page's, its contents are the cubes'.
        await expect(page.locator('.rb-page-bar rb-sql-vendor'),
          'one database picker, in the page bar').toHaveCount(1);
        await expect(page.locator('#cubeRuntimeSqlVendor'),
          'and no select inside the cube tile').toHaveCount(0);
        await expect(page.locator('#cubeSqlVendor'),
          'a dashboard whose cube shows no SQL has nothing to pick a database for').toHaveCount(0);

        // ── D7: the five stories this dashboard chose, in D9's layout ──
        // A reader opening a dashboard cold is told what the cube can answer, in this dashboard's
        // own words: five of the Online Sales cube's ten questions, the ones that still mean
        // something once a country is picked at the top of the page, each with its variants under
        // it. The entry names them, in this order, and the order is the author's.
        await expect(page.locator('#cubeHints'), 'the tile offers its stories')
          .toHaveCount(1, { timeout: 60000 });
        const storyIds = await page.locator('#cubeHints .rb-hint').evaluateAll((cards) =>
          cards.map((card) => card.id));
        expect(storyIds, 'exactly these five ids, in this order, with their variants under them')
          .toEqual([
            'hint-revenue-mix',
            'hint-revenue-mix--by-channel',
            'hint-sales-by-month',
            'hint-sales-by-city',
            'hint-discount-by-category',
            'hint-category-margin',
            'hint-category-margin--in-all',
          ]);
        // Each one is a question a reader reads, with a Show Me of its own.
        await expect(page.locator('#hint-sales-by-month'), 'the new month-by-month story')
          .toContainText('Month by month: are we selling more?');
        await expect(page.locator('#hint-sales-by-city'), 'and the new city story')
          .toContainText('Which cities buy the most?');
        await expect(page.locator('#btnShowMe-sales-by-month')).toBeVisible();
        await expect(page.locator('#btnShowMe-sales-by-city')).toBeVisible();

        // The negative half, twice over. The stories this dashboard left out are offered nowhere -
        // the two that group by Country would answer in one row now that a country is picked, the
        // period story belongs to the file's other cube, and two more repeat the tiles above.
        for (const left of ['sales-by-country', 'customers-by-country', 'what-sells',
          'customers-by-category', 'sales-for-a-period']) {
          await expect(page.locator(`#hint-${left}`), `${left} is not one of this dashboard's five`)
            .toHaveCount(0);
        }
        // And the one story that would fight the filter bar is dropped by the server, although its
        // own hint is offered: `revenue-mix` is on the tile, its `germany` variant is not, because
        // a Show Me that filtered Germany while the reader picked another country is a broken
        // promise. Drop that rule and this is the line that goes red.
        await expect(page.locator('#hint-revenue-mix--germany'),
          'no story presets a filter on the member the dashboard binds').toHaveCount(0);

        // D9's layout, on this tile too: the cube on one half, its stories on the other, and the
        // answer under both.
        await expect(page.locator('.rb-cube-halves.rb-cube-split'), 'the tile is split in two')
          .toHaveCount(1);
        const twoHalves = await page.evaluate(() => {
          const box = (selector: string) => {
            const found = document.querySelector(selector);
            return found ? found.getBoundingClientRect() : null;
          };
          return { fields: box('.rb-cube-fields'), stories: box('.rb-cube-stories'),
            result: box('#cubeRuntimeResult') };
        });
        expect(twoHalves.fields, 'the cube has its half').not.toBeNull();
        expect(twoHalves.stories, 'and the stories theirs').not.toBeNull();
        expect(twoHalves.stories!.left, 'the stories are beside the cube, not under it')
          .toBeGreaterThanOrEqual(twoHalves.fields!.right - 1);
        expect(twoHalves.result!.top, 'and the answer is under both of them')
          .toBeGreaterThanOrEqual(Math.max(twoHalves.fields!.bottom, twoHalves.stories!.bottom) - 1);
        await expect(page.locator('.rb-tree .rb-tree-field').first(),
          'the cube is still there to tick').toBeVisible({ timeout: 60000 });

        // What the live cube answers, asked the way the renderer asks it: the viewer's answer
        // travels in `params`, and the binding that turns it into a filter lives in the
        // dashboard's own -cube-widgets.json entry, never in this request.
        const askCube = async (
          params: Record<string, string>,
          dimensions: string[],
          filters: unknown[] = [],
          token = '',
        ) =>
          (await Helpers.sessionFetch(
            page,
            `/api/reports/g-cube-country-sales/cube/tabulator_live-shop/query${
              token ? `?token=${encodeURIComponent(token)}` : ''
            }`,
            {
              body: {
                dimensions,
                measures: ['NetSales'],
                filters,
                params,
              },
            },
          )).body;

        const netSalesOf = (answer: any): number =>
          (answer.rows as Record<string, unknown>[]).reduce(
            (sum, row) => sum + Number(row.NetSales),
            0,
          );

        // Germany, by channel: the same 859,422.88 the KPI above it shows, so the two kinds of
        // tile are one dashboard and not two.
        const germanyLive = await askCube({ country: 'Germany' }, ['Channel']);
        expect(netSalesOf(germanyLive), "the live cube is on Germany too").toBeCloseTo(859422.88, 1);
        expect((germanyLive.rows as unknown[]).length, "Germany's four channels").toBe(4);

        // The viewer's own filter is ANDed with the dashboard's, never instead of it: Germany's
        // Displays, and not every country's 1,092,301.89.
        const germanyDisplays = await askCube({ country: 'Germany' }, ['Category'], [
          { member: 'Category', operator: 'equals', values: ['Displays'] },
        ]);
        expect(netSalesOf(germanyDisplays), "Germany's Displays").toBeCloseTo(261897.29, 1);
        expect(netSalesOf(germanyDisplays), 'and not every country\'s Displays')
          .not.toBeCloseTo(1092301.89, 1);

        // All is not a country: it adds no filter at all, and the cube is the whole shop again.
        const allLive = await askCube({ country: '*' }, ['Channel']);
        expect(netSalesOf(allLive), 'All is the whole shop').toBeCloseTo(3571889.64, 1);

        // A tick the viewer made survives the filter bar: the widget is replaced when the
        // dashboard reloads, and the view it was looking at is carried across (R3).
        await page.check('#chk-dim-Category');
        await expect(page.locator('#chk-dim-Category')).toBeChecked({ timeout: 15000 });
        await page.selectOption('#country', 'France');
        await page.click('#btnReloadDashboard');
        await expect(page.locator('#btnConfirmReload')).toBeVisible({ timeout: 5000 });
        await page.click('#btnConfirmReload');
        await expect(page.locator('#chipDashFilter-Country'), 'the cube follows the new country')
          .toContainText('Country: France (dashboard)', { timeout: 60000 });
        await expect(page.locator('#chk-dim-Category'), 'and the tick the viewer made is still theirs')
          .toBeChecked({ timeout: 30000 });

        const franceLive = await askCube({ country: 'France' }, ['Channel']);
        expect(netSalesOf(franceLive), 'France is a country of its own, not Germany')
          .not.toBeCloseTo(859422.88, 1);
        expect(netSalesOf(franceLive), 'nor is it the whole shop')
          .not.toBeCloseTo(3571889.64, 1);
        expect(netSalesOf(franceLive), 'and it is some of the shop').toBeGreaterThan(0);

        // ── D4: a signed-in viewer's own questions are answered, not refused ──
        // Every question this tile asks is a POST, and a POST that rides on a browser session is
        // refused unless it carries back the token the server put in the XSRF-TOKEN cookie. Until
        // the components sent it, a signed-in reader met a red "Forbidden" where the rows belong
        // and "Your view was not saved" under every tick - while the tiles above, which read with
        // GET, looked perfectly well. So: a fresh load, one tick, and what is drawn.
        await page.goto(dashboardUrl, { timeout: 30000, waitUntil: 'networkidle' });
        await expect(page.locator('rb-cube-renderer')).toHaveCount(1, { timeout: 15000 });

        // What the cube answers for that tick, taken from the cube itself rather than written
        // here: whatever the shop's channels are called, one of them has to be on the screen.
        const everyChannel = await askCube({ country: '*' }, ['Channel']);
        const aChannel = String((everyChannel.rows as Record<string, unknown>[])[0].Channel);

        await page.check('#chk-dim-Channel');
        await expect(page.locator('#cubeRuntimeResult'), 'the live tile answers a signed-in viewer')
          .toContainText(aChannel, { timeout: 60000 });

        // The negative half, in the reader's own terms: neither red line is anywhere on the tile.
        // Both are one refusal each - the rows' POST and the view's PUT - and either one of them
        // coming back would put its text here.
        await new FluentTester(page)
          .elementShouldNotContainText('rb-cube-renderer', 'Forbidden')
          .elementShouldNotContainText('rb-cube-renderer', 'Your view was not saved');
        await expect(page.locator('#cubeRuntimeError'), 'nothing was refused where the rows go')
          .toHaveCount(0);
        await expect(page.locator('#cubeViewSaveError'), 'and nothing was refused where the view is saved')
          .toHaveCount(0);

        // And the view really was saved: a fresh load of the page opens on the tick this viewer
        // made, which nothing but the PUT having been accepted can have put there.
        await page.goto(dashboardUrl, { timeout: 30000, waitUntil: 'networkidle' });
        await expect(page.locator('#chk-dim-Channel'), "the viewer's own view came back")
          .toBeChecked({ timeout: 30000 });

        // ── D7: a Show Me on this tile answers, and answers with the right numbers ──
        // No country is picked on this fresh load (All is the default, and All adds no filter), so
        // what the month-by-month story answers is the whole shop - which is exactly what its
        // check pins, computed over the frozen cube_demo rows by
        // .docs/cube-demo-data/truths_stories_22.py. The click is the whole test: nothing here
        // fills the tree by hand.
        await expect(page.locator('#btnShowMe-sales-by-month')).toBeVisible({ timeout: 60000 });
        const monthAnswered = page.waitForResponse(
          (r) => r.url().includes('/cube/tabulator_live-shop/query') && r.request().method() === 'POST',
          { timeout: 90000 },
        );
        await page.click('#btnShowMe-sales-by-month');
        expect((await monthAnswered).status(), "the page's own question was answered").toBe(200);

        // The tree says what the story said: Ordered, read by month, with the two measures ticked
        // and nothing else left over from the view this viewer was on (Channel was ticked above).
        await expect(page.locator('#chk-dim-OrderDate'), 'Ordered is ticked')
          .toBeChecked({ timeout: 60000 });
        await expect(page.locator('#gran-OrderDate'), 'and read by month').toHaveValue('month');
        await expect(page.locator('#chk-meas-Orders')).toBeChecked();
        await expect(page.locator('#chk-meas-NetSales')).toBeChecked();
        await expect(page.locator('#chk-dim-Channel'), 'Show Me replaces the selection')
          .not.toBeChecked();

        // And the rows drawn under both halves are the rows the check pins, to the penny.
        const monthCheck = checksOf('online-sales').get('sales-by-month');
        expect(monthCheck, 'the story carries a check of its own').toBeTruthy();
        await expect
          .poll(async () => (await page.locator('#cubeRuntimeResult rb-tabulator').first()
            .evaluate((el: any) => (el.data ?? []).length)), { timeout: 60000 })
          .toBe(monthCheck!.rows.length);
        const monthDrawn = await page.locator('#cubeRuntimeResult rb-tabulator').first()
          .evaluate((el: any) => (el.data ?? []).map((row: Record<string, unknown>) => Object.values(row)));
        expect(difference(monthCheck!.rows, monthDrawn, false),
          'the rows of the month-by-month story, month by month').toBeNull();

        // ── A share link locked to Germany ──
        // The recipient cannot pick a country, and neither kind of tile lets them ask for one.
        const share = await Helpers.sessionFetch(page, '/api/embed/share-link', {
          body: {
            reportId: 'g-cube-country-sales',
            lockedParams: { country: 'Germany' },
          },
        });
        expect(share.status, 'locking a declared parameter to a value it has').toBe(200);

        await page.goto(
          `${dashboardUrl}?token=${encodeURIComponent(share.body.token)}`,
          { timeout: 30000, waitUntil: 'networkidle' },
        );
        await expect(page.locator('#country'), 'the locked parameter cannot be picked')
          .toBeDisabled({ timeout: 30000 });
        await expect(page.locator('#chipDashFilter-Country'), 'and the cube is on the locked country')
          .toContainText('Country: Germany (dashboard)', { timeout: 60000 });

        // And asking louder does not widen it: the lock beats what the request says.
        const lockedAsksForFrance = await askCube(
          { country: 'France' }, ['Channel'], [], share.body.token,
        );
        expect(netSalesOf(lockedAsksForFrance), 'the lock beats the dashboard value')
          .toBeCloseTo(859422.88, 1);
      } finally {
        if (externalBrowser) {
          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
        }
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Sample 23: Dashboard Demos — 25 dashboards on one page.
  //
  // Light, as sample 21's is: it walks the sample the way the person in front of the
  // installation does (the list, the Learn More modal, Try It, the page in a browser) and
  // checks that the Gallery a visitor meets is the page the index describes. What each of
  // the 25 dashboards shows, the filters, the stories, the links and the sharing are
  // `specs/areas/dashboard-demos.spec.ts`.
  //
  // It is sample 23 and not 22: 22 is Country Sales Dashboard, above.
  // ═══════════════════════════════════════════════════════════════════════════
  electronBeforeAfterAllTest(
    'should work correctly (23_dashboard_demos)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      await ft
        .click('#leftMenuSamples')
        .scrollIntoViewIfNeeded('#trDASHBOARD-DEMOS')
        .waitOnElementToContainText('#tdDASHBOARD-DEMOS', 'Dashboard Demos');

      // Verify the Learn More modal
      ft = SamplesTestHelper.verifyLearnMoreModal(ft, 'DASHBOARD-DEMOS', 'northwind.duckdb');

      // A dashboard sample's "Try It" opens the page in the browser, as sample 22's does.
      let externalBrowser = null;

      await ft
        .scrollIntoViewIfNeeded('#trDASHBOARD-DEMOS')
        .click('#trDASHBOARD-DEMOS')
        .click('#btnSampleTryItDASHBOARD-DEMOS');

      try {
        const { browser, context, page } = await SelfServicePortalsTestHelper.createExternalBrowser();
        externalBrowser = browser;

        // A brand new browser carries no session; on a Server the dashboard would otherwise be
        // the login page. On a desktop installation this returns without doing anything.
        await Helpers.signInBrowserContext(context);

        const galleryUrl = `http://localhost:9090/dashboard/${GALLERY_REPORT_ID}`;

        await SelfServicePortalsTestHelper.waitForServerReady(page, galleryUrl, 30, 2000);

        // The readiness probe returns at DOMContentLoaded and leaves the Gallery still asking for its
        // configuration. Leave that load before the watch starts: the browser cancels its requests,
        // and a cancelled request of the probe is not one the page lost.
        await page.goto('about:blank');

        // Nothing the page does may go wrong while this test uses it.
        const watch = watchForErrors(page);

        await page.goto(galleryUrl, { timeout: 120000, waitUntil: 'networkidle' });

        const { expect } = await import('@playwright/test');

        // The page says what it is, to a reader who arrives with no sample list around them.
        await expect(page.locator('.rb-dashboard-demos-root')).toBeVisible({ timeout: 60000 });
        await expect(page.locator('.rb-dashboard-demos-root .dash-title'))
          .toContainText('Dashboard Demos', { timeout: 30000 });

        // The contents list above the cards: one entry per demo, in the index's order.
        const contents = await page
          .locator('.rb-dashboard-demos-root nav a[href^="#dd-"]')
          .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).hash));
        expect(contents, 'the contents list names every demo, in order')
          .toEqual(DEMOS.map((demo) => `#${demo.id}`));

        // And the cards themselves, each carrying its own dashboard.
        const cards = await page
          .locator('.rb-dashboard-demos-root .card')
          .evaluateAll((divs) => divs.map((div) => div.id));
        expect(cards, 'one card per demo, in the index\'s order')
          .toEqual(DEMOS.map((demo) => demo.id));

        for (const demo of DEMOS)
          await expect(
            page.locator(`#${demo.id} rb-dashboard[report-id="${demo.reportId}"]`),
            `${demo.id}'s card carries its own dashboard`,
          ).toHaveCount(1);

        // Every card says how it was built, below its dashboard, on a page of its own.
        for (const demo of DEMOS) {
          const built = page.locator(`#lnkHowBuilt-${demo.id}`);
          await expect(built, `${demo.id} says how it was built`)
            .toHaveAttribute('href', demo.howItWasBuiltUrl);
          await expect(built, 'and that page opens beside the Gallery, not over it')
            .toHaveAttribute('target', '_blank');
          const below = await page.evaluate((id) => {
            const dashboard = document.querySelector(`#${id} rb-dashboard`);
            const link = document.querySelector(`#lnkHowBuilt-${id}`);
            if (!dashboard || !link) return false;
            return link.getBoundingClientRect().top >= dashboard.getBoundingClientRect().top;
          }, demo.id);
          expect(below, `${demo.id}'s "how it was built" sits below its dashboard`).toBe(true);
        }

        // The first card, in full: the dashboard loaded, showing the numbers its checks hold it
        // to, and offering the questions its stories file asks. The other 24 are walked the same
        // way in `specs/areas/dashboard-demos.spec.ts`.
        const first = DEMOS[0];
        const card = await scrollCardIntoView(page, first);
        await assertStoriesAreOffered(card, first);
        await assertDemoDashboard(card, first);

        watch.assertNone('the Dashboard Demos gallery');
      } finally {
        if (externalBrowser) {
          await SelfServicePortalsTestHelper.closeExternalBrowser(externalBrowser);
        }
      }
    },
  );

});
