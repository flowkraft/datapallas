import _ from 'lodash';

import { FluentTester } from '../fluent-tester';
import * as PATHS from '../../utils/paths';
import { Constants } from '../../utils/constants';
import { ConfigurationTestHelper } from './configuration-test-helper';
import { DockerTestHelper } from '../docker-test-helper';

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Database vendor constants
export const DB_VENDORS_SUPPORTED = [
  'oracle',
  'sqlserver',
  'postgres',
  'mysql',
  'mariadb',
  'ibmdb2',
  'sqlite',
  'duckdb',
  'clickhouse',
  'supabase',
];

export const DB_VENDORS_DEFAULT = 'sqlite';

// OLAP vendors (have Star Schema with fact/dimension tables + views)
export const DB_VENDORS_OLAP = ['duckdb', 'clickhouse'];

// Helper to check if vendor is OLAP (has Star Schema)
export const SEED_CAPABLE_VENDORS = ['oracle', 'sqlserver', 'ibmdb2', 'postgres', 'mysql', 'mariadb', 'supabase', 'clickhouse', 'duckdb'];

export function hasSeedCapability(vendor: string): boolean {
  return SEED_CAPABLE_VENDORS.includes(vendor);
}

export function isOlapVendor(vendor: string): boolean {
  return DB_VENDORS_OLAP.includes(vendor.toLowerCase());
}

// OLTP tables (present in ALL databases)
export const SCHEMA_TABLES_OLTP = [
  'Categories',
  'Customers',
  'Employees',
  'OrderDetails',
  'Orders',
  'Products',
  'Shippers',
  'Suppliers',
];

// OLAP Star Schema tables (present only in DuckDB and ClickHouse)
export const SCHEMA_TABLES_OLAP = [
  'dim_customer',
  'dim_employee',
  'dim_product',
  'dim_time',
  'fact_sales',
];

// OLAP Views (present only in DuckDB and ClickHouse)
export const SCHEMA_VIEWS_OLAP = [
  'vw_monthly_sales',
  'vw_sales_detail',
];

type StarterPackState = 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown';

// Tables created by the Example (default) seed script (see component.getExampleCustomSeedScript).
// Used by the Database Schema verification step to confirm the seed actually landed in the DB
// and that the wipe actually removed them. Lowercase form matches the tree-node id convention
// (#treeNode{name}sourceTreedatabaseSchemaPicklist).
const EXAMPLE_DEFAULT_TABLES = ['my_employees', 'my_departments'];

// Tables created by the bundled `invoice-seeder.groovy` template and dropped by
// `wipe-invoices.groovy`. Authoritative source: GenericSeedExecutor.java:38 and the
// two .groovy templates under asbl/.../db-template/db/scripts/.
const INVOICE_SEEDER_TABLES = [
  'seed_inv_customer',
  'seed_inv_product',
  'seed_inv_invoice',
  'seed_inv_invoice_line',
];

// Hardcoded wipe paired with the Example (default) seed script.
// `safeDrop` swallows "table doesn't exist" errors so the wipe is idempotent on every
// vendor — sqlite, duckdb, and any future addition. Mirrors the component's own pattern.
const EXAMPLE_DEFAULT_WIPE_SCRIPT = `import groovy.sql.Sql

def safeDrop = { String table ->
    try { dbSql.execute("DROP TABLE " + table) }
    catch (Exception e) { /* table didn't exist — fine */ }
}

log.info("Wiping example default seed for " + vendor + "...")
safeDrop("my_employees")
safeDrop("my_departments")
log.info("Example default wipe complete for " + vendor)
`;

function vendorToPackId(vendor: string): string {
  const v = (vendor || '').toLowerCase().trim();
  switch (v) {
    case 'postgres':
    case 'postgresql':
      return 'db-northwind-postgres';
    case 'ibm-db2':
    case 'ibmdb2':
    case 'db2':
      return 'db-northwind-db2';
    case 'sqlserver':
      return 'db-northwind-sqlserver';
    case 'oracle':
      return 'db-northwind-oracle';
    case 'mariadb':
      return 'db-northwind-mariadb';
    case 'mysql':
      return 'db-northwind-mysql';
    case 'sqlite':
      return 'db-northwind-sqlite';
    case 'duckdb':
      return 'db-northwind-duckdb';
    case 'clickhouse':
      return 'db-northwind-clickhouse';
    case 'supabase':
      return 'db-northwind-supabase';
    case 'timescaledb':
      return 'db-timeseries-timescaledb';
    default:
      return `db-northwind-${v}`;
  }
}

export class ConnectionsTestHelper {
  static DB_VENDORS_TEST_RANDOM = true;

  // Map starter-pack defaults (mirrors .env)
  static dbServerConnDefaults(vendor: string) {
    const v = (vendor || '').toLowerCase();
    switch (v) {
      case 'postgres':
      case 'postgresql':
        return { host: 'localhost', port: '5432', db: 'Northwind', user: 'postgres', pass: 'postgres' };
      case 'mysql':
        return { host: 'localhost', port: '3306', db: 'Northwind', user: 'root', pass: 'password' };
      case 'mariadb':
        return { host: 'localhost', port: '3307', db: 'Northwind', user: 'root', pass: 'password' };
      case 'sqlserver':
        return { host: 'localhost', port: '1433', db: 'Northwind', user: 'sa', pass: 'Password123!' };
      case 'oracle':
        return { host: 'localhost', port: '1521', db: 'XEPDB1', user: 'oracle', pass: 'oracle' };
      case 'ibmdb2':
        return { host: 'localhost', port: '50000', db: 'NORTHWND', user: 'db2inst1', pass: 'password' };
      case 'duckdb':
        // DuckDB is file-based: no host/port/user/pass needed, only the database file path
        return { host: '', port: '', db: '/db/sample-northwind-duckdb/northwind.duckdb', user: '', pass: '' };
      case 'clickhouse':
        return { host: 'localhost', port: '8123', db: 'northwind', user: 'default', pass: 'clickhouse' };
      case 'supabase':
        return { host: 'localhost', port: '5435', db: 'Northwind', user: 'supabase_admin', pass: 'postgres' };
      case 'timescaledb':
        return { host: 'localhost', port: '5433', db: 'timeseries', user: 'timescale', pass: 'timescale' };
      default:
        return { host: 'localhost', port: '5432', db: 'Northwind', user: 'postgres', pass: 'postgres' };
    }
  }


  static deleteAndAssertEmailConnection(
    ft: FluentTester,
    connectionFileName: string,
  ): FluentTester {
    return ft
      .gotoConnections()
      .waitOnElementToBecomeVisible(`#${connectionFileName}`)
      .clickAndSelectTableRow(`#${connectionFileName}`)
      .waitOnElementToBecomeEnabled('#btnDelete')
      .elementShouldBeEnabled('#btnDelete')
      .click('#btnDelete')
      .waitOnElementToBecomeVisible('#confirmDialog')
      .clickNoDontDoThis()
      .waitOnElementToBecomeInvisible('#confirmDialog')
      // re-select row because some UIs clear selection after dialog dismissal
      .clickAndSelectTableRow(`#${connectionFileName}`)
      .waitOnElementToBecomeEnabled('#btnDelete')
      .click('#btnDelete')
      .waitOnElementToBecomeVisible('#confirmDialog')
      .clickYesDoThis()
      .waitOnElementToBecomeInvisible(`#${connectionFileName}`)
      .gotoConnections()
      .elementShouldNotBeVisible(`#${connectionFileName}`);
  }

  static duplicateAndAssertEmailConnection(
    ft: FluentTester,
    connectionName: string,
  ): FluentTester {
    const connectionFileName = `eml-${_.kebabCase(connectionName)}\\.xml`;
    const newConnectionName = `${connectionName} Duplicated`;
    const newConnectionFileName = `eml-${_.kebabCase(newConnectionName)}\\.xml`;

    return ft
      .gotoConnections()
      .waitOnElementToHaveText(
        `#${connectionFileName} td:first-child`,
        `${connectionName} Modified`,
      )
      .clickAndSelectTableRow(`#${connectionFileName}`)
      .waitOnElementToBecomeEnabled('#btnDuplicate')
      .click('#btnDuplicate')
      .waitOnElementToBecomeEnabled('#connectionName')
      .click('#connectionName')
      .typeText(`${connectionName}`)
      .waitOnElementToContainText('#alreadyExistsWarning', 'already exists')
      .waitOnElementToBecomeDisabled('#btnOKConfirmationConnectionModal')
      .click('#connectionName')
      .typeText('')
      .waitOnElementToBecomeInvisible('#alreadyExistsWarning')
      .elementShouldBeDisabled('#btnOKConfirmationConnectionModal')
      .typeText(`${newConnectionName}`)
      .waitOnElementToBecomeEnabled('#btnOKConfirmationConnectionModal')
      .click('#emailServerHost')
      .typeText('smtp.exmail.qq.com Duplicated')
      .click('#smtpPort')
      .typeText('777')
      .pageShouldContainText('Create Email Connection')
      .click('#btnOKConfirmationConnectionModal')
      .waitOnElementToHaveText(
        `#${newConnectionFileName} td:first-child`,
        `${newConnectionName}`,
      )
      .gotoConnections()
      .waitOnElementToHaveText(
        `#${connectionFileName} td:first-child`,
        `${connectionName} Modified`,
      )
      .waitOnElementToHaveText(
        `#${newConnectionFileName} td:first-child`,
        `${newConnectionName}`,
      )
      .clickAndSelectTableRow(`#${newConnectionFileName}`)
      .waitOnElementToBecomeEnabled('#btnEdit')
      .click('#btnEdit')
      .waitOnElementToBecomeEnabled('#btnOKConfirmationConnectionModal')
      .inputShouldHaveValue('#connectionName', `${newConnectionName}`)
      .inputShouldHaveValue('#emailServerHost', 'smtp.exmail.qq.com Duplicated')
      .inputShouldHaveValue('#smtpPort', '777')
      .click('#btnCloseConnectionModal');
  }

  static readUpdateAndAssertEmailConnection(
    ft: FluentTester,
    connectionName: string,
  ): FluentTester {
    const connectionFileName = `eml-${_.kebabCase(connectionName)}\\.xml`;

    return ft
      .gotoConnections()
      .waitOnElementToHaveText(
        `#${connectionFileName} td:first-child`,
        connectionName,
      )
      .clickAndSelectTableRow(`#${connectionFileName}`)
      .waitOnElementToBecomeEnabled('#btnEdit')
      .click('#btnEdit')
      .waitOnElementToBecomeEnabled('#btnOKConfirmationConnectionModal')
      .inputShouldHaveValue('#connectionName', connectionName)
      .inputShouldHaveValue('#emailServerHost', 'smtp.exmail.qq.com')
      .inputShouldHaveValue('#smtpPort', '465')
      .elementCheckBoxShouldBeSelected('#btnSSL')
      .elementCheckBoxShouldNotBeSelected('#btnTLS')
      .inputShouldHaveValue('#fromName', '${var0}')
      .inputShouldHaveValue('#fromEmailAddress', '${var1}')
      .inputShouldHaveValue('#userName', '${var2}')
      .inputShouldHaveValue('#smtpPassword', '${var3}')
      .pageShouldContainText('Update Email Connection')
      .click('#btnCloseConnectionModal')
      .elementShouldHaveText(
        `#${connectionFileName} td:first-child`,
        connectionName,
      )
      .click('#btnEdit')
      .waitOnElementToBecomeEnabled('#btnOKConfirmationConnectionModal')
      .click('#connectionName')
      .typeText(`${connectionName} Modified`)
      .click('#emailServerHost')
      .typeText('smtp.exmail.qq.com Modified')
      .click('#smtpPort')
      .typeText('999')
      .click('#btnSSL')
      .click('#btnTLS')
      .click('#fromName')
      .typeText('${var0} Modified')
      .click('#fromEmailAddress')
      .typeText('${var1} Modified')
      .click('#userName')
      .typeText('${var2} Modified')
      .click('#smtpPassword')
      .typeText('${var3} Modified')
      .click('#btnOKConfirmationConnectionModal')
      .waitOnElementToHaveText(
        `#${connectionFileName} td:first-child`,
        `${connectionName} Modified`,
      )
      .gotoConnections()
      .waitOnElementToHaveText(
        `#${connectionFileName} td:first-child`,
        `${connectionName} Modified`,
      )
      .clickAndSelectTableRow(`#${connectionFileName}`)
      .waitOnElementToBecomeEnabled('#btnEdit')
      .click('#btnEdit')
      .waitOnElementToBecomeEnabled('#btnOKConfirmationConnectionModal')
      .inputShouldHaveValue('#connectionName', `${connectionName} Modified`)
      .inputShouldHaveValue('#emailServerHost', 'smtp.exmail.qq.com Modified')
      .inputShouldHaveValue('#smtpPort', '999')
      .elementCheckBoxShouldNotBeSelected('#btnSSL')
      .elementCheckBoxShouldBeSelected('#btnTLS')
      .inputShouldHaveValue('#fromName', '${var0} Modified')
      .inputShouldHaveValue('#fromEmailAddress', '${var1} Modified')
      .inputShouldHaveValue('#userName', '${var2} Modified')
      .inputShouldHaveValue('#smtpPassword', '${var3} Modified')
      .click('#btnCloseConnectionModal');
  }

  static createAndAssertNewEmailConnection(
    ft: FluentTester,
    connectionName: string,
  ): FluentTester {
    const connectionFileName = `eml-${_.kebabCase(connectionName)}\\.xml`;

    return ft
      .gotoConnections()
      .waitOnElementToBecomeEnabled('#btnNewDropdown') // Wait for the dropdown button to be enabled
      .click('#btnNewDropdown') // Click the dropdown button
      .waitOnElementToBecomeVisible('#btnNewEmail') // Wait for the email option to appear
      .click('#btnNewEmail')
      .waitOnElementToBecomeVisible('#connectionName')
      .elementShouldBeDisabled('#btnOKConfirmationConnectionModal')
      .click('#btnCloseConnectionModal')
      .waitOnElementToBecomeInvisible('#btnCloseConnectionModal')
      .click('#btnNewDropdown') // Click the dropdown button
      .waitOnElementToBecomeVisible('#btnNewEmail') // Wait for the email option to appear
      .click('#btnNewEmail')
      .waitOnElementToBecomeVisible('#connectionName')
      .click('#connectionName')
      .typeText('Contact')
      .waitOnElementToContainText('#alreadyExistsWarning', 'already exists')
      .typeText(connectionName)
      .waitOnElementToBecomeInvisible('#alreadyExistsWarning')
      .waitOnElementToBecomeEnabled('#btnOKConfirmationConnectionModal')
      .click('#btnWellKnownEmailProviders')
      .waitOnElementToBecomeVisible('#btnShowMoreProviders')
      .click('#modalWellKnownEmailProviders #btnClose:visible')
      .waitOnElementToBecomeInvisible('#btnShowMoreProviders')
      .click('#btnWellKnownEmailProviders')
      .waitOnElementToBecomeVisible('#btnShowMoreProviders')
      .click('#btnShowMoreProviders')
      .click('#QQex:visible')
      .click('#modalWellKnownEmailProviders #btnOKConfirmation:visible')
      .inputShouldHaveValue('#emailServerHost', 'smtp.exmail.qq.com')
      .inputShouldHaveValue('#smtpPort', '465')
      .elementCheckBoxShouldBeSelected('#btnSSL')
      .elementCheckBoxShouldNotBeSelected('#btnTLS')
      .click('#fromName')
      .typeText('')
      .click('#btnFromNameVariables')
      .click('#\\$\\{var0\\}:visible')
      .click('#modalSelectVariable #btnOKConfirmation:visible')
      .click('#fromEmailAddress')
      .typeText('')
      .click('#btnFromEmailAddressVariables')
      .click('#\\$\\{var1\\}:visible')
      .click('#modalSelectVariable #btnOKConfirmation:visible')
      .click('#userName')
      .typeText('')
      .click('#btnUserNameVariables')
      .click('#\\$\\{var2\\}:visible')
      .click('#modalSelectVariable #btnOKConfirmation:visible')
      .click('#smtpPassword')
      .typeText('')
      .click('#btnSmtpPasswordVariables')
      .click('#btnShowMoreVariables:visible')
      .waitOnElementToBecomeVisible('#\\$\\{var3\\}:visible')
      .click('#\\$\\{var3\\}:visible')
      .click('#modalSelectVariable #btnOKConfirmation:visible')
      .pageShouldContainText('Create Email Connection')
      .click('#btnOKConfirmationConnectionModal')
      .waitOnElementToHaveText(
        `#${connectionFileName} td:first-child`,
        connectionName,
      );
  }

  static makeConnectionAsDefault(
    ft: FluentTester,
    connectionFileName: string,
  ): FluentTester {

    // not default -> perform the normal fluent UI flow to make it default
    return ft
      .clickAndSelectTableRow(`#${connectionFileName}`)
      .waitOnElementToBecomeVisible(`#btnActions_${connectionFileName}`)
      .click(`#btnActions_${connectionFileName}`)
      .waitOnElementToBecomeVisible(`#btnToggleDefault_${connectionFileName}`)
      // first click (cancel) to ensure dialog flow works
      .click(`#btnToggleDefault_${connectionFileName}`)
      .clickNoDontDoThis()
      // repeat and confirm
      .click(`#btnActions_${connectionFileName}`)
      .waitOnElementToBecomeVisible(`#btnToggleDefault_${connectionFileName}`)
      .click(`#btnToggleDefault_${connectionFileName}`)
      .clickYesDoThis()
      .waitOnElementToBecomeInvisible(`#btnActions_${connectionFileName}`)
      .waitOnElementToBecomeVisible(`#btnDefault_${connectionFileName}`)
      .waitOnElementToHaveClass('#btnDelete', 'disabled');
  }

  static assertConfigurationUsesEmailConnection(
    ft: FluentTester,
    folderName: string,
    emailConnectionName: string,
    shouldBeTheDefaultEmailConnection: string,
  ): FluentTester {
    ft = ConfigurationTestHelper.loadConfiguration(ft, folderName)

    ft = ft
      .click('#leftMenuEmailSettings') // email SMTP settings
      .elementCheckBoxShouldBeSelected('#btnUseExistingEmailConnection')
      .elementShouldBeEnabled('#btnSelectedEmailConnection')
      .elementShouldContainText(
        '#btnSelectedEmailConnection',
        emailConnectionName,
      );

    if (shouldBeTheDefaultEmailConnection == 'yes-default-connection')
      ft = ft.elementShouldBeVisible('#selectedEmailConnectionDefault');
    else ft = ft.elementShouldNotBeVisible('#selectedEmailConnectionDefault');

    if (emailConnectionName == 'Email Contact Information') {
      ft = ft
        .inputShouldHaveValue('#fromName', 'From Name')
        .inputShouldHaveValue('#fromEmailAddress', 'from@emailaddress.com')
        .inputShouldHaveValue('#emailServerHost', 'Email Server Host')
        .inputShouldHaveValue('#smtpPort', '25')
        .inputShouldHaveValue('#userName', 'From Email User ID')
        .inputShouldHaveValue('#smtpPassword', 'From Email Password')
        .elementCheckBoxShouldNotBeSelected('#btnSSL')
        .elementCheckBoxShouldNotBeSelected('#btnTLS');
    } else if (emailConnectionName == 'Test Contact Information') {
      ft = ft
        .inputShouldHaveValue('#fromName', '${var0}')
        .inputShouldHaveValue('#fromEmailAddress', '${var1}')
        .inputShouldHaveValue('#emailServerHost', 'smtp.exmail.qq.com')
        .inputShouldHaveValue('#smtpPort', '465')
        .inputShouldHaveValue('#userName', '${var2}')
        .inputShouldHaveValue('#smtpPassword', '${var3}')
        .elementCheckBoxShouldBeSelected('#btnSSL')
        .elementCheckBoxShouldNotBeSelected('#btnTLS');
    }
    ft = ft
      .elementShouldBeDisabled('#fromName')
      .elementShouldBeDisabled('#fromEmailAddress')
      .elementShouldBeDisabled('#emailServerHost')
      .elementShouldBeDisabled('#smtpPort')
      .elementShouldBeDisabled('#userName')
      .elementShouldBeDisabled('#smtpPassword')
      .elementShouldBeDisabled('#btnTLS')
      .elementShouldBeDisabled('#btnSSL')
      .elementShouldHaveAttribute('#btnFromNameVariables > button', 'disabled')
      .elementShouldHaveAttribute(
        '#btnFromEmailAddressVariables > button',
        'disabled',
      )
      .elementShouldHaveAttribute(
        '#btnEmailServerHostVariables > button',
        'disabled',
      )
      .elementShouldHaveAttribute('#btnSmtpPortVariables > button', 'disabled')
      .elementShouldHaveAttribute('#btnUserNameVariables > button', 'disabled')
      .elementShouldHaveAttribute(
        '#btnSmtpPasswordVariables > button',
        'disabled',
      );

    return ft;
  }

  /**
   * Creates a new database connection and asserts that it was created correctly
   * @param ft FluentTester instance
   * @param connectionName Name for the new connection
   * @param dbVendor Database vendor type (one of Constants.DB_VENDORS_SUPPORTED)
   */
  static createAndAssertNewDatabaseConnection(
    ft: FluentTester,
    connectionName: string,
    dbVendor: string,
  ): FluentTester {
    const connectionCode = `db-${_.kebabCase(connectionName)}-${dbVendor}`;
    //const kebabConnectionName = _.kebabCase(connectionName); // Needed for fillNewDatabaseConnectionDetails

    // Navigate and open the modal
    ft = ft
      .gotoConnections()
      .waitOnElementToBecomeEnabled('#btnNewDropdown')
      .click('#btnNewDropdown')
      .waitOnElementToBecomeVisible('#btnNewDatabase')
      .click('#btnNewDatabase')
      .waitOnElementToBecomeVisible('#modalDbConnection')
      // Wait for a field to be ready before filling, e.g., connection name input
      .waitOnElementToBecomeEnabled('#dbConnectionName');

    // Fill connection details using the reusable helper
    // This replaces the manual .typeText, .dropDownSelectOptionHavingValue, and if/else block for vendor specifics
    ft = ConnectionsTestHelper.fillNewDatabaseConnectionDetails(
      ft,
      connectionName,
      dbVendor,
      //kebabConnectionName,
    );

    // Save the connection and perform assertions (this part remains the same as your original)
    return ft
      .waitOnElementToBecomeEnabled('#btnOKConfirmationDbConnectionModal')
      .click('#btnOKConfirmationDbConnectionModal')
      .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal')
      .waitOnElementToBecomeVisible(`#${connectionCode}\\.xml`)
      .clickAndSelectTableRow(`#${connectionCode}\\.xml`)
      .elementShouldContainText(
        `#${connectionCode}\\.xml td:first-child`,
        connectionName,
      )
      .elementShouldContainText(
        `#${connectionCode}\\.xml td:nth-child(2)`,
        'database-connection',
      )
      .elementShouldHaveText(
        `#${connectionCode}\\.xml td:nth-child(3)`,
        '--not used--',
      );
  }

  /**
   * Reads an existing database connection, updates its values, and asserts the changes
   * @param ft FluentTester instance
   * @param connectionName Name of the connection to update
   * @param dbVendor Database vendor type (one of Constants.DB_VENDORS_SUPPORTED)
   */
  static readUpdateAndAssertDatabaseConnection(
    ft: FluentTester,
    connectionName: string,
    dbVendor: string,
  ): FluentTester {
    const connectionCode = `db-${_.kebabCase(connectionName)}-${dbVendor}`;
    const updatedConnectionName = `${connectionName} Updated`;

    // Start sequence for updating
    let sequence = ft
      .gotoConnections()
      .clickAndSelectTableRow(`#${connectionCode}\\.xml`)
      .waitOnElementToBecomeEnabled('#btnEdit')
      .click('#btnEdit')
      .waitOnElementToBecomeVisible('#dbConnectionName')
      .click('#dbConnectionName')
      .typeText('')
      .typeText(updatedConnectionName);

    // Vendor-specific update logic
    if (dbVendor === 'sqlite') {
      // For SQLite, we only update the database file path
      sequence = sequence
        .createFolder(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-sqlite-test`,
        )
        .copyFile(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-sqlite/northwind.db`,
          `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-sqlite-test/northwind-test.db`,
        )
        .click('#btnBrowseSqliteFile')
        .waitOnElementToBecomeEnabled(
          '#childDirLinksample-northwind-sqlite-test',
        )
        .click('#childDirLinksample-northwind-sqlite-test')
        .waitOnElementToBecomeVisible('#tdFileNamenorthwind-test\\.db')
        .elementShouldBeDisabled('#btnSelectFileExplorer')
        .click('#tdFileNamenorthwind-test\\.db');
      sequence = sequence
        .waitOnElementToBecomeEnabled('#btnSelectFileExplorer')
        .click('#btnSelectFileExplorer')
        .waitOnElementToBecomeInvisible('#btnSelectFileExplorer')
        .waitOnInputValueToContainText(
          '#dbName',
          '/db/sample-northwind-sqlite-test/northwind-test.db',
        );
    } else if (dbVendor === 'duckdb') {
      // DuckDB update: copy file to test dir, browse to it (#dbName is readonly)
      sequence = sequence
        .createFolder(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test`,
        )
        .copyFile(
          `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb/northwind.duckdb`,
          `${process.env.PORTABLE_EXECUTABLE_DIR}/db/sample-northwind-duckdb-test/northwind-test.duckdb`,
        )
        .click('#btnBrowseSqliteFile')
        .waitOnElementToBecomeEnabled(
          '#childDirLinksample-northwind-duckdb-test',
        )
        .click('#childDirLinksample-northwind-duckdb-test')
        .waitOnElementToBecomeVisible('#tdFileNamenorthwind-test\\.duckdb')
        .elementShouldBeDisabled('#btnSelectFileExplorer')
        .click('#tdFileNamenorthwind-test\\.duckdb');
      sequence = sequence
        .waitOnElementToBecomeEnabled('#btnSelectFileExplorer')
        .click('#btnSelectFileExplorer')
        .waitOnElementToBecomeInvisible('#btnSelectFileExplorer')
        .waitOnInputValueToContainText(
          '#dbName',
          '/db/sample-northwind-duckdb-test/northwind-test.duckdb',
        );
    } else {
      // For server-based databases (PostgreSQL, MySQL, ClickHouse, etc.), update host and port
      sequence = sequence
        .click('#dbHost')
        .typeText('')
        .typeText('db.example.com')
        .click('#dbPort')
        .typeText('')
        .typeText('5433');
    }

    // Complete the update sequence
    return sequence
      .waitOnElementToBecomeEnabled('#btnOKConfirmationDbConnectionModal')
      .click('#btnOKConfirmationDbConnectionModal')
      .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal')
      .waitOnElementToBecomeVisible(`#${connectionCode}\\.xml`)
      .clickAndSelectTableRow(`#${connectionCode}\\.xml`)
      .elementShouldContainText(
        `#${connectionCode}\\.xml td:first-child`,
        updatedConnectionName,
      );
  }

  /**
   * Duplicates an existing database connection and asserts the duplicate was created
   * @param ft FluentTester instance
   * @param connectionName Name of the connection to duplicate
   * @param dbVendor Database vendor type (one of Constants.DB_VENDORS_SUPPORTED)
   */
  static duplicateAndAssertDatabaseConnection(
    ft: FluentTester,
    connectionName: string,
    dbVendor: string,
  ): FluentTester {
    const originalConnectionCode = `db-${_.kebabCase(connectionName)}-${dbVendor}`;

    // This will be the new unique name we type for the duplicated connection.
    const newNameForDuplicate = `${connectionName} Duplicated`;
    // This will be the code/ID of the newly created duplicated connection based on the new unique name.
    const newDuplicateConnectionCode = `db-${_.kebabCase(newNameForDuplicate)}-${dbVendor}`;

    return (
      ft
        .gotoConnections()
        .clickAndSelectTableRow(`#${originalConnectionCode}\\.xml`)
        .waitOnElementToBecomeEnabled('#btnDuplicate')
        .click('#btnDuplicate')
        .waitOnElementToBecomeVisible('#dbConnectionName')
        // --- Start: New logic similar to the email duplication test ---
        .click('#dbConnectionName') // Focus the name field
        .typeText(connectionName) // Type the current name of the connection being duplicated
        .waitOnElementToContainText('#dbAlreadyExistsWarning', 'already exists') // Check for the warning
        .waitOnElementToBecomeDisabled('#btnOKConfirmationDbConnectionModal') // Save button should be disabled

        .click('#dbConnectionName') // Focus again to clear
        .typeText('') // Clear the name field
        .waitOnElementToBecomeInvisible('#dbAlreadyExistsWarning') // Warning should disappear
        .elementShouldBeDisabled('#btnOKConfirmationDbConnectionModal') // Save button still disabled (empty name)

        .typeText(newNameForDuplicate) // Type the new, unique name for the duplicate
        .waitOnElementToBecomeEnabled('#btnOKConfirmationDbConnectionModal') // Save button should become enabled
        // --- End: New logic ---

        .pageShouldContainText('Create Database Connection') // Verify modal title for duplicate is "Create..."
        .click('#btnOKConfirmationDbConnectionModal') // Click Save
        .waitOnElementToBecomeInvisible('#btnOKConfirmationDbConnectionModal')
        .waitOnElementToBecomeVisible(`#${newDuplicateConnectionCode}\\.xml`) // Wait for the new duplicated entry in the list
        .clickAndSelectTableRow(`#${newDuplicateConnectionCode}\\.xml`) // Select the new duplicated entry
        .elementShouldContainText(
          `#${newDuplicateConnectionCode}\\.xml td:first-child`, // Verify the name in the list
          newNameForDuplicate,
        )
        .elementShouldContainText(
          `#${newDuplicateConnectionCode}\\.xml td:nth-child(2)`,
          'database-connection',
        )
        .elementShouldHaveText(
          `#${newDuplicateConnectionCode}\\.xml td:nth-child(3)`,
          '--not used--',
        )
    );
  }

  /**
   * Deletes a database connection and verifies that it and all its associated files are deleted
   * @param ft FluentTester instance
   * @param connectionFileName Name of the connection file (with xml extension)
   * @param dbVendor Database vendor type (one of Constants.DB_VENDORS_SUPPORTED)
   */
  static deleteAndAssertDatabaseConnection(
    ft: FluentTester,
    connectionFileName: string,
    dbVendor: string,
  ): FluentTester {
    // We'll verify the deletion in the UI first
    return ft
      .gotoConnections()
      .clickAndSelectTableRow(`#${connectionFileName}`)
      .waitOnElementToBecomeEnabled('#btnDelete')
      .click('#btnDelete')
      .waitOnConfirmDialogToBecomeVisible()
      .clickYesDoThis()
      .waitOnElementToBecomeInvisible(`#${connectionFileName}`)
      .gotoConnections()
      .elementShouldNotBeVisible(`#${connectionFileName}`);
  }

  // Helper methods for database vendors default values
  /**
   * Get the default host name for the given database vendor
   */
  static getDefaultHostForVendor(dbVendor: string): string {
    switch (dbVendor) {
      case 'oracle':
        return 'oracle-db.example.com';
      case 'sqlserver':
        return 'sqlserver.example.com';
      case 'postgresql':
        return 'localhost';
      case 'mysql':
        return 'mysql.example.com';
      case 'mariadb':
        return 'mariadb.example.com';
      case 'ibmdb2':
        return 'db2.example.com';
      default:
        return 'localhost';
    }
  }

  /**
   * Get the default port for the given database vendor
   */
  static getDefaultPortForVendor(dbVendor: string): string {
    switch (dbVendor) {
      case 'oracle':
        return '1521';
      case 'sqlserver':
        return '1433';
      case 'postgresql':
        return '5432';
      case 'mysql':
        return '3306';
      case 'mariadb':
        return '3306';
      case 'ibmdb2':
        return '50000';
      default:
        return '5432';
    }
  }

  /**
   * Get the default database name for the given database vendor
   */
  static getDefaultDatabaseNameForVendor(dbVendor: string): string {
    switch (dbVendor) {
      case 'oracle':
        return 'XEPDB1';
      case 'sqlserver':
        return 'master';
      case 'postgresql':
        return 'postgres';
      case 'mysql':
        return 'test';
      case 'mariadb':
        return 'test';
      case 'ibmdb2':
        return 'sample';
      default:
        return 'test';
    }
  }

  /**
   * Get the default username for the given database vendor
   */
  static getDefaultUsernameForVendor(dbVendor: string): string {
    switch (dbVendor) {
      case 'oracle':
        return 'system';
      case 'sqlserver':
        return 'sa';
      case 'postgresql':
        return 'postgres';
      case 'mysql':
        return 'root';
      case 'mariadb':
        return 'root';
      case 'ibmdb2':
        return 'db2inst1';
      default:
        return 'admin';
    }
  }

  /**
   * Get the default password for the given database vendor
   */
  static getDefaultPasswordForVendor(dbVendor: string): string {
    // Use simple passwords for testing
    switch (dbVendor) {
      case 'oracle':
        return 'oracle';
      case 'sqlserver':
        return 'Password123!';
      case 'postgresql':
        return 'postgres';
      case 'mysql':
        return 'password';
      case 'mariadb':
        return 'password';
      case 'ibmdb2':
        return 'password';
      default:
        return 'password';
    }
  }

  /**
   * Fills the details in an already open "New/Edit Database Connection" modal.
   * For SQLite, this includes interacting with the file browser to create the DB file.
   * This function does NOT click the final "OK" or "Save" button of the modal.
   */
  public static fillNewDatabaseConnectionDetails(
    ft: FluentTester,
    connectionName: string,
    dbVendor: string,
    //kebabConnectionName: string, // Used for generating default DB names and SQLite filename
  ): FluentTester {
    ft = ft.consoleLog(
      `Filling database connection details for: ${connectionName}, Vendor: ${dbVendor}`,
    );

    // 1. Fill Connection Name
    ft = ft
      .waitOnElementToBecomeEnabled('#dbConnectionName')
      .click('#dbConnectionName') // Ensure focus
      .typeText(connectionName);

    // 2. Select Database Type
    const dbVendorSelectValue = dbVendor.toLowerCase();
    ft = ft.dropDownSelectOptionHavingValue('#dbType', dbVendorSelectValue);
    // No verification needed - if selection fails, subsequent steps (file browser, save) will fail anyway
    // Original working code (connections.spec.ignore) never verified dropdown selection

    // 3. Fill vendor-specific details
    if (dbVendorSelectValue === 'sqlite') {
      // SQLite requires a file path via file browser
      ft = ft.waitOnElementToBecomeEnabled('#btnBrowseSqliteFile');
      ft = ft.click('#btnBrowseSqliteFile');

      ft = ft.waitOnElementToBecomeEnabled(
        '#childDirLinksample-northwind-sqlite',
      );
      ft = ft.click('#childDirLinksample-northwind-sqlite');

      ft = ft.waitOnElementToBecomeVisible('#tdFileNamenorthwind\\.db');

      ft = ft.elementShouldBeDisabled('#btnSelectFileExplorer');
      ft = ft.click('#tdFileNamenorthwind\\.db');
      ft = ft.waitOnElementToBecomeEnabled('#btnSelectFileExplorer');

      ft = ft.click('#btnSelectFileExplorer');
      ft = ft.waitOnElementToBecomeInvisible('#btnSelectFileExplorer');
      ft = ft.waitOnInputValueToContainText(
        '#dbName',
        '/db/sample-northwind-sqlite/northwind.db',
      );
    } else if (dbVendorSelectValue === 'duckdb') {
      // DuckDB is file-based: use file browser (same as SQLite — #dbName is readonly)
      ft = ft.waitOnElementToBecomeEnabled('#btnBrowseSqliteFile');
      ft = ft.click('#btnBrowseSqliteFile');
      ft = ft.waitOnElementToBecomeEnabled('#childDirLinksample-northwind-duckdb');
      ft = ft.click('#childDirLinksample-northwind-duckdb');
      ft = ft.waitOnElementToBecomeVisible('#tdFileNamenorthwind\\.duckdb');
      ft = ft.elementShouldBeDisabled('#btnSelectFileExplorer');
      ft = ft.click('#tdFileNamenorthwind\\.duckdb');
      ft = ft.waitOnElementToBecomeEnabled('#btnSelectFileExplorer');
      ft = ft.click('#btnSelectFileExplorer');
      ft = ft.waitOnElementToBecomeInvisible('#btnSelectFileExplorer');
      ft = ft.waitOnInputValueToContainText(
        '#dbName',
        '/db/sample-northwind-duckdb/northwind.duckdb',
      );
    } else {
      // Server-based databases (PostgreSQL, MySQL, ClickHouse, etc.)
      const d = ConnectionsTestHelper.dbServerConnDefaults(dbVendorSelectValue);

      ft = ft
        .waitOnElementToBecomeEnabled('#dbHost').click('#dbHost').typeText(d.host)
        .waitOnElementToBecomeEnabled('#dbPort').click('#dbPort').typeText(d.port)
        .waitOnElementToBecomeEnabled('#dbName').click('#dbName').typeText(d.db)
        .waitOnElementToBecomeEnabled('#dbUsername').click('#dbUsername').typeText(d.user)
        .waitOnElementToBecomeEnabled('#dbPassword').click('#dbPassword').typeText(d.pass);
    }

    ft = ft.consoleLog(
      `Finished filling database connection details for: ${connectionName}`,
    );
    return ft;
  }

  static useForJasperReports(
    ft: FluentTester,
    connectionFileName: string,
  ): FluentTester {
    // The dropdown button is btnDefault_ (blue) for default connections
    // or btnActions_ (grey) for non-default — click whichever is visible
    const dropdownSelector = `#btnDefault_${connectionFileName}, #btnActions_${connectionFileName}`;
    return ft
      .gotoConnections()
      .clickAndSelectTableRow(`#${connectionFileName}`)
      .waitOnElementToBecomeVisible(dropdownSelector)
      .click(dropdownSelector)
      .waitOnElementToBecomeVisible(`#btnUseForJasper_${connectionFileName}`)
      .click(`#btnUseForJasper_${connectionFileName}`)
      .confirmDialogShouldBeVisible()
      .clickYesDoThis();
  }

  static _waitForStarterPackToBeInState(
    ft: FluentTester,
    packId: string,
    state: StarterPackState,
    timeout: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS,
  ): FluentTester {
    if (!packId) return ft.consoleLog(`Invalid starter pack id '${packId}'`);

    const btnSel = `#btnStartStop_${packId}`;
    const iconSel = `#btnStartStop_${packId} #starterPackIcon_${packId}`;
    const spinnerSel = `#btnStartStop_${packId} #starterPackSpinner_${packId}`;

    let seq = ft;

    switch (state) {
      case 'starting':
        return seq
          .waitOnElementToBecomeDisabled(btnSel, timeout)
          .waitOnElementToBecomeVisible(spinnerSel, timeout)
          .waitOnElementToHaveText(btnSel, 'Starting', timeout)
          .consoleLog(`Starter pack '${packId}' entered 'starting' state.`);
      case 'stopping':
        return seq
          .waitOnElementToBecomeDisabled(btnSel, timeout)
          .waitOnElementToBecomeVisible(spinnerSel, timeout)
          .waitOnElementToHaveText(btnSel, 'Stopping', timeout)
          .consoleLog(`Starter pack '${packId}' entered 'stopping' state.`);
      case 'running':
        return seq
          .waitOnElementToBecomeEnabled(btnSel, timeout)
          .waitOnElementToHaveText(btnSel, 'Stop', timeout)
          .waitOnElementToBecomeVisible(iconSel, timeout)
          .consoleLog(`Starter pack '${packId}' is 'running'.`);
      case 'stopped':
        return seq
          .waitOnElementToBecomeEnabled(btnSel, timeout)
          .waitOnElementToHaveText(btnSel, 'Start', timeout)
          .waitOnElementToBecomeVisible(iconSel, timeout)
          .consoleLog(`Starter pack '${packId}' is 'stopped'.`);
      case 'error':
        return seq
          .waitOnElementToBecomeEnabled(btnSel, timeout)
          .waitOnElementToHaveText(btnSel, 'Start', timeout)
          .consoleLog(`Starter pack '${packId}' reported 'error' / not running.`);
      case 'unknown':
      default:
        return seq.consoleLog(
          `Starter pack '${packId}' is in 'unknown' / control visible state.`,
        );
    }
  }

  static setStarterPackStateForVendor(
    ft: FluentTester,
    dbVendor: string,
    action: 'start' | 'stop',
    fullTimeout: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS,
  ): FluentTester {
    // Starting a pack really boots a container — fail fast + loud if Docker is down,
    // instead of hanging on the long Start→running wait below.
    if (action === 'start') {
      DockerTestHelper.assertDockerRunning(`starter pack start: ${dbVendor}`);
    }

    const packId = vendorToPackId(dbVendor);
    const btnSel = `#btnStartStop_${packId}`;

    // Navigate, then operate only on the Start/Stop button (container ID is not reliable)
    let seq = ft
      .gotoStarterPacks()
      .setValue('#packSearch', dbVendor)
      // debounce in component is 300ms; add small buffer
      .sleep(400)
      .waitOnElementToBecomeVisible(btnSel);

    // --- MINIMAL LIVE PRECHECK: probe page state after navigation, and cancel queued actions if already in target state ---
    const probeAction = async (): Promise<void> => {
      try {
        // quick non-blocking probe of the button presence/visibility
        const exists = await ft.elementExistsNow(btnSel, 1000);
        if (!exists) {
          // no control found -> nothing to do
          console.log(`[ConnectionsTestHelper] Starter pack control not present for '${packId}' (btnSel=${btnSel}) - skipping start/stop probe.`);
          return;
        }

        // read normalized button text and decide
        const raw = (await ft.getElementTextContent(btnSel) || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (action === 'start') {
          if (raw.includes('stop') && !raw.includes('start')) {
            console.log(`Starter pack '${packId}' already running; skipping start.`);
            // cancel queued follow-up actions (prevents the start flow)
            ft.actions = [];
            return;
          }
        } else {
          if (raw.includes('start') && !raw.includes('stop')) {
            console.log(`Starter pack '${packId}' already stopped; skipping stop.`);
            // cancel queued follow-up actions (prevents the stop flow)
            ft.actions = [];
            return;
          }
        }
      } catch (err) {
        // on probe errors fall back to normal flow (do nothing)
        console.warn(`[ConnectionsTestHelper] probeAction failed for '${packId}': ${err && err.message}`);
      }
    };

    // push probeAction so it runs after the navigation actions but before the start/stop actions added below
    seq.actions.push(probeAction);
    // --- end precheck ---

    // --- MINIMAL PRE-VALIDATION + original flow (queued) ---
    if (action === 'start') {
      // assert UI shows "Start" before attempting to start (tolerant contains)
      seq = seq.elementShouldContainText(btnSel, 'Start');
    } else {
      seq = seq.elementShouldContainText(btnSel, 'Stop');
    }

    seq = seq
      .waitOnElementToBecomeEnabled(btnSel)
      .click(btnSel)
      .confirmDialogShouldBeVisible()
      .clickYesDoThis()
      .consoleLog(`Requested ${action} for starter pack '${packId}'.`);

    if (action === 'start') {
      seq = this._waitForStarterPackToBeInState(
        seq,
        packId,
        'starting',
        fullTimeout,
      );
      seq = this._waitForStarterPackToBeInState(seq, packId, 'running', fullTimeout);
      return seq;
    }

    // action === 'stop'
    seq = this._waitForStarterPackToBeInState(
      seq,
      packId,
      'stopping',
      fullTimeout,
    );
    seq = this._waitForStarterPackToBeInState(seq, packId, 'stopped', fullTimeout);
    return seq;
  }

  static dockerComposeDownInDbFolder(
    timeoutMs: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS,
    removeVolumes: boolean = true
  ): void {
    const baseDir = String(process.env.PORTABLE_EXECUTABLE_DIR || '.');
    const dbDir = path.resolve(baseDir, 'db');
    const isWin = process.platform === 'win32';

    let cmd: string;
    let args: string[];

    const downCmd = removeVolumes ? 'docker compose down -v' : 'docker compose down';

    if (isWin) {
      cmd = 'powershell.exe';
      // run the compose command inside PowerShell so PATH/resolution works on Windows
      args = ['-NoProfile', '-NonInteractive', '-Command', downCmd];
    } else {
      cmd = 'docker';
      args = removeVolumes ? ['compose', 'down', '-v'] : ['compose', 'down'];
    }

    console.log(`[ConnectionsTestHelper] (blocking) running: ${cmd} ${args.join(' ')} (cwd=${dbDir})`);

    const res = spawnSync(cmd, args, {
      cwd: dbDir,
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (res.error) {
      console.error('[ConnectionsTestHelper] spawnSync error:', res.error);
      throw res.error;
    }

    if (res.status !== 0) {
      const out = (res.stdout || '').toString();
      const err = (res.stderr || '').toString();
      console.error(`[ConnectionsTestHelper] docker compose down failed (status=${res.status})\nSTDOUT:\n${out}\nSTDERR:\n${err}`);
      throw new Error(`docker compose down failed (status=${res.status}): ${err || out}`);
    }

    if (res.stdout) console.log(res.stdout.toString());
    if (res.stderr) console.error(res.stderr.toString());

    // When volumes are removed, also delete .northwind_initialized marker files
    // so NorthwindManager re-provisions on next start (e.g., Playwright retry)
    if (removeVolumes) {
      const entries = fs.readdirSync(dbDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('sample-northwind-')) {
          const markerPath = path.join(dbDir, entry.name, '.northwind_initialized');
          if (fs.existsSync(markerPath)) {
            fs.unlinkSync(markerPath);
            console.log(`[ConnectionsTestHelper] Removed marker: ${markerPath}`);
          }
        }
      }
    }

    console.log('[ConnectionsTestHelper] docker compose down completed (blocking).');
  }

  /**
   * Vendor-aware docker compose down. Supabase uses its own subdirectory
   * (`db/supabase/`) rather than the root `db/` compose file. All other
   * server-based vendors live in the root `db/` compose.
   *
   * Safe to call from a `finally` block — swallows non-fatal errors from
   * already-stopped containers.
   */
  static dockerComposeDownForVendor(
    vendor: string,
    timeoutMs: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS,
    removeVolumes: boolean = true,
  ): void {
    const baseDir = String(process.env.PORTABLE_EXECUTABLE_DIR || '.');
    const v = (vendor || '').toLowerCase().trim();
    // Supabase has its own docker-compose in db/supabase/
    const composeDir = v === 'supabase'
      ? path.resolve(baseDir, 'db', 'supabase')
      : path.resolve(baseDir, 'db');

    const downCmd = removeVolumes ? 'docker compose down -v' : 'docker compose down';
    const isWin = process.platform === 'win32';
    let cmd: string;
    let args: string[];

    if (isWin) {
      cmd = 'powershell.exe';
      args = ['-NoProfile', '-NonInteractive', '-Command', downCmd];
    } else {
      cmd = 'docker';
      args = removeVolumes ? ['compose', 'down', '-v'] : ['compose', 'down'];
    }

    console.log(`[ConnectionsTestHelper] stopping ${vendor} docker compose (cwd=${composeDir})`);

    const res = spawnSync(cmd, args, {
      cwd: composeDir,
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (res.error) {
      console.error(`[ConnectionsTestHelper] docker compose down error (${vendor}):`, res.error);
      return; // non-fatal in finally cleanup
    }
    if (res.status !== 0) {
      const out = (res.stdout || '').toString();
      const err = (res.stderr || '').toString();
      console.error(`[ConnectionsTestHelper] docker compose down failed (${vendor}, status=${res.status})\n${err || out}`);
      return; // non-fatal in finally cleanup
    }

    if (res.stdout) console.log(res.stdout.toString());

    // Remove .northwind_initialized markers so next start re-provisions
    if (removeVolumes) {
      const markerDir = v === 'supabase' ? composeDir : path.resolve(baseDir, 'db');
      try {
        const entries = fs.readdirSync(markerDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('sample-northwind-')) {
            const markerPath = path.join(markerDir, entry.name, '.northwind_initialized');
            if (fs.existsSync(markerPath)) {
              fs.unlinkSync(markerPath);
              console.log(`[ConnectionsTestHelper] Removed marker: ${markerPath}`);
            }
          }
        }
      } catch (e) { /* ignore marker cleanup errors */ }
    }

    console.log(`[ConnectionsTestHelper] docker compose down completed for ${vendor}.`);
  }

  /**
   * Seeds invoice data then wipes it via the Seed Data tab in the Connection Details modal.
   *
   * Flow (twice — once with each bundled template): pick template from `<select>` on
   * Example sub-tab → confirm → Example codejar populates → Copy to clipboard →
   * switch to My Script → paste → Run Script → wait until done.
   *
   * The bundled `invoice-seeder.groovy` template hard-codes `int N = 10000` internally;
   * the `invoiceCount` parameter is currently retained for back-compat but unused.
   * Honoring it requires plumbing `params: { N }` through `runCustomSeed` (separate change).
   */
  static seedAndWipeInvoicesViaConnectionDetails(
    ft: FluentTester,
    connectionCode: string,
    dbVendor: string,
    invoiceCount: number = 100,
    fullTimeout: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS,
  ): FluentTester {
    ft = ConnectionsTestHelper.openSeedDataTabAndTestConnection(ft, connectionCode, dbVendor, fullTimeout);

    // SEED via Invoice Seeder template (creates seed_inv_* tables)
    ft = ConnectionsTestHelper.loadExampleAndPasteIntoMyScript(ft, 'invoice-seeder', 'seed_inv_');
    ft = ConnectionsTestHelper.runMyScriptAndWait(ft, 'invoice-seeder', fullTimeout);

    // VERIFY: Database Schema tab → Refresh → assert the seed_inv_* tables now exist in the tree.
    ft = ConnectionsTestHelper.verifySchemaTablesPresent(ft, INVOICE_SEEDER_TABLES, fullTimeout);
    ft = ConnectionsTestHelper.returnToSeedDataTab(ft);

    // WIPE via Wipe Invoices template (drops every seed_inv_* table)
    ft = ConnectionsTestHelper.loadExampleAndPasteIntoMyScript(ft, 'wipe-invoices', 'seed_inv_');
    ft = ConnectionsTestHelper.runMyScriptAndWait(ft, 'wipe-invoices', fullTimeout);

    // VERIFY: Database Schema tab → Refresh → assert the seed_inv_* tables are gone from the tree.
    ft = ConnectionsTestHelper.verifySchemaTablesAbsent(ft, INVOICE_SEEDER_TABLES, fullTimeout);

    return ConnectionsTestHelper.closeConnectionDetailsModal(ft);
  }

  /**
   * Runs the Example (default) script against an existing sample connection and then
   * runs a hardcoded wipe that drops the tables it created. Does **not** create or
   * delete the connection — assumes a pre-existing read-friendly sample connection
   * (e.g. `rbt-sample-northwind-sqlite-4f2`, `rbt-sample-northwind-duckdb-4f2`).
   *
   * The Example default creates `my_departments` and `my_employees`. The wipe script
   * embedded here is vendor-agnostic (uses `safeDrop`) so it works on every vendor;
   * sample connections currently exist only for sqlite and duckdb, but the helper
   * itself does not assume either.
   */
  static seedAndWipeUsingExampleDefaultViaConnectionDetails(
    ft: FluentTester,
    connectionCode: string,
    dbVendor: string,
    fullTimeout: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS,
  ): FluentTester {
    ft = ConnectionsTestHelper.openSeedDataTabAndTestConnection(ft, connectionCode, dbVendor, fullTimeout);

    // SEED via Example (default) — `__EXAMPLE_DEFAULT__` is already loaded on first open;
    // pass null for templateId so the helper skips the dropdown pick + confirm.
    ft = ConnectionsTestHelper.loadExampleAndPasteIntoMyScript(ft, null, 'my_employees');
    ft = ConnectionsTestHelper.runMyScriptAndWait(ft, 'example-default', fullTimeout);

    // VERIFY: Database Schema tab → Refresh → assert the seed tables now exist in the tree.
    ft = ConnectionsTestHelper.verifySchemaTablesPresent(ft, EXAMPLE_DEFAULT_TABLES, fullTimeout);
    ft = ConnectionsTestHelper.returnToSeedDataTab(ft);

    // WIPE via hardcoded inline script (no UI affordance for this — supplied by the helper)
    ft = ConnectionsTestHelper.loadInlineIntoMyScript(
      ft,
      EXAMPLE_DEFAULT_WIPE_SCRIPT,
      'safeDrop',
    );
    ft = ConnectionsTestHelper.runMyScriptAndWait(ft, 'example-default-wipe', fullTimeout);

    // VERIFY: Database Schema tab → Refresh → assert the seed tables are gone from the tree.
    ft = ConnectionsTestHelper.verifySchemaTablesAbsent(ft, EXAMPLE_DEFAULT_TABLES, fullTimeout);

    return ConnectionsTestHelper.closeConnectionDetailsModal(ft);
  }

  // ============================================================================
  // Shared Seed Data sub-flows (used by both seed-wipe public helpers above)
  // ============================================================================

  /**
   * Opens the Connection Details modal for `connectionCode`, navigates to the
   * Seed Data tab, uses the placeholder button to route to Connection Details,
   * tests the connection (confirming the "Save first?" dialog), then returns to
   * Seed Data — at which point `showSchemaTreeSelect` is true and the panel
   * (My Script / Example / Templates dropdown / Run / Copy buttons) is rendered.
   */
  private static openSeedDataTabAndTestConnection(
    ft: FluentTester,
    connectionCode: string,
    dbVendor: string,
    fullTimeout: number,
  ): FluentTester {
    const connFileSel = `#${connectionCode}\\.xml`;
    const isFileBased = dbVendor === 'sqlite' || dbVendor === 'duckdb';

    ft = ft
      .gotoConnections()
      .waitOnElementToBecomeVisible(connFileSel)
      .clickAndSelectTableRow(connFileSel)
      .waitOnElementToBecomeEnabled('#btnEdit')
      .click('#btnEdit')
      .waitOnElementToBecomeVisible('#modalDbConnection')
      .consoleLog(`[SeedWipe] Opened modal for ${connectionCode}`);

    ft = ft
      .waitOnElementToBecomeVisible('#tab-btn-seedDataTab')
      .click('#tab-btn-seedDataTab');

    ft = ft
      .waitOnElementToBecomeVisible('#btnTestDbConnectionSeedData')
      .click('#btnTestDbConnectionSeedData')
      .waitOnElementToBecomeVisible('#btnTestDbConnection')
      .waitOnElementToBecomeEnabled('#btnTestDbConnection')
      .click('#btnTestDbConnection');

    if (!isFileBased) {
      ft = ft
        .infoDialogShouldBeVisible()
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

    // Brief disabled/spinner state only catchable for non-file-based vendors. The
    // in-process REST refactor (was shell process spawning) makes the SQLite/DuckDB
    // test resolve in microseconds — Playwright's polling can miss the disabled
    // window. The downstream Schema-tab placeholder vanish below confirms success.
    if (!isFileBased) {
      ft = ft
        .waitOnElementToBecomeDisabled('#btnTestDbConnection')
        .waitOnElementToHaveClass('#btnTestDbConnectionIcon', 'animate-spin');
    }
    ft = ft.consoleLog('[SeedWipe] Connection test running');

    ft = ft
      .click('#tab-btn-databaseSchemaTab')
      .waitOnElementToBecomeInvisible(
        'span:has-text("To load the schema, please ensure your connection details are configured")',
      );
    ft = ft.waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer');
    ft = ft
      .waitOnElementToBecomeVisible('#btnRefreshDatabaseSchema')
      .consoleLog('[SeedWipe] Schema loaded — switching back to Seed Data');

    return ft
      .click('#tab-btn-seedDataTab')
      .waitOnElementToBecomeVisible('#seedTemplateSelect');
  }

  /**
   * Closes the Connection Details modal via the Close button.
   *
   * The DB-connection modal's close button is `#btnCloseDbConnectionModal`
   * (note "Db" in the middle); `#btnCloseConnectionModal` belongs to the
   * email-connection modal and does not exist in this context.
   */
  private static closeConnectionDetailsModal(ft: FluentTester): FluentTester {
    return ft
      .click('#btnCloseDbConnectionModal')
      .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal')
      .consoleLog('[SeedWipe] Modal closed');
  }

  /**
   * Switches to the Example sub-tab, optionally picks a template from
   * `#seedTemplateSelect` (when `templateId` is non-null) and confirms the dialog,
   * then clicks Copy and pastes the clipboard into the My Script editor via
   * Ctrl+A / Delete / Ctrl+V.
   *
   * `templateId === null` is used for the Example (default) flow — the dropdown
   * stays on `__EXAMPLE_DEFAULT__` and the in-component generated script is used.
   *
   * `exampleMarker` is asserted in both the Example codejar (after load) and the
   * My Script codejar (after paste), and on the OS clipboard (after Copy).
   */
  private static loadExampleAndPasteIntoMyScript(
    ft: FluentTester,
    templateId: string | null,
    exampleMarker: string,
  ): FluentTester {
    ft = ft
      .waitOnElementToBecomeVisible('#tab-btn-seedTabExample')
      .click('#tab-btn-seedTabExample')
      .waitOnElementToBecomeEnabled('#seedTemplateSelect');

    if (templateId !== null) {
      // Two timing concerns:
      // 1. The component lazy-loads `seedTemplates` from the backend on first
      //    Seed Data tab activation. Wait for the specific <option> to appear
      //    so we don't try to select before the dropdown is populated.
      // 2. After `selectOption`, the change event flows through Zone.js into
      //    `(ngModelChange)` → async `onSeedTemplateSelected` → `await
      //    confirmService.askConfirmation(...)` before the confirm dialog
      //    renders. `confirmDialogShouldBeVisible()` is a synchronous count
      //    check and loses that race; `waitOnConfirmDialogToBecomeVisible`
      //    polls with a timeout.
      ft = ft
        .waitOnElementToBecomeVisible(
          `#seedTemplateSelect option[value="${templateId}"]`,
        )
        .dropDownSelectOptionHavingValue('#seedTemplateSelect', templateId)
        .waitOnConfirmDialogToBecomeVisible()
        .clickYesDoThis()
        .consoleLog(`[SeedWipe] Selected template '${templateId}'`);
    } else {
      ft = ft.consoleLog('[SeedWipe] Using Example (default) script — no template pick');
    }

    ft = ft
      .waitOnElementToBecomeVisible('#seedExampleEditor')
      .codeJarShouldContainText('#seedExampleEditor', exampleMarker);

    // Copy to OS clipboard (uses navigator.clipboard.writeText in the page)
    ft = ft
      .waitOnElementToBecomeEnabled('#btnCopyExampleSeedScript')
      .click('#btnCopyExampleSeedScript')
      .clipboardShouldContainText(exampleMarker);

    // Switch to My Script and paste the OS clipboard contents into the codejar.
    // Note: Electron-Playwright's synthesized Ctrl+V does not couple the OS
    // clipboard to the contenteditable's paste event in a way CodeJar's
    // (update) model picks up — the editor stays empty. pasteClipboardIntoCodeJar
    // reads the clipboard inside the page and dispatches a real `input` event,
    // so Copy is still tested end-to-end via `clipboardShouldContainText` above.
    return ft
      .waitOnElementToBecomeVisible('#tab-btn-seedTabMyScript')
      .click('#tab-btn-seedTabMyScript')
      .waitOnElementToBecomeVisible('#seedCustomScriptEditor')
      .pasteClipboardIntoCodeJar('#seedCustomScriptEditor')
      .consoleLog('[SeedWipe] Pasted clipboard into My Script')
      .codeJarShouldContainText('#seedCustomScriptEditor', exampleMarker);
  }

  /**
   * Switches to the My Script sub-tab and injects a hardcoded Groovy `source`
   * directly into `#seedCustomScriptEditor` via `setCodeJarContentSingleShot`.
   *
   * Used when there is no UI affordance to load the script (e.g. the wipe step
   * of the Example-default flow). `marker` is asserted to appear in the editor
   * after injection.
   */
  private static loadInlineIntoMyScript(
    ft: FluentTester,
    source: string,
    marker: string,
  ): FluentTester {
    return ft
      .waitOnElementToBecomeVisible('#tab-btn-seedTabMyScript')
      .click('#tab-btn-seedTabMyScript')
      .waitOnElementToBecomeVisible('#seedCustomScriptEditor')
      .setCodeJarContentSingleShot('#seedCustomScriptEditor', source)
      .consoleLog('[SeedWipe] Injected inline script into My Script')
      .codeJarShouldContainText('#seedCustomScriptEditor', marker);
  }

  /**
   * Clicks `#btnRunCustomSeed`, confirms the dialog, and waits for the run to
   * finish via the button's disabled → enabled transition (driven by
   * `isCustomSeedRunning` and `executionStatsService.jobStats.numberOfActiveJobs`).
   *
   * `label` is purely for log output to disambiguate seed/wipe phases.
   */
  private static runMyScriptAndWait(
    ft: FluentTester,
    label: string,
    fullTimeout: number,
  ): FluentTester {
    return ft
      .waitOnElementToBecomeEnabled('#btnRunCustomSeed')
      .click('#btnRunCustomSeed')
      .confirmDialogShouldBeVisible()
      .clickYesDoThis()
      .consoleLog(`[SeedWipe] Running '${label}'...`)
      .waitOnElementToBecomeEnabled('#btnRunCustomSeed', fullTimeout)
      .consoleLog(`[SeedWipe] '${label}' completed`);
  }

  /**
   * Switches to the Database Schema tab and clicks Refresh. Confirms the
   * "This will refresh the Database Schema. Continue?" dialog and waits for
   * the `animate-spin` class on `#btnRefreshDatabaseSchemaIcon` to appear and clear —
   * the same pattern other tests use (e.g. connections.spec.ts:992-1015).
   *
   * The refresh delegates to `connectionsService.testConnection` + a fresh
   * `loadSchemaFromBackend` call, so any tables created since the last fetch
   * (e.g. by a seed script) appear in the picklist tree afterwards.
   */
  private static refreshDatabaseSchemaTab(
    ft: FluentTester,
    fullTimeout: number,
  ): FluentTester {
    return ft
      .waitOnElementToBecomeVisible('#tab-btn-databaseSchemaTab')
      .click('#tab-btn-databaseSchemaTab')
      .waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer')
      .waitOnElementToBecomeVisible('#btnRefreshDatabaseSchema')
      .click('#btnRefreshDatabaseSchema')
      .waitOnElementToContainText(
        '#confirmDialog .modal-box',
        'This will refresh the Database Schema. Continue?',
      )
      .clickYesDoThis()
      // Drop the "wait for spinner to APPEAR" assertion: in-process REST makes
      // file-based vendors (SQLite/DuckDB) resolve too fast to catch. The
      // "wait for spinner to DISAPPEAR" below is idempotent — passes immediately
      // if spinner never appeared, waits through it if it did. Downstream
      // table-visibility assertions confirm refresh actually ran.
      .waitOnElementNotToHaveClass(
        '#btnRefreshDatabaseSchemaIcon',
        'animate-spin',
        fullTimeout,
      )
      .consoleLog('[SeedWipe] Database Schema refreshed');
  }

  /**
   * Refreshes the Database Schema tab and asserts each lowercase table name
   * is present as a tree node in the source picklist
   * (`#treeNode{name}sourceTreedatabaseSchemaPicklist`).
   */
  private static verifySchemaTablesPresent(
    ft: FluentTester,
    tableNamesLowercase: string[],
    fullTimeout: number,
  ): FluentTester {
    ft = ConnectionsTestHelper.refreshDatabaseSchemaTab(ft, fullTimeout);
    for (const t of tableNamesLowercase) {
      ft = ft
        .waitOnElementToBecomeVisible(
          `#treeNode${t}sourceTreedatabaseSchemaPicklist`,
        )
        .consoleLog(`[SeedWipe] Schema contains table '${t}'`);
    }
    return ft;
  }

  /**
   * Refreshes the Database Schema tab and asserts each lowercase table name
   * is **not** present as a tree node in the source picklist.
   */
  private static verifySchemaTablesAbsent(
    ft: FluentTester,
    tableNamesLowercase: string[],
    fullTimeout: number,
  ): FluentTester {
    ft = ConnectionsTestHelper.refreshDatabaseSchemaTab(ft, fullTimeout);
    for (const t of tableNamesLowercase) {
      ft = ft
        .elementShouldNotBeVisible(
          `#treeNode${t}sourceTreedatabaseSchemaPicklist`,
        )
        .consoleLog(`[SeedWipe] Schema no longer contains table '${t}'`);
    }
    return ft;
  }

  /**
   * Returns to the Seed Data tab and waits for the seed panel to be ready
   * (Templates dropdown visible). Used between schema-verification steps and
   * the next seed/wipe cycle.
   */
  private static returnToSeedDataTab(ft: FluentTester): FluentTester {
    return ft
      .click('#tab-btn-seedDataTab')
      .waitOnElementToBecomeVisible('#seedTemplateSelect');
  }

  /**
   * Exercises the Field Selection toolbar (All Details / Names Only / Mixed)
   * on the Database Schema picklist. Only works when enableFieldSelection=true
   * (i.e. context is sqlQuery, scriptQuery, or dashboardScript).
   *
   * Assumes Products is already in the target picklist.
   * Moves Categories + Employees to target, then tests all three modes.
   */
  static exerciseFieldSelectionModes(
    ft: FluentTester,
    picklistId: string,
  ): FluentTester {
    // Assumes Products + Categories already in target. Move Employees to target.
    ft = ft.consoleLog('Field Selection Modes — testing All Details / Names Only / Mixed');

    ft = ft
      .click(`#treeNodeemployeessourceTree${picklistId}`)
      .click(`#btnMoveToTarget${picklistId}`)
      .waitOnElementToBecomeVisible(`#treeNodecategoriestargetTree${picklistId}`)
      .waitOnElementToBecomeVisible(`#treeNodeemployeestargetTree${picklistId}`)
      .waitOnElementToBecomeVisible(`#treeNodeproductstargetTree${picklistId}`);

    // ── 4a: All three tables → Names Only ──
    ft = ft.consoleLog('Field Selection 4a: All three tables → Names Only');
    ft = ft
      .click(`#btnNamesOnly${picklistId}`)
      .sleep(Constants.DELAY_ONE_SECOND)
      .click('#btnGenerateWithAIDbSchema')
      .waitOnElementToBecomeVisible('#btnCopyPromptText')
      .click('#btnCopyPromptText')
      .waitOnConfirmDialogToBecomeVisible()
      .click('.dburst-button-question-confirm:visible')
      .waitOnConfirmDialogToBecomeInvisible()
      .clipboardShouldContainText('Products')
      .clipboardShouldContainText('Categories')
      .clipboardShouldContainText('Employees')
      .clipboardShouldContainText('Tables Included by Name Only')
      .clipboardShouldNotContainText('"columnName"')
      .click('#btnCloseAiCopilotModal')
      .waitOnElementToBecomeInvisible('#btnCopyPromptText');

    // ── 4b: Switch back to All Details for all three ──
    ft = ft.consoleLog('Field Selection 4b: All three tables → All Details');
    ft = ft
      .click(`#btnAllDetails${picklistId}`)
      .sleep(Constants.DELAY_ONE_SECOND)
      .click('#btnGenerateWithAIDbSchema')
      .waitOnElementToBecomeVisible('#btnCopyPromptText')
      .click('#btnCopyPromptText')
      .waitOnConfirmDialogToBecomeVisible()
      .click('.dburst-button-question-confirm:visible')
      .waitOnConfirmDialogToBecomeInvisible()
      .clipboardShouldContainText('"tableName": "Products"')
      .clipboardShouldContainText('"columnName": "Discontinued"')
      .clipboardShouldContainText('"tableName": "Categories"')
      .clipboardShouldContainText('"columnName": "CategoryName"')
      .clipboardShouldContainText('"tableName": "Employees"')
      .clipboardShouldContainText('"columnName": "LastName"')
      .click('#btnCloseAiCopilotModal')
      .waitOnElementToBecomeInvisible('#btnCopyPromptText');

    // ── 4c: Mixed — Products full, Categories partial, Employees names-only ──
    ft = ft.consoleLog('Field Selection 4c: Mixed — Products full, Categories partial, Employees names-only');

    // Start from all-details baseline (all three tables → full).
    // The target-side checkbox cycle is tri-state: full → names-only → fully-deselected,
    // so we build the mixed scenario by descending from "all full" rather than ascending
    // from "all names-only" (which would put the second click into the wrong bucket).
    ft = ft
      .click(`#btnAllDetails${picklistId}`)
      .sleep(Constants.DELAY_ONE_SECOND);

    // Products — leave as-is → stays full. No click needed.

    // Categories → partial: expand, then uncheck Description column,
    // leaving CategoryName (and any other vendor-specific columns) partially selected.
    // Picture is not unchecked here because DuckDB's Northwind omits that column entirely.
    ft = ft.ensureTreeNodeExpanded(
      `#treeNodecategoriestargetTree${picklistId}`,
    ).sleep(Constants.DELAY_ONE_SECOND);

    ft = ft
      .click(`#treeNodecategories_descriptiontargetTree${picklistId} .p-checkbox`)
      .sleep(Constants.DELAY_ONE_SECOND);

    // Employees → names-only: single click on the table's own checkbox cycles
    // full → names-only. Use the direct-child combinator to hit the row's own
    // checkbox (not a nested column's) even if the node is expanded.
    ft = ft
      .click(`#treeNodeemployeestargetTree${picklistId} > .p-treenode-content > .p-checkbox`)
      .sleep(Constants.DELAY_ONE_SECOND);

    ft = ft
      .sleep(Constants.DELAY_ONE_SECOND)
      .click('#btnGenerateWithAIDbSchema')
      .waitOnElementToBecomeVisible('#btnCopyPromptText')
      .click('#btnCopyPromptText')
      .waitOnConfirmDialogToBecomeVisible()
      .click('.dburst-button-question-confirm:visible')
      .waitOnConfirmDialogToBecomeInvisible()
      // Products = full details
      .clipboardShouldContainText('"tableName": "Products"')
      .clipboardShouldContainText('"columnName": "Discontinued"')
      // Categories = partial (CategoryName included; Description excluded)
      .clipboardShouldContainText('"columnName": "CategoryName"')
      .clipboardShouldNotContainText('"columnName": "Description"')
      // Employees = names only (no column details)
      .clipboardShouldContainText('Employees')
      .clipboardShouldNotContainText('"columnName": "LastName"')
      // Sectioned format markers
      .clipboardShouldContainText('Tables with Full/Partial Schema')
      .clipboardShouldContainText('Tables Included by Name Only')
      .click('#btnCloseAiCopilotModal')
      .waitOnElementToBecomeInvisible('#btnCopyPromptText');

    // Cleanup: restore picklist and switch back to Connection Details tab
    // so that isDatabaseSchemaTabActive=false when modal closes (prevents
    // stale tab state from affecting the next connection's tab auto-selection)
    ft = ft
      .click(`#btnAllDetails${picklistId}`)
      .sleep(Constants.DELAY_HALF_SECOND)
      .click(`#btnMoveAllToSource${picklistId}`)
      .sleep(Constants.DELAY_HALF_SECOND)
      // Re-select Categories + Products — use > .p-treenode-content > .p-checkbox to avoid
      // hitting nested child checkboxes when Categories is still expanded from step 4c
      .click(`#treeNodecategoriessourceTree${picklistId} > .p-treenode-content > .p-checkbox`)
      .click(`#treeNodeproductssourceTree${picklistId} > .p-treenode-content > .p-checkbox`)
      .click(`#btnMoveToTarget${picklistId}`)
      .waitOnElementToBecomeVisible(`#treeNodecategoriestargetTree${picklistId}`)
      .waitOnElementToBecomeVisible(`#treeNodeproductstargetTree${picklistId}`)
      // Switch to Connection Details tab to reset isDatabaseSchemaTabActive
      .click('#tab-btn-connectionDetailsTab')
      .waitOnElementToBecomeVisible('#btnTestDbConnection')
      .sleep(Constants.DELAY_HALF_SECOND);

    return ft;
  }

  /**
   * Lightweight check: verifies the Field Selection toolbar buttons exist, respond,
   * and produce the expected prompt content (Names Only vs All Details).
   * Only works when enableFieldSelection=true.
   *
   * Assumes at least one table is already in the target picklist
   * and the AI generate button is enabled.
   */
  static quickExerciseFieldSelectionButtons(
    ft: FluentTester,
    picklistId: string,
  ): FluentTester {
    ft = ft.consoleLog('Quick Field Selection — verifying buttons and prompt content');

    // Names Only: prompt should mention "Tables Included by Name Only" and have no column details
    ft = ft
      .waitOnElementToBecomeVisible(`#btnAllDetails${picklistId}`)
      .waitOnElementToBecomeVisible(`#btnNamesOnly${picklistId}`)
      .click(`#btnNamesOnly${picklistId}`)
      .sleep(Constants.DELAY_ONE_SECOND)
      .click('#btnGenerateWithAIDbSchema')
      .waitOnElementToBecomeVisible('#btnCopyPromptText')
      .click('#btnCopyPromptText')
      .waitOnConfirmDialogToBecomeVisible()
      .click('.dburst-button-question-confirm:visible')
      .waitOnConfirmDialogToBecomeInvisible()
      .clipboardShouldContainText('Tables Included by Name Only')
      .clipboardShouldNotContainText('"columnName"')
      .click('#btnCloseAiCopilotModal')
      .waitOnElementToBecomeInvisible('#btnCopyPromptText');

    // All Details: prompt should contain column details
    ft = ft
      .click(`#btnAllDetails${picklistId}`)
      .sleep(Constants.DELAY_ONE_SECOND)
      .click('#btnGenerateWithAIDbSchema')
      .waitOnElementToBecomeVisible('#btnCopyPromptText')
      .click('#btnCopyPromptText')
      .waitOnConfirmDialogToBecomeVisible()
      .click('.dburst-button-question-confirm:visible')
      .waitOnConfirmDialogToBecomeInvisible()
      .clipboardShouldContainText('"columnName"')
      .clipboardShouldNotContainText('Tables Included by Name Only')
      .click('#btnCloseAiCopilotModal')
      .waitOnElementToBecomeInvisible('#btnCopyPromptText');

    return ft;
  }

}
