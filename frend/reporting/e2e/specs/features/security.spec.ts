import * as path from 'path';
import _ from 'lodash';

import { test } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../helpers/areas/connections-test-helper';

/**
 * Security E2E Tests
 *
 * Verifies:
 * 1. Email connection passwords are encrypted on disk (ENC(...)) after creation
 * 2. Database connection passwords are encrypted on disk after creation
 * 3. Password fields are masked (type="password") and toggleable via eye icon
 * 4. Saved connection XML files never contain plaintext passwords (AI boundary)
 */

const KNOWN_EMAIL_PASSWORD = 'TestSecretPassword123!';
const KNOWN_DB_PASSWORD = 'DbSecretPassword456!';

const SECURITY_EMAIL_CONNECTION_NAME = 'Security Test Email';
const SECURITY_EMAIL_CONNECTION_FILENAME = `eml-${_.kebabCase(SECURITY_EMAIL_CONNECTION_NAME)}\\.xml`;
const SECURITY_EMAIL_CONNECTION_FILENAME_RAW = `eml-${_.kebabCase(SECURITY_EMAIL_CONNECTION_NAME)}.xml`;

const SECURITY_DB_CONNECTION_NAME = 'Security Test Db';
const SECURITY_DB_VENDOR = 'postgres';
const SECURITY_DB_CONNECTION_CODE = `db-${_.kebabCase(SECURITY_DB_CONNECTION_NAME)}-${SECURITY_DB_VENDOR}`;
const SECURITY_DB_CONNECTION_FILENAME = `${SECURITY_DB_CONNECTION_CODE}\\.xml`;
const SECURITY_DB_CONNECTION_FILENAME_RAW = `${SECURITY_DB_CONNECTION_CODE}.xml`;

test.describe('Security Tests', async () => {
  //
  // -- PASSWORD ENCRYPTION AT REST ----------------------------------------
  //

  electronBeforeAfterAllTest(
    '(password-encryption) email connection password should be encrypted on disk after creation',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      const ft = new FluentTester(firstPage);

      const xmlPath = path.resolve(
        process.env.PORTABLE_EXECUTABLE_DIR,
        'config/connections',
        SECURITY_EMAIL_CONNECTION_FILENAME_RAW,
      );

      // Create a new email connection with a KNOWN literal password
      await ft
        .navigateToConnectionsPage()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewEmail')
        .click('#btnNewEmail')
        .waitOnElementToBecomeVisible('#connectionName')
        .click('#connectionName')
        .typeText(SECURITY_EMAIL_CONNECTION_NAME)
        .waitOnElementToBecomeEnabled('#btnOKConfirmationConnectionModal')
        .click('#emailServerHost')
        .typeText('smtp.security-test.example.com')
        .click('#smtpPort')
        .typeText('587')
        .click('#fromName')
        .typeText('Security Tester')
        .click('#fromEmailAddress')
        .typeText('security@test.example.com')
        .click('#userName')
        .typeText('security-user')
        .click('#smtpPassword')
        .typeText(KNOWN_EMAIL_PASSWORD)
        .click('#btnOKConfirmationConnectionModal')
        .waitOnElementToHaveText(
          `#${SECURITY_EMAIL_CONNECTION_FILENAME} td:first-child`,
          SECURITY_EMAIL_CONNECTION_NAME,
        )
        // Assert: file exists and password is encrypted
        .fileShouldExist(xmlPath)
        .fileContentShouldContain(xmlPath, 'ENC(')
        .fileContentShouldNotContain(xmlPath, KNOWN_EMAIL_PASSWORD);

      // Cleanup: delete the email connection (inline to avoid gotoConnections() precondition)
      await ft
        .navigateToConnectionsPage()
        .waitOnElementToBecomeVisible(`#${SECURITY_EMAIL_CONNECTION_FILENAME}`)
        .clickAndSelectTableRow(`#${SECURITY_EMAIL_CONNECTION_FILENAME}`)
        .waitOnElementToBecomeEnabled('#btnDelete')
        .click('#btnDelete')
        .waitOnElementToBecomeVisible('#confirmDialog')
        .clickYesDoThis()
        .waitOnElementToBecomeInvisible(`#${SECURITY_EMAIL_CONNECTION_FILENAME}`);
    },
  );

  electronBeforeAfterAllTest(
    '(password-encryption) database connection password should be encrypted on disk after creation',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      const ft = new FluentTester(firstPage);

      const xmlPath = path.resolve(
        process.env.PORTABLE_EXECUTABLE_DIR,
        'config/connections',
        SECURITY_DB_CONNECTION_CODE,
        SECURITY_DB_CONNECTION_FILENAME_RAW,
      );

      // Create a new SQLite database connection with a KNOWN literal password
      await ft
        .navigateToConnectionsPage()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewDatabase')
        .click('#btnNewDatabase')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .waitOnElementToBecomeEnabled('#dbConnectionName')
        .click('#dbConnectionName')
        .typeText(SECURITY_DB_CONNECTION_NAME)
        .dropDownSelectOptionHavingValue('#dbType', SECURITY_DB_VENDOR)
        .waitOnElementToBecomeEnabled('#dbPassword')
        .click('#dbHost')
        .typeText('localhost')
        .click('#dbPort')
        .typeText('5432')
        .click('#dbName')
        .typeText('security_test_db')
        .click('#dbPassword')
        .typeText(KNOWN_DB_PASSWORD)
        .waitOnElementToBecomeEnabled('#btnOKConfirmationDbConnectionModal')
        .click('#btnOKConfirmationDbConnectionModal')
        .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal')
        .waitOnElementToBecomeVisible(`#${SECURITY_DB_CONNECTION_FILENAME}`)
        // Assert: file exists and password is encrypted
        .fileShouldExist(xmlPath)
        .fileContentShouldContain(xmlPath, 'ENC(')
        .fileContentShouldNotContain(xmlPath, KNOWN_DB_PASSWORD);

      // Cleanup: delete the connection
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft.navigateToConnectionsPage(),
        SECURITY_DB_CONNECTION_FILENAME,
        SECURITY_DB_VENDOR,
      );
    },
  );

  electronBeforeAfterAllTest(
    '(password-encryption) email password should decrypt back to the original value via reveal-password API',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      const ft = new FluentTester(firstPage);

      const emailConnectionId = SECURITY_EMAIL_CONNECTION_FILENAME_RAW.replace('.xml', '');

      // Create a new email connection with a KNOWN password, then verify
      // the reveal-password API decrypts it back to the original value
      await ft
        .navigateToConnectionsPage()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewEmail')
        .click('#btnNewEmail')
        .waitOnElementToBecomeVisible('#connectionName')
        .click('#connectionName')
        .typeText(SECURITY_EMAIL_CONNECTION_NAME)
        .waitOnElementToBecomeEnabled('#btnOKConfirmationConnectionModal')
        .click('#emailServerHost')
        .typeText('smtp.decrypt-test.example.com')
        .click('#smtpPassword')
        .typeText(KNOWN_EMAIL_PASSWORD)
        .click('#btnOKConfirmationConnectionModal')
        .waitOnElementToHaveText(
          `#${SECURITY_EMAIL_CONNECTION_FILENAME} td:first-child`,
          SECURITY_EMAIL_CONNECTION_NAME,
        )
        // Assert: reveal-password API decrypts back to the original value
        .apiPostJsonValueShouldEqual(
          `http://localhost:9090/api/connections/${emailConnectionId}/reveal-password`,
          { field: 'userpassword' },
          'password',
          KNOWN_EMAIL_PASSWORD,
        );

      // Cleanup: delete the connection
      await ConnectionsTestHelper.deleteAndAssertEmailConnection(
        ft.navigateToConnectionsPage(),
        SECURITY_EMAIL_CONNECTION_FILENAME,
      );
    },
  );

  electronBeforeAfterAllTest(
    '(password-encryption) database password should decrypt back to the original value via reveal-password API',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      const ft = new FluentTester(firstPage);

      // Create a new database connection with a KNOWN password, then verify
      // the reveal-password API decrypts it back to the original value
      await ft
        .navigateToConnectionsPage()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewDatabase')
        .click('#btnNewDatabase')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .waitOnElementToBecomeEnabled('#dbConnectionName')
        .click('#dbConnectionName')
        .typeText(SECURITY_DB_CONNECTION_NAME)
        .dropDownSelectOptionHavingValue('#dbType', SECURITY_DB_VENDOR)
        .waitOnElementToBecomeEnabled('#dbPassword')
        .click('#dbHost')
        .typeText('localhost')
        .click('#dbPort')
        .typeText('5432')
        .click('#dbName')
        .typeText('security_test_db')
        .click('#dbPassword')
        .typeText(KNOWN_DB_PASSWORD)
        .waitOnElementToBecomeEnabled('#btnOKConfirmationDbConnectionModal')
        .click('#btnOKConfirmationDbConnectionModal')
        .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal')
        .waitOnElementToBecomeVisible(`#${SECURITY_DB_CONNECTION_FILENAME}`)
        // Assert: reveal-password API decrypts back to the original value
        .apiPostJsonValueShouldEqual(
          `http://localhost:9090/api/connections/${SECURITY_DB_CONNECTION_CODE}/reveal-password`,
          { field: 'userpassword' },
          'password',
          KNOWN_DB_PASSWORD,
        );

      // Cleanup: delete the connection
      await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft.navigateToConnectionsPage(),
        SECURITY_DB_CONNECTION_FILENAME,
        SECURITY_DB_VENDOR,
      );
    },
  );

  //
  // -- PASSWORD UI MASKING ------------------------------------------------
  //

  electronBeforeAfterAllTest(
    '(password-ui) email connection password field should be masked by default and revealable with eye toggle',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      const ft = new FluentTester(firstPage);

      // Open a new email connection modal to inspect the password field
      await ft
        .navigateToConnectionsPage()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewEmail')
        .click('#btnNewEmail')
        .waitOnElementToBecomeVisible('#connectionName')
        .click('#connectionName')
        .typeText(SECURITY_EMAIL_CONNECTION_NAME)
        .waitOnElementToBecomeEnabled('#btnOKConfirmationConnectionModal')
        .click('#smtpPassword')
        .typeText(KNOWN_EMAIL_PASSWORD)
        // Assert: password field is masked by default
        .elementAttributeShouldHaveValue('#smtpPassword', 'type', 'password')
        // Click the eye toggle to reveal
        .click('#btnToggleEmailPassword')
        // Assert: password field is now visible
        .elementAttributeShouldHaveValue('#smtpPassword', 'type', 'text')
        // Click the eye toggle again to re-hide
        .click('#btnToggleEmailPassword')
        // Assert: password field is masked again
        .elementAttributeShouldHaveValue('#smtpPassword', 'type', 'password')
        // Close without saving
        .click('#btnCloseConnectionModal');
    },
  );

  electronBeforeAfterAllTest(
    '(password-ui) database connection password field should be masked by default and revealable with eye toggle',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      const ft = new FluentTester(firstPage);

      // Open a new database connection modal to inspect the password field
      await ft
        .navigateToConnectionsPage()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewDatabase')
        .click('#btnNewDatabase')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .waitOnElementToBecomeEnabled('#dbConnectionName')
        .click('#dbConnectionName')
        .typeText(SECURITY_DB_CONNECTION_NAME)
        .dropDownSelectOptionHavingValue('#dbType', 'postgres')
        .waitOnElementToBecomeEnabled('#dbPassword')
        .click('#dbPassword')
        .typeText(KNOWN_DB_PASSWORD)
        // Assert: password field is masked by default
        .elementAttributeShouldHaveValue('#dbPassword', 'type', 'password')
        // Click the eye toggle to reveal
        .click('#btnToggleDbPassword')
        // Assert: password field is now visible
        .elementAttributeShouldHaveValue('#dbPassword', 'type', 'text')
        // Click the eye toggle again to re-hide
        .click('#btnToggleDbPassword')
        // Assert: password field is masked again
        .elementAttributeShouldHaveValue('#dbPassword', 'type', 'password')
        // Close without saving
        .click('#btnCloseDbConnectionModal');
    },
  );

  //
  // -- AI BOUNDARY --------------------------------------------------------
  //

  electronBeforeAfterAllTest(
    '(ai-boundary) saved connection files should not contain plaintext passwords readable by AI agents',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
      const ft = new FluentTester(firstPage);

      const aiBoundaryPassword = 'MySecretPassword123!';

      const xmlPath = path.resolve(
        process.env.PORTABLE_EXECUTABLE_DIR,
        'config/connections',
        SECURITY_EMAIL_CONNECTION_FILENAME_RAW,
      );

      // Create an email connection with a KNOWN password
      await ft
        .navigateToConnectionsPage()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewEmail')
        .click('#btnNewEmail')
        .waitOnElementToBecomeVisible('#connectionName')
        .click('#connectionName')
        .typeText(SECURITY_EMAIL_CONNECTION_NAME)
        .waitOnElementToBecomeEnabled('#btnOKConfirmationConnectionModal')
        .click('#emailServerHost')
        .typeText('smtp.ai-boundary.example.com')
        .click('#smtpPassword')
        .typeText(aiBoundaryPassword)
        .click('#btnOKConfirmationConnectionModal')
        .waitOnElementToHaveText(
          `#${SECURITY_EMAIL_CONNECTION_FILENAME} td:first-child`,
          SECURITY_EMAIL_CONNECTION_NAME,
        )
        // Assert: file exists, contains ENC(), does NOT contain plaintext password
        .fileShouldExist(xmlPath)
        .fileContentShouldContain(xmlPath, 'ENC(')
        .fileContentShouldNotContain(xmlPath, aiBoundaryPassword);

      // Cleanup: delete the connection
      await ConnectionsTestHelper.deleteAndAssertEmailConnection(
        ft.navigateToConnectionsPage(),
        SECURITY_EMAIL_CONNECTION_FILENAME,
      );
    },
  );
});
