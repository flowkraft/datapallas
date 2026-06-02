import * as path from 'path';
const slash = require('slash');

import { ElectronApplication, Page, test } from '@playwright/test';
import * as jetpack from 'fs-jetpack';

import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import * as PATHS from '../../utils/paths';
import { Helpers } from '../../utils/helpers';
import { FluentTester } from '../../helpers/fluent-tester';

//DONE2
test.describe('', async () => {
  test('should correctly, at runtime when already started, pick-up and display log files which contain data', async function () {
    //const shouldDeactivateLicenseKey = true;
    const shouldDeactivateLicenseKey = false;

    //reload default "clean" configuration
    await Helpers.restoreDocumentBursterCleanState(shouldDeactivateLicenseKey);

    const firstPage = await Helpers.appStart();

    //const shouldRestartApp = false;
    await _shouldCorrectlyDisplayLogFiles(firstPage);

    return Helpers.appClose();
  });

  electronBeforeAfterAllTest(
    'should correctly display the log viewers in the initial "Empty" state',
    async function ({ beforeAfterEach: firstPage }) {
      const ft = new FluentTester(firstPage);

      await ft
        .gotoBurstScreen()
        .appShouldBeReadyToRunNewJobs()
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#tab-btn-logsTab')
        .elementShouldBeVisible('dburst-log-files-viewer-all-together #infoLog')
        .elementShouldBeVisible(
          'dburst-log-files-viewer-all-together #errorsLog',
        )
        .elementShouldBeVisible(
          'dburst-log-files-viewer-all-together #warningsLog',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '',
        );
    },
  );

  electronBeforeAfterAllTest(
    'should correctly, at runtime when already started, handle log files which are constantly updated',
    async function ({ beforeAfterEach: firstPage }) {
      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/errors-with-123data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/errors.log`,
          ),
        ),
        { overwrite: true },
      );
      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/warnings-with-1234data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/warnings.log`,
          ),
        ),
        { overwrite: true },
      );
      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/info-with-12data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/info.log`,
          ),
        ),
        { overwrite: true },
      );

      const ft = new FluentTester(firstPage);
      await ft
        .gotoBurstScreen()
        .appShouldBeReadyToRunNewJobs()
        .waitOnElementToBecomeVisible('#btnErrors')
        .appStatusShouldShowErrors()
        .click('#tab-btn-logsTab')
        .elementShouldBeVisible('dburst-log-files-viewer-all-together #infoLog')
        .elementShouldBeVisible(
          'dburst-log-files-viewer-all-together #errorsLog',
        )
        .elementShouldBeVisible(
          'dburst-log-files-viewer-all-together #warningsLog',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '1',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '2',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '1',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '3',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '2',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '1',
        );

      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/warnings-with-123456789data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/warnings.log`,
          ),
        ),
        {
          overwrite: true,
        },
      );

      await ft
        .appShouldBeReadyToRunNewJobs()
        .waitOnElementToBecomeVisible('#btnErrors')
        .appStatusShouldShowErrors()
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '2',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '1',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '3',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '2',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '1',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '8',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '7',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '6',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '5',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '4',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '3',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '2',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '1',
        );
    },
  );

  electronBeforeAfterAllTest(
    'should correctly, at runtime when app runs, handle emptied log files and when log files are re-populated should work fine',
    async function ({ beforeAfterEach: firstPage }) {
      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/errors-with-123data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/errors.log`,
          ),
        ),
        { overwrite: true },
      );

      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/warnings-with-1234data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/warnings.log`,
          ),
        ),
        { overwrite: true },
      );

      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/info-with-12data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/info.log`,
          ),
        ),
        { overwrite: true },
      );

      const ft = new FluentTester(firstPage);
      await ft
        .gotoBurstScreen()
        .appShouldBeReadyToRunNewJobs()
        .waitOnElementToBecomeVisible('#btnErrors')
        .appStatusShouldShowErrors()
        .click('#tab-btn-logsTab')
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '1',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '2',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '1',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '3',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '2',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '1',
        );

      await jetpack.writeAsync(
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/info.log`,
          ),
        ),
        '',
      );

      await jetpack.writeAsync(
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/errors.log`,
          ),
        ),
        '',
      );

      await jetpack.writeAsync(
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/warnings.log`,
          ),
        ),
        '',
      );

      await ft
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '',
        );

      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/errors-with-123data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/errors.log`,
          ),
        ),
        { overwrite: true },
      );

      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/warnings-with-123456789data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/warnings.log`,
          ),
        ),
        { overwrite: true },
      );

      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/info-with-12data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/info.log`,
          ),
        ),
        { overwrite: true },
      );

      await ft
        .waitOnElementToBecomeVisible('#btnErrors')
        .appStatusShouldShowErrors()
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '1',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '2',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '1',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '8',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '7',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '6',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '5',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '4',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '3',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '2',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '1',
        );
    },
  );

  electronBeforeAfterAllTest(
    'should handle correctly pressing the Clear Info button',
    async function ({ beforeAfterEach: firstPage }) {
      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/info-with-12data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/info.log`,
          ),
        ),
        { overwrite: true },
      );

      const ft = new FluentTester(firstPage);

      await ft
        .gotoBurstScreen()
        .appShouldBeReadyToRunNewJobs()
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#tab-btn-logsTab')
        .elementShouldBeVisible('dburst-log-files-viewer-all-together #infoLog')
        .elementShouldBeVisible(
          'dburst-log-files-viewer-all-together #errorsLog',
        )
        .elementShouldBeVisible(
          'dburst-log-files-viewer-all-together #warningsLog',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '1',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '',
        )
        .click('#btnClearLogFiles')
        .click('#btnClearInfoLog')
        .clickYesDoThis()
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '',
        )
        .appStatusShouldBeGreatNoErrorsNoWarnings();
    },
  );

  electronBeforeAfterAllTest(
    'should handle correctly pressing the Clear Warnings button',
    async function ({ beforeAfterEach: firstPage }) {
      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/warnings-with-1234data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/warnings.log`,
          ),
        ),
        {
          overwrite: true,
        },
      );

      const ft = new FluentTester(firstPage);

      return ft
        .gotoBurstScreen()
        .appShouldBeReadyToRunNewJobs()
        .waitOnElementToBecomeVisible('#btnWarnings')
        .appStatusShouldShowWarnings()
        .click('#tab-btn-logsTab')
        .elementShouldHaveText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '',
        )
        .elementShouldHaveText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '3',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '2',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '1',
        )
        .click('#btnClearLogFiles')
        .click('#btnClearWarningsLog')
        .clickYesDoThis()
        .waitOnElementToBecomeInvisible('#btnWarnings')
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .elementShouldHaveText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '',
        )
        .elementShouldHaveText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '',
        )
        .elementShouldHaveText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '',
        );
    },
  );

  electronBeforeAfterAllTest(
    'should handle correctly pressing the Clear Errors button',
    async function ({ beforeAfterEach: firstPage }) {
      await Helpers.clearLogFiles();

      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/errors-with-123data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/errors.log`,
          ),
        ),
        { overwrite: true },
      );

      const ft = new FluentTester(firstPage);

      return ft
        .gotoBurstScreen()
        .appShouldBeReadyToRunNewJobs()
        .waitOnElementToBecomeVisible('#btnErrors')
        .appStatusShouldShowErrors()
        .click('#tab-btn-logsTab')
        .elementShouldHaveText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '',
        )
        .elementShouldHaveText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '2',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '1',
        )
        .click('#btnClearLogFiles')
        .click('#btnClearErrorsLog')
        .clickYesDoThis()
        .waitOnElementToBecomeInvisible('#btnErrors')
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .elementShouldHaveText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '',
        )
        .elementShouldHaveText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '',
        );
    },
  );

  electronBeforeAfterAllTest(
    'should handle correctly pressing the Clear Quarantined Files button',
    async function ({ beforeAfterEach: firstPage }) {
      await Helpers.clearLogFiles();

      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/quarantine`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.QUARANTINE_PATH}`,
          ),
        ),
        {
          overwrite: true,
        },
      );

      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/errors-with-123data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/errors.log`,
          ),
        ),
        { overwrite: true },
      );
      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/warnings-with-1234data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/warnings.log`,
          ),
        ),
        { overwrite: true },
      );
      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/info-with-12data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/info.log`,
          ),
        ),
        { overwrite: true },
      );

      const ft = new FluentTester(firstPage);
      await ft
        .gotoBurstScreen()
        .appShouldBeReadyToRunNewJobs()
        .waitOnElementToBecomeVisible('#btnErrors')
        .appStatusShouldShowErrors()
        .click('#tab-btn-logsTab')
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '2',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '1',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '3',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '2',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '1',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '4',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '3',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '2',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '1',
        )
        .processingShouldHaveGeneratedQuarantineFiles([
          'alfreda.waldback@northridgehealth.org.pdf',
          'clyde.grew@northridgehealth.org.pdf',
          'kyle.butford@northridgehealth.org.pdf',
        ])
        .click('#btnClearLogFiles')
        .click('#btnClearQuarantinedFiles')
        .clickYesDoThis()
        .appStatusShouldShowErrors()
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '2',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '1',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '3',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '2',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '1',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '4',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '3',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '2',
        )
        .elementShouldContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '1',
        )
        .processingShouldHaveGeneratedQuarantineFiles([]);
    },
  );

  electronBeforeAfterAllTest(
    'should handle correctly pressing the Clear All Quarantined and Log Files button',
    async function ({ beforeAfterEach: firstPage }) {
      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/quarantine`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.QUARANTINE_PATH}`,
          ),
        ),
        {
          overwrite: true,
        },
      );

      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/errors-with-123data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/errors.log`,
          ),
        ),
        { overwrite: true },
      );
      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/warnings-with-1234data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/warnings.log`,
          ),
        ),
        { overwrite: true },
      );
      await jetpack.copyAsync(
        `${PATHS.E2E_RESOURCES_PATH}/logs/info-with-12data.log`,
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/info.log`,
          ),
        ),
        { overwrite: true },
      );

      const ft = new FluentTester(firstPage);

      await ft
        .gotoBurstScreen()
        .appShouldBeReadyToRunNewJobs()
        .waitOnElementToBecomeVisible('#btnErrors')
        .appStatusShouldShowErrors()
        .click('#tab-btn-logsTab')
        .elementShouldBeVisible('dburst-log-files-viewer-all-together #infoLog')
        .elementShouldBeVisible(
          'dburst-log-files-viewer-all-together #errorsLog',
        )
        .elementShouldBeVisible(
          'dburst-log-files-viewer-all-together #warningsLog',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '1',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '2',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '1',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '3',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '2',
        )
        .waitOnElementToContainText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '1',
        )
        .processingShouldHaveGeneratedQuarantineFiles([
          'alfreda.waldback@northridgehealth.org.pdf',
          'clyde.grew@northridgehealth.org.pdf',
          'kyle.butford@northridgehealth.org.pdf',
        ])
        .click('#btnClearLogFiles')
        .click('#btnClearAllLogQuarantinedFiles')
        .clickYesDoThis()
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToHaveText(
          'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
          '',
        )
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .processingShouldHaveGeneratedQuarantineFiles([]);
    },
  );
});

async function _shouldCorrectlyDisplayLogFiles(firstPage: Page) {
  await jetpack.copyAsync(
    `${PATHS.E2E_RESOURCES_PATH}/logs/errors-with-123data.log`,
    path.resolve(
      slash(
        `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/errors.log`,
      ),
    ),
    { overwrite: true },
  );

  await jetpack.copyAsync(
    `${PATHS.E2E_RESOURCES_PATH}/logs/warnings-with-1234data.log`,
    path.resolve(
      slash(
        `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/warnings.log`,
      ),
    ),
    { overwrite: true },
  );

  await jetpack.copyAsync(
    `${PATHS.E2E_RESOURCES_PATH}/logs/info-with-12data.log`,
    path.resolve(
      slash(
        `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/info.log`,
      ),
    ),
    { overwrite: true },
  );

  const ft = new FluentTester(firstPage);
  await ft
    .gotoBurstScreen()
    .appShouldBeReadyToRunNewJobs()
    .waitOnElementToBecomeVisible('#btnErrors')
    .appStatusShouldShowErrors()
    .click('#tab-btn-logsTab')
    .elementShouldBeVisible('dburst-log-files-viewer-all-together #infoLog')
    .elementShouldBeVisible('dburst-log-files-viewer-all-together #errorsLog')
    .elementShouldBeVisible('dburst-log-files-viewer-all-together #warningsLog')
    .waitOnElementToContainText(
      'dburst-log-files-viewer-all-together #infoLog dburst-log-file-viewer div',
      '1',
    )
    .waitOnElementToContainText(
      'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
      '2',
    )
    .waitOnElementToContainText(
      'dburst-log-files-viewer-all-together #errorsLog dburst-log-file-viewer div',
      '1',
    )
    .waitOnElementToContainText(
      'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
      '3',
    )
    .waitOnElementToContainText(
      'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
      '2',
    )
    .waitOnElementToContainText(
      'dburst-log-files-viewer-all-together #warningsLog dburst-log-file-viewer div',
      '1',
    );

  await Helpers.appClose();
}
