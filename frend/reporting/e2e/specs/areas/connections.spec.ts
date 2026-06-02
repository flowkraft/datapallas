import { test } from '@playwright/test';
import _ from 'lodash';

import { FluentTester } from '../../helpers/fluent-tester';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import * as PATHS from '../../utils/paths';
import { ConfTemplatesTestHelper } from '../../helpers/areas/conf-templates-test-helper';
import { ConfigurationTestHelper } from '../../helpers/areas/configuration-test-helper';
import { ConnectionsTestHelper, DB_VENDORS_DEFAULT, DB_VENDORS_SUPPORTED, hasSeedCapability, isOlapVendor, SCHEMA_TABLES_OLAP, SCHEMA_VIEWS_OLAP } from '../../helpers/areas/connections-test-helper';

const DB_VENDORS_SELECTED: string[] = (() => {
  //return ['postgres']; // DEV FOCUS — comment out to restore full rotation

  //return ['sqlite']; // DEV FOCUS — comment out to restore full rotation

  //return ['oracle'];
  //return ['oracle', 'sqlserver', 'ibmdb2', 'postgres', 'mysql', 'mariadb', 'supabase']; // DEV FOCUS — comment out to restore full rotation
  //return ['supabase']; // DEV FOCUS — comment out to restore full rotation
  
  //return ['duckdb', 'clickhouse']; // DEV FOCUS — comment out to restore full rotation
  //return ['duckdb']; // DEV FOCUS — comment out to restore full rotation
  //return ['clickhouse']; // DEV FOCUS — comment out to restore full rotation

  const requiredVendors = ['sqlite', 'duckdb']; // Always test SQLite and DuckDB
  const pool = DB_VENDORS_SUPPORTED.filter(v => !requiredVendors.includes(v));

  // Use date-based seed for daily variation but consistent within a run
  const today = new Date().toISOString().split('T')[0]; // e.g., "2025-12-02"
  const seed = today.split('-').reduce((acc, n) => acc + parseInt(n), 0);

  // Simple seeded shuffle
  const seededRandom = (i: number) => {
    const x = Math.sin(seed + i) * 10000;
    return x - Math.floor(x);
  };

  const shuffled = [...pool].sort((a, b) => seededRandom(pool.indexOf(a)) - seededRandom(pool.indexOf(b)));
  const pickedOthers = shuffled.slice(0, 1); // Pick only 1 other vendor (was 2)

  const list = [...requiredVendors, ...pickedOthers]; // sqlite, duckdb, + 1 random
  return list;
})();

// Helper to check if a database vendor is file-based (no Docker container needed)
const isFileBasedVendor = (vendor: string): boolean => {
  return vendor === 'sqlite' || vendor === 'duckdb';
};

// Northwind domain-grouped schema JSON fixture — shared by tests that need a
// pre-populated DGS on a connection. Factory so the `Order Details` table name
// can vary by vendor (ClickHouse stores it without the space).
const buildNorthwindDomainGroupedSchemaExample = (dbVendor: string): string => {
  const orderDetailsTableName = dbVendor === 'clickhouse' ? 'OrderDetails' : 'Order Details';
  return `{
  "originalSchema": [
    {
      "tableName": "Customers",
      "columns": [
        { "name": "CustomerID", "dataType": "NCHAR(5)", "isPrimaryKey": true },
        { "name": "CompanyName", "dataType": "NVARCHAR(40)" },
        { "name": "ContactName", "dataType": "NVARCHAR(30)" },
        { "name": "Country", "dataType": "NVARCHAR(15)" }
      ]
    },
    {
      "tableName": "Orders",
      "columns": [
        { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true },
        { "name": "CustomerID", "dataType": "NCHAR(5)", "isForeignKey": true, "references": "Customers" },
        { "name": "OrderDate", "dataType": "DATETIME" },
        { "name": "ShipCountry", "dataType": "NVARCHAR(15)" }
      ]
    },
    {
      "tableName": "${orderDetailsTableName}",
      "columns": [
        { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Orders" },
        { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Products" },
        { "name": "UnitPrice", "dataType": "MONEY" },
        { "name": "Quantity", "dataType": "SMALLINT" }
      ]
    },
    {
      "tableName": "Products",
      "columns": [
        { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true },
        { "name": "ProductName", "dataType": "NVARCHAR(40)" },
        { "name": "SupplierID", "dataType": "INT", "isForeignKey": true, "references": "Suppliers" },
        { "name": "CategoryID", "dataType": "INT", "isForeignKey": true, "references": "Categories" },
        { "name": "UnitPrice", "dataType": "MONEY" }
      ]
    },
    {
      "tableName": "Categories",
      "columns": [
        { "name": "CategoryID", "dataType": "INT", "isPrimaryKey": true },
        { "name": "CategoryName", "dataType": "NVARCHAR(15)" },
        { "name": "Description", "dataType": "NTEXT" }
      ]
    }
  ],
  "domainGroupedSchema": [
    {
      "label": "Customer Management",
      "children": [
        {
          "tableName": "Customers",
          "columns": [
            { "name": "CustomerID", "dataType": "NCHAR(5)", "isPrimaryKey": true },
            { "name": "CompanyName", "dataType": "NVARCHAR(40)" },
            { "name": "ContactName", "dataType": "NVARCHAR(30)" },
            { "name": "Country", "dataType": "NVARCHAR(15)" }
          ]
        }
      ]
    },
    {
      "label": "Sales & Orders",
      "children": [
        {
          "tableName": "Orders",
          "columns": [
            { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true },
            { "name": "CustomerID", "dataType": "NCHAR(5)", "isForeignKey": true, "references": "Customers" },
            { "name": "OrderDate", "dataType": "DATETIME" },
            { "name": "ShipCountry", "dataType": "NVARCHAR(15)" }
          ]
        },
        {
          "tableName": "${orderDetailsTableName}",
          "columns": [
            { "name": "OrderID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Orders" },
            { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true, "isForeignKey": true, "references": "Products" },
            { "name": "UnitPrice", "dataType": "MONEY" },
            { "name": "Quantity", "dataType": "SMALLINT" }
          ]
        }
      ]
    },
    {
      "label": "Product Catalog",
      "children": [
        {
          "tableName": "Products",
          "columns": [
            { "name": "ProductID", "dataType": "INT", "isPrimaryKey": true },
            { "name": "ProductName", "dataType": "NVARCHAR(40)" },
            { "name": "SupplierID", "dataType": "INT", "isForeignKey": true, "references": "Suppliers" },
            { "name": "CategoryID", "dataType": "INT", "isForeignKey": true, "references": "Categories" },
            { "name": "UnitPrice", "dataType": "MONEY" }
          ]
        },
        {
          "tableName": "Categories",
          "columns": [
            { "name": "CategoryID", "dataType": "INT", "isPrimaryKey": true },
            { "name": "CategoryName", "dataType": "NVARCHAR(15)" },
            { "name": "Description", "dataType": "NTEXT" }
          ]
        }
      ]
    }
  ]
}`;
};

//DONE2
test.describe('', async () => {

  electronBeforeAfterAllTest(
    '(email-connection) should correctly CRUD create, read, update, duplicate and delete',
    async function ({ beforeAfterEach: firstPage }) {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      let ft = new FluentTester(firstPage);

      ft = ConnectionsTestHelper.createAndAssertNewEmailConnection(
        ft,
        'Test Email Connection',
      );
      ft = ConnectionsTestHelper.readUpdateAndAssertEmailConnection(
        ft,
        'Test Email Connection',
      );
      ft = ConnectionsTestHelper.duplicateAndAssertEmailConnection(
        ft,
        'Test Email Connection',
      );
      ft = ConnectionsTestHelper.deleteAndAssertEmailConnection(
        ft,
        'eml-test-email-connection\\.xml',
      );
      ft = ConnectionsTestHelper.deleteAndAssertEmailConnection(
        ft,
        'eml-test-email-connection-duplicated\\.xml',
      );

      return ft;
    },
  );

  electronBeforeAfterAllTest(
    '(email-connection) should correctly handle all the "Default" related actions',
    async function ({ beforeAfterEach: firstPage }) {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      let ft = new FluentTester(firstPage);

      //assert basic "default" email-connection things
      ft.gotoConnections()
        .clickAndSelectTableRow(`#${PATHS.EML_CONTACT_FILE}`)
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .waitOnElementToBecomeEnabled('#btnEdit')
        .waitOnElementToBecomeEnabled('#btnDuplicate')
        .elementShouldContainText(
          `#${PATHS.EML_CONTACT_FILE} td:first-child`,
          'Default Email Connection',
        )
        .elementShouldContainText(
          `#${PATHS.EML_CONTACT_FILE} td:nth-child(2)`,
          'email-connection',
        )
        .elementShouldContainText(
          `#${PATHS.EML_CONTACT_FILE} td:nth-child(3)`,
          'Bursting',
        )
        .elementShouldBeVisible(`#btnDefault_${PATHS.EML_CONTACT_FILE}`)
        .elementShouldNotBeVisible(`#btnActions_${PATHS.EML_CONTACT_FILE}`)
        .click(`#btnDefault_${PATHS.EML_CONTACT_FILE}`)
        .waitOnElementToBecomeVisible(
          `#btnSendTestEmail_${PATHS.EML_CONTACT_FILE}`,
        )
        .elementShouldNotBeVisible(`#btnSeparator_${PATHS.EML_CONTACT_FILE}`)
        .elementShouldNotBeVisible(
          `#btnToggleDefault_${PATHS.EML_CONTACT_FILE}`,
        )
        //#btnDelete should be disabled for Default | usedBy != empty
        .elementShouldHaveClass('#btnDelete', 'disabled');

      //create 2nd email connection and assert it is not default and other basic things
      const secondEmailConnectionName = 'Second Email Connection';
      const secondEmailConnectionFileName = `eml-${_.kebabCase(
        secondEmailConnectionName,
      )}\\.xml`;

      ft = ConnectionsTestHelper.createAndAssertNewEmailConnection(
        ft,
        secondEmailConnectionName,
      );
      ft.gotoConnections()
        .clickAndSelectTableRow(`#${secondEmailConnectionFileName}`)
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .waitOnElementToBecomeEnabled('#btnEdit')
        .waitOnElementToBecomeEnabled('#btnDuplicate')
        //#btnDelete should be enable for NonDefault && usedBy == empty
        .waitOnElementToBecomeEnabled('#btnDelete')
        .elementShouldContainText(
          `#${secondEmailConnectionFileName} td:first-child`,
          secondEmailConnectionName,
        )
        .elementShouldContainText(
          `#${secondEmailConnectionFileName} td:nth-child(2)`,
          'email-connection',
        )
        .elementShouldHaveText(
          `#${secondEmailConnectionFileName} td:nth-child(3)`,
          '--not used--',
        );
      //toggle 1st time default and assert it worked
      ft = ConnectionsTestHelper.makeConnectionAsDefault(
        ft,
        secondEmailConnectionFileName,
      );

      //toggle 2nd tine default and assert it worked
      ft = ConnectionsTestHelper.makeConnectionAsDefault(
        ft,
        PATHS.EML_CONTACT_FILE,
      );

      ft = ConnectionsTestHelper.deleteAndAssertEmailConnection(
        ft,
        secondEmailConnectionFileName,
      );

      return ft;
    },
  );

  electronBeforeAfterAllTest(
    '(email-connection) should correctly handle Configuration -> Email -> Connection Settings -> "Re-use existing email connection"',
    async function ({ beforeAfterEach: firstPage }) {
      //long running test
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      let ft = new FluentTester(firstPage); //assert basic "default" connection things

      //assert basic "default" connection things
      ft = ConnectionsTestHelper.assertConfigurationUsesEmailConnection(
        ft,
        'burst',
        'Default Email Connection',
        'yes-default-connection',
      );

      ft = ConfTemplatesTestHelper.createNewTemplate(
        ft,
        'First Test Configuration',
      );
      ft = ConnectionsTestHelper.assertConfigurationUsesEmailConnection(
        ft,
        'first-test-configuration',
        'Default Email Connection',
        'yes-default-connection',
      );

      ft = ConnectionsTestHelper.createAndAssertNewEmailConnection(
        ft,
        'Test Contact Information',
      );

      ft = ConnectionsTestHelper.makeConnectionAsDefault(
        ft,
        'eml-test-contact-information\\.xml',
      );

      ft = ConfTemplatesTestHelper.createNewTemplate(
        ft,
        'Second Test Configuration',
      );

      ft = ConnectionsTestHelper.assertConfigurationUsesEmailConnection(
        ft,
        'second-test-configuration',
        'Test Contact Information',
        'yes-default-connection',
      );

      ft = ConfigurationTestHelper.loadConfiguration(ft, 'second-test-configuration')

      ft = ft
        .click('#leftMenuEmailSettings')
        .waitOnElementToBecomeVisible('#selectedEmailConnectionDefault')
        .waitOnElementToBecomeVisible('#btnSelectedEmailConnection')
        .click('#btnSelectedEmailConnection')
        .waitOnElementToBecomeVisible('#eml-contact')
        .click('#eml-contact')
        .clickNoDontDoThis()
        .click('#btnSelectedEmailConnection')
        .waitOnElementToBecomeVisible('#eml-contact')
        .click('#eml-contact')
        .clickYesDoThis()
        .waitOnElementToBecomeInvisible('#selectedEmailConnectionDefault')
        .gotoBurstScreen();

      ft = ConnectionsTestHelper.assertConfigurationUsesEmailConnection(
        ft,
        'second-test-configuration',
        'Default Email Connection',
        'no-default-connection',
      );

      //uncheck the "Re-use existing email connection" and change email host and port
      //and assert things are working correctly
      ft = ft
        .click('#btnUseExistingEmailConnection')
        .waitOnElementToBecomeInvisible('#btnSelectedEmailConnection')
        .waitOnElementToBecomeEnabled('#emailServerHost')
        .click('#emailServerHost')
        .typeText('')
        .typeText('email.company.com')
        .waitOnElementToBecomeEnabled('#smtpPort')
        .click('#smtpPort')
        .typeText('')
        .typeText('777');

      ft = ConfigurationTestHelper.loadConfiguration(ft, 'second-test-configuration')

      ft = ft
        .click('#leftMenuEmailSettings')
        .elementShouldNotBeVisible('#btnSelectedEmailConnection')
        .inputShouldHaveValue('#emailServerHost', 'email.company.com')
        .inputShouldHaveValue('#smtpPort', '777')
        .elementShouldBeEnabled('#fromName')
        .elementShouldBeEnabled('#fromEmailAddress')
        .elementShouldBeEnabled('#emailServerHost')
        .elementShouldBeEnabled('#smtpPort')
        .elementShouldBeEnabled('#userName')
        .elementShouldBeEnabled('#smtpPassword')
        .elementShouldBeEnabled('#btnTLS')
        .elementShouldBeEnabled('#btnSSL')
        .elementShouldNotHaveAttribute(
          '#btnFromNameVariables > button',
          'disabled',
        )
        .elementShouldNotHaveAttribute(
          '#btnFromEmailAddressVariables > button',
          'disabled',
        )
        .elementShouldNotHaveAttribute(
          '#btnEmailServerHostVariables > button',
          'disabled',
        )
        .elementShouldNotHaveAttribute(
          '#btnSmtpPortVariables > button',
          'disabled',
        )
        .elementShouldNotHaveAttribute(
          '#btnUserNameVariables > button',
          'disabled',
        )
        .elementShouldNotHaveAttribute(
          '#btnSmtpPasswordVariables > button',
          'disabled',
        );

      //check back "Re-use existing email connection" and then "Manage Email Connections" and change email host and port
      //and come back to Connection and check things are working correctly
      ft = ConfigurationTestHelper.loadConfiguration(ft, 'second-test-configuration')

      ft = ft
        .click('#leftMenuEmailSettings')
        .click('#btnUseExistingEmailConnection')
        .sleep(Constants.DELAY_ONE_SECOND) // allow debounced save (useconn=true) to flush before sub-navigation
        .waitOnElementToBecomeDisabled('#emailServerHost')
        .waitOnElementToBecomeVisible('#btnSelectedEmailConnection')
        .click('#btnSelectedEmailConnection')
        .waitOnElementToBecomeVisible('#manageEmailConnections')
        .click('#manageEmailConnections')
        .waitOnElementToBecomeInvisible('#btnSelectedEmailConnection')
        .waitOnElementToBecomeVisible('#btnGoBack')
        .waitOnElementToHaveText(
          `#${PATHS.EML_CONTACT_FILE} td:first-child`,
          'Default Email Connection',
        )
        .clickAndSelectTableRow(`#${PATHS.EML_CONTACT_FILE}`)
        .waitOnElementToBecomeEnabled('#btnEdit')
        .click('#btnEdit')
        .waitOnElementToBecomeEnabled('#emailServerHost')
        .click('#emailServerHost')
        .typeText('')
        .typeText('smtp.exmail.qq.com Modified')
        .waitOnElementToBecomeEnabled('#smtpPort')
        .click('#smtpPort')
        .typeText('')
        .typeText('999')
        .click('#btnOKConfirmationConnectionModal')
        .waitOnElementToBecomeVisible('#btnGoBack');

      ft = ConnectionsTestHelper.makeConnectionAsDefault(
        ft,
        PATHS.EML_CONTACT_FILE,
      );

      //assert that changes are reflected accurately
      ft = ft
        .click('#btnGoBack')
        .waitOnElementToBecomeVisible('#selectedEmailConnectionDefault')
        .waitOnElementToContainText(
          '#btnSelectedEmailConnection',
          'Default Email Connection',
        )
        .inputShouldHaveValue('#emailServerHost', 'smtp.exmail.qq.com Modified')
        .inputShouldHaveValue('#smtpPort', '999')
        .elementShouldBeDisabled('#emailServerHost')
        .elementShouldBeDisabled('#smtpPort');

      ft = ConfigurationTestHelper.loadConfiguration(ft, 'second-test-configuration')

      ft = ft
        .click('#leftMenuEmailSettings')
        .elementCheckBoxShouldBeSelected('#btnUseExistingEmailConnection')
        .waitOnElementToBecomeVisible('#selectedEmailConnectionDefault')
        .waitOnElementToContainText(
          '#btnSelectedEmailConnection',
          'Default Email Connection',
        )
        .inputShouldHaveValue('#emailServerHost', 'smtp.exmail.qq.com Modified')
        .inputShouldHaveValue('#smtpPort', '999')
        .elementShouldBeDisabled('#emailServerHost')
        .elementShouldBeDisabled('#smtpPort');

      ft = ConfTemplatesTestHelper.deleteTemplate(
        ft,
        'first-test-configuration',
      );

      ft = ConfTemplatesTestHelper.deleteTemplate(
        ft,
        'second-test-configuration',
      );
      ft = ConnectionsTestHelper.deleteAndAssertEmailConnection(
        ft,
        'eml-test-contact-information\\.xml',
      );

      return ft;
    },
  );

  electronBeforeAfterAllTest(
    '(email-connection) should exercise Send Test Email: unsaved modal, list, config reuse, inline valid and inline invalid (bundled SMTP)',
    async function ({ beforeAfterEach: firstPage }) {
      // generous timeout for network & SMTP operations
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      let ft = new FluentTester(firstPage);

      // Test connection name + derived selectors
      const connectionName = 'E2E Combined Email Conn';
      const connectionCode = `eml-${_.kebabCase(connectionName)}`;
      const connectionFileId = `${connectionCode}\\.xml`;
      const escapedWhich = PATHS.SETTINGS_CONFIG_FILE;

      // --------------------------------------------------------------------
      // STEP 1 — Start bundled SMTP test server so we can verify deliveries
      // --------------------------------------------------------------------
      ft = ft.gotoBurstScreen()
        .click('#leftMenuQualityAssurance')
        .click('#testTokensRandom')
        .waitOnElementToBecomeVisible('#startTestEmailServer')
        .waitOnElementToBecomeEnabled('#startTestEmailServer')
        .click('#startTestEmailServer')
        .clickYesDoThis()
        .waitOnElementToBecomeEnabled('#stopTestEmailServer', Constants.DELAY_FIVE_HUNDRED_SECONDS);

      // ensure inbox starts empty
      ft = ft.shouldHaveSentNCorrectEmails(0);

      // --------------------------------------------------------------------
      // STEP 2 — UNSAVED flow: open New Email modal, fill fields but DO NOT save,
      //           click Send Test Email -> expect "Save first?" dialog -> choose NO -> assert no email sent
      // --------------------------------------------------------------------
      ft = ft.gotoConnections()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewEmail')
        .click('#btnNewEmail')
        .waitOnElementToBecomeVisible('#modalExtConnection')
        .waitOnElementToBecomeEnabled('#connectionName')
        .click('#connectionName').typeText(connectionName)
        .waitOnElementToBecomeEnabled('#fromName')
        .click('#fromName').typeText('Test User')
        .waitOnElementToBecomeEnabled('#fromEmailAddress')
        .click('#fromEmailAddress').typeText('test@example.com')
        .waitOnElementToBecomeEnabled('#emailServerHost')
        .click('#emailServerHost').typeText('127.0.0.1')
        .waitOnElementToBecomeEnabled('#smtpPort')
        .click('#smtpPort').typeText('1025');

      // Click Send Test Email (unsaved): expect "Save first?" -> click NO -> verify no email sent
      ft = ft.waitOnElementToBecomeVisible('#btnSendTestEmail')
        .waitOnElementToBecomeEnabled('#btnSendTestEmail')
        .click('#btnSendTestEmail')
        .waitOnElementToContainText(
          '#confirmDialog .modal-box',
          'The connection must be saved before being able to test it. Save now?',
        )
        .clickNoDontDoThis()
        .waitOnElementToBecomeInvisible('#confirmDialog');

      // assert still zero emails delivered
      ft = ft.shouldHaveSentNCorrectEmails(0);

      // --------------------------------------------------------------------
      // STEP 3 — UNSAVED flow continued: click Send Test Email again, choose YES to save+test,
      //           assert success toast and that 1 email was delivered
      // --------------------------------------------------------------------
      // Match main's working flow EXACTLY: doTestSMTPConnection auto-chains
      // runTest() from inside the "Save now?" confirmAction, so the "Send test
      // email?" dialog opens immediately after save (no count=0 window between
      // chained confirms). Don't assert invisibility between them — just wait
      // for the new text in the visible dialog. The final invisibility check is
      // also dropped: button-disabled/enabled toggles already prove the test ran.
      ft = ft.waitOnElementToBecomeEnabled('#btnSendTestEmail')
        .click('#btnSendTestEmail')
        .waitOnElementToContainText(
          '#confirmDialog .modal-box:visible',
          'The connection must be saved before being able to test it. Save now?',
        )
        .clickYesDoThis()
        .waitOnElementToContainText(
          '#confirmDialog .modal-box:visible',
          'Send test email?',
        )
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnSendTestEmail', Constants.DELAY_HUNDRED_SECONDS)
        .waitOnElementToBecomeEnabled('#btnSendTestEmail', Constants.DELAY_HUNDRED_SECONDS)
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      // verify SMTP received 1 email (the saved+tested connection)
      ft = ft.shouldHaveSentNCorrectEmails(1)
        .click('#btnOKConfirmationConnectionModal')
        .waitOnToastToBecomeVisible(
          'info',
          `Connection '${connectionName}' saved successfully.`,
        )
        .clickAndSelectTableRow(`#${connectionCode}\\.xml`)
        .gotoBurstScreen();

      // --------------------------------------------------------------------
      // STEP 4 — From Connections list: press Send Test Email next to saved row
      // --------------------------------------------------------------------
      ft = ft.gotoConnections()
        .waitOnElementToHaveText(`#${connectionFileId} td:first-child`, connectionName)
        .clickAndSelectTableRow(`#${connectionFileId}`)
        .waitOnElementToBecomeVisible(`#btnActions_${connectionFileId}`)
        .click(`#btnActions_${connectionFileId}`)
        .waitOnElementToBecomeVisible(`#btnSendTestEmail_${connectionFileId}`)
        .waitOnElementToBecomeEnabled(`#btnSendTestEmail_${connectionFileId}`)
        .click(`#btnSendTestEmail_${connectionFileId}`)
        .waitOnElementToBecomeVisible('#btnClearLogsConnection')
        .waitOnElementToBecomeEnabled('#btnClearLogsConnection')
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnConfirmDialogToBecomeInvisible()
        .click('#btnClearLogsConnection')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogsConnection')
        .waitOnElementToBecomeEnabled('#btnSendTestEmail')
        .click('#btnSendTestEmail')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnSendTestEmail', Constants.DELAY_HUNDRED_SECONDS)
        .waitOnElementToBecomeEnabled('#btnSendTestEmail', Constants.DELAY_HUNDRED_SECONDS)
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      // verify SMTP received 2 emails total now
      ft = ft.shouldHaveSentNCorrectEmails(2)
        .click('#btnCloseConnectionModal')
        .waitOnElementToBecomeInvisible('#btnCloseConnectionModal')
        .clickAndSelectTableRow(`#${connectionCode}\\.xml`);

      // --------------------------------------------------------------------
      // STEP 5 — Configuration tab: Re-use existing email connection -> select saved connection -> Send Test Email
      // --------------------------------------------------------------------
      ft = ft.gotoBurstScreen()
        .click('#topMenuConfiguration')
        .click('#topMenuConfigurationLoad_burst_' + escapedWhich)
        .click('#leftMenuEmailSettings');

      ft = ft.waitOnElementToBecomeVisible('#btnUseExistingEmailConnection')
        .elementCheckBoxShouldBeSelected('#btnUseExistingEmailConnection')
        .waitOnElementToBecomeVisible('#btnSelectedEmailConnection')
        .click('#btnSelectedEmailConnection')
        .waitOnElementToBecomeVisible(`#${connectionCode}`)
        .click(`#${connectionCode}`)
        .clickYesDoThis()
        .waitOnElementToBecomeInvisible('#selectedEmailConnectionDefault', Constants.DELAY_TEN_SECONDS)
        .waitOnElementToBecomeVisible('#btnClearLogs')
        .waitOnElementToBecomeEnabled('#btnClearLogs')
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .waitOnElementToBecomeVisible('#btnSendTestEmail')
        .waitOnElementToBecomeEnabled('#btnSendTestEmail')
        .click('#btnSendTestEmail')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnSendTestEmail', Constants.DELAY_HUNDRED_SECONDS)
        .waitOnElementToBecomeEnabled('#btnSendTestEmail', Constants.DELAY_HUNDRED_SECONDS)
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      // verify SMTP received 3 emails total now
      ft = ft.shouldHaveSentNCorrectEmails(3);

      // --------------------------------------------------------------------
      // STEP 6 — Configuration tab: uncheck "Re-use" and use inline SMTP details (valid) -> Send Test Email
      // --------------------------------------------------------------------
      ft = ft.waitOnElementToBecomeVisible('#btnUseExistingEmailConnection')
        .click('#btnUseExistingEmailConnection') // uncheck -> inline enabled
        .waitOnElementToBecomeEnabled('#emailServerHost')
        .click('#emailServerHost').typeText('') // clear then set
        .typeText('127.0.0.1')
        .waitOnElementToBecomeEnabled('#smtpPort')
        .click('#smtpPort').typeText('') // clear then set
        .typeText('1025')
        .waitOnElementToBecomeEnabled('#fromName')
        .click('#fromName').typeText('Test User')
        .waitOnElementToBecomeEnabled('#fromEmailAddress')
        .click('#fromEmailAddress').typeText('test@example.com');

      ft = ft.waitOnElementToBecomeEnabled('#btnClearLogs')
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .waitOnElementToBecomeEnabled('#btnSendTestEmail')
        .click('#btnSendTestEmail')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnSendTestEmail', Constants.DELAY_HUNDRED_SECONDS)
        .waitOnElementToBecomeEnabled('#btnSendTestEmail', Constants.DELAY_HUNDRED_SECONDS)
        .appStatusShouldBeGreatNoErrorsNoWarnings();

      // verify SMTP received 4 emails total now
      ft = ft.shouldHaveSentNCorrectEmails(4);

      // --------------------------------------------------------------------
      // STEP 7 — Configuration tab: inline invalid SMTP detail (wrong port) -> Send Test Email -> expect NO new email delivered
      // --------------------------------------------------------------------
      ft = ft.waitOnElementToBecomeEnabled('#smtpPort')
        .click('#smtpPort')
        .typeText('') // clear
        .typeText('9999') // invalid port
        .waitOnElementToBecomeEnabled('#btnClearLogs')
        .click('#btnClearLogs')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogs')
        .waitOnElementToBecomeEnabled('#btnSendTestEmail')
        .click('#btnSendTestEmail')
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnSendTestEmail', Constants.DELAY_HUNDRED_SECONDS)
        .waitOnElementToBecomeEnabled('#btnSendTestEmail', Constants.DELAY_HUNDRED_SECONDS)
        .appStatusShouldShowErrors();

      // mailbox should remain unchanged (still 4)
      ft = ft.shouldHaveSentNCorrectEmails(4);

      // --------------------------------------------------------------------
      // STEP 8 — Stop bundled SMTP server
      // --------------------------------------------------------------------
      ft = ft.gotoBurstScreen()
        .click('#leftMenuQualityAssurance')
        .click('#testTokensRandom')
        .waitOnElementToBecomeVisible('#stopTestEmailServer')
        .waitOnElementToBecomeEnabled('#stopTestEmailServer')
        .click('#stopTestEmailServer')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#startTestEmailServer', Constants.DELAY_FIVE_HUNDRED_SECONDS);

      // --------------------------------------------------------------------
      // STEP 9 — Cleanup: delete created email connection
      // --------------------------------------------------------------------
      ft = ft.gotoConnections();
      ft = ConnectionsTestHelper.deleteAndAssertEmailConnection(ft, connectionFileId);

      return ft;
    },
  );

  for (const dbVendor of DB_VENDORS_SELECTED) {
    electronBeforeAfterAllTest(
      `(database-connection) [${dbVendor}] should correctly CRUD create, read, update, duplicate and delete`,
      async function ({ beforeAfterEach: firstPage }) {
        //long running test
        test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

        const connectionName = `Test Database Connection (${dbVendor})`;
        const dbConnection1FileNameAndId = `db-${_.kebabCase(connectionName)}-${dbVendor}\\.xml`; // For UI element IDs

        let ft = new FluentTester(firstPage);

        // Create a new database connection
        ft = ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
          ft,
          connectionName,
          dbVendor,
        );

        // Read and update the connection
        ft = ConnectionsTestHelper.readUpdateAndAssertDatabaseConnection(
          ft,
          connectionName,
          dbVendor,
        );

        // Duplicate the connection
        ft = ConnectionsTestHelper.duplicateAndAssertDatabaseConnection(
          ft,
          connectionName,
          dbVendor,
        );

        // Delete both connections and verify associated files are also deleted
        ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          ft,
          dbConnection1FileNameAndId,
          dbVendor,
        );
        ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          ft,
          `db-${_.kebabCase(`${connectionName} Duplicated`)}-${dbVendor}\\.xml`,
          dbVendor,
        );

        return ft;
      },
    );

    electronBeforeAfterAllTest(
      `(database-connection) [${dbVendor}] should correctly handle all the "Default" related actions`,
      async function ({ beforeAfterEach: firstPage }) {
        test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

        let ft = new FluentTester(firstPage);

        const dbConnection1Name = `First Test DB for Default (${dbVendor})`;
        const dbConnection1FileNameAndId = `db-${_.kebabCase(dbConnection1Name)}-${dbVendor}\\.xml`; // For UI element IDs
        const dbConnection1Vendor = dbVendor;

        const dbConnection2Name = `Second Test DB for Default (${dbVendor})`;
        const dbConnection2FileNameAndId = `db-${_.kebabCase(dbConnection2Name)}-${dbVendor}\\.xml`;
        const dbConnection2Vendor = dbVendor;

        // --- Test Steps ---

        // 1. Go to connections.
        ft.gotoConnections();

        // 2. Create the first database connection.
        ft = ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
          ft,
          dbConnection1Name,
          dbConnection1Vendor,
        );

        // 3. Assert the first DB connection is present and NOT default initially.
        // "Make Default" should be available. Delete button should be enabled.
        ft.gotoConnections()
          .clickAndSelectTableRow(`#${dbConnection1FileNameAndId}`)
          .waitOnElementToBecomeEnabled('#btnNewDropdown')
          .waitOnElementToBecomeEnabled('#btnEdit')
          .waitOnElementToBecomeEnabled('#btnDuplicate')
          .waitOnElementToBecomeEnabled('#btnDelete') // Delete should be enabled for non-default & unused
          .elementShouldContainText(
            `#${dbConnection1FileNameAndId} td:first-child`,
            dbConnection1Name,
          )
          .elementShouldContainText(
            `#${dbConnection1FileNameAndId} td:nth-child(2)`,
            'database-connection',
          )
          .elementShouldHaveText(
            `#${dbConnection1FileNameAndId} td:nth-child(3)`,
            '--not used--',
          ).waitOnElementToBecomeVisible(
            `#btnDefault_${dbConnection1FileNameAndId}`,
          )
          .elementShouldNotBeVisible(`#btnActions_${dbConnection1FileNameAndId}`)
          .clickAndSelectTableRow(`#${dbConnection1FileNameAndId}`);

        // 5. Create the second database connection.
        ft = ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
          ft,
          dbConnection2Name,
          dbConnection2Vendor,
        );

        // 6. Assert the second DB connection is present and NOT default.
        // The first DB connection should still be default.
        // Delete button for second connection should be enabled.
        ft.gotoConnections()
          .clickAndSelectTableRow(`#${dbConnection2FileNameAndId}`)
          .elementShouldBeVisible(`#btnActions_${dbConnection2FileNameAndId}`)
          .elementShouldNotBeVisible(`#btnDefault_${dbConnection2FileNameAndId}`)
          .waitOnElementToBecomeEnabled('#btnDelete') // Delete enabled for this non-default
          // Verify first one is still default and its delete button is disabled
          .clickAndSelectTableRow(`#${dbConnection1FileNameAndId}`)
          .elementShouldBeVisible(`#btnDefault_${dbConnection1FileNameAndId}`)
          .elementShouldNotBeVisible(`#btnActions_${dbConnection1FileNameAndId}`)
          .elementShouldHaveClass('#btnDelete', 'disabled');

        // 7. Make the second DB connection default.
        // First connection becomes non-default, its delete button should become enabled.
        // Second connection becomes default, its delete button should become disabled.
        ft = ConnectionsTestHelper.makeConnectionAsDefault(
          ft,
          dbConnection2FileNameAndId,
        ); // Make temp default

        ft = ft
          .clickAndSelectTableRow(`#${dbConnection2FileNameAndId}`) // Reselect second
          .elementShouldHaveClass('#btnDelete', 'disabled') // Delete disabled for new default
          .waitOnElementToBecomeVisible(
            `#btnActions_${dbConnection1FileNameAndId}`,
          ) // First is no longer default
          .clickAndSelectTableRow(`#${dbConnection1FileNameAndId}`) // Select first
          .waitOnElementToBecomeEnabled('#btnDelete'); // Delete enabled for now non-default first

        // 8. Make the first DB connection default again.
        // Second connection becomes non-default, its delete button should become enabled.
        // First connection becomes default, its delete button should become disabled.
        ft = ConnectionsTestHelper.makeConnectionAsDefault(
          ft,
          dbConnection1FileNameAndId,
        ); // Make temp default

        ft = ft
          .waitOnElementToBecomeVisible(
            `#btnActions_${dbConnection2FileNameAndId}`,
          ) // Second is no longer default
          .elementShouldHaveClass('#btnDelete', 'disabled') // Delete disabled for new default
          .clickAndSelectTableRow(`#${dbConnection2FileNameAndId}`) // Select second
          .waitOnElementToBecomeEnabled('#btnDelete'); // Delete enabled for now non-default second

        // 9. Delete the second (now non-default) database connection.
        // dbConnection1Name should remain default, and its delete button should remain disabled.
        ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          ft,
          dbConnection2FileNameAndId,
          dbConnection2Vendor,
        );

        // 10. Attempt to delete the first (and now only, and default) database connection.
        // Assert Delete button is disabled.
        ft.gotoConnections();
        ft.clickAndSelectTableRow(
          `#${dbConnection1FileNameAndId}`,
        ).elementShouldHaveClass('#btnDelete', 'disabled');

        ft = ft.deleteFolder(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/db/${dbConnection1FileNameAndId.replace('\\.xml', '')}`,
        );
        // 11. To clean up, we must create another connection, make IT default, then delete the original.
        // For this test's scope, we'll just delete dbConnection1Name after making it non-default
        // by creating a temporary one.
        // However, a full cleanup would involve another helper or direct deletion if the test was ending.
        // For now, we'll just assert it cannot be deleted and then manually clean it up
        // (assuming a global afterAll or similar handles full cleanup of test-created files).
        // For this specific test, we will delete it by creating a temp one, making it default, then deleting the original.

        return ft;
      },
    );

    electronBeforeAfterAllTest(
      `(database-connection) [${dbVendor}] should successfully test an (EXISTING) connection for a supported database type`,
      async function ({ beforeAfterEach: firstPage }) {
        //long running test
        test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS * 2); // Adjusted timeout for a single vendor test

        let ft = new FluentTester(firstPage);
        try {

        //const dbVendor = ConnectionsTestHelper.getRandomDbVendor();
        ft = ft.consoleLog(
          `Testing database connection for randomly selected vendor: ${dbVendor}`,
        );

        // Start starter-pack only for server-based vendors (not file-based like SQLite/DuckDB)
        if (!isFileBasedVendor(dbVendor)) {
          ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'start');
        }

        const connectionName = `ExistingTestConn-${dbVendor}-${Date.now()}`;
        const kebabConnectionName = _.kebabCase(connectionName);
        const fileNameAndId = `db-${kebabConnectionName}-${dbVendor}\\.xml`;

        // 1. Create the database connection using the existing helper
        // This helper handles filling details, SQLite file creation, and saving.
        ft = ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
          ft,
          connectionName,
          dbVendor,
        );

        // 2. Go back to connections, find the created connection, and open it for editing
        ft = ft.gotoConnections();
        ft = ft.clickAndSelectTableRow(`#${fileNameAndId}`);
        ft = ft.waitOnElementToBecomeEnabled('#btnEdit').click('#btnEdit');
        ft = ft.waitOnElementToBecomeVisible('#modalDbConnection');
        // Wait for a known field to be enabled to ensure the modal is fully loaded with connection data
        ft = ft.waitOnElementToBecomeEnabled('#dbConnectionName');
        ft = ft.waitOnInputToHaveValue('#dbConnectionName', connectionName);

        // 3. Click the "Test Connection" button
        // Ensure the button is enabled before clicking. It might depend on form state or async operations.
        ft = ft
          .waitOnElementToBecomeEnabled('#btnTestDbConnection')
          .click('#btnTestDbConnection');

        if (!isFileBasedVendor(dbVendor)) {
          ft = ft.infoDialogShouldBeVisible()
            .clickYesDoThis()
            .click('#btnClearLogsDbConnection')
            .confirmDialogShouldBeVisible()
            .clickYesDoThis()
            .waitOnElementToBecomeDisabled('#btnClearLogsDbConnection')
            .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
            .appStatusShouldBeGreatNoErrorsNoWarnings()
            .click('#btnTestDbConnection');
        }

        ft = ft
          .confirmDialogShouldBeVisible()
          .clickYesDoThis();

        // In-process REST refactor makes file-based (SQLite/DuckDB) test resolve
        // too fast to catch the disabled/spinner state via polling. The Schema-tab
        // placeholder vanish below is the reliable success signal.
        if (!isFileBasedVendor(dbVendor)) {
          ft = ft
            .waitOnElementToBecomeDisabled('#btnTestDbConnection')
            .waitOnElementToHaveClass('#btnTestDbConnectionIcon', 'animate-spin');
        }

        //    b. Verify that the schema information section is displayed
        //       The instruction text should disappear
        ft = ft
          .click('#tab-btn-databaseSchemaTab')
          .waitOnElementToBecomeInvisible(
            'span:has-text("To load the schema, please ensure your connection details are configured")',
          );
        //       The picklist for schema objects should become visible
        ft = ft.waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer');
        ft = ft.waitOnElementToBecomeVisible('#btnRefreshDatabaseSchema');
        ft = ft
          .click('#btnRefreshDatabaseSchema')
          .waitOnElementToContainText(
            '#confirmDialog .modal-box',
            'This will refresh the Database Schema. Continue?',
          )
          .clickNoDontDoThis()
          .click('#btnRefreshDatabaseSchema');

        ft = ft
          .waitOnElementToContainText(
            '#confirmDialog .modal-box',
            'This will refresh the Database Schema. Continue?',
          )
          .clickYesDoThis()
          .waitOnElementToHaveClass(
            '#btnRefreshDatabaseSchemaIcon',
            'animate-spin',
          )
          .waitOnElementNotToHaveClass(
            '#btnRefreshDatabaseSchemaIcon',
            'animate-spin',
          );

        // 5. Close the modal
        ft = ft.click('#btnCloseDbConnectionModal');

        ft = ft.clickAndSelectTableRow(`#${fileNameAndId}`);

        // 6. Clean up: Delete the connection
        ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          ft,
          fileNameAndId,
          dbVendor,
        );
        ft = ft.consoleLog(
          `Successfully tested and cleaned up for vendor: ${dbVendor}`,
        );

        // Stop starter-pack when done
        if (!isFileBasedVendor(dbVendor)) {
          ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'stop');
        }

        return ft;
        } finally {
          if (!isFileBasedVendor(dbVendor)) {
            ConnectionsTestHelper.dockerComposeDownInDbFolder();
          }
        }
      },
    );

    electronBeforeAfterAllTest(
      `(seed-wipe) [${dbVendor}] should seed and wipe invoice data via Connection Details Seed Data tab`,
      async function ({ beforeAfterEach: firstPage }) {
        test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
        let ft = new FluentTester(firstPage);

        if (!hasSeedCapability(dbVendor)) {
          ft = ft.consoleLog(`[SeedWipe] Skipping — ${dbVendor} not seed-capable`);
          return ft;
        }

        const tempConnName = 'Seed Test';
        const tempConnCode = `db-${_.kebabCase(tempConnName)}-${dbVendor}`;
        const isContainer = !isFileBasedVendor(dbVendor);

        try {
          // All vendors follow the same flow: bring DB up (containers only) →
          // create a fresh editable connection → run seed + wipe → delete the
          // connection. File-based vendors (sqlite, duckdb) point at the bundled
          // sample DB file; the seed + wipe pair leaves it back at baseline.
          if (isContainer) {
            ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'start');
          }
          ft = ConnectionsTestHelper.createAndAssertNewDatabaseConnection(ft, tempConnName, dbVendor);

          ft = ConnectionsTestHelper.seedAndWipeInvoicesViaConnectionDetails(ft, tempConnCode, dbVendor, 100);

          // Escape the dot for CSS — `#id.xml` (raw) parses as id+class, not a literal `.xml` suffix.
          ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(ft, `${tempConnCode}\\.xml`, dbVendor);

          // Graceful happy-path stop — finally still does nuclear `docker compose down`.
          if (isContainer) {
            ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'stop');
          }
          return ft;
        } finally {
          if (isContainer) {
            ConnectionsTestHelper.dockerComposeDownInDbFolder();
          }
        }
      },
    );

    electronBeforeAfterAllTest(
      `(database-connection) [${dbVendor}] should successfully test an (NEW) connection for a supported database type`,
      async function ({ beforeAfterEach: firstPage }) {
        test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS * 3); // Adjusted timeout

        let ft = new FluentTester(firstPage);
        try {

        //const dbVendor = ConnectionsTestHelper.getRandomDbVendor();
        ft = ft.consoleLog(
          `Testing (NEW) database connection for randomly selected vendor: ${dbVendor}`,
        );

        // Start starter-pack only for server-based vendors (not file-based like SQLite/DuckDB)
        if (!isFileBasedVendor(dbVendor)) {
          ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'start');
        }

        const connectionName = `NewTestConn-${dbVendor}-${Date.now()}`;
        const kebabConnectionName = _.kebabCase(connectionName);
        const fileNameAndId = `db-${kebabConnectionName}-${dbVendor}\\.xml`; // For deletion after save

        // 1. Navigate and open the "New Database Connection" modal
        ft = ft.gotoConnections();
        ft = ft
          .waitOnElementToBecomeEnabled('#btnNewDropdown')
          .click('#btnNewDropdown');
        ft = ft
          .waitOnElementToBecomeVisible('#btnNewDatabase')
          .click('#btnNewDatabase');
        ft = ft.waitOnElementToBecomeVisible('#modalDbConnection');
        ft = ft.waitOnElementToBecomeEnabled('#dbConnectionName'); // Wait for modal to be ready

        // 2. Fill connection details using the reusable helper
        //    (modal remains open, connection not yet saved by modal's OK)
        ft = ConnectionsTestHelper.fillNewDatabaseConnectionDetails(
          ft,
          connectionName,
          dbVendor,
          //kebabConnectionName,
        );

        // 3. First "Test Connection" attempt: Expect "Save first?" dialog, click "No".
        ft = ft.consoleLog(
          'Attempt 1: Click Test. Expect "Save first?" dialog. Click NO.',
        );
        ft = ft
          .waitOnElementToBecomeEnabled('#btnTestDbConnection')
          .click('#btnTestDbConnection');

        if (!isFileBasedVendor(dbVendor)) {
          ft = ft.infoDialogShouldBeVisible()
            .clickYesDoThis()
            .click('#btnClearLogsDbConnection')
            .confirmDialogShouldBeVisible()
            .clickYesDoThis()
            .waitOnElementToBecomeDisabled('#btnClearLogsDbConnection')
            .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
            .appStatusShouldBeGreatNoErrorsNoWarnings()
            .click('#btnTestDbConnection');
        }

        ft = ft.waitOnElementToContainText(
          '#confirmDialog .modal-box',
          'The connection must be saved before being able to test it. Save now?',
        );
        ft = ft.clickNoDontDoThis(); // Clicks PrimeNG "No"
        ft = ft.waitOnElementToBecomeInvisible(Constants.BTN_DECLINE_SELECTOR); // PrimeNG No button
        ft = ft.waitOnElementToBecomeVisible('#modalDbConnection'); // Ensure main modal is still open

        // 4. Second "Test Connection" attempt: Expect "Save first?" dialog, click "Yes".
        //    This saves the connection and then runs the test.
        ft = ft.consoleLog(
          'Attempt 2: Click Test. Expect "Save first?" dialog. Click YES.',
        );
        ft = ft
          .waitOnElementToBecomeEnabled('#btnTestDbConnection')
          .click('#btnTestDbConnection');
        ft = ft.confirmDialogShouldBeVisible();
        ft = ft.waitOnElementToContainText(
          '#confirmDialog .modal-box',
          'The connection must be saved before being able to test it. Save now?',
        );
        ft = ft.clickYesDoThis(); // Clicks PrimeNG "Yes", triggers save, then test.


        ft = ft.waitOnToastToBecomeVisible(
          'success',
          'Successfully connected to the database', Constants.DELAY_HUNDRED_SECONDS
        );

        // 5. Assertions after "Save first? YES" (connection saved and tested)
        //    Similar to the (EXISTING) test after a successful test.
        ft = ft.consoleLog(
          'Assertions after "Save first? YES": Toast and Schema should appear.',
        );

        // Verify schema information section is displayed
        ft = ft
          .click('#tab-btn-databaseSchemaTab') // Ensure the tab is active
          .waitOnElementToBecomeInvisible(
            'span:has-text("To load the schema, please ensure your connection details are configured")',
          );
        ft = ft.waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer');
        ft = ft.waitOnElementToBecomeVisible('#btnRefreshDatabaseSchema');

        // 6. Interact with "Refresh Database Schema" button (similar to EXISTING test)
        ft = ft.consoleLog('Interacting with "Refresh Database Schema" button.');
        ft = ft
          .click('#btnRefreshDatabaseSchema')
          .waitOnElementToContainText(
            '#confirmDialog .modal-box',
            'This will refresh the Database Schema. Continue?',
          )
          .clickNoDontDoThis() // Click "No" on the confirmation
          .waitOnElementToBecomeInvisible('#confirmDialog');

        ft = ft
          .click('#btnRefreshDatabaseSchema') // Click "Refresh" again
          .waitOnElementToContainText(
            '#confirmDialog .modal-box',
            'This will refresh the Database Schema. Continue?',
          )
          .clickYesDoThis() // Click "Yes" on the confirmation
          .waitOnElementToHaveClass(
            // Check for spinner
            '#btnRefreshDatabaseSchemaIcon', // Selector for the icon within the button
            'animate-spin',
          )
          .waitOnElementNotToHaveClass(
            // Check spinner disappears
            '#btnRefreshDatabaseSchemaIcon',
            'animate-spin',
          );

        ft = ft.waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer');

        // 7. Save and Close the modal (using the modal's main OK button as it's a new connection)
        ft = ft.consoleLog('Finalizing: Clicking modal OK to close.');
        ft = ft
          .waitOnElementToBecomeEnabled('#btnOKConfirmationDbConnectionModal')
          .click('#btnOKConfirmationDbConnectionModal');

        // 8. Clean up: Delete the connection from the connections list
        ft = ft.consoleLog('Cleaning up: Deleting the created connection.');
        ft = ft.gotoConnections(); // Ensure on connections page before attempting delete helper
        ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          ft,
          fileNameAndId,
          dbVendor,
        );

        ft = ft.consoleLog(
          `Successfully tested (NEW) connection and cleaned up for vendor: ${dbVendor}`,
        );

        // Stop starter-pack when done
        if (!isFileBasedVendor(dbVendor)) {
          ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'stop');
        }

        return ft;
        } finally {
          if (!isFileBasedVendor(dbVendor)) {
            ConnectionsTestHelper.dockerComposeDownInDbFolder();
          }
        }
      },
    );

    electronBeforeAfterAllTest(
      `(database-connection) [${dbVendor}] 'Database Schema' Tab: Schema Load and Source Tree Filter (Vendor Agnostic)`,
      async function ({ beforeAfterEach: firstPage }) {
        test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS); // Generous timeout
        let ft = new FluentTester(firstPage);
        try {

        //const dbVendor = ConnectionsTestHelper.getRandomDbVendor();
        ft = ft.consoleLog(
          `STEP 0.0: Testing 'Information Schema' Tab for randomly selected vendor: ${dbVendor}`,
        );

        // Start starter-pack only for server-based vendors (not file-based like SQLite/DuckDB)
        if (!isFileBasedVendor(dbVendor)) {
          ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'start');
        }

        const connectionName = `InfoSchemaTest-${dbVendor}-${Date.now()}`;
        const dbConnectionFileNameAndId = `db-${_.kebabCase(connectionName)}-${dbVendor}\\.xml`;

        // --- STEP 0.1: Setup - Create and Test a new connection for the random vendor ---
        // This helper needs to ensure the connection is viable for schema fetching.
        // It will internally handle creating a test DB (like Northwind for SQLite) or
        // using appropriate connection strings for other vendors.
        ft = ft.gotoConnections();
        ft = ft
          .waitOnElementToBecomeEnabled('#btnNewDropdown')
          .click('#btnNewDropdown');
        ft = ft
          .waitOnElementToBecomeVisible('#btnNewDatabase')
          .click('#btnNewDatabase');
        ft = ft.waitOnElementToBecomeVisible('#modalDbConnection');
        ft = ft.waitOnElementToBecomeEnabled('#dbConnectionName'); // Wait for modal to be ready

        ft = ft.elementShouldBeDisabled('#btnTestDbConnection');
        ft = ft
          .click('#tab-btn-databaseSchemaTab')
          .waitOnElementToBecomeVisible('#schemaNotLoadedDatabaseSchema')
          .click('#tab-btn-domainGroupedDatabaseSchemaTab')
          .waitOnElementToBecomeVisible('#schemaNotLoadedDomainGroupedSchema')
          .click('#tab-btn-databaseDiagramTab')
          .waitOnElementToBecomeVisible('#schemaNotLoadedERDiagram')
          .click('#tab-btn-toolsTab')
          .waitOnElementToBecomeVisible('#appPanel_flowkraft-data-canvas')
          .click('#tab-btn-connectionDetailsTab')
          .waitOnElementToBecomeEnabled('#dbConnectionName');

        ft = ft.consoleLog(
          `STEP 0.1: Setting up new connection '${connectionName}' for vendor ${dbVendor}.`,
        );
        ft = ConnectionsTestHelper.fillNewDatabaseConnectionDetails(
          ft,
          connectionName,
          dbVendor,
          //kebabConnectionName,
        );

        // 3. First "Test Connection" attempt: Expect "Save first?" dialog, click "No".
        ft = ft
          .waitOnElementToBecomeEnabled('#btnTestDbConnection')
          .click('#btnTestDbConnection');

        if (!isFileBasedVendor(dbVendor)) {
          ft = ft.infoDialogShouldBeVisible()
            .clickYesDoThis()
            .click('#btnClearLogsDbConnection')
            .confirmDialogShouldBeVisible()
            .clickYesDoThis()
            .waitOnElementToBecomeDisabled('#btnClearLogsDbConnection')
            .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
            .appStatusShouldBeGreatNoErrorsNoWarnings()
            .click('#btnTestDbConnection');
        }

        ft = ft
          .waitOnElementToContainText(
            '#confirmDialog .modal-box',
            'The connection must be saved before being able to test it. Save now?',
          )
          .elementShouldNotHaveClass('#btnTestDbConnectionIcon', 'animate-spin');

        ft = ft.clickYesDoThis(); // Clicks "Yes", triggers save, then test.
        // For non-file-based vendors the spinner is visible long enough to poll;
        // for SQLite/DuckDB (in-process REST) the test resolves in microseconds
        // and the spinner appearance can be missed. Schema-tab loads below
        // implicitly confirm success.
        if (!isFileBasedVendor(dbVendor)) {
          ft = ft
            .waitOnElementToHaveClass('#btnTestDbConnectionIcon', 'animate-spin')
            .waitOnElementNotToHaveClass('#btnTestDbConnectionIcon', 'animate-spin');
        }

        // --- STEP 1: Navigate to 'Information Schema' Tab & Initial Assertions ---
        ft = ft.consoleLog(
          'STEP 1: Navigating to Information Schema tab and performing initial assertions.',
        );
        ft = ft.click('#tab-btn-databaseSchemaTab');
        ft = ft.waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer');

        ft = ft.waitOnElementToBecomeEnabled(
          '#btnOKConfirmationDbConnectionModal',
        );

        //right is empty
        ft = ft.waitOnElementToBecomeVisible(
          '#targetTreedatabaseSchemaPicklist .p-tree-empty-message',
        );
        ft = ft.elementShouldNotBeVisible(
          '#sourceTreedatabaseSchemaPicklist .p-tree-empty-message',
        );

        //left is populated with schema objects
        ft = ft.waitOnElementToBecomeVisible(
          '#treeNodecategoriessourceTreedatabaseSchemaPicklist',
        );
        ft = ft.waitOnElementToBecomeVisible(
          '#treeNodeproductssourceTreedatabaseSchemaPicklist',
        );

        // For OLAP vendors (DuckDB, ClickHouse), also assert Star Schema tables and views
        if (isOlapVendor(dbVendor)) {
          ft = ft.consoleLog('STEP 1.5: Asserting OLAP Star Schema tables and views (DuckDB/ClickHouse)');
          // Assert dimension tables
          ft = ft.waitOnElementToBecomeVisible(
            '#treeNodedim_customersourceTreedatabaseSchemaPicklist',
          );
          ft = ft.waitOnElementToBecomeVisible(
            '#treeNodedim_productsourceTreedatabaseSchemaPicklist',
          );
          ft = ft.waitOnElementToBecomeVisible(
            '#treeNodedim_timesourceTreedatabaseSchemaPicklist',
          );
          ft = ft.waitOnElementToBecomeVisible(
            '#treeNodedim_employeesourceTreedatabaseSchemaPicklist',
          );
          // Assert fact table
          ft = ft.waitOnElementToBecomeVisible(
            '#treeNodefact_salessourceTreedatabaseSchemaPicklist',
          );
          // Assert views
          ft = ft.waitOnElementToBecomeVisible(
            '#treeNodevw_sales_detailsourceTreedatabaseSchemaPicklist',
          );
          ft = ft.waitOnElementToBecomeVisible(
            '#treeNodevw_monthly_salessourceTreedatabaseSchemaPicklist',
          );
        }

        ft = ft.consoleLog('STEP 2: Test Picklist Functionality');
        //Test 'Searching' Type "Test" into the search filter
        ft = ft.setValue('#filterInputsourceTreedatabaseSchemaPicklist', 'Test');

        ft = ft.waitOnElementToBecomeInvisible(
          '#treeNodecategoriessourceTreedatabaseSchemaPicklist',
        );
        ft = ft.waitOnElementToBecomeInvisible(
          '#treeNodeproductssourceTreedatabaseSchemaPicklist',
        );

        ft = ft.setValue('#filterInputsourceTreedatabaseSchemaPicklist', '');

        ft = ft.waitOnElementToBecomeVisible(
          '#treeNodecategoriessourceTreedatabaseSchemaPicklist',
        );
        ft = ft.waitOnElementToBecomeVisible(
          '#treeNodeproductssourceTreedatabaseSchemaPicklist',
        );

        ft = ft.setValue(
          '#filterInputsourceTreedatabaseSchemaPicklist',
          'Products',
        );

        ft = ft.waitOnElementToBecomeInvisible(
          '#treeNodecategoriessourceTreedatabaseSchemaPicklist',
        );
        ft = ft.waitOnElementToBecomeVisible(
          '#treeNodeproductssourceTreedatabaseSchemaPicklist',
        );

        ft = ft.setValue('#filterInputsourceTreedatabaseSchemaPicklist', '');

        ft = ft.waitOnElementToBecomeVisible(
          '#treeNodecategoriessourceTreedatabaseSchemaPicklist',
        );
        ft = ft.waitOnElementToBecomeVisible(
          '#treeNodeproductssourceTreedatabaseSchemaPicklist',
        );

        ft = ft.click('#btnCloseDbConnectionModal');

        ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          ft,
          dbConnectionFileNameAndId,
          dbVendor,
        );

        // Stop starter-pack when done
        if (!isFileBasedVendor(dbVendor)) {
          ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'stop');
        }

        return ft;
        } finally {
          if (!isFileBasedVendor(dbVendor)) {
            ConnectionsTestHelper.dockerComposeDownInDbFolder();
          }
        }
      },
    );

    electronBeforeAfterAllTest(
      `(database-connection) [${dbVendor}] 'Domain-Grouped Schema' Tab: AI Schema Gen, JSON Edit, Save and Reload (Vendor Agnostic)`,
      async function ({ beforeAfterEach: firstPage }) {
        test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS); // Generous timeout
        let ft = new FluentTester(firstPage);
        try {

        //const dbVendor = ConnectionsTestHelper.getRandomDbVendor();
        ft = ft.consoleLog(
          `STEP 0.0: Testing 'Domain-Grouped Schema' Tab for randomly selected vendor: ${dbVendor}`,
        );

        // Start starter-pack only for server-based vendors (not file-based like SQLite/DuckDB)
        if (!isFileBasedVendor(dbVendor)) {
          ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'start');
        }

        const connectionName = `DomainSchemaTest-${dbVendor}-${Date.now()}`;
        const dbConnectionFileNameAndId = `db-${_.kebabCase(connectionName)}-${dbVendor}\\.xml`;

        // --- STEP 0.1: Setup - Create a new connection for the random vendor (DO NOT TEST YET) ---
        ft = ft.gotoConnections();
        ft = ft
          .waitOnElementToBecomeEnabled('#btnNewDropdown')
          .click('#btnNewDropdown');
        ft = ft
          .waitOnElementToBecomeVisible('#btnNewDatabase')
          .click('#btnNewDatabase');
        ft = ft.waitOnElementToBecomeVisible('#modalDbConnection');
        ft = ft.waitOnElementToBecomeEnabled('#dbConnectionName');

        ft = ft.consoleLog(
          `STEP 0.1: Setting up new connection '${connectionName}' for vendor ${dbVendor}.`,
        );
        ft = ConnectionsTestHelper.fillNewDatabaseConnectionDetails(
          ft,
          connectionName,
          dbVendor,
          //kebabConnectionName,
        );

        // 3. First "Test Connection" attempt: Expect "Save first?" dialog, click "No".
        ft = ft
          .waitOnElementToBecomeEnabled('#btnTestDbConnection')
          .click('#btnTestDbConnection');

        if (!isFileBasedVendor(dbVendor)) {
          ft = ft.infoDialogShouldBeVisible()
            .clickYesDoThis()
            .click('#btnClearLogsDbConnection')
            .confirmDialogShouldBeVisible()
            .clickYesDoThis()
            .waitOnElementToBecomeDisabled('#btnClearLogsDbConnection')
            .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
            .appStatusShouldBeGreatNoErrorsNoWarnings()
            .click('#btnTestDbConnection');
        }

        ft = ft
          .waitOnElementToContainText(
            '#confirmDialog .modal-box',
            'The connection must be saved before being able to test it. Save now?',
          )
          .elementShouldNotHaveClass('#btnTestDbConnectionIcon', 'animate-spin');

        ft = ft.clickYesDoThis(); // Clicks "Yes", triggers save, then test.
        // See note in 'Database Schema' Tab test: file-based vendors resolve too
        // fast to catch the spinner. Schema-tab assertions below confirm success.
        if (!isFileBasedVendor(dbVendor)) {
          ft = ft
            .waitOnElementToHaveClass('#btnTestDbConnectionIcon', 'animate-spin')
            .waitOnElementNotToHaveClass('#btnTestDbConnectionIcon', 'animate-spin');
        }

        ft = ft
          .click('#tab-btn-domainGroupedDatabaseSchemaTab')
          .waitOnElementToBecomeVisible('#noDomainGroupedSchemaAvailable')
          .waitOnElementToBecomeEnabled('#btnToggleDomainGroupedCodeView')
          .waitOnElementToBecomeEnabled('#btnGenerateWithAIDomainGroupedSchema')
          .click('#btnToggleDomainGroupedCodeView')
          .waitOnElementToBecomeInvisible('#noDomainGroupedSchemaAvailable')
          .waitOnElementToBecomeVisible('#domainGroupedCodeEditor')
          .click('#btnToggleDomainGroupedCodeView')
          .waitOnElementToBecomeInvisible('#domainGroupedCodeEditor')
          .waitOnElementToBecomeVisible('#noDomainGroupedSchemaAvailable');

        ft = ft
          .click('#btnGenerateWithAIDomainGroupedSchema')
          // Wait for AI Copilot dp-dialog to be ACTUALLY open before interacting with
          // its contents. waitOnElementToBecomeVisible is just a DOM-count check —
          // the prompt button is in DOM the moment @if (expandedPrompt) flips true,
          // even before dp-dialog's effect calls el.showModal(). waitOnElementToBecomeEnabled
          // uses Playwright's toBeEnabled() which IS actionable (visible+enabled+stable),
          // so it blocks until the native <dialog> is actually open. Same pattern as
          // configuration-test-helper.ts:1888-1889 used by configuration.spec.track-e2e-done.
          .waitOnElementToBecomeVisible('#btnCloseAiCopilotModal')
          .waitOnElementToBecomeEnabled('#btnCloseAiCopilotModal')
          .waitOnElementToBecomeVisible('#btnCopyPromptText')
          .click('#btnCopyPromptText')
          .waitOnConfirmDialogToBecomeVisible()
          .click('.dburst-button-question-confirm:visible')
          .waitOnConfirmDialogToBecomeInvisible();

        ft = ft.clipboardShouldContainText(
          'You are an expert Database Modeler and Data Architect.',
        );

        const orderDetailsName = dbVendor === 'clickhouse' ? 'OrderDetails' : 'Order Details';
        ft = ft.clipboardShouldContainText(`"tableName": "${orderDetailsName}"`);
        ft = ft
          .clipboardShouldContainText('"tableType":')
          .clipboardShouldContainText('"primaryKeyColumns":')
          .clipboardShouldContainText('"refs":')
          .click('#btnCloseAiCopilotModal')
          .waitOnElementToBecomeInvisible('#btnCopyPromptText');

        const northwindDomainGroupedSchemaExample = buildNorthwindDomainGroupedSchemaExample(dbVendor);

        //set the Domain-Grouped Schema Editor content
        ft = ft
          .click('#btnToggleDomainGroupedCodeView')
          .waitOnElementToBecomeInvisible('#noDomainGroupedSchemaAvailable')
          .waitOnElementToBecomeVisible('#domainGroupedCodeEditor')
          .waitOnElementToBecomeEnabled('#domainGroupedCodeEditor')
          .setCodeJarContentSingleShot(
            '#domainGroupedCodeEditor',
            northwindDomainGroupedSchemaExample,
          )
          .click('#btnToggleDomainGroupedCodeView')
          .waitOnElementToBecomeInvisible('#domainGroupedCodeEditor')
          .waitOnElementToBecomeInvisible('#btnGenerateWithAIDomainGroupedSchema')
          .waitOnElementToBecomeVisible('#domainGroupedSchemaPicklist')
          // In 'crud' context the SQL gen button + caret-dropdown split-button
          // is replaced by a single standalone "Show Domain-Grouped Schema
          // Code" toggle button. Same intent as the Database Schema tab's
          // `context !== 'crud'` guard — no AI affordance while configuring
          // a connection, but the picklist↔code-view toggle stays accessible.
          .waitOnElementToBecomeInvisible('#btnGenerateSqlQueryWithAIDomainGroupedSchema')
          .waitOnElementToBecomeInvisible('#btnToggleDomainGroupedCodeViewDropdown')
          .waitOnElementToBecomeVisible('#btnToggleDomainGroupedCodeView')
          .waitOnElementToBecomeEnabled('#btnToggleDomainGroupedCodeView')
          .click('#btnToggleDomainGroupedCodeView')
          .waitOnElementToBecomeInvisible('#domainGroupedSchemaPicklist')
          .waitOnElementToBecomeEnabled('#domainGroupedCodeEditor')
          .waitOnElementToBecomeEnabled('#btnToggleDomainGroupedCodeView')
          .click('#btnToggleDomainGroupedCodeView')
          .waitOnElementToBecomeInvisible('#domainGroupedCodeEditor')
          .waitOnElementToBecomeInvisible('#btnGenerateWithAIDomainGroupedSchema')
          .waitOnElementToBecomeVisible('#domainGroupedSchemaPicklist')
          .waitOnElementToBecomeInvisible('#btnGenerateSqlQueryWithAIDomainGroupedSchema');

        //save the Domain-Grouped Schema
        ft = ft
          .click('#btnOKConfirmationDbConnectionModal')
          .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal');

        ft = ft
          .gotoConnections()
          .waitOnElementToHaveText(
            `#${dbConnectionFileNameAndId} td:first-child`,
            connectionName,
          )
          .clickAndSelectTableRow(`#${dbConnectionFileNameAndId}`)
          .waitOnElementToBecomeEnabled('#btnEdit')
          .click('#btnEdit')
          .waitOnElementToBecomeVisible('#dbConnectionName')
          .inputShouldHaveValue('#dbConnectionName', connectionName) // Ensure on connections page before attempting delete helper
          .click('#tab-btn-databaseSchemaTab')
          // In 'crud' context the Domain-Grouped Schema's "Choose Table(s)"
          // badge and SQL gen button are hidden (mirrors the Database Schema
          // tab's `context !== 'crud'` guard). Verify the hide instead of the
          // old visibility/disabled asserts.
          .waitOnElementToBecomeInvisible('#chooseTableLabelDomainGroupedSchema')
          .waitOnElementToBecomeInvisible('#btnGenerateSqlQueryWithAIDomainGroupedSchema')
          .waitOnElementToBecomeVisible(
            '#treeNodecustomerdemographicssourceTreedatabaseSchemaPicklist',
          )
          .click('#tab-btn-domainGroupedDatabaseSchemaTab')
          .waitOnElementToBecomeVisible(
            '#treeNodedomain_sales_\\&_orderssourceTreedomainGroupedSchemaPicklist',
          );

        ft = ft
          .click('#btnCloseDbConnectionModal')
          .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');

        ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          ft,
          dbConnectionFileNameAndId,
          dbVendor,
        );

        // Stop starter-pack when done
        if (!isFileBasedVendor(dbVendor)) {
          ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'stop');
        }

        return ft;
        } finally {
          if (!isFileBasedVendor(dbVendor)) {
            ConnectionsTestHelper.dockerComposeDownInDbFolder();
          }
        }
      },
    );

    electronBeforeAfterAllTest(
      `(database-connection) [${dbVendor}] 'ER Diagram' Tab: Functionality, Edit, Save, Load, AI (Vendor Agnostic)`,
      async function ({ beforeAfterEach: firstPage }) {
        test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS * 3); // Generous timeout
        let ft = new FluentTester(firstPage);
        try {

        //const dbVendor = ConnectionsTestHelper.getRandomDbVendor();
        ft = ft.consoleLog(
          `STEP 0.0: Testing 'ER Diagram' Tab with vendor: ${dbVendor}`,
        );

        // Start starter-pack only for server-based vendors (not file-based like SQLite/DuckDB)
        if (!isFileBasedVendor(dbVendor)) {
          ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'start');
        }

        const connectionName = `ErDiagramTest-${dbVendor}-${Date.now()}`;
        const kebabConnectionName = _.kebabCase(connectionName);
        const dbConnectionFileNameAndId = `db-${kebabConnectionName}-${dbVendor}\\.xml`;
        const connectionCode = `db-${kebabConnectionName}-${dbVendor}`;

        // --- STEP 0.1: Setup - Create a new connection ---
        ft = ft.consoleLog(
          `STEP 0.1: Setting up new connection '${connectionName}' for vendor ${dbVendor}.`,
        );

        // --- STEP 0.1: Setup - Create a new connection for the random vendor (DO NOT TEST YET) ---
        ft = ft.gotoConnections();
        ft = ft
          .waitOnElementToBecomeEnabled('#btnNewDropdown')
          .click('#btnNewDropdown');
        ft = ft
          .waitOnElementToBecomeVisible('#btnNewDatabase')
          .click('#btnNewDatabase');
        ft = ft.waitOnElementToBecomeVisible('#modalDbConnection');
        ft = ft.waitOnElementToBecomeEnabled('#dbConnectionName');

        ft = ft.consoleLog(
          `STEP 0.1: Setting up new connection '${connectionName}' for vendor ${dbVendor}.`,
        );
        ft = ConnectionsTestHelper.fillNewDatabaseConnectionDetails(
          ft,
          connectionName,
          dbVendor,
          //kebabConnectionName,
        );

        ft = ft
          .click('#tab-btn-databaseSchemaTab')
          .waitOnElementToBecomeVisible('#schemaNotLoadedDatabaseSchema')
          .click('#tab-btn-domainGroupedDatabaseSchemaTab')
          .waitOnElementToBecomeVisible('#schemaNotLoadedDomainGroupedSchema')
          .click('#tab-btn-databaseDiagramTab')
          .waitOnElementToBecomeVisible('#schemaNotLoadedERDiagram')
          .click('#tab-btn-connectionDetailsTab')
          .waitOnElementToBecomeEnabled('#dbConnectionName');

        // 3. First "Test Connection" attempt: Expect "Save first?" dialog, click "No".
        ft = ft
          .waitOnElementToBecomeEnabled('#btnTestDbConnection')
          .click('#btnTestDbConnection');

        if (!isFileBasedVendor(dbVendor)) {
          ft = ft.infoDialogShouldBeVisible()
            .clickYesDoThis()
            .click('#btnClearLogsDbConnection')
            .confirmDialogShouldBeVisible()
            .clickYesDoThis()
            .waitOnElementToBecomeDisabled('#btnClearLogsDbConnection')
            .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
            .appStatusShouldBeGreatNoErrorsNoWarnings()
            .click('#btnTestDbConnection');
        }

        ft = ft
          .waitOnElementToContainText(
            '#confirmDialog .modal-box',
            'The connection must be saved before being able to test it. Save now?',
          )
          .elementShouldNotHaveClass('#btnTestDbConnectionIcon', 'animate-spin');

        ft = ft.clickYesDoThis(); // Clicks "Yes", triggers save, then test.
        // See note in 'Database Schema' Tab test: file-based vendors resolve too
        // fast to catch the spinner. Diagram-tab assertions below confirm success.
        if (!isFileBasedVendor(dbVendor)) {
          ft = ft
            .waitOnElementToHaveClass('#btnTestDbConnectionIcon', 'animate-spin')
            .waitOnElementNotToHaveClass('#btnTestDbConnectionIcon', 'animate-spin');
        }

        ft = ft
          .sleep(Constants.DELAY_ONE_SECOND)
          .click('#tab-btn-databaseDiagramTab')
          .sleep(Constants.DELAY_ONE_SECOND)
          .waitOnElementToBecomeVisible('#noErDiagramAvailable')
          .waitOnElementToBecomeVisible('#btnDatabaseDiagramShowCode')
          .waitOnElementToBecomeVisible('#btnGenerateWithAIErDiagram')
          .elementShouldBeDisabled('#btnDatabaseDiagramViewInBrowser')
          .click('#btnDatabaseDiagramShowCode')
          .waitOnElementToBecomeVisible('#btnDatabaseDiagramViewDiagram')
          .click('#btnDatabaseDiagramViewDiagram')
          .waitOnElementToBecomeVisible('#btnDatabaseDiagramShowCode');

        // Click the "Generate SQL Query with Help From AI" button
        // This ID is used when domainGroupedSchemaExists is true
        ft = ft.click('#btnGenerateWithAIErDiagram');

        ft = ft.waitOnElementToBecomeVisible('#btnCopyPromptText');

        // Verify clipboard content for SQL Generation prompt
        ft = ft
          .click('#btnCopyPromptText')
          .waitOnConfirmDialogToBecomeVisible()
          // `:visible` is required — dp-dialog (native <dialog>) keeps inner
          // DOM mounted while closed, so the 6 Variables-picker dialogs in
          // the modal each carry their own `.dburst-button-question-confirm`
          // OK button. Without `:visible`, the selector matches all 7 and
          // Playwright strict mode fails. See suspect #3 (PrimeNG/ngx-bootstrap
          // → dp-* migration) in the project's e2e regression-suspects memory.
          .click('.dburst-button-question-confirm:visible')
          .waitOnConfirmDialogToBecomeInvisible();

        ft = ft.clipboardShouldContainText(
          'You are an expert Database Modeler and Visual Designer specializing in Entity-Relationship (ER) diagrams using PlantUML.',
        );
        ft = ft.clipboardShouldContainText('"tableName": "CustomerDemographics"');
        ft = ft.clipboardShouldContainText('"tableName": "Customers"');
        ft = ft.clipboardShouldContainText('"primaryKeyColumns":');
        ft = ft.clipboardShouldContainText('"foreignKeys":');

        ft = ft
          .click('#btnCloseAiCopilotModal')
          .waitOnElementToBecomeInvisible('#btnCopyPromptText');

        const erDiagramPuml = `@startuml
entity "Categories" {
  +CategoryID : INTEGER
  CategoryName : VARCHAR
  Description : CLOB
  Picture : BLOB
}
entity "CustomerCustomerDemo" {
  +CustomerID : VARCHAR
  +CustomerTypeID : VARCHAR
}
entity "CustomerDemographics" {
  +CustomerTypeID : VARCHAR
  CustomerDesc : CLOB
}
entity "Customers" {
  +CustomerID : VARCHAR
  PostalCode : VARCHAR
  City : VARCHAR
  Country : VARCHAR
  Region : VARCHAR
  Fax : VARCHAR
  Phone : VARCHAR
  ContactName : VARCHAR
  ContactTitle : VARCHAR
  CompanyName : VARCHAR
  Address : VARCHAR
  Email : VARCHAR
}
entity "EmployeeTerritories" {
  +EmployeeID : INTEGER
  +TerritoryID : VARCHAR
}
entity "Employees" {
  BirthDate : DATE
  +EmployeeID : INTEGER
  Extension : VARCHAR
  HireDate : DATE
  ReportsTo : INTEGER
  FirstName : VARCHAR
  PostalCode : VARCHAR
  City : VARCHAR
  Country : VARCHAR
  Region : VARCHAR
  LastName : VARCHAR
  HomePhone : VARCHAR
  Mobile : VARCHAR
  TitleOfCourtesy : VARCHAR
  Title : VARCHAR
  Address : VARCHAR
  Email : VARCHAR
  Notes : CLOB
  Photo : BLOB
  PhotoPath : VARCHAR
}
entity "Order Details" {
  Discount : NUMERIC
  +OrderID : INTEGER
  +ProductID : INTEGER
  Quantity : SMALLINT
  UnitPrice : NUMERIC
}
entity "Orders" {
  EmployeeID : INTEGER
  Freight : NUMERIC
  +OrderID : INTEGER
  ShipVia : INTEGER
  CustomerID : VARCHAR
  OrderDate : TIMESTAMP
  RequiredDate : TIMESTAMP
  ShippedDate : TIMESTAMP
  ShipPostalCode : VARCHAR
  ShipCity : VARCHAR
  ShipCountry : VARCHAR
  ShipRegion : VARCHAR
  ShipName : VARCHAR
  ShipAddress : VARCHAR
}
entity "Products" {
  CategoryID : INTEGER
  Discontinued : BOOLEAN
  +ProductID : INTEGER
  ReorderLevel : SMALLINT
  SupplierID : INTEGER
  UnitPrice : NUMERIC
  UnitsInStock : SMALLINT
  UnitsOnOrder : SMALLINT
  QuantityPerUnit : VARCHAR
  ProductName : VARCHAR
}
entity "Region" {
  +RegionID : INTEGER
  RegionDescription : VARCHAR
}
entity "Shippers" {
  +ShipperID : INTEGER
  Phone : VARCHAR
  CompanyName : VARCHAR
}
entity "Suppliers" {
  +SupplierID : INTEGER
  PostalCode : VARCHAR
  City : VARCHAR
  Country : VARCHAR
  Region : VARCHAR
  Fax : VARCHAR
  Phone : VARCHAR
  ContactName : VARCHAR
  ContactTitle : VARCHAR
  CompanyName : VARCHAR
  Address : VARCHAR
  Email : VARCHAR
  HomePage : CLOB
}
entity "Territories" {
  RegionID : INTEGER
  +TerritoryID : VARCHAR
  TerritoryDescription : VARCHAR
}

Orders }o--|| Customers : "CustomerID"
Orders }o--|| Employees : "EmployeeID"
Orders }o--|| Shippers : "ShipVia"
"Order Details" }|--|| Orders : "OrderID"
"Order Details" }|--|| Products : "ProductID"
Products }o--|| Categories : "CategoryID"
Products }o--|| Suppliers : "SupplierID"
Employees }o--|| Employees : "ReportsTo"
EmployeeTerritories }|--|| Employees : "EmployeeID"
EmployeeTerritories }|--|| Territories : "TerritoryID"
Territories }|--|| Region : "RegionID"
CustomerCustomerDemo }|--|| Customers : "CustomerID"
CustomerCustomerDemo }|--|| CustomerDemographics : "CustomerTypeID"
@enduml`;

        ft = ft
          .elementShouldBeDisabled('#btnDatabaseDiagramViewInBrowser')
          .waitOnElementToBecomeVisible('#btnDatabaseDiagramShowCode')
          .waitOnElementToBecomeEnabled('#btnDatabaseDiagramShowCode')
          .click('#btnDatabaseDiagramShowCode')
          .waitOnElementToBecomeVisible('#btnDatabaseDiagramViewDiagram')
          .waitOnElementToBecomeVisible('#plantUmlEditor')
          .waitOnElementToBecomeEnabled('#plantUmlEditor')
          .setCodeJarContentSingleShot('#plantUmlEditor', erDiagramPuml)
          .click('#btnDatabaseDiagramViewDiagram')
          .waitOnElementToBecomeInvisible('#btnDatabaseDiagramViewDiagram')
          .waitOnElementToBecomeInvisible('#plantUmlEditor')
          .waitOnElementToBecomeVisible('#btnDatabaseDiagramViewInBrowserLink')
          .waitOnElementToBecomeEnabled('#btnDatabaseDiagramShowCode')
          .click('#btnDatabaseDiagramShowCode')
          .waitOnElementToBecomeInvisible('#btnDatabaseDiagramShowCode')
          .waitOnElementToBecomeVisible('#btnDatabaseDiagramViewDiagram')
          .waitOnElementToBecomeEnabled('#plantUmlEditor')
          .click('#btnDatabaseDiagramViewDiagram')
          .waitOnElementToBecomeInvisible('#btnDatabaseDiagramViewDiagram')
          .waitOnElementToBecomeInvisible('#plantUmlEditor');

        // Save the ER Diagram
        ft = ft
          .click('#btnOKConfirmationDbConnectionModal')
          .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal');

        ft = ft
          .gotoConnections()
          .waitOnElementToHaveText(
            `#${dbConnectionFileNameAndId} td:first-child`,
            connectionName,
          )
          .clickAndSelectTableRow(`#${dbConnectionFileNameAndId}`)
          .waitOnElementToBecomeEnabled('#btnEdit')
          .click('#btnEdit')
          .waitOnElementToBecomeVisible('#ibmDb2Label')
          .waitOnElementToBecomeVisible('#dbConnectionName')
          .inputShouldHaveValue('#dbConnectionName', connectionName) // Ensure on connections page before attempting delete helper
          .waitOnElementToBecomeVisible('#tab-btn-databaseDiagramTab')
          .waitOnElementToBecomeEnabled('#tab-btn-databaseDiagramTab')
          .sleep(Constants.DELAY_ONE_SECOND)
          .click('#tab-btn-databaseDiagramTab')
          .sleep(Constants.DELAY_ONE_SECOND)
          .waitOnElementToBecomeVisible('#plantUmlDiagram')
          .waitOnElementToBecomeEnabled('#btnDatabaseDiagramShowCode')
          .waitOnElementToBecomeEnabled('#btnDatabaseDiagramViewInBrowserLink')
          .waitOnElementToBecomeEnabled('#btnGenerateWithAIErDiagram')
          // BS3 → daisyUI: the "non-primary action" visual state was `btn-default`
          // in Bootstrap 3, it's `btn-ghost` in daisyUI. The semantic is identical
          // (the button is de-emphasized because an ER diagram already exists).
          // Suspect #1 in the project's e2e regression-suspects memory.
          .elementShouldHaveClass('#btnGenerateWithAIErDiagram', 'btn-ghost')
          .click('#btnDatabaseDiagramShowCode')
          .waitOnElementToBecomeInvisible('#btnDatabaseDiagramShowCode')
          .waitOnElementToBecomeVisible('#btnDatabaseDiagramViewDiagram')
          .waitOnElementToBecomeEnabled('#plantUmlEditor')
          .codeJarShouldContainText(
            '#plantUmlEditor',
            '"Order Details" }|--|| Orders : "OrderID"',
          )
          .click('#btnDatabaseDiagramViewDiagram')
          .waitOnElementToBecomeInvisible('#btnDatabaseDiagramViewDiagram')
          .waitOnElementToBecomeInvisible('#plantUmlEditor')
          .waitOnElementToBecomeVisible('#btnDatabaseDiagramViewInBrowserLink');

        ft = ft
          .click('#btnCloseDbConnectionModal')
          .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');

        ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          ft,
          dbConnectionFileNameAndId,
          dbVendor,
        );

        // Stop starter-pack when done
        if (!isFileBasedVendor(dbVendor)) {
          ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'stop');
        }

        return ft;
        } finally {
          if (!isFileBasedVendor(dbVendor)) {
            ConnectionsTestHelper.dockerComposeDownInDbFolder();
          }
        }
      },
    );

  }

  // ============================================================
  // Seed Data — Example (default) script against bundled sample connections.
  // Outside the DB_VENDORS_SELECTED loop because these tests deliberately reuse
  // the pre-existing `rbt-sample-northwind-{sqlite,duckdb}-4f2` sample
  // connections (no create/delete) and exercise the in-component Example
  // default script rather than a bundled `seed-templates/*.groovy` template.
  // The wipe is supplied by the helper as a hardcoded inline script (no UI
  // affordance for a default-cleanup), keeping the sample DB state unchanged.
  // ============================================================
  for (const sampleVendor of ['sqlite', 'duckdb'] as const) {
    electronBeforeAfterAllTest(
      `(seed-wipe-example-default) [${sampleVendor}] should run the Example (default) script against the bundled sample connection and clean up`,
      async function ({ beforeAfterEach: firstPage }) {
        test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);
        let ft = new FluentTester(firstPage);

        const sampleConnectionCode = `rbt-sample-northwind-${sampleVendor}-4f2`;

        ft = ConnectionsTestHelper.seedAndWipeUsingExampleDefaultViaConnectionDetails(
          ft,
          sampleConnectionCode,
          sampleVendor,
        );

        return ft;
      },
    );
  }

  // ============================================================
  // Ubiquitous Language tab — vendor-agnostic, run once with sqlite
  // ============================================================
  electronBeforeAfterAllTest(
    `(database-connection) [sqlite] 'Ubiquitous Language' Tab: Functionality (Edit, Save, Load)`,
    async function ({ beforeAfterEach: firstPage }) {
      const dbVendor = 'sqlite';
        test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS * 2);
        let ft = new FluentTester(firstPage);
        try {

        ft = ft.consoleLog(
          `STEP 0.0: Testing 'Ubiquitous Language' Tab with vendor: ${dbVendor}`,
        );

        // Start starter-pack only for non-sqlite vendors
        // if (!isFileBasedVendor(dbVendor)) {
        //   ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'start');
        // }

        const connectionName = `UbLangTest-${dbVendor}-${Date.now()}`;
        const kebabConnectionName = _.kebabCase(connectionName);
        const dbConnectionFileNameAndId = `db-${kebabConnectionName}-${dbVendor}\\.xml`;

        // --- STEP 1: Setup - Create a new database connection ---
        ft = ft.consoleLog(
          `STEP 1: Creating new connection '${connectionName}' for vendor ${dbVendor}.`,
        );

        ft = ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
          ft,
          connectionName,
          dbVendor,
        );

        // --- STEP 2: Open connection and navigate to Ubiquitous Language tab ---
        ft = ft.consoleLog(
          'STEP 2: Opening connection and navigating to Ubiquitous Language tab.',
        );
        ft = ft.gotoConnections();
        ft = ft.clickAndSelectTableRow(`#${dbConnectionFileNameAndId}`);
        ft = ft.waitOnElementToBecomeEnabled('#btnEdit').click('#btnEdit');
        ft = ft.waitOnElementToBecomeVisible('#modalDbConnection');
        ft = ft.sleep(Constants.DELAY_ONE_SECOND).click('#tab-btn-databaseUbiquitousLanguageTab').sleep(Constants.DELAY_ONE_SECOND);

        ft = ft
          .waitOnElementToBecomeVisible('#noUbiquitousLanguageContentInfo')
          .waitOnElementToBecomeVisible('#btnUbiquitousLanguageStartEditing')
          .waitOnElementToBecomeEnabled('#btnUbiquitousLanguageStartEditing')
          .elementShouldNotBeVisible('#ubiquitousLanguageEditor')
          .elementShouldNotBeVisible('#ubiquitousLanguageViewer');

        // --- STEP 3: Toggle to Edit Mode ---
        ft = ft.consoleLog('STEP 3: Toggling to Edit Mode.');

        ft = ft.click('#btnUbiquitousLanguageStartEditing');
        ft = ft.waitOnElementToBecomeVisible('#ubiquitousLanguageEditor');
        ft = ft.waitOnElementToBecomeVisible('#btnUbiquitousLanguageEditDone');
        ft = ft.elementShouldNotBeVisible('#btnUbiquitousLanguageEdit');

        // --- STEP 4: Enter Markdown, switch to View, and Save ---
        const initialMarkdown = `# Test Header\n\nThis is a test paragraph for Ubiquitous Language.`;
        const updatedMarkdown = `# Updated Header\n\nThis content has been updated.`;

        ft = ft.consoleLog(
          'STEP 4: Entering Markdown, switching to View, and Saving.',
        );
        ft = ft.setCodeJarContentSingleShot(
          '#ubiquitousLanguageEditor',
          initialMarkdown,
        );
        ft = ft.click('#btnUbiquitousLanguageEditDone'); // Switch back to view mode
        ft = ft.waitOnElementToBecomeVisible('#btnUbiquitousLanguageEdit'); // View mode
        ft = ft.elementShouldNotBeVisible('#ubiquitousLanguageEditor');

        // Verify rendered markdown - selectors depend on how <markdown> component renders
        ft = ft.waitOnElementToContainText('.markdown-content h1', 'Test Header');
        ft = ft.waitOnElementToContainText(
          '.markdown-content p',
          'This is a test paragraph for Ubiquitous Language.',
        );

        // Save the UL
        ft = ft
          .click('#btnOKConfirmationDbConnectionModal')
          .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal');

        // --- STEP 5: Load Existing Content ---
        ft = ft.consoleLog(
          'STEP 5: Re-opening connection to load existing Ubiquitous Language.',
        );
        ft = ft.gotoConnections();
        ft = ft.clickAndSelectTableRow(`#${dbConnectionFileNameAndId}`);
        ft = ft.click('#btnEdit');
        ft = ft.waitOnElementToBecomeVisible('#modalDbConnection');
        ft = ft.sleep(Constants.DELAY_ONE_SECOND).click('#tab-btn-databaseUbiquitousLanguageTab').sleep(Constants.DELAY_ONE_SECOND);
        ft = ft.waitOnElementToBecomeVisible('#btnUbiquitousLanguageEdit'); // Should be in view mode
        // Verify loaded markdown
        ft = ft.waitOnElementToContainText('.markdown-content h1', 'Test Header');
        ft = ft.waitOnElementToContainText(
          '.markdown-content p',
          'This is a test paragraph for Ubiquitous Language.',
        );

        // --- STEP 6: Edit again, but Cancel (changes should not persist) ---
        ft = ft.consoleLog('STEP 6: Editing again, then cancelling.');
        ft = ft.click('#btnUbiquitousLanguageEdit'); // To edit mode
        ft = ft.waitOnElementToBecomeVisible('#ubiquitousLanguageEditor');
        ft = ft.setCodeJarContentSingleShot(
          '#ubiquitousLanguageEditor',
          updatedMarkdown,
        );
        ft = ft.click('#btnUbiquitousLanguageEditDone'); // To view mode with updated (but unsaved) content
        ft = ft.waitOnElementToContainText(
          '.markdown-content h1',
          'Updated Header',
        );
        ft = ft.click('#btnCloseDbConnectionModal'); // Cancel changes
        ft = ft.waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');

        // --- STEP 7: Verify Content Was Not Saved After Cancel ---
        ft = ft.consoleLog(
          'STEP 7: Verifying content was not saved after cancel.',
        );
        ft = ft.gotoConnections();
        ft = ft.clickAndSelectTableRow(`#${dbConnectionFileNameAndId}`);
        ft = ft.click('#btnEdit');
        ft = ft.waitOnElementToBecomeVisible('#modalDbConnection');
        ft = ft.sleep(Constants.DELAY_ONE_SECOND);
        ft = ft.click('#tab-btn-databaseUbiquitousLanguageTab');
        ft = ft.sleep(Constants.DELAY_ONE_SECOND);
        // Should still be the initial saved markdown
        ft = ft.waitOnElementToContainText('.markdown-content h1', 'Test Header');
        ft = ft.waitOnElementToContainText(
          '.markdown-content p',
          'This is a test paragraph for Ubiquitous Language.',
        );

        // --- STEP 8: Edit to Empty Content and Save (should delete file) ---
        ft = ft.consoleLog('STEP 8: Editing to empty content and saving.');
        ft = ft.click('#btnUbiquitousLanguageEdit');
        ft = ft.waitOnElementToBecomeVisible('#ubiquitousLanguageEditor');
        ft = ft.setCodeJarContentSingleShot('#ubiquitousLanguageEditor', '');
        ft = ft.click('#btnUbiquitousLanguageEditDone');
        // Markdown view area should now be hidden due to ngIf="isStringAndNotEmpty(...)"
        ft = ft
          .waitOnElementToBecomeVisible('#noUbiquitousLanguageContentInfo')
          .waitOnElementToBecomeVisible('#btnUbiquitousLanguageStartEditing');

        ft = ft
          .click('#btnOKConfirmationDbConnectionModal')
          .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal');

        // --- STEP 9: Verify Empty Content on Load (after deletion/empty save) ---
        ft = ft.consoleLog('STEP 9: Verifying empty content on load.');
        ft = ft.gotoConnections();
        ft = ft.clickAndSelectTableRow(`#${dbConnectionFileNameAndId}`);
        ft = ft.click('#btnEdit');
        ft = ft.waitOnElementToBecomeVisible('#modalDbConnection');
        ft = ft
          .sleep(Constants.DELAY_ONE_SECOND)
          .click('#tab-btn-databaseUbiquitousLanguageTab')
          .sleep(Constants.DELAY_ONE_SECOND)
          .waitOnElementToBecomeVisible('#noUbiquitousLanguageContentInfo')
          .waitOnElementToBecomeVisible('#btnUbiquitousLanguageStartEditing');
        ft = ft.elementShouldNotBeVisible('#btnUbiquitousLanguageEdit');
        ft = ft.elementShouldNotBeVisible('.markdown-content');

        ft = ft
          .click('#btnCloseDbConnectionModal')
          .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');

        // --- STEP 10: Cleanup ---
        ft = ft.consoleLog('STEP 10: Cleaning up the test connection.');
        ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          ft,
          dbConnectionFileNameAndId,
          dbVendor,
        );

        // Stop starter-pack when done
        // if (!isFileBasedVendor(dbVendor)) {
        //   ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, dbVendor, 'stop');
        // }

        return ft;
        } finally {
          if (!isFileBasedVendor(dbVendor)) {
            ConnectionsTestHelper.dockerComposeDownInDbFolder();
          }
        }
      },
  );

  // ============================================================
  // In-Memory DuckDB CRUD test
  // DuckDB supports in-memory mode (empty dbName = no file needed).
  // This test verifies create/update/delete without file browsing.
  // ============================================================
  electronBeforeAfterAllTest(
    '(database-connection) [duckdb] in-memory mode: create, update, and delete',
    async function ({ beforeAfterEach: firstPage }) {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const connectionName = 'In-Memory DuckDB Test';
      const connectionCode = `db-${_.kebabCase(connectionName)}-duckdb`;
      const fileId = `${connectionCode}\\.xml`;
      const updatedName = `${connectionName} Updated`;

      let ft = new FluentTester(firstPage);

      // --- CREATE: name + type=duckdb, no file selected (in-memory) ---
      ft = ft
        .gotoConnections()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewDatabase')
        .click('#btnNewDatabase')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .waitOnElementToBecomeEnabled('#dbConnectionName')
        .click('#dbConnectionName')
        .typeText(connectionName)
        .dropDownSelectOptionHavingValue('#dbType', 'duckdb');

      // Don't touch #dbName — leave empty = in-memory DuckDB
      ft = ft
        .waitOnElementToBecomeEnabled('#btnOKConfirmationDbConnectionModal')
        .click('#btnOKConfirmationDbConnectionModal')
        // In-memory DuckDB shows confirmation: "You did not select any DuckDB database file..."
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal')
        .waitOnElementToBecomeVisible(`#${fileId}`)
        .clickAndSelectTableRow(`#${fileId}`)
        .elementShouldContainText(`#${fileId} td:first-child`, connectionName);

      // --- UPDATE: change name only ---
      ft = ft
        .gotoConnections()
        .clickAndSelectTableRow(`#${fileId}`)
        .waitOnElementToBecomeEnabled('#btnEdit')
        .click('#btnEdit')
        .waitOnElementToBecomeVisible('#dbConnectionName')
        .click('#dbConnectionName')
        .typeText('')
        .typeText(updatedName)
        .waitOnElementToBecomeEnabled('#btnOKConfirmationDbConnectionModal')
        .click('#btnOKConfirmationDbConnectionModal')
        // In-memory DuckDB: confirmation dialog appears again on update (dbName still empty)
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal')
        .waitOnElementToBecomeVisible(`#${fileId}`)
        .clickAndSelectTableRow(`#${fileId}`)
        .elementShouldContainText(`#${fileId} td:first-child`, updatedName);

      // --- DELETE ---
      ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft,
        fileId,
        'duckdb',
      );

      return ft;
    },
  );

  // ============================================================
  // T19: Explore Data tab — AI Hub start/stop + ai-manager state
  // Outside vendor loop (not vendor-specific)
  // ============================================================
  electronBeforeAfterAllTest(
    'Explore Data tab: AI Hub start/stop lifecycle and ai-manager dropdown state',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      let ft = new FluentTester(firstPage);

      // Step 1: Open connection modal, navigate to Explore Data tab
      ft = ft
        .gotoConnections()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewDatabase')
        .click('#btnNewDatabase')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .click('#tab-btn-toolsTab')
        .sleep(1000);

      // Step 2: Assert AI Hub shown as stopped
      ft = ft
        .consoleLog('[T19] Step 2: Assert AI Hub is stopped')
        .waitOnElementToBecomeVisible('#appPanel_flowkraft-data-canvas')
        .elementShouldContainText('#appState_flowkraft-data-canvas', 'stopped')
        .elementShouldContainText('#btnStartStop_flowkraft-data-canvas', 'Start');

      // Step 3: Assert ai-manager dropdown shows stopped state
      ft = ft
        .consoleLog('[T19] Step 3: Assert ai-manager dropdown (stopped)')
        .click('#btnAiDropdownToggle')
        .sleep(500)
        .elementShouldContainText('#btnLaunchChat2DB', 'stopped')
        .click('#btnAiDropdownToggle')
        .sleep(300);

      // Step 4: Start AI Hub from apps-manager
      ft = ft
        .consoleLog('[T19] Step 4: Starting AI Hub from Explore Data tab')
        .waitOnElementToBecomeEnabled('#btnStartStop_flowkraft-data-canvas')
        .click('#btnStartStop_flowkraft-data-canvas')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        // Wait for starting state
        .waitOnElementToBecomeDisabled('#btnStartStop_flowkraft-data-canvas')
        .waitOnElementToBecomeVisible('#appSpinner_flowkraft-data-canvas')
        .waitOnElementToContainText('#appState_flowkraft-data-canvas', 'starting')
        .consoleLog('[T19] AI Hub is starting...')
        // Wait for running state
        .waitOnElementToBecomeEnabled('#btnStartStop_flowkraft-data-canvas')
        .waitOnElementToContainText('#appState_flowkraft-data-canvas', 'running')
        .waitOnElementToContainText('#btnStartStop_flowkraft-data-canvas', 'Stop')
        .consoleLog('[T19] AI Hub is running.');

      // Step 5: Assert ai-manager dropdown shows running state
      ft = ft
        .consoleLog('[T19] Step 5: Assert ai-manager dropdown (running)')
        .click('#btnAiDropdownToggle')
        .sleep(500)
        .elementShouldContainText('#btnLaunchChat2DB', 'Launch')
        .click('#btnAiDropdownToggle')
        .sleep(300);

      // Step 6: Stop AI Hub from apps-manager
      ft = ft
        .consoleLog('[T19] Step 6: Stopping AI Hub from Explore Data tab')
        .waitOnElementToBecomeEnabled('#btnStartStop_flowkraft-data-canvas')
        .click('#btnStartStop_flowkraft-data-canvas')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        // Wait for stopping state
        .waitOnElementToBecomeDisabled('#btnStartStop_flowkraft-data-canvas')
        .waitOnElementToBecomeVisible('#appSpinner_flowkraft-data-canvas')
        .waitOnElementToContainText('#appState_flowkraft-data-canvas', 'stopping')
        .consoleLog('[T19] AI Hub is stopping...')
        // Wait for stopped state
        .waitOnElementToBecomeEnabled('#btnStartStop_flowkraft-data-canvas')
        .waitOnElementToContainText('#appState_flowkraft-data-canvas', 'stopped')
        .waitOnElementToContainText('#btnStartStop_flowkraft-data-canvas', 'Start')
        .consoleLog('[T19] AI Hub is stopped.');

      // Step 7: Assert ai-manager dropdown shows stopped state again
      ft = ft
        .consoleLog('[T19] Step 7: Assert ai-manager dropdown (stopped again)')
        .click('#btnAiDropdownToggle')
        .sleep(500)
        .elementShouldContainText('#btnLaunchChat2DB', 'stopped')
        .click('#btnAiDropdownToggle')
        .sleep(300);

      // Step 8: Close modal
      ft = ft
        .consoleLog('[T19] Step 8: Closing modal')
        .click('#btnCloseDbConnectionModal')
        .consoleLog('[T19] Explore Data tab test complete.');

      await ft;
    },
  );

});
