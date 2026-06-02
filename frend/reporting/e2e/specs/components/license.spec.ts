import * as path from 'path';
const slash = require('slash');

import { test } from '@playwright/test';
import * as jetpack from 'fs-jetpack';

import * as PATHS from '../../utils/paths';
import { Helpers } from '../../utils/helpers';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';

//DONE2
test.describe('', async () => {
  test('should correctly handle when the user will empty the license key', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await jetpack.copyAsync(
      `${PATHS.E2E_RESOURCES_PATH}/license/license-empty-key-but-with-status.xml`,
      path.resolve(
        slash(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}/_internal/license.xml`,
        ),
      ),
      { overwrite: true },
    );

    const firstPage = await Helpers.appStart();

    const ft = new FluentTester(firstPage);

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      .elementShouldBeVisible('#btnCheckLicenseKeyDisabled')
      .elementShouldBeVisible('#statusInvalidLicense')
      .elementShouldBeVisible('#version');

    await ft.sleep(1000);

    await Helpers.appClose();
  });

  test('should correctly display the license screen in the initial empty key state', async () => {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await jetpack.copyAsync(
      `${PATHS.E2E_RESOURCES_PATH}/license/license-just-downloaded-demo.xml`,
      path.resolve(
        slash(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}/_internal/license.xml`,
        ),
      ),
      { overwrite: true },
    );

    const firstPage = await Helpers.appStart();

    const ft = new FluentTester(firstPage);

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      // STEP0 - start from a demo (empty) license key
      .elementShouldBeVisible('#btnGetLicenseKey')
      .elementShouldBeVisible('#statusDemoLicense')
      .elementShouldBeVisible('#version')
      // STEP1 - fill a license key
      // SourceKraft Test License - virgil.trasca@datapallas.com
      .click('#licenseKey')
      .typeText(Constants.TEST_LICENSE_KEY)
      .elementShouldBeVisible('#btnActivateLicenseKey');

    await ft.sleep(1000);

    await Helpers.appClose();
  });

  test('should correctly display a license in the deactivated state', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await jetpack.copyAsync(
      `${PATHS.E2E_RESOURCES_PATH}/license/license-deactivated.xml`,
      path.resolve(
        slash(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}/_internal/license.xml`,
        ),
      ),
      { overwrite: true },
    );

    const firstPage = await Helpers.appStart();

    const ft = new FluentTester(firstPage);

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      .inputShouldHaveValue('#licenseKey', Constants.TEST_LICENSE_KEY)
      .elementShouldBeVisible('#btnActivateLicenseKey')
      .elementShouldBeVisible('#statusDemoLicense')
      .elementShouldBeVisible('#version');

    await ft.sleep(1000);

    await Helpers.appClose();
  });

  test('should correctly handle demo status', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await jetpack.copyAsync(
      `${PATHS.E2E_RESOURCES_PATH}/license/license-just-downloaded-demo.xml`,
      path.resolve(
        slash(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}/_internal/license.xml`,
        ),
      ),
      { overwrite: true },
    );

    const firstPage = await Helpers.appStart();

    const ft = new FluentTester(firstPage);

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      // STEP0 - start from a demo (empty) license key
      .elementShouldBeVisible('#btnGetLicenseKey')
      .elementShouldBeVisible('#statusDemoLicense')
      .elementShouldBeVisible('#version')
      // STEP1 - fill, activate and verify the flow of a valid license key
      // SourceKraft Test License - virgil.trasca@datapallas.com
      .click('#licenseKey')
      .typeText(Constants.TEST_LICENSE_KEY)
      .elementShouldBeVisible('#btnActivateLicenseKey');

    await ft.sleep(1000);

    await Helpers.appClose();
  });

  test('should correctly handle invalid status key', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await jetpack.copyAsync(
      `${PATHS.E2E_RESOURCES_PATH}/license/license-re-check-existing-license.xml`,
      path.resolve(
        slash(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}/_internal/license.xml`,
        ),
      ),
      { overwrite: true },
    );

    const firstPage = await Helpers.appStart();

    const ft = new FluentTester(firstPage);

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      .elementShouldBeVisible('#btnCheckLicenseKey')
      .elementShouldBeVisible('#statusInvalidLicense')
      .elementShouldBeVisible('#version');

    await ft.sleep(1000);

    await Helpers.appClose();
  });

  test('should correctly handle active status key', async function () {
    await jetpack.copyAsync(
      `${PATHS.E2E_RESOURCES_PATH}/license/license-active.xml`,
      path.resolve(
        slash(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}/_internal/license.xml`,
        ),
      ),
      { overwrite: true },
    );

    const firstPage = await Helpers.appStart();

    const ft = new FluentTester(firstPage);

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      .elementShouldBeVisible('#btnCheckLicenseKey')
      .elementShouldBeVisible('#statusActiveLicenseKey')
      .elementShouldBeVisible('#version')
      .elementShouldBeVisible('#deactivateLicenseKey');

    await ft.sleep(1000);

    await Helpers.appClose();
  });

  test('should correctly handle expired status key', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await jetpack.copyAsync(
      `${PATHS.E2E_RESOURCES_PATH}/license/license-expired.xml`,
      path.resolve(
        slash(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}/_internal/license.xml`,
        ),
      ),
      { overwrite: true },
    );

    const firstPage = await Helpers.appStart();

    const ft = new FluentTester(firstPage);

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      .elementShouldBeVisible('#btnCheckLicenseKey')
      .elementShouldBeVisible('#statusExpiredLicense')
      .elementShouldBeVisible('#version');

    await ft.sleep(1000);

    await Helpers.appClose();
  });

  test('should allow user to (re) check a key', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    await jetpack.copyAsync(
      `${PATHS.E2E_RESOURCES_PATH}/license/license-re-check-existing-license.xml`,
      path.resolve(
        slash(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}/_internal/license.xml`,
        ),
      ),
      { overwrite: true },
    );

    const firstPage = await Helpers.appStart();

    const ft = new FluentTester(firstPage);

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      .elementShouldBeVisible('#btnCheckLicenseKey')
      .elementShouldBeVisible('#statusInvalidLicense')
      .elementShouldBeVisible('#version');

    await ft.sleep(1000);

    await Helpers.appClose();
  });

  /*
  
  test('should correctly display when a newer version is available for download', async () => {
    await jetpack.copyAsync(
      PATHS.E2E_RESOURCES_PATH + '/license/license-download-latest-version.xml',
      path.resolve(
        slash(
          process.env.PORTABLE_EXECUTABLE_DIR +
            PATHS.CONFIG_PATH +
            '/_internal/license.xml',
        ),
      ),
      { overwrite: true },
    );

    const electronApp = await Helpers.electronAppLaunch('../..');
    const ft = new FluentTester(await electronApp.firstWindow());

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      .elementShouldBeVisible('#btnCheckLicenseKey')
      .elementShouldBeVisible('#statusActiveLicenseKey')
      .elementShouldBeVisible('#version')
      .elementShouldContainText('#version', 'DocumentBurster 9.1.3')
      .elementShouldNotBeVisible('#updateNowSuccint');

    await Helpers.electronAppClose(electronApp);
  });

  
  */
});
