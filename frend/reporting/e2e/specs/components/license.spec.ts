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

  // The version chip and the Releases heading name the installation itself: the product the server
  // reports and the version in config/_defaults/settings.xml. A cached licence comes before
  // datapallas.com (license.service), so each case below is set up without the network.
  test('should show the installed product and version on the license screen', async () => {
    await Helpers.restoreDocumentBursterCleanState(false);

    const firstPage = await Helpers.appStart();
    const ft = new FluentTester(firstPage);
    const { product, version } = await installedProductAndVersion();

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      .elementShouldContainText('#version', product)
      .elementShouldContainText('#version', version)
      .elementShouldNotContainText('#version', 'DocumentBurster');

    await Helpers.appClose();
  });

  test('should show a cached release newer than the installed one as the latest', async () => {
    await Helpers.restoreDocumentBursterCleanState(false);
    await cacheLicence('license-newer-release-cached.xml');

    const firstPage = await Helpers.appStart();
    const ft = new FluentTester(firstPage);
    const { product } = await installedProductAndVersion();

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      .elementShouldContainText('#releaseVersion', '99.0.0')
      .elementShouldContainText('#releaseProduct', product)
      .elementShouldNotContainText('#releaseProduct', 'DocumentBurster');

    await Helpers.appClose();
  });

  test('should show the installation own release notes when the cached release is older', async () => {
    await Helpers.restoreDocumentBursterCleanState(false);
    // Its changelog tops at 8.8.3, many releases before the testground's.
    await cacheLicence('license-download-latest-version.xml');

    const ownNotes = jetpack.read(
      path.resolve(slash(`${process.env.PORTABLE_EXECUTABLE_DIR}/CHANGELOG.md`)),
    );
    const ownNewest = /^## (\d+\.\d+\.\d+)/m.exec(ownNotes || '')?.[1];
    if (!ownNewest) throw new Error('the testground has no release in its own CHANGELOG.md');

    const firstPage = await Helpers.appStart();
    const ft = new FluentTester(firstPage);
    const { product } = await installedProductAndVersion();

    await ft
      .click('#topMenuBurst')
      .click('#tab-btn-licenseTab')
      .elementShouldContainText('#releaseVersion', ownNewest)
      .elementShouldNotContainText('#releaseVersion', '8.8.3')
      .elementShouldContainText('#releaseProduct', product)
      .elementShouldNotContainText('#releaseProduct', 'DocumentBurster');

    await Helpers.appClose();
  });
});

/** What the screen has to show: the product the server reports, the version the installation ships. */
async function installedProductAndVersion(): Promise<{ product: string; version: string }> {
  const info = await fetch('http://localhost:9090/api/system/info', { headers: Helpers.apiKeyHeader() });
  if (!info.ok) throw new Error(`/api/system/info answered ${info.status}`);
  const product = String((await info.json()).product);

  const defaults = jetpack.read(
    path.resolve(
      slash(`${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}/_defaults/settings.xml`),
    ),
  );
  const version = /<version>([^<]+)<\/version>/.exec(defaults || '')?.[1]?.trim();
  if (!version) throw new Error('the testground has no <version> in config/_defaults/settings.xml');

  return { product, version };
}

async function cacheLicence(resource: string): Promise<void> {
  await jetpack.copyAsync(
    `${PATHS.E2E_RESOURCES_PATH}/license/${resource}`,
    path.resolve(
      slash(`${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.CONFIG_PATH}/_internal/license.xml`),
    ),
    { overwrite: true },
  );
}
