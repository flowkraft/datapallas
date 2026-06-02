import { sample } from 'lodash';
import { Constants } from '../utils/constants';
import { FluentTester } from './fluent-tester';

export class SamplesTestHelper {
  static verifyLearnMoreModal(
    ft: FluentTester,
    sampleId: string,
    //expectedPiecesOfText?: string[],
    expectedInputFile?: string,
    expectedOutputFile?: string,
    expectedTemplateFile?: string,
    expectedTemplateContent?: string,
  ): FluentTester {
    // 1. Open modal and verify basic content
    ft = ft
      .click(`#btnSamplesLearnMode${sampleId}`)
      .waitOnElementToBecomeVisible('dp-dialog')
      .waitOnElementToBecomeVisible('#modalInputDetails')
      .waitOnElementToBecomeVisible('#modalOutputDetails');

    /* 2. Verify expected text pieces if provided
    if (expectedPiecesOfText?.length > 0) {
      expectedPiecesOfText.forEach((textToFind) => {
        ft = ft.elementShouldContainText('p-dialog *', textToFind);
      });
    }
    */

    // 3. Check input/output types if provided
    if (expectedInputFile) {
      ft = ft.elementShouldContainText(
        `#tdInputSample${sampleId}`,
        expectedInputFile,
      );
      ft = ft.elementShouldContainText(`#modalInputDetails`, expectedInputFile);
    }

    if (expectedOutputFile) {
      ft = ft.elementShouldContainText(
        `#tdOutputSample${sampleId}`,
        expectedOutputFile,
      );
      ft = ft.elementShouldContainText(
        `#modalOutputDetails`,
        expectedOutputFile,
      );
    }

    // 4. Verify file type icons based on input/output types. iconSvg() in
    //    shared/icon-svgs.ts stamps a `data-icon` attribute on every emitted
    //    <svg> so callers can target a specific icon by registry name.
    if (
      expectedInputFile?.includes('.xlsx') ||
      expectedInputFile?.includes('.xls') ||
      expectedOutputFile?.includes('.xlsx') ||
      expectedOutputFile?.includes('.xls')
    ) {
      ft = ft.elementShouldBeVisible('dp-dialog svg[data-icon="file-excel-o"]');
    }

    if (
      expectedInputFile?.includes('.pdf') ||
      expectedOutputFile?.includes('.pdf')
    ) {
      ft = ft.elementShouldBeVisible('dp-dialog svg[data-icon="file-pdf-o"]');
    }

    if (
      expectedInputFile?.includes('.html') ||
      expectedOutputFile?.includes('.html')
    ) {
      ft = ft.elementShouldBeVisible('dp-dialog svg[data-icon="file-text-o"]');
    }

    if (
      expectedInputFile?.includes('.docx') ||
      expectedOutputFile?.includes('.docx')
    ) {
      ft = ft.elementShouldBeVisible('dp-dialog svg[data-icon="file-text-o"]');
    }

    // 5. Verify notes section
    ft = ft.elementShouldBeVisible(`#div${sampleId}`);

    // 6. Verify configuration
    ft = ft
      .click(`#btnViewConfigurationFile${sampleId}`)
      .waitOnElementToBecomeVisible('#burstFileName');

    let expectedBurstFileName = '${burst_token}.${output_type_extension}';

    if (sampleId.includes("STUDENT-PROFILES"))
      expectedBurstFileName = '${FirstName}-${LastName}.pdf';

    if (sampleId.includes("CUSTOMER-STATEMENTS"))
      expectedBurstFileName = '${CustomerID}.html';

    if (sampleId.includes("CUSTOMER-SALES"))
      expectedBurstFileName = 'CustomerSalesSummary.xlsx';

    if (sampleId.includes("CUSTOMER-INVOICES"))
      expectedBurstFileName = 'invoice_${OrderID}.html';
    
    if (sampleId.includes("CROSSTAB"))
      expectedBurstFileName = 'CategoryRegionCrosstab.html';

    if (sampleId.includes("MONTHLY-SALES-TREND"))
      expectedBurstFileName = 'MonthlySalesTrend.html';
    
    if (sampleId.includes("SUPPLIER-SCORECARDS"))
      expectedBurstFileName = 'supplier_${burst_token}_scorecard.html';

    if (sampleId.includes("ADHOC-EMPLOYEE-PROFILE"))
      expectedBurstFileName = '${EmployeeID}-${FirstName}-${LastName}.pdf';

    if (sampleId.includes("NORTHWIND-SALES-DASHBOARD"))
      expectedBurstFileName = 'dashboard.html';

    if (sampleId.includes("NORTHWIND-SALES-PIVOTTABLE"))
      expectedBurstFileName = 'dashboard.html';

    ft = ft.waitOnInputToHaveValue(
      '#burstFileName',
      expectedBurstFileName,
    );

    // 7. Check Split2Times configuration if applicable
    if (expectedInputFile && expectedInputFile.includes('2Times.pdf')) {
      ft = ft
        .click('#leftMenuAdvancedSettings')
        .waitOnElementToBecomeVisible('#btnSplit2ndTime')
        .elementCheckBoxShouldBeSelected('#btnSplit2ndTime')
        .click('#leftMenuGeneralSettings');
    }

    const capReportGenerationMailMerge =
      expectedTemplateFile || expectedTemplateContent;

    // 8. Check output configuration if provided
    if (capReportGenerationMailMerge) {
      ft = ft
        .click('#leftMenuReportingSettings')
        .click('#tab-btn-reportingTemplateOutputTab')
        .waitOnElementToBecomeVisible('#reportOutputType')
        .sleep(3 * Constants.DELAY_ONE_SECOND);

      if (expectedOutputFile.endsWith('.docx') && expectedTemplateFile) {
        ft = ft
          .dropDownShouldHaveSelectedOption('#reportOutputType', 'output.docx')
          .elementShouldNotBeVisible('#codeJarHtmlTemplateEditor')
          .elementShouldContainText(
            '#selectTemplateFile',
            expectedTemplateFile,
          );
      }

      if (expectedOutputFile.endsWith('.html') && expectedTemplateContent) {
        ft = ft
          .dropDownShouldHaveSelectedOption('#reportOutputType', 'output.html')
          .elementShouldNotBeVisible('#selectTemplateFile')
          .elementShouldContainText(
            '#codeJarHtmlTemplateEditor',
            expectedTemplateContent,
          );
      }

      if (expectedOutputFile.endsWith('.pdf') && expectedTemplateContent) {

        if (!expectedTemplateContent.includes('fo:layout-master-set'))
          ft = ft
            .dropDownShouldHaveSelectedOption('#reportOutputType', 'output.pdf')
            .elementShouldNotBeVisible('#selectTemplateFile')
            .elementShouldContainText(
              '#codeJarHtmlTemplateEditor',
              expectedTemplateContent,
            );
      }

      if (expectedOutputFile.endsWith('.pdf') && expectedTemplateContent) {
        if (expectedTemplateContent.includes('fo:layout-master-set'))
          ft = ft
            .dropDownShouldHaveSelectedOption('#reportOutputType', 'output.fop2pdf')
            .elementShouldNotBeVisible('#selectTemplateFile')
            .elementShouldContainText(
              '#codeJarHtmlTemplateEditor',
              expectedTemplateContent,
            );
      }

      if (expectedOutputFile.endsWith('.xlsx') && expectedTemplateContent) {
        ft = ft
          .dropDownShouldHaveSelectedOption('#reportOutputType', 'output.xlsx')
          .elementShouldNotBeVisible('#selectTemplateFile')
          .elementShouldContainText(
            '#codeJarHtmlTemplateEditor',
            expectedTemplateContent,
          );
      }
    }

    ft = ft.gotoBurstScreen();

    // 9. Return to samples screen
    return ft.click('#leftMenuSamples');
  }
}
