import { test } from '@playwright/test';
import * as jetpack from 'fs-jetpack';

import { FluentTester } from '../../helpers/fluent-tester';
import helpers from '../../upgrade/updater.helpers';
import * as PATHS from '../../utils/paths';
import { Constants } from '../../utils/constants';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';

const isElectron = process.env.TEST_ENV === 'electron'

//DONE2
test.describe('', async () => {
  electronBeforeAfterAllTest(
    'should correctly update and migrate older configuration',
    async ({ beforeAfterEach: firstPage }) => {
      
      //should be executed only on Electron
      if (!isElectron)
        return;

      helpers.updateDestinationDirectoryPath = 'testground/e2e';

      const UPGRADE_DIR = 'testground/upgrade';

      await jetpack.dirAsync(UPGRADE_DIR, { empty: true });

      const baselineVersionFilePath = `${PATHS.E2E_RESOURCES_PATH}/upgrade/_baseline/db-baseline-8.7.2.zip`;
      //console.log(`baselineVersionFilePath = ${baselineVersionFilePath}`);
      await helpers.extractBaseLineAndCopyCustomConfigAndScriptFiles(
        UPGRADE_DIR,
        baselineVersionFilePath,
      );

      const ft = new FluentTester(firstPage);

      return ft
        .click('#topMenuHelp')
        .waitOnElementToContainText(
          '#topMenuHelpJava',
          'System Diagnostics / Update',
        )
        .click('#topMenuHelpJava')
        .click('#tab-btn-updateTab')
        .click('#btnLetMeUpdateManually')
        .waitOnElementToBecomeVisible('#oldDbInstallationFolder')
        .waitOnElementToBecomeEnabled('#oldDbInstallationFolder')
        .click('#oldDbInstallationFolder')
        .typeText('playwright/')
        .waitOnElementToBecomeVisible('#btnE2EFillInfo')
        .click('#btnE2EFillInfo')
        .waitOnElementToBecomeVisible('#errorMsg')
        .elementShouldContainText(
          '#errorMsg',
          'Neither DocumentBurster.exe or DataPallas.exe was not found',
        )
        .click('#oldDbInstallationFolder')
        .typeText('')
        .waitOnElementToBecomeInvisible('#btnE2EFillInfo')
        .renameFile(
          `${UPGRADE_DIR}/baseline/DocumentBurster/file-1.txt`,
          'DocumentBurster.exe',
        )
        .click('#oldDbInstallationFolder')
        .typeText('playwright/')
        .waitOnElementToBecomeVisible('#btnE2EFillInfo')
        .click('#btnE2EFillInfo')
        .waitOnElementToBecomeInvisible('#btnE2EFillInfo')
        .waitOnElementToBecomeVisible('#btnMigrate')
        .click('#btnMigrate')
        .clickNoDontDoThis()
        .click('#btnMigrate')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_STATUS_BAR)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_STATUS_BAR)
        .elementShouldNotBeVisible('#btnMigrate')
        .gotoConfigurationReports()
        .setValue('#reportsListSearch', '6.2')
        .sleep(400)
        .click('#burst_15-settings-6\\.2-custom\\.xml')
        .waitOnElementToBecomeVisible('#btnLoadInvite_burst_15-settings-6\\.2-custom\\.xml')
        .click('#btnLoadInvite_burst_15-settings-6\\.2-custom\\.xml')
        .waitOnElementToBecomeVisible('#btnLoadConfirmYes_burst_15-settings-6\\.2-custom\\.xml')
        .click('#btnLoadConfirmYes_burst_15-settings-6\\.2-custom\\.xml')
        .waitOnElementToBecomeVisible('#burstFileName')
        .inputShouldHaveValue(
          '#burstFileName',
          'custom-${var0}.${output_type_extension}',
        )
        .inputShouldHaveValue('#outputFolder', 'custom-output path')
        .inputShouldHaveValue('#quarantineFolder', 'custom-quarantine');
    },
  );
});
