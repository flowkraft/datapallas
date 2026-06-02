import * as path from 'path';
const slash = require('slash');

import { test } from '@playwright/test';
import { Page } from 'playwright';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { Helpers } from '../../utils/helpers';
import { ConfigurationTestHelper } from '../../helpers/areas/configuration-test-helper';

//DONE2
test.describe('', async () => {
  electronBeforeAfterAllTest(
    'should correctly split-test-all samples/burst/Payslips.pdf (My Report)',
    async function ({ beforeAfterEach: firstPage }) {
      const sendEmails = false;
      await _splitSendVerifyEmails(
        firstPage,
        sendEmails,
        Constants.PROC_BURST,
        Constants.QA_TA,
      );
    },
  );

  electronBeforeAfterAllTest(
    'should correctly split-test-random2 samples/burst/Payslips.pdf (My Report)',
    async function ({ beforeAfterEach: firstPage }) {
      const sendEmails = false;
      await _splitSendVerifyEmails(
        firstPage,
        sendEmails,
        Constants.PROC_BURST,
        Constants.QA_TR,
      );
    },
  );

  electronBeforeAfterAllTest(
    'should correctly split-test-tokenlist samples/burst/Payslips.pdf (My Report)',
    async function ({ beforeAfterEach: firstPage }) {
      const sendEmails = false;
      await _splitSendVerifyEmails(
        firstPage,
        sendEmails,
        Constants.PROC_BURST,
        Constants.QA_TL,
      );
    },
  );

  test('should correctly split-email-test-all samples/burst/Payslips.pdf (My Report)', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    const firstPage = await Helpers.appStart();

    const sendEmails = true;
    await _splitSendVerifyEmails(
      firstPage,
      sendEmails,
      Constants.PROC_BURST,
      Constants.QA_TA,
    );

    await Helpers.appClose();
  });

  electronBeforeAfterAllTest(
    'should correctly split-email-test-random2 samples/burst/Payslips.pdf (My Report)',
    async function ({ beforeAfterEach: firstPage }) {
      const sendEmails = true;
      await _splitSendVerifyEmails(
        firstPage,
        sendEmails,
        Constants.PROC_BURST,
        Constants.QA_TR,
      );
    },
  );

  electronBeforeAfterAllTest(
    'should correctly split-email-test-tokenlist samples/burst/Payslips.pdf (My Report)',
    async function ({ beforeAfterEach: firstPage }) {
      const sendEmails = true;
      await _splitSendVerifyEmails(
        firstPage,
        sendEmails,
        Constants.PROC_BURST,
        Constants.QA_TL,
      );
    },
  );

  //generate START
  test('should correctly generate-test-all samples/reports/payslips/Payslips.csv (Payslips)', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await Helpers.setupConfigurationTemplate(
      'Payslips',
      'enableMailMergeCapability',
    );

    const firstPage = await Helpers.appStart();

    const sendEmails = false;
    await _splitSendVerifyEmails(
      firstPage,
      sendEmails,
      Constants.PROC_GENERATE,
      Constants.QA_TA,
    );

    await Helpers.appClose();
  });

  test('should correctly generate-test-random2 samples/reports/payslips/Payslips.csv (Payslips)', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await Helpers.setupConfigurationTemplate(
      'Payslips',
      'enableMailMergeCapability',
    );

    const firstPage = await Helpers.appStart();

    const sendEmails = false;
    await _splitSendVerifyEmails(
      firstPage,
      sendEmails,
      Constants.PROC_GENERATE,
      Constants.QA_TR,
    );

    await Helpers.appClose();
  });

  test('should correctly generate-test-tokenlist samples/reports/payslips/Payslips.csv (Payslips)', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await Helpers.setupConfigurationTemplate(
      'Payslips',
      'enableMailMergeCapability',
    );

    const firstPage = await Helpers.appStart();

    const sendEmails = false;
    await _splitSendVerifyEmails(
      firstPage,
      sendEmails,
      Constants.PROC_GENERATE,
      Constants.QA_TL,
    );

    await Helpers.appClose();
  });

  test('should correctly generate-email-test-all samples/reports/payslips/Payslips.csv (Payslips)', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await Helpers.setupConfigurationTemplate(
      'Payslips',
      'enableMailMergeCapability',
    );

    const firstPage = await Helpers.appStart();

    const sendEmails = true;
    await _splitSendVerifyEmails(
      firstPage,
      sendEmails,
      Constants.PROC_GENERATE,
      Constants.QA_TA,
    );

    await Helpers.appClose();
  });

  test('should correctly generate-email-test-random2 samples/reports/payslips/Payslips.csv (Payslips)', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await Helpers.setupConfigurationTemplate(
      'Payslips',
      'enableMailMergeCapability',
    );
    const firstPage = await Helpers.appStart();

    const sendEmails = true;
    await _splitSendVerifyEmails(
      firstPage,
      sendEmails,
      Constants.PROC_GENERATE,
      Constants.QA_TR,
    );

    await Helpers.appClose();
  });

  test('should correctly generate-email-test-tokenlist samples/reports/payslips/Payslips.csv (Payslips)', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await Helpers.setupConfigurationTemplate(
      'Payslips',
      'enableMailMergeCapability',
    );

    const firstPage = await Helpers.appStart();

    const sendEmails = true;
    await _splitSendVerifyEmails(
      firstPage,
      sendEmails,
      Constants.PROC_GENERATE,
      Constants.QA_TL,
    );

    await Helpers.appClose();
  });
  //generate END
});

const _splitSendVerifyEmails = async (
  firstPage: Page,
  sendEmails: boolean,
  processingMode: string,
  qaMode: string,
  //expectedOutputEmailFiles: string[]
): Promise<void> => {
  const qaFlowOptions = ['PROC_2_QA', 'QA_DIRECTLY'];
  let randomQAFlowChoice =
    qaFlowOptions[Math.floor(Math.random() * qaFlowOptions.length)];

  let folderName = 'burst';
  let tokenId = '$burst_token$';

  if (processingMode == Constants.PROC_GENERATE) {
    randomQAFlowChoice = 'PROC_2_QA';
    folderName = 'payslips';
    tokenId = '${var17}';
  }

  const ft = new FluentTester(firstPage);

  ft.click('#topMenuBurst');

  if (sendEmails) {
    // STEP0 - CHANGE VALUES — enable email distribution
    ConfigurationTestHelper.loadConfiguration(ft, folderName)
      .click('#btnEnableDisableDistribution')
      .click('#btnSendDocumentsEmail');
    // email message settings
    ConfigurationTestHelper.loadConfiguration(ft, folderName)
      .click('#leftMenuEmailSettings')
      .click('#tab-btn-emailMessageTab')
      .click('#emailToAddress');

    if (processingMode == Constants.PROC_GENERATE) {
      ft.typeText('${col17}');
    } else ft.typeText(tokenId);

    ft.click('#emailSubject')
      .typeText(`Subject ${tokenId}`)
      // email message settings
      .click('.ql-editor')
      .typeText(`Message ${tokenId}`)
      .click('#topMenuBurst');
  }
  ft.appShouldBeReadyToRunNewJobs().appStatusShouldBeGreatNoErrorsNoWarnings();

  if (randomQAFlowChoice == 'PROC_2_QA') {
    if (processingMode == Constants.PROC_BURST) {
      ft.setInputFiles(
        '#burstFileUploadInput',
        path.resolve(
          slash(
            process.env.PORTABLE_EXECUTABLE_DIR + '/samples/burst/Payslips.pdf',
          ),
        ),
      );
    }

    if (processingMode == Constants.PROC_GENERATE) {
      ft.click('#tab-btn-reportGenerationMailMergeTab')
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("Payslips (input CSV)")',
        )
        .click('span.ng-option-label:has-text("Payslips (input CSV)")')
        .waitOnElementToBecomeVisible('#browseMailMergeClassicReportInputFile')
        .setInputFiles(
          '#reportingFileUploadInput',
          slash(
            path.resolve(
              process.env.PORTABLE_EXECUTABLE_DIR +
                '/samples/reports/payslips/Payslips.csv',
            ),
          ),
        );
    }

    ft.waitOnElementToBecomeVisible('#qaReminderLink')
      .click('#qaReminderLink')
      .waitOnElementToBecomeVisible('#qaReminder a')
      .elementShouldBeVisible('#qaReminder a')
      .elementShouldBeVisible('#goToQa');

    ft.click('#goToQa');
  }

  if (randomQAFlowChoice == 'QA_DIRECTLY') {
    ft.click('#leftMenuQualityAssurance');
    ft.setInputFiles(
      '#qaFileUploadInput',
      path.resolve(
        slash(
          process.env.PORTABLE_EXECUTABLE_DIR + '/samples/burst/Payslips.pdf',
        ),
      ),
    );
  }

  let listOfTokens =
    'clyde.grew@northridgehealth.org,alfreda.waldback@northridgehealth.org';
  if (processingMode == Constants.PROC_GENERATE) listOfTokens = '0,2';

  if (qaMode === Constants.QA_TA) {
    ft.click('#testTokensAll');
  } else if (qaMode === Constants.QA_TR) {
    ft.click('#testTokensRandom').setValue('#numberOfRandomTokens', '2');
  } else if (qaMode === Constants.QA_TL) {
    ft.click('#testTokensList').setValue('#listOfTokens', listOfTokens);
  }

  if (sendEmails && qaMode !== Constants.QA_TA) {
    ft.click('#startTestEmailServer')
      .clickYesDoThis()
      .waitOnElementToBecomeVisible(
        '#stopTestEmailServer',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      )
      .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR);
  }

  ft.click('#btnRunTest')
    .clickNoDontDoThis()
    .click('#btnRunTest')
    .clickYesDoThis()
    .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
    .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
    .appStatusShouldBeGreatNoErrorsNoWarnings();

  if (qaMode === Constants.QA_TA) {
    if (processingMode == Constants.PROC_BURST) {
      ft.processingShouldHaveGeneratedOutputFiles(
        Constants.PAYSLIPS_PDF_BURST_TOKENS.map(function (burstToken) {
          return burstToken + '.pdf';
        }),
      );
    } else
      ft.processingShouldHaveGeneratedOutputFiles(
        ['0.docx', '1.docx', '2.docx'],
        'docx',
      );
  } else if (qaMode === Constants.QA_TR)
    if (processingMode == Constants.PROC_BURST)
      ft.processingShouldHaveGeneratedNFilesHavingSuffix(2, '.pdf');
    else ft.processingShouldHaveGeneratedNFilesHavingSuffix(2, '.docx');
  else if (qaMode === Constants.QA_TL) {
    if (processingMode == Constants.PROC_BURST)
      ft.processingShouldHaveGeneratedOutputFiles([
        'clyde.grew@northridgehealth.org.pdf',
        'alfreda.waldback@northridgehealth.org.pdf',
      ]);
    else
      ft.processingShouldHaveGeneratedOutputFiles(['0.docx', '2.docx'], 'docx');
  }

  if (sendEmails) {
    if (processingMode == Constants.PROC_BURST) {
      if (qaMode === Constants.QA_TA)
        ft.shouldHaveSentNCorrectEmails(
          qaMode,
          Constants.PAYSLIPS_PDF_BURST_TOKENS.length,
          Constants.ATTACHMENTS_DEFAULT,
        );
      else
        ft.shouldHaveSentNCorrectEmails(
          qaMode,
          2,
          Constants.ATTACHMENTS_DEFAULT,
        );
    } else {
      if (qaMode === Constants.QA_TA)
        ft.shouldHaveSentNCorrectEmails(
          qaMode,
          Constants.PAYSLIPS_PDF_BURST_TOKENS.length,
          Constants.ATTACHMENTS_DEFAULT,
          'docx',
        );
      else
        ft.shouldHaveSentNCorrectEmails(
          qaMode,
          2,
          Constants.ATTACHMENTS_DEFAULT,
          'docx',
        );
    }
  }

  if (sendEmails && qaMode !== Constants.QA_TA) {
    ft.click('#stopTestEmailServer')
      .clickYesDoThis()
      .waitOnElementToBecomeVisible(
        '#startTestEmailServer',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      )
      .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR);
  }

  return ft;
};
