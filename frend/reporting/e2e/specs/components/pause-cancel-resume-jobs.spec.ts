const slash = require('slash');

import { Page, test } from '@playwright/test';
import _ from 'lodash';
import * as jetpack from 'fs-jetpack';

import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import * as PATHS from '../../utils/paths';
import { Constants } from '../../utils/constants';
import path from 'path';
import { FluentTester } from '../../helpers/fluent-tester';

//DONE2
test.describe('', async () => {
  electronBeforeAfterAllTest(
    'should Pause a Job and no output file should be created (because the Pause is called before the first output file is generated)',
    async function ({ beforeAfterEach: firstPage }) {
      //long running test
      //test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      //await Helpers.deActivateLicenseKey();
      await _splitVerifyBigFile(firstPage, 'pause-immediately');
    },
  );

  electronBeforeAfterAllTest(
    'should Cancel a Job and no PDF file should be created (Cancel triggered before the first PDF output file is generated)',
    async function ({ beforeAfterEach: firstPage }) {
      //await Helpers.deActivateLicenseKey();
      await _splitVerifyBigFile(firstPage, 'cancel-immediately');
    },
  );

  electronBeforeAfterAllTest(
    'should Pause a running Job after few output PDF files started to be generated',
    async function ({ beforeAfterEach: firstPage }) {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      await _splitVerifyBigFile(firstPage, 'pause-after-pdf-generated');
    },
  );

  electronBeforeAfterAllTest(
    'should properly Cancel a running Job after few output PDF files started to be generated',
    async function ({ beforeAfterEach: firstPage }) {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      await _splitVerifyBigFile(firstPage, 'cancel-after-pdf-generated');
    },
  );

  electronBeforeAfterAllTest(
    'should Pause a Job after few output PDF files are generated and then, resuming the paused Job, should complete until all files are generated',
    async function ({ beforeAfterEach: firstPage }) {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      await _splitVerifyBigFile(
        firstPage,
        'pause-after-pdf-generated-and-then-resume',
      );
    },
  );
});

const _copyBigInputPDFFileLocally = async () => {
  if (
    (await jetpack.existsAsync(
      process.env.PORTABLE_EXECUTABLE_DIR + '/samples/burst/Payslips-Oct.pdf',
    )) !== 'file'
  )
    await jetpack.copyAsync(
      PATHS.E2E_RESOURCES_PATH + '/samples/Payslips-Oct.pdf',
      process.env.PORTABLE_EXECUTABLE_DIR + '/samples/burst/Payslips-Oct.pdf',
    );
};

const _splitVerifyBigFile = (
  firstPage: Page,
  pauseCancelMode: string,
): FluentTester => {
  _copyBigInputPDFFileLocally();

  const ft = new FluentTester(firstPage);

  ft.gotoBurstScreen();
  if (pauseCancelMode.includes('after-pdf-generated')) {
    ft.click('#tab-btn-licenseTab')
      // STEP0 - start from a demo license key
      .elementShouldBeVisible('#statusDemoLicense')
      .appShouldBeReadyToRunNewJobs()
      .appStatusShouldBeGreatNoErrorsNoWarnings()
      // activating the test license key (pre-requisite for the test)
      .click('#licenseKey')
      .typeText(Constants.TEST_LICENSE_KEY)
      .click('#btnActivateLicenseKey')
      .clickYesDoThis()
      .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
      .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
      .waitOnElementToBecomeVisible('#btnCheckLicenseKey', Constants.DELAY_FIVE_THOUSANDS_SECONDS)
      .click('#tab-btn-burstTab')
      .waitOnElementToBecomeVisible('#logsViewerBurstReportsTab')
      .click('#btnClearLogsBurstReportsTab')
      .clickYesDoThis()
      .waitOnElementToBecomeInvisible('#logsViewerBurstReportsTab')
      .click('#tab-btn-licenseTab')
      .click('#btnCheckLicenseKey')
      .clickYesDoThis()
      .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
      .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
      .waitOnElementToBecomeVisible(
        '#statusActiveLicenseKey',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      )
      .waitOnElementToBecomeVisible(
        '#deactivateLicenseKey',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      )
      .waitOnElementToBecomeVisible(
        '#version',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      )
      .appShouldBeReadyToRunNewJobs()
      .click('#tab-btn-burstTab')
      .waitOnElementToBecomeVisible('#logsViewerBurstReportsTab')
      .click('#btnClearLogsBurstReportsTab')
      .clickYesDoThis()
      .waitOnElementToBecomeInvisible('#logsViewerBurstReportsTab');
  }

  ft.appStatusShouldBeGreatNoErrorsNoWarnings().setInputFiles(
    '#burstFileUploadInput',
    path.resolve(
      slash(
        `${process.env.PORTABLE_EXECUTABLE_DIR}/samples/burst/Payslips-Oct.pdf`,
      ),
    ),
  );

  if (!pauseCancelMode.includes('after-pdf-generated')) {
    ft.waitOnElementToBecomeVisible('#qaReminderLink');
  }

  ft.sleep(Constants.DELAY_ONE_SECOND).click('#btnBurst')
    .clickYesDoThis()
    .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR);

  if (pauseCancelMode.includes('after-pdf-generated'))
    // check when the first PDF file was created
    ft.waitOnElementToBecomeVisible(
      '#progressJobFileExists',
      Constants.DELAY_FIVE_THOUSANDS_SECONDS,
    );

  ft.appStatusShouldBeGreatNoErrorsNoWarnings().click(
    '#btnCancelPauseRunningJobs',
  );
  //.waitOnElementToBecomeVisible('#btnPausePayslips-Oct\\.pdf')
  // and Pause the running job
  if (pauseCancelMode.includes('pause'))
    ft.click('#btnPausePayslips-Oct\\.pdf');
  else if (pauseCancelMode.includes('cancel'))
    ft.click('#btnCancelPayslips-Oct\\.pdf');

  ft.clickYesDoThis()
    .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
    .appShouldBeReadyToRunNewJobs()
    .appStatusShouldBeGreatNoErrorsNoWarnings();
  //.killHangingJavaProcesses();

  //.waitOnElementToBecomeVisible('#resumeJobsBurstReportsTab #btnResume')
  if (pauseCancelMode === 'pause-after-pdf-generated-and-then-resume') {
    ft.click('#resumeJobsBurstReportsTab #btnResume')
      // wait for the 'Clear Logs' modal to come
      .clickYesDoThis()
      .click('#btnClearLogsBurstReportsTab')
      .clickYesDoThis()
      //.waitOnElementToBecomeInvisible('#logsViewerBurstReportsTab')
      .click('#resumeJobsBurstReportsTab #btnResume')
      .clickYesDoThis()
      .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
      // check when the first PDF file was created
      //.waitOnElementToBecomeVisible(
      //  '#progressJobFileExists',
      //  Constants.DELAY_FIVE_THOUSANDS_SECONDS
      //)
      // wait the resumed Job to finish
      .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
      .appShouldBeReadyToRunNewJobs()
      .appStatusShouldBeGreatNoErrorsNoWarnings();
    //.killHangingJavaProcesses();
  }

  if (pauseCancelMode.includes('after-pdf-generated')) {
    ft.click('#tab-btn-licenseTab')
      // de-activating the test license key
      .click('#deactivateLicenseKey')
      .clickYesDoThis()
      .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
      .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
      .waitOnElementToBecomeVisible(
        '#statusDemoLicense',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      )
      .appStatusShouldBeGreatNoErrorsNoWarnings();
  }

  ft.click('#tab-btn-burstTab')
    .click('#btnClearLogsBurstReportsTab')
    .clickYesDoThis()
    .waitOnElementToBecomeInvisible('#logsViewerBurstReportsTab')
    .appShouldBeReadyToRunNewJobs();

  if (pauseCancelMode === 'pause-after-pdf-generated-and-then-resume')
    ft.processingShouldHaveGeneratedNFilesHavingSuffix(443, '.pdf');
  else if (
    pauseCancelMode === 'pause-after-pdf-generated' ||
    pauseCancelMode === 'cancel-after-pdf-generated'
  )
    ft.processingShouldHaveGeneratedFewFilesHavingSuffix('.pdf');
  else ft.processingShouldHaveGeneratedNFilesHavingSuffix(0, '.pdf');

  if (pauseCancelMode !== 'pause-after-pdf-generated') {
    ft.appShouldHaveNoActiveJob();
  } else if (pauseCancelMode === 'pause-after-pdf-generated') {
    ft.appShouldHaveNActiveJobs(1);
  }

  return ft;
};
