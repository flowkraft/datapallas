import { test, expect } from '@playwright/test';
import _ from 'lodash';

import { FluentTester } from '../../helpers/fluent-tester';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';

//DONE2
test.describe('', async () => {

  // ─────────────────────────────────────────────────────────────────────────────
  // 4.1 — Basic CRUD: create, read, update, duplicate, delete
  // ─────────────────────────────────────────────────────────────────────────────

  electronBeforeAfterAllTest(
    '(cube-definitions) should correctly CRUD create, read, update, duplicate and delete',
    async function ({ beforeAfterEach: firstPage }) {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const cubeName = 'Test Orders Cube';
      const cubeId = _.kebabCase(cubeName);

      const ft = new FluentTester(firstPage);

      // Navigate to Cube Definitions
      ft.gotoCubeDefinitions();

      // ── CREATE ──
      ft.click('#btnCreateCube')
        .waitOnElementToBecomeVisible('#cubeName')
        .click('#cubeName')
        .typeText(cubeName)
        .click('#cubeDescription')
        .typeText('Test cube for E2E testing')
        .click('#btnOKConfirmationCubeModal')
        .waitOnElementToBecomeInvisible('#btnOKConfirmationCubeModal');

      // ── READ — verify in list ──
      ft.gotoCubeDefinitions()
        .waitOnElementToBecomeVisible(`#${cubeId}`)
        .elementShouldContainText(`#${cubeId}`, cubeName)
        .elementShouldContainText(`#${cubeId}`, 'Test cube for E2E testing');

      // ── UPDATE — change name ──
      const updatedName = 'Test Orders Cube Updated';
      ft.clickAndSelectTableRow(`#${cubeId}`)
        .waitOnElementToBecomeEnabled('#btnEditCube')
        .click('#btnEditCube')
        .waitOnElementToBecomeVisible('#cubeName')
        .click('#cubeName')
        .typeText(updatedName)
        .click('#btnOKConfirmationCubeModal')
        .waitOnElementToBecomeInvisible('#btnOKConfirmationCubeModal');

      // Verify updated name in list (cube id never changes on rename — file stays test-orders-cube)
      ft.gotoCubeDefinitions()
        .waitOnElementToBecomeVisible(`#${cubeId}`)
        .elementShouldContainText(`#${cubeId}`, updatedName);

      // ── DUPLICATE ──
      const duplicatedName = 'Test Orders Cube Duplicated';
      ft.clickAndSelectTableRow(`#${cubeId}`)
        .waitOnElementToBecomeEnabled('#btnDuplicateCube')
        .click('#btnDuplicateCube')
        .waitOnElementToBecomeVisible('#cubeName')
        .click('#cubeName')
        .typeText(duplicatedName)
        .click('#btnOKConfirmationCubeModal')
        .waitOnElementToBecomeInvisible('#btnOKConfirmationCubeModal');

      // Verify duplicate in list
      const duplicatedId = _.kebabCase(duplicatedName);
      ft.gotoCubeDefinitions()
        .waitOnElementToBecomeVisible(`#${duplicatedId}`)
        .elementShouldContainText(`#${duplicatedId}`, duplicatedName);

      // ── DELETE both ──
      // Delete duplicated
      ft.clickAndSelectTableRow(`#${duplicatedId}`)
        .waitOnElementToBecomeEnabled('#btnDeleteCube')
        .click('#btnDeleteCube')
        .clickYesDoThis()
        .waitOnElementToBecomeInvisible(`#${duplicatedId}`);

      // Delete original (updated)
      ft.clickAndSelectTableRow(`#${cubeId}`)
        .waitOnElementToBecomeEnabled('#btnDeleteCube')
        .click('#btnDeleteCube')
        .clickYesDoThis()
        .waitOnElementToBecomeInvisible(`#${cubeId}`);

      return ft;
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 4.2 — DSL editor → preview renders
  // ─────────────────────────────────────────────────────────────────────────────

  electronBeforeAfterAllTest(
    '(cube-definitions) should render preview when DSL is entered in editor',
    async function ({ beforeAfterEach: firstPage }) {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const ft = new FluentTester(firstPage);

      const previewDsl = `cube {
  sql_table 'public.orders'
  title 'Orders'
  dimension { name 'order_status'; title 'Order Status'; sql 'status'; type 'string' }
  dimension { name 'order_date'; title 'Order Date'; sql 'created_at'; type 'time' }
  measure { name 'order_count'; title 'Order Count'; type 'count' }
  measure { name 'total_revenue'; title 'Total Revenue'; sql 'amount'; type 'sum' }
}`;

      ft.gotoCubeDefinitions()
        .click('#btnCreateCube')
        .waitOnElementToBecomeVisible('#cubeName')
        .click('#cubeName')
        .typeText('Preview Test Cube')
        .setCodeJarContentSingleShot('#cubeDslEditor', previewDsl)
        // Verify specific dimension and measure IDs rendered by rb-cube-renderer
        .waitOnElementToBecomeVisible('#cubePreviewContainer')
        .waitOnElementToBecomeVisible('#dim-order_status')
        .waitOnElementToBecomeVisible('#dim-order_date')
        .waitOnElementToBecomeVisible('#meas-order_count')
        .waitOnElementToBecomeVisible('#meas-total_revenue')
        .elementShouldContainText('#dim-order_status', 'Order Status')
        .elementShouldContainText('#meas-total_revenue', 'Total Revenue');

      // Close without saving
      ft.click('#btnCloseCubeModal');

      return ft;
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 4.3 — Field selection → View SQL → verify SQL
  // ─────────────────────────────────────────────────────────────────────────────

  electronBeforeAfterAllTest(
    '(cube-definitions) should generate valid SQL when fields are selected and View SQL is clicked',
    async function ({ beforeAfterEach: firstPage }) {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const ft = new FluentTester(firstPage);

      // Use the pre-existing northwind-customers sample cube — no create/cleanup needed.
      // Business question: "How many customers do we have by country?" (Country + CustomerCount)
      ft.gotoCubeDefinitions()
        .waitOnElementToBecomeVisible('#northwind-customers')
        .clickAndSelectTableRow('#northwind-customers')
        .waitOnElementToBecomeEnabled('#btnEditCube')
        .click('#btnEditCube')
        .waitOnElementToBecomeVisible('#cubePreviewContainer')
        // Select dimension: Country (main-table dimension)
        .waitOnElementToBecomeVisible('#dim-Country')
        .click('#chk-dim-Country')
        // Select measure: CustomerCount
        .waitOnElementToBecomeVisible('#meas-CustomerCount')
        .click('#chk-meas-CustomerCount')
        // View SQL button should now be enabled
        .waitOnElementToBecomeEnabled('#btnViewSql')
        .click('#btnViewSql')
        // Assert SQL modal shows real generated SQL
        .waitOnElementToBecomeVisible('#cubeSqlResult')
        .elementShouldContainText('#cubeSqlResult', 'SELECT')
        .elementShouldContainText('#cubeSqlResult', 'Customers')
        .elementShouldContainText('#cubeSqlResult', 'Country')
        .elementShouldContainText('#cubeSqlResult', 'count')
        .click('#btnCloseCubeSqlModal')
        .waitOnElementToBecomeInvisible('#cubeSqlResult')
        // Close modal without saving (sample cube is read-only)
        .click('#btnCloseCubeModal');

      return ft;
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 4.4 — Every sample cube is listed by its title, never by its folder id
  // ─────────────────────────────────────────────────────────────────────────────

  electronBeforeAfterAllTest(
    '(cube-definitions) should list every sample cube by its title, never by its folder id',
    async function ({ beforeAfterEach: firstPage }) {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      // One row per sample folder: the id is what the row is keyed on, the title is
      // what the user has to read. A folder whose cube.xml has no <name> falls back
      // to showing the id, which is what this test is here to catch.
      const samples: [string, string][] = [
        ['online-sales', 'Online Sales'],
        ['sales-pipeline', 'Sales Pipeline'],
        ['support-desk', 'Support Desk'],
        ['freight-shipments', 'Freight Shipments'],
        ['student-enrollments', 'Student Enrollments'],
        ['customer-invoices', 'Customer Invoices'],
        ['customer-payments', 'Customer Payments'],
        ['invoice-balances', 'Invoice Balances'],
        ['northwind-sales', 'Northwind Sales Analysis'],
        ['northwind-customers', 'Northwind Customer Management'],
        ['northwind-inventory', 'Northwind Product Inventory'],
        ['northwind-hr', 'Northwind Human Resources'],
        ['northwind-warehouse', 'Northwind Sales Warehouse'],
      ];

      const ft = new FluentTester(firstPage);

      ft.gotoCubeDefinitions();

      for (const [cubeId, cubeTitle] of samples) {
        ft.waitOnElementToBecomeVisible(`#${cubeId}`)
          .elementShouldContainText(`#${cubeId}`, cubeTitle)
          .elementShouldNotContainText(`#${cubeId}`, cubeId);
      }

      return ft;
    },
  );
});
