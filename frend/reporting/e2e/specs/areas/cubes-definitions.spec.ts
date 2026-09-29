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
  // 4.3b — A viewer filter: the icon, the popover, the chip, and the SQL
  //        (Phase 3a TODO 7b, W1. Written, never run by the plan; retries 0.)
  // ─────────────────────────────────────────────────────────────────────────────

  electronBeforeAfterAllTest(
    '(cube-definitions) should filter from the field tree and show it in View SQL',
    async function ({ beforeAfterEach: firstPage }) {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const ft = new FluentTester(firstPage);

      // Business question: "Revenue by category, Germany only". The filter is on a dimension nobody
      // ticked (ShipCountry), because a filter is a WHERE and not a column - and the chip is what
      // says so on screen.
      //
      // `#cubeFilterParams` is `<rb-parameters>` fed the metadata of that one dimension. Its
      // multi-select draws a trigger button carrying the dimension's own id (`#ShipCountry`), and
      // the modal behind it holds one checkbox per value (`#ShipCountry_cb_Germany`) and its own OK.
      // Germany is in that list only if the options endpoint really read the column.
      ft.gotoCubeDefinitions()
        .waitOnElementToBecomeVisible('#northwind-sales')
        .clickAndSelectTableRow('#northwind-sales')
        .waitOnElementToBecomeEnabled('#btnEditCube')
        .click('#btnEditCube')
        .waitOnElementToBecomeVisible('#cubePreviewContainer')
        // CategoryName is two joins away, in the Categories folder
        .click('#grp-join-Categories')
        .waitOnElementToBecomeVisible('#dim-CategoryName')
        .click('#chk-dim-CategoryName')
        .waitOnElementToBecomeVisible('#meas-Revenue')
        .click('#chk-meas-Revenue')
        // ── The filter icon of a dimension that is not ticked ──
        .waitOnElementToBecomeVisible('#btnFilter-ShipCountry')
        .click('#btnFilter-ShipCountry')
        .waitOnElementToBecomeVisible('#cubeFilterPopover')
        .waitOnElementToBecomeVisible('#cubeFilterParams')
        .waitOnElementToBecomeVisible('#ShipCountry')
        .click('#ShipCountry')
        .waitOnElementToBecomeVisible('#ShipCountry_cb_Germany')
        .click('#ShipCountry_cb_Germany')
        .click('#ShipCountry_btnOk')
        .click('#btnFilterApply')
        .waitOnElementToBecomeInvisible('#cubeFilterPopover')
        .waitOnElementToBecomeVisible('#cubeFilterChips')
        .elementShouldContainText('#chipFilter-ShipCountry', 'Ship Country: Germany')
        // ── The filter is really applied ──
        .waitOnElementToBecomeEnabled('#btnViewSql')
        .click('#btnViewSql')
        .waitOnElementToBecomeVisible('#cubeSqlResult')
        .elementShouldContainText('#cubeSqlResult', 'Germany')
        .elementShouldContainText('#cubeSqlResult', 'GROUP BY')
        .click('#btnCloseCubeSqlModal')
        .waitOnElementToBecomeInvisible('#cubeSqlResult')
        // ── and really removed: the other half of the same question. The grouping stays,
        //    so what went is the filter and not the query.
        .click('#btnChipRemove-ShipCountry')
        .waitOnElementToBecomeInvisible('#cubeFilterChips')
        .click('#btnViewSql')
        .waitOnElementToBecomeVisible('#cubeSqlResult')
        .elementShouldNotContainText('#cubeSqlResult', 'Germany')
        .elementShouldContainText('#cubeSqlResult', 'GROUP BY')
        .click('#btnCloseCubeSqlModal')
        .waitOnElementToBecomeInvisible('#cubeSqlResult')
        // The sample cube is read-only: close without saving anything
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
        ['depot-network', 'Depot Network'],
        ['student-progress', 'Student Progress'],
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

  // ─────────────────────────────────────────────────────────────────────────────
  // 4.5 — A time dimension is asked for by month, and the picker says so
  //       (Phase 3a TODO 7. Written, never run by the plan; retries 0.)
  // ─────────────────────────────────────────────────────────────────────────────

  electronBeforeAfterAllTest(
    '(cube-definitions) time dimension by month',
    async function ({ beforeAfterEach: firstPage }) {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const ft = new FluentTester(firstPage);

      // The northwind-sales sample ships on SQLite, so the month bucket is
      // `date(…, 'start of month')` — the string this test reads.
      ft.gotoCubeDefinitions()
        .waitOnElementToBecomeVisible('#northwind-sales')
        .clickAndSelectTableRow('#northwind-sales')
        .waitOnElementToBecomeEnabled('#btnEditCube')
        .click('#btnEditCube')
        .waitOnElementToBecomeVisible('#cubePreviewContainer')
        // ── U1: the default view — Measures and the main table open, joins closed ──
        .waitOnElementToBecomeVisible('#grp-measures')
        .waitOnElementToBecomeVisible('#grp-main')
        .waitOnElementToBecomeVisible('#meas-Revenue')
        .waitOnElementToBecomeVisible('#dim-OrderDate')
        // A joined table's field is one click away, not on screen from the start.
        .waitOnElementToBecomeInvisible('#dim-SupplierName')
        .click('#grp-join-Suppliers')
        .waitOnElementToBecomeVisible('#dim-SupplierName')
        // ── The Month default: the picker is not touched ──
        .click('#chk-dim-OrderDate')
        .click('#chk-meas-Revenue')
        .waitOnElementToBecomeVisible('#gran-OrderDate')
        .selectedOptionShouldContainText('#gran-OrderDate', 'Month')
        .waitOnElementToBecomeEnabled('#btnViewSql')
        .click('#btnViewSql')
        .waitOnElementToBecomeVisible('#cubeSqlResult')
        .elementShouldContainText('#cubeSqlResult', 'start of month')
        .click('#btnCloseCubeSqlModal')
        .waitOnElementToBecomeInvisible('#cubeSqlResult')
        // ── Year: the same tick, another bucket ──
        .dropDownSelectOptionHavingValue('#gran-OrderDate', 'year')
        .click('#btnViewSql')
        .waitOnElementToBecomeVisible('#cubeSqlResult')
        .elementShouldContainText('#cubeSqlResult', 'start of year')
        .elementShouldNotContainText('#cubeSqlResult', 'start of month')
        .click('#btnCloseCubeSqlModal')
        .waitOnElementToBecomeInvisible('#cubeSqlResult')
        // ── As is: the raw values, no bucket at all ──
        .dropDownSelectOptionHavingValue('#gran-OrderDate', '')
        .click('#btnViewSql')
        .waitOnElementToBecomeVisible('#cubeSqlResult')
        .elementShouldNotContainText('#cubeSqlResult', 'start of')
        .click('#btnCloseCubeSqlModal')
        .waitOnElementToBecomeInvisible('#cubeSqlResult')
        // The sample cube is read-only: close without saving.
        .click('#btnCloseCubeModal');

      return ft;
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 4.6 — Several cubes in one file: the picker, the warnings and a drill path
  //       (Phase 3a TODO 7. Written, never run by the plan; retries 0.)
  // ─────────────────────────────────────────────────────────────────────────────

  electronBeforeAfterAllTest(
    '(cube-definitions) several cubes in one file, and a drill path',
    async function ({ beforeAfterEach: firstPage }) {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const ft = new FluentTester(firstPage);

      // Two named cubes on the Northwind tables. Two mistakes are left in on
      // purpose: `titel` (an unknown key, so a warning that suggests `title`)
      // and `type 'median'` (a type the generator refuses, so an error — and a
      // measure that cannot be ticked).
      const twoCubesDsl = `cube('customers') {
  sql_table '"Customers"'
  title 'Customers'
  dimension { name 'Country'; title 'Country'; sql '"Country"'; type 'string' }
  dimension { name 'City'; title 'City'; sql '"City"'; type 'string' }
  measure { name 'CustomerCount'; title 'Customer Count'; type 'count' }
  hierarchy { name 'geography'; title 'Geography'; levels 'Country', 'City' }
}

cube('orders') {
  sql_table '"Orders"'
  title 'Orders'
  dimension { name 'OrderID'; titel 'Order'; sql '"OrderID"'; type 'number'; primary_key true }
  dimension { name 'ShipCountry'; title 'Ship Country'; sql '"ShipCountry"'; type 'string' }
  measure { name 'OrderCount'; title 'Order Count'; type 'count' }
  measure { name 'MedianFreight'; title 'Median Freight'; sql '"Freight"'; type 'median' }
}`;

      ft.gotoCubeDefinitions()
        .click('#btnCreateCube')
        .waitOnElementToBecomeVisible('#cubeName')
        .click('#cubeName')
        .typeText('Two Cubes Test')
        .setCodeJarContentSingleShot('#cubeDslEditor', twoCubesDsl)
        .waitOnElementToBecomeVisible('#cubePreviewContainer')
        // ── U5: the mistakes are said out loud, and the file still previews ──
        .waitOnElementToBecomeVisible('#cubeDslWarnings')
        .elementShouldContainText('#cubeDslWarnings', "did you mean 'title'")
        .elementShouldContainText('#cubeDslWarnings', 'MedianFreight')
        .waitOnElementToBecomeVisible('#cubeSelect')
        .elementShouldContainText('#cubeSelect', 'customers')
        .elementShouldContainText('#cubeSelect', 'orders')
        // ── The picked cube is the one the generator is asked about ──
        .dropDownSelectOptionHavingValue('#cubeSelect', 'orders')
        .waitOnElementToBecomeVisible('#meas-MedianFreight')
        .waitOnElementToBecomeDisabled('#chk-meas-MedianFreight')
        .click('#chk-dim-ShipCountry')
        .click('#chk-meas-OrderCount')
        .waitOnElementToBecomeEnabled('#btnViewSql')
        .click('#btnViewSql')
        .waitOnElementToBecomeVisible('#cubeSqlResult')
        .elementShouldContainText('#cubeSqlResult', 'Orders')
        .elementShouldNotContainText('#cubeSqlResult', 'No sql_table')
        .click('#btnCloseCubeSqlModal')
        .waitOnElementToBecomeInvisible('#cubeSqlResult')
        // ── A drill path ticks its level and every level above it ──
        .dropDownSelectOptionHavingValue('#cubeSelect', 'customers')
        .waitOnElementToBecomeVisible('#grp-drill')
        .click('#grp-drill')
        .waitOnElementToBecomeVisible('#chk-hier-geography-City')
        .click('#chk-hier-geography-City')
        .elementCheckBoxShouldBeSelected('#chk-dim-Country')
        .elementCheckBoxShouldBeSelected('#chk-dim-City')
        .click('#chk-meas-CustomerCount')
        .waitOnElementToBecomeEnabled('#btnViewSql')
        .click('#btnViewSql')
        .waitOnElementToBecomeVisible('#cubeSqlResult')
        .elementShouldContainText('#cubeSqlResult', 'Country')
        .elementShouldContainText('#cubeSqlResult', 'City')
        .click('#btnCloseCubeSqlModal')
        .waitOnElementToBecomeInvisible('#cubeSqlResult')
        // ── U3: "Field details" is the same tree, so a tick survives it ──
        .click('#chk-show-everything')
        .elementCheckBoxShouldBeSelected('#chk-dim-City')
        // Nothing is saved: the file was only ever previewed.
        .click('#btnCloseCubeModal');

      return ft;
    },
  );
});
