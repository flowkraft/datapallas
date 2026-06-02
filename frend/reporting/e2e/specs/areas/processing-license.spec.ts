import { test } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { Helpers } from '../../utils/helpers';
import { FluentTester } from '../../helpers/fluent-tester';

//DONE2
test.describe('', async () => {
  electronBeforeAfterAllTest(
    'should correctly activate, check and deactivate a valid license',
    async function ({ beforeAfterEach: firstPage }) {
      await Helpers.deActivateLicenseKey();

      let ft = new FluentTester(firstPage);

      return (
        ft
          .gotoBurstScreen()
          .click('#tab-btn-licenseTab')
          // STEP0 - start from a demo license key
          .elementShouldBeVisible('#statusDemoLicense')
          .appShouldBeReadyToRunNewJobs()
          .appStatusShouldBeGreatNoErrorsNoWarnings()
          // STEP1 - fill, activate and verify the flow of a valid license key
          // SourceKraft Test License - virgil.trasca@datapallas.com
          .setValue('#licenseKey', Constants.TEST_LICENSE_KEY)
          .click('#btnActivateLicenseKey')
          .clickYesDoThis()
          .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
          .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
          .appShouldBeReadyToRunNewJobs()
          .appStatusShouldBeGreatNoErrorsNoWarnings()
          .click('#btnCheckLicenseKey')
          .clickYesDoThis()
          .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
          .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
          .appShouldBeReadyToRunNewJobs()
          .appStatusShouldBeGreatNoErrorsNoWarnings()
          .waitOnElementToBecomeVisible(
            '#statusActiveLicenseKey',
            Constants.DELAY_FIVE_THOUSANDS_SECONDS,
          )
          .elementShouldBeVisible('#version')
          //.sleep(Constants.DELAY_ONE_SECOND)
          // STEP2 - verify the flow of checking a valid license key
          //.killHangingJavaProcesses()
          .click('#btnCheckLicenseKey')
          .clickYesDoThis()
          //.waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
          //.waitOnProcessingToFinish(Constants.CHECK_PROCESSING_JAVA)
          .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
          .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
          .appShouldBeReadyToRunNewJobs()
          .appStatusShouldBeGreatNoErrorsNoWarnings()
          .elementShouldBeVisible('#statusActiveLicenseKey')
          .elementShouldBeVisible('#version')
          // STEP3 - verify the flow of de-activating a valid license key
          //.killHangingJavaProcesses()
          //.sleep(Constants.DELAY_ONE_SECOND)
          .click('#deactivateLicenseKey')
          .clickYesDoThis()
          .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
          .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
          .waitOnElementToBecomeVisible(
            '#statusDemoLicense',
            Constants.DELAY_FIVE_THOUSANDS_SECONDS,
          )
          .appShouldBeReadyToRunNewJobs()
          .appStatusShouldBeGreatNoErrorsNoWarnings()
        //.killHangingJavaProcesses()
      );
    },
  );
});
