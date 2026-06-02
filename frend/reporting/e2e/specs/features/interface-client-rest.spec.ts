import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { InterfaceTestHelper } from '../../helpers/interface-test-helper';
import { Constants } from '../../utils/constants';

/**
 * REST Interface Tests — verifies the Jobs REST API produces identical results to CLI.
 *
 * Each test mirrors interface-client-cli.spec.ts exactly (same inputs, same expected
 * output files from samples.spec.ignore) but executes via REST API instead of CLI.
 *
 * If a test passes for CLI but fails for REST (or vice versa), the bug is in the
 * interface layer, not the engine.
 */

const BASE_URL = 'http://localhost:9090';
const PORTABLE_DIR = process.env.PORTABLE_EXECUTABLE_DIR!;

// ── Burst Tests (from samples.spec.ignore) ──

test.describe('REST — Burst (samples.spec.ignore)', () => {

  test('01_monthly_payslips_split_only (pdf2pdf)', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('burst', {
      inputFile: 'samples/burst/Payslips.pdf', reportId: 'split-only',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(
      Constants.PAYSLIPS_PDF_BURST_TOKENS.map(t => t + '.pdf'), 'pdf',
    );
  });

  test('02_excel_distinct_sheets_split_only (xls2xls)', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('burst', {
      inputFile: 'samples/burst/Payslips-Distinct-Sheets.xls', reportId: 'split-only',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(
      Constants.PAYSLIPS_XLS_BURST_TOKENS.map(t => t + '.xls'), 'xls',
    );
  });

  test('03_excel_distinct_column_values (xls2xls)', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('burst', {
      inputFile: 'samples/burst/Customers-Distinct-Column-Values.xls', reportId: 'split-only',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFilesExist('xls');
  });

  test('04_split_two_times (pdf2pdf)', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('burst', {
      inputFile: 'samples/burst/Split2Times.pdf', reportId: 'split-two-times',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFilesExist('pdf');
  });
});

// ── Generate CSV Tests (from samples.spec.ignore) ──

test.describe('REST — Generate CSV (samples.spec.ignore)', () => {

  test('06_generate_payslips_csv2docx', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-csv2docx', input: 'samples/reports/payslips/Payslips.csv',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(['0.docx', '1.docx', '2.docx'], 'docx');
  });

  test('07_generate_payslips_csv2html', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-csv2htm', input: 'samples/reports/payslips/Payslips.csv',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(['0.html', '1.html', '2.html'], 'html');
  });

  test('08_generate_payslips_csv2pdf', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-csv2pdf', input: 'samples/reports/payslips/Payslips.csv',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(['0.pdf', '1.pdf', '2.pdf'], 'pdf');
  });

  test('09_generate_payslips_csv2xlsx', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-csv2xls', input: 'samples/reports/payslips/Payslips.csv',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(['0.xlsx', '1.xlsx', '2.xlsx'], 'xlsx');
  });

  test('10_generate_payslips_xls2xls', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-xls2xls', input: 'samples/reports/payslips/Payslips.xlsx',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFilesExist('xlsx');
  });
});

// ── Generate SQL/Script Tests (from samples.spec.ignore) ──

test.describe('REST — Generate SQL/Script (samples.spec.ignore)', () => {

  test('11_generate_student_profiles_sql2foppdf', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-sql2fop-stud',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(
      ['Andrew-Fuller.pdf', 'Janet-Leverling.pdf', 'Nancy-Davolio.pdf'], 'pdf',
    );
  });

  test('12_generate_customer_statements_sql2html', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-sql2htm-cst-stmt',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles([
      'ALFKI.html', 'ANATR.html', 'ANTON.html', 'AROUT.html', 'BERGS.html',
      'BLAUS.html', 'BONAP.html', 'CACTU.html', 'DRACD.html', 'DUMON.html',
      'ERNSH.html', 'FOLKO.html', 'FRANK.html', 'GREAL.html', 'HILAA.html',
      'ISLAT.html', 'KOENE.html', 'LEHMS.html', 'LILAS.html', 'MAGAA.html',
      'MORGK.html', 'OTTIK.html', 'QUICK.html', 'TOMSP.html', 'WANDK.html',
    ], 'html');
  });

  test('13_generate_customer_sales_summary_sql2xlsx', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-sql2xls-cst-sles',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(['CustomerSalesSummary.xlsx'], 'xlsx');
  });

  test('15_generate_category_region_crosstab_script2html', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-scr2htm-cross',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(['CategoryRegionCrosstab.html'], 'html');
  });

  test('16_generate_monthly_sales_trend_script2html', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-scr2htm-trend',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(['MonthlySalesTrend.html'], 'html');
  });

  test('17_generate_supplier_scorecards_script2html', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-scr2htm-supc',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles([
      'supplier_1_scorecard.html', 'supplier_2_scorecard.html',
      'supplier_3_scorecard.html', 'supplier_4_scorecard.html',
      'supplier_5_scorecard.html', 'supplier_6_scorecard.html',
    ], 'html');
  });

  test('20_generate_adhoc_employee_profile_script2pdf', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-scr2pdf-adhoc',
      params: {
        EmployeeID: 'E001', FirstName: 'John', LastName: 'Doe',
        Title: 'Sales Representative', City: 'Seattle', Country: 'USA',
      },
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(['E001-John-Doe.pdf'], 'pdf');
  });
});

// ── Merge Test (from samples.spec.ignore) ──

test.describe('REST — Merge (samples.spec.ignore)', () => {

  test('05_merge_then_burst_invoices (pdf2pdf)', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();

    const absoluteDir = path.resolve(PORTABLE_DIR);

    const prepareResponse = await fetch(`${BASE_URL}/api/jobs/merge-prepare-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePaths: [
          path.join(absoluteDir, 'samples/burst/Invoices-Oct.pdf'),
          path.join(absoluteDir, 'samples/burst/Invoices-Nov.pdf'),
          path.join(absoluteDir, 'samples/burst/Invoices-Dec.pdf'),
        ],
      }),
    });
    const { listFile } = await prepareResponse.json();

    await InterfaceTestHelper.execRest('merge', {
      listFile, outputName: 'merged.pdf', burst: true, reportId: 'split-only',
    }, BASE_URL);

    await InterfaceTestHelper.assertOutputFiles([
      '0011.pdf', '0012.pdf', '0013.pdf', '0014.pdf', '0015.pdf',
      '0016.pdf', '0017.pdf', '0018.pdf', '0019.pdf', 'merged.pdf',
    ], 'pdf');
  });
});

// ── QA Testing Modes (from processing-qa.spec.ignore) ──

test.describe('REST — QA Testing (processing-qa.spec.ignore)', () => {

  test('burst --testall', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('burst', {
      inputFile: 'samples/burst/Payslips.pdf', reportId: 'split-only', testAll: true,
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(
      Constants.PAYSLIPS_PDF_BURST_TOKENS.map(t => t + '.pdf'), 'pdf',
    );
  });

  test('burst --testlist single token', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('burst', {
      inputFile: 'samples/burst/Payslips.pdf', reportId: 'split-only',
      testList: 'clyde.grew@northridgehealth.org',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFileCount(1, 'pdf');
  });

  test('burst --testrandom 2', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('burst', {
      inputFile: 'samples/burst/Payslips.pdf', reportId: 'split-only', testRandom: 2,
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFileCount(2, 'pdf');
  });
});

// ── System (REST equivalents of CLI system commands) ──

test.describe('REST — System Commands', () => {

  test('system info returns SystemInfo with osName, product, userName', async () => {
    const response = await fetch(`${BASE_URL}/api/system/info`, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    // SystemInfo fields: osName, osVersion, userName, osArch, product, isDockerInstalled, …
    expect(body.osName).toBeTruthy();
    expect(body.product).toBeTruthy();
    expect(body.userName).toBeTruthy();
    expect(typeof body.isDockerInstalled).toEqual('boolean');
  });

  test('services status returns array of ServiceStatusInfo', async () => {
    const response = await fetch(`${BASE_URL}/api/system/services/status`, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    // ServiceStatusInfo fields: name, status, ports, health. May be empty if
    // docker isn't running, but when present each entry must have name + status.
    for (const svc of body) {
      expect(svc.name).toBeDefined();
      expect(svc.status).toBeDefined();
    }
  });

  test('--version from settings.xml', async () => {
    const settingsXml = fs.readFileSync(path.join(PORTABLE_DIR, 'config/burst/settings.xml'), 'utf-8');
    const versionMatch = settingsXml.match(/<version>([^<]+)<\/version>/);
    expect(versionMatch).toBeTruthy();
    expect(versionMatch![1]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ── Tier 1: Job (additional) — parallel to CLI Job (additional) ──
//
// status / cancel of an unknown UUID exercise the resource-not-found path on
// the GET/DELETE endpoints. The QA-mode tests round-trip testAll/testList/testRandom
// through the JSON body into the engine's QA arguments (same engine layer as the
// burst-QA tests above, just for `generate` instead of `burst`).

test.describe('REST — Job (additional)', () => {

  test('GET /api/jobs/{unknown} returns 404 with empty body', async () => {
    const response = await fetch(`${BASE_URL}/api/jobs/00000000-0000-0000-0000-000000000000`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.status).toEqual(404);
    // ResponseEntity.notFound().build() returns no body
    const text = await response.text();
    expect(text.length).toEqual(0);
  });

  test('DELETE /api/jobs/{unknown} returns 404 with empty body', async () => {
    const response = await fetch(`${BASE_URL}/api/jobs/00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    expect(response.status).toEqual(404);
    const text = await response.text();
    expect(text.length).toEqual(0);
  });

  test('generate with testAll (csv2html)', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-csv2htm', input: 'samples/reports/payslips/Payslips.csv', testAll: true,
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFiles(['0.html', '1.html', '2.html'], 'html');
  });

  test('generate with testList single token', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-csv2htm', input: 'samples/reports/payslips/Payslips.csv', testList: '0',
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFileCount(1, 'html');
  });

  test('generate with testRandom 2', async () => {
    InterfaceTestHelper.cleanOutputAndLogs();
    await InterfaceTestHelper.execRest('generate', {
      reportId: 'g-csv2htm', input: 'samples/reports/payslips/Payslips.csv', testRandom: 2,
    }, BASE_URL);
    await InterfaceTestHelper.assertOutputFileCount(2, 'html');
  });
});

// ── Tier 1: Connections ──
//
// GET endpoints dispatch and return JSON. POST test-* and run-seed against
// missing/placeholder targets validate that the routes exist and reach the
// service layer where they fail predictably (network / file-not-found).
// Skipped: oauth-sign-in (interactive browser flow).

test.describe('REST — Connections', () => {

  test('GET /api/connections returns array containing seeded eml-contact', async () => {
    const response = await fetch(`${BASE_URL}/api/connections`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    // Seeded eml-contact.xml must appear with connectionType='email-connection'
    const emlContact = body.find((c: any) => c.connectionCode === 'eml-contact');
    expect(emlContact).toBeTruthy();
    expect(emlContact.connectionType).toEqual('email-connection');
    expect(emlContact.fileName).toMatch(/eml-contact/);
  });

  test('GET /api/connections?type=database returns array of DB connections', async () => {
    const response = await fetch(`${BASE_URL}/api/connections?type=database`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    // Every returned entry (if any) must be a database connection
    for (const conn of body) {
      expect(conn.connectionType).toEqual('database-connection');
    }
  });

  test('GET /api/connections/eml-contact returns loaded email-server config', async () => {
    const response = await fetch(`${BASE_URL}/api/connections/eml-contact`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    // loadConnection returns DocumentBursterConnectionEmailSettings — the JAXB
    // root, so the email-server config lives under connection.emailserver.
    expect(body.connection).toBeTruthy();
    expect(body.connection.code).toEqual('eml-contact');
    expect(body.connection.emailserver).toBeTruthy();
    expect(body.connection.emailserver.host).toBeDefined();
    expect(body.connection.emailserver.port).toBeDefined();
  });

  test('POST /api/connections/eml-contact/test-email returns failure signal', async () => {
    // Placeholder SMTP host in eml-contact.xml → SMTP attempt fails. The
    // backend conveys this via HTTP non-2xx OR a body with success=false/error.
    const response = await fetch(`${BASE_URL}/api/connections/eml-contact/test-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await response.json().catch(() => null);
    const failsCleanly =
      response.status >= 400 ||
      (body && (body.success === false || body.status === 'error' || body.error || body.errorMessage));
    expect(failsCleanly).toBeTruthy();
  });

  test('POST /api/connections/{missing}/test-database returns 500 with file-not-found', async () => {
    const response = await fetch(`${BASE_URL}/api/connections/db-does-not-exist-zzz/test-database`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // BaseCommand.getJob → FileNotFoundException → Spring default = 500
    expect(response.status).toEqual(500);
    const text = await response.text();
    // Actual server message: "Connection file not found or is not a file: …"
    expect(text).toMatch(/not found|does not exist|FileNotFound|cannot find|nicht finden/i);
  });

  test('POST /api/connections/{code}/run-seed returns submit acknowledgement', async () => {
    // GenericSeedExecutor.execute() is fire-and-forget: it spawns the CLI
    // job asynchronously via jobExecutionService.executeAsync(...) and
    // returns { ok: true, submitted: true } immediately. Any later failure
    // (bogus connection, script error) surfaces in logs, not the response.
    // The meaningful contract here is "request accepted + job queued".
    const response = await fetch(`${BASE_URL}/api/connections/db-does-not-exist-zzz/run-seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: 'println "noop"' }),
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(body.ok).toEqual(true);
    expect(body.submitted).toEqual(true);
  });

  test('POST /api/connections/{code}/run-seed rejects empty script', async () => {
    // The handler validates upfront and returns { ok: false, error: ... }
    // when the request body has no script. This is the SYNCHRONOUS error
    // path — distinct from the async fire-and-forget when a script is given.
    const response = await fetch(`${BASE_URL}/api/connections/db-anything/run-seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(body.ok).toEqual(false);
    expect(body.error).toMatch(/script/i);
  });
});

// ── Tier 1: System (additional) ──
//
// preferences (GET), changelog (GET with required query param), feedback (POST
// predictable failure). Skipped: chocolatey install (mutates host),
// test-email-server start (state-mutating).

test.describe('REST — System (additional)', () => {

  test('GET /api/system/preferences returns DocumentBursterSettingsInternal', async () => {
    const response = await fetch(`${BASE_URL}/api/system/preferences`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    // DocumentBursterSettingsInternal wraps InternalSettings under .settings
    expect(body.settings).toBeTruthy();
    // backendurl is always populated, runtime indicates host platform
    expect(body.settings.backendurl).toBeDefined();
    expect(typeof body.settings.backendurl).toEqual('string');
  });

  test('GET /api/system/info/changelog returns non-empty content', async () => {
    // changelog requires `itemName` query param; returns Mono<String> (text).
    const response = await fetch(`${BASE_URL}/api/system/info/changelog?itemName=server`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
  });

  test('POST /api/system/feedback/feature-request handles missing file gracefully', async () => {
    const response = await fetch(`${BASE_URL}/api/system/feedback/feature-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobFilePath: 'does-not-exist.xml' }),
    });
    expect(response.status).not.toEqual(404);
    // featureRequest returns ProcessOutputResultDto — body must be parseable JSON
    const body = await response.json().catch(() => null);
    expect(body).toBeTruthy();
    expect(typeof body).toEqual('object');
  });
});

// ── Tier 1: License ──
//
// All license endpoints live under /api/system/license. The base method maps
// to "/", so the load URL has a trailing slash. Activate / deactivate are
// deliberately omitted — they mutate the test machine's persistent license state.

test.describe('REST — License', () => {

  // LicenseController declares consumes=application/json at the class level
  // (no method-level override) so every GET also needs a Content-Type header
  // on Spring 6 — same pattern as LogsController. All three tests only assert
  // the route is mapped (not 404); checkLicense legitimately 500s on a host
  // without a license file installed, which is the e2e default state.

  test('GET /api/system/license/ returns LicenseDetails or null', async () => {
    const response = await fetch(`${BASE_URL}/api/system/license/`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    expect(response.status).not.toEqual(404);
    // No-license host returns 500; licensed host returns 200 with LicenseDetails.
    if (response.ok) {
      const body = await response.json();
      if (body !== null) {
        // LicenseDetails fields: key, product, status, expires, customername, …
        expect(typeof body).toEqual('object');
        expect(body.product !== undefined || body.key !== undefined).toBeTruthy();
      }
    }
  });

  test('GET /api/system/license/status returns license check result', async () => {
    const response = await fetch(`${BASE_URL}/api/system/license/status`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    expect(response.status).not.toEqual(404);
    // checkLicense throws when no license is installed on the test machine →
    // 500 with an error body. A licensed host would return 200 (void body).
    if (response.status === 500) {
      const text = await response.text();
      expect(text.length).toBeGreaterThan(0);
    }
  });

  test('GET /api/system/license/about returns AboutInfo with product/version', async () => {
    const response = await fetch(`${BASE_URL}/api/system/license/about`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    expect(response.status).not.toEqual(404);
    if (response.ok) {
      const body = await response.json();
      // AboutInfo fields: product, version, latestversion, changelog
      expect(body.product).toBeTruthy();
      expect(body.version).toBeTruthy();
    }
  });
});

// ── Tier 2: Reports ──

test.describe('REST — Reports', () => {

  test('GET /api/reports returns array including burst configuration', async () => {
    const response = await fetch(`${BASE_URL}/api/reports`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);
    // Seeded `burst` folder must appear in the list
    const burst = body.find((r: any) => r.folderName === 'burst');
    expect(burst).toBeTruthy();
    expect(burst.fileName).toBeDefined();
  });

  test('GET /api/reports/burst returns ConfigurationFileInfo for burst', async () => {
    const response = await fetch(`${BASE_URL}/api/reports/burst`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(body.folderName).toEqual('burst');
    expect(body.fileName).toBeDefined();
    // ConfigurationFileInfo carries capability flags from the loaded settings
    expect(typeof body.capReportDistribution).toEqual('boolean');
    expect(typeof body.capReportGenerationMailMerge).toEqual('boolean');
  });

  test('GET /api/reports/burst/settings returns settings JSON with version', async () => {
    const response = await fetch(`${BASE_URL}/api/reports/burst/settings`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(body).toBeTruthy();
    // The serialized settings.xml must expose a version field somewhere in
    // the documentburster.settings tree (e.g. "version":"15.2.0").
    const json = JSON.stringify(body);
    expect(json).toMatch(/"version":\s*"\d+\.\d+\.\d+"/);
  });
});

// ── Tier 2: Queries ──
//
// No DB connection is seeded under testground/config/connections — we only
// assert that the routes reach the handler and return a predictable non-2xx
// when given a bogus connectionId, not that the SQL actually runs.

test.describe('REST — Queries', () => {

  test('POST /api/queries/run-sql with bogus connection returns error in body', async () => {
    const response = await fetch(`${BASE_URL}/api/queries/run-sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId: 'db-does-not-exist-zzz', sql: 'SELECT 1' }),
    });
    expect(response.status).not.toEqual(404);
    const body = await response.json().catch(() => null);
    expect(body).toBeTruthy();
    // executeQuery returns Mono<Map<String, Object>> — a bogus connection
    // must surface as an error/exception field, not as rows.
    const indicatesError =
      body.error || body.errorMessage || body.message || body.exception ||
      body.status === 'error' || body.success === false ||
      response.status >= 400;
    expect(indicatesError).toBeTruthy();
  });

  test('GET /api/queries/schema/{missing} returns error (4xx or 5xx)', async () => {
    const response = await fetch(`${BASE_URL}/api/queries/schema/db-does-not-exist-zzz`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeFalsy();
    expect(response.status).toBeGreaterThanOrEqual(400);
    // Error body should mention the missing connection / file
    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
  });
});

// ── Tier 2: Cubes ──

test.describe('REST — Cubes', () => {

  test('GET /api/cubes returns array of cube entries', async () => {
    const response = await fetch(`${BASE_URL}/api/cubes`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    // Each entry is a Map<String,String> with at least an identifier
    for (const cube of body) {
      expect(typeof cube).toEqual('object');
    }
  });

  test('POST /api/cubes/parse-dsl with invalid DSL returns 500 with parser error', async () => {
    // 'cube "test" {}' parses as cube("test") followed by an orphan closure;
    // Groovy then tries to call test(closure) on Script1 and throws
    // MissingMethodException. Spring resolves to 500.
    const response = await fetch(`${BASE_URL}/api/cubes/parse-dsl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dslCode: 'cube "test" {}' }),
    });
    expect(response.status).toEqual(500);
    const text = await response.text();
    // Error message must surface either the Groovy missing-method or the
    // CubeOptionsParser/CubesService failure chain.
    expect(text).toMatch(/Method|method|Script|signature|MissingMethod|parse/i);
  });
});

// ── Tier 2: Analytics ──

test.describe('REST — Analytics', () => {

  test('GET /api/analytics/health returns status UP with engines info', async () => {
    const response = await fetch(`${BASE_URL}/api/analytics/health`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(body.status).toEqual('UP');
    expect(body.service).toMatch(/Analytics/);
    expect(body.engines).toBeTruthy();
    expect(body.engines.duckdb).toBeTruthy();
    expect(body.engines.clickhouse).toBeTruthy();
    expect(typeof body.engines.duckdb.supportedAggregators).toEqual('number');
  });

  test('GET /api/analytics/aggregators returns list containing count and sum', async () => {
    const response = await fetch(`${BASE_URL}/api/analytics/aggregators`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    // Actual list (uppercase): SUM, COUNT, COUNT_UNIQUE, AVERAGE, MAX, MIN,
    // MEDIAN, MODE, STDDEV, VARIANCE, … — assert the two foundational ones.
    expect(body).toContain('COUNT');
    expect(body).toContain('SUM');
    expect(body.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Tier 2: Logs (jobs/logs) ──
//
// LogsController is mounted at /api/jobs (sibling of JobsController) and adds
// /logs and /logs/tailer endpoints used by the renderer's log viewer.

test.describe('REST — Logs (jobs/logs)', () => {

  test('GET /api/jobs/logs returns array of FileInfo entries', async () => {
    // LogsController has class-level consumes=application/json (no method-level
    // override) so the GET also requires the Content-Type header on Spring 6.
    const response = await fetch(`${BASE_URL}/api/jobs/logs`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    // logs dir always has at least info.log after a job ran
    expect(body.length).toBeGreaterThan(0);
    // FileInfo fields: fileName, filePath, fileSize, lastModified, isDirectory
    const sample = body[0];
    expect(sample.fileName).toBeDefined();
    expect(sample.filePath).toBeDefined();
    expect(typeof sample.fileSize).toEqual('number');
    expect(typeof sample.isDirectory).toEqual('boolean');
  });

  test('POST /api/jobs/logs/tailer stop returns 200 OK', async () => {
    // TailCommandInfo body { command, fileName }. 'stop' for an unstarted
    // tailer is a no-op that completes successfully.
    const response = await fetch(`${BASE_URL}/api/jobs/logs/tailer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'stop', fileName: 'info.log' }),
    });
    expect(response.status).toEqual(200);
  });
});

// ── Tier 2: Gallery ──

test.describe('REST — Gallery', () => {

  test('GET /api/system/gallery/templates/{unknown}/readme returns structured response', async () => {
    // For a missing templateId the gallery returns 200 with an empty (or
    // fallback) body rather than 404. The endpoint produces text/plain per
    // the controller, so the response must be a string regardless of whether
    // a readme was found.
    const response = await fetch(
      `${BASE_URL}/api/system/gallery/templates/does-not-exist-zzz/readme`,
      { headers: { Accept: 'text/plain' } },
    );
    expect(response.status).not.toEqual(404);
    expect(response.status).toBeLessThan(500);
    const text = await response.text();
    expect(typeof text).toEqual('string');
  });
});
