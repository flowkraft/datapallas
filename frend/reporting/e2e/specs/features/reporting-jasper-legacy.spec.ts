import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

import { test, expect } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { Constants } from '../../utils/constants';
import { FluentTester } from '../../helpers/fluent-tester';
import { DockerTestHelper } from '../../helpers/docker-test-helper';
import { ConnectionsTestHelper } from '../../helpers/areas/connections-test-helper';
import { ConfigurationTestHelper } from '../../helpers/areas/configuration-test-helper';
import { JasperCompileHelper } from '../../helpers/jasper-compile-helper';
import _ from 'lodash';

/**
 * JasperReports LEGACY — classic .jrxml, the format every version from 1.x to
 * 6.21 produced. JasperReports 7 cannot read it, so DataPallas renders it
 * through the container under tools/jasper-legacy.
 *
 * The sibling suite (reporting-jasper.spec.ts) covers the JasperReports 7
 * engine and needs nothing running. This one needs Docker and the legacy
 * renderer, so the suite starts it once in beforeAll and guarantees it is gone
 * again in afterAll — graceful stop first, nuclear `docker compose down` either
 * way. The image is kept, because rebuilding JasperReports 6 costs minutes.
 *
 * The templates below are deliberately NOT tidy fixtures. They are written the
 * way reports of that era actually were — DTD or namespace headers, <band>
 * layouts, <queryString> with the SQL inside the report, groups with their own
 * variables, $V{PAGE_NUMBER}, styles, classic <pieChart>, and in one case the
 * repo: paths only JasperReports Server could resolve. If DataPallas can run
 * these it can run what people have.
 *
 * sqlite only: the subject here is the JasperReports engine, not databases.
 */

const TOOL_DIR = () => path.resolve(process.env.PORTABLE_EXECUTABLE_DIR as string, 'tools', 'jasper-legacy');
const LEGACY_REPORTS_DIR = () =>
  path.resolve(process.env.PORTABLE_EXECUTABLE_DIR as string, 'config', 'reports-jasper-legacy');

// ── Wild template 1 ─────────────────────────────────────────────────────────
// A JasperReports Server export, untouched: the corporate logo still points at
// the Server's own repository, which nothing outside Server can resolve.
const SERVER_EXPORT_HEADCOUNT = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xsi:schemaLocation="http://jasperreports.sourceforge.net/jasperreports http://jasperreports.sourceforge.net/xsd/jasperreport.xsd"
              name="monthly_headcount" pageWidth="595" pageHeight="842" columnWidth="515"
              leftMargin="40" rightMargin="40" topMargin="40" bottomMargin="40">
    <style name="Heading" isDefault="false" fontSize="15" isBold="true"/>
    <parameter name="Department" class="java.lang.String"/>
    <title>
        <band height="250">
            <image>
                <reportElement x="0" y="0" width="120" height="40"/>
                <imageExpression class="java.lang.String"><![CDATA["repo:/images/corp_logo.png"]]></imageExpression>
            </image>
            <staticText>
                <reportElement style="Heading" x="0" y="50" width="515" height="28"/>
                <text><![CDATA[Monthly Headcount]]></text>
            </staticText>
            <textField>
                <reportElement x="0" y="85" width="515" height="20"/>
                <textFieldExpression class="java.lang.String"><![CDATA["Department: " + $P{Department}]]></textFieldExpression>
            </textField>
            <pieChart>
                <chart><reportElement x="0" y="115" width="380" height="125"/></chart>
                <pieDataset>
                    <keyExpression><![CDATA["Permanent"]]></keyExpression>
                    <valueExpression><![CDATA[Double.valueOf(37)]]></valueExpression>
                </pieDataset>
                <piePlot><plot/></piePlot>
            </pieChart>
        </band>
    </title>
    <pageFooter>
        <band height="20">
            <textField>
                <reportElement x="400" y="0" width="115" height="15"/>
                <textElement textAlignment="Right"/>
                <textFieldExpression class="java.lang.String"><![CDATA["Page " + $V{PAGE_NUMBER}]]></textFieldExpression>
            </textField>
        </band>
    </pageFooter>
</jasperReport>
`;

// ── Wild template 2 ─────────────────────────────────────────────────────────
// The DTD header of the JasperReports 1.x/2.x era, before the XSD existed.
// Groups, a group-reset Sum variable, a grand total in the summary band, and
// $V{PAGE_NUMBER} — the shape of every invoice ever built on the library.
const LIBRARY_ERA_ORDER_BOOK = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE jasperReport PUBLIC "-//JasperReports//DTD Report Design//EN" "http://jasperreports.sourceforge.net/dtds/jasperreport.dtd">
<jasperReport name="order_book" pageWidth="595" pageHeight="842" columnWidth="515"
              leftMargin="40" rightMargin="40" topMargin="40" bottomMargin="40">
    <parameter name="Country" class="java.lang.String"/>
    <queryString language="SQL"><![CDATA[SELECT o."OrderID", o."OrderDate", c."CompanyName", p."ProductName",
       od."Quantity", od."UnitPrice"
FROM "Orders" o
JOIN "Customers" c ON c."CustomerID" = o."CustomerID"
JOIN "OrderDetails" od ON od."OrderID" = o."OrderID"
JOIN "Products" p ON p."ProductID" = od."ProductID"
WHERE c."Country" = $P{Country}
ORDER BY o."OrderID"]]></queryString>
    <field name="OrderID" class="java.lang.Integer"/>
    <field name="OrderDate" class="java.lang.String"/>
    <field name="CompanyName" class="java.lang.String"/>
    <field name="ProductName" class="java.lang.String"/>
    <field name="Quantity" class="java.lang.Integer"/>
    <field name="UnitPrice" class="java.lang.Double"/>
    <variable name="LineTotal" class="java.lang.Double">
        <variableExpression><![CDATA[Double.valueOf($F{Quantity}.intValue() * $F{UnitPrice}.doubleValue())]]></variableExpression>
    </variable>
    <variable name="OrderTotal" class="java.lang.Double" resetType="Group" resetGroup="OrderGroup" calculation="Sum">
        <variableExpression><![CDATA[Double.valueOf($F{Quantity}.intValue() * $F{UnitPrice}.doubleValue())]]></variableExpression>
    </variable>
    <variable name="GrandTotal" class="java.lang.Double" calculation="Sum">
        <variableExpression><![CDATA[Double.valueOf($F{Quantity}.intValue() * $F{UnitPrice}.doubleValue())]]></variableExpression>
    </variable>
    <group name="OrderGroup">
        <groupExpression><![CDATA[$F{OrderID}]]></groupExpression>
        <groupHeader>
            <band height="24">
                <textField>
                    <reportElement x="0" y="4" width="515" height="16"/>
                    <textElement><font isBold="true"/></textElement>
                    <textFieldExpression class="java.lang.String"><![CDATA["Order " + $F{OrderID} + " — " + $F{CompanyName} + " (" + $F{OrderDate} + ")"]]></textFieldExpression>
                </textField>
            </band>
        </groupHeader>
        <groupFooter>
            <band height="20">
                <textField pattern="#,##0.00">
                    <reportElement x="300" y="2" width="215" height="15"/>
                    <textElement textAlignment="Right"><font isBold="true"/></textElement>
                    <textFieldExpression class="java.lang.Double"><![CDATA[$V{OrderTotal}]]></textFieldExpression>
                </textField>
            </band>
        </groupFooter>
    </group>
    <title>
        <band height="40">
            <staticText>
                <reportElement x="0" y="0" width="515" height="24"/>
                <textElement><font size="14" isBold="true"/></textElement>
                <text><![CDATA[Order Book]]></text>
            </staticText>
        </band>
    </title>
    <columnHeader>
        <band height="18">
            <staticText><reportElement x="0" y="0" width="250" height="14"/><text><![CDATA[Product]]></text></staticText>
            <staticText><reportElement x="260" y="0" width="60" height="14"/><text><![CDATA[Qty]]></text></staticText>
            <staticText><reportElement x="330" y="0" width="90" height="14"/><text><![CDATA[Unit price]]></text></staticText>
            <staticText><reportElement x="430" y="0" width="85" height="14"/><text><![CDATA[Line total]]></text></staticText>
        </band>
    </columnHeader>
    <detail>
        <band height="16">
            <textField>
                <reportElement x="0" y="0" width="250" height="14"/>
                <textFieldExpression class="java.lang.String"><![CDATA[$F{ProductName}]]></textFieldExpression>
            </textField>
            <textField>
                <reportElement x="260" y="0" width="60" height="14"/>
                <textFieldExpression class="java.lang.Integer"><![CDATA[$F{Quantity}]]></textFieldExpression>
            </textField>
            <textField pattern="#,##0.00">
                <reportElement x="330" y="0" width="90" height="14"/>
                <textElement textAlignment="Right"/>
                <textFieldExpression class="java.lang.Double"><![CDATA[$F{UnitPrice}]]></textFieldExpression>
            </textField>
            <textField pattern="#,##0.00">
                <reportElement x="430" y="0" width="85" height="14"/>
                <textElement textAlignment="Right"/>
                <textFieldExpression class="java.lang.Double"><![CDATA[$V{LineTotal}]]></textFieldExpression>
            </textField>
        </band>
    </detail>
    <pageFooter>
        <band height="20">
            <textField>
                <reportElement x="400" y="2" width="115" height="14"/>
                <textElement textAlignment="Right"/>
                <textFieldExpression class="java.lang.String"><![CDATA["Page " + $V{PAGE_NUMBER}]]></textFieldExpression>
            </textField>
        </band>
    </pageFooter>
    <summary>
        <band height="30">
            <staticText>
                <reportElement x="250" y="6" width="170" height="16"/>
                <textElement textAlignment="Right"><font isBold="true"/></textElement>
                <text><![CDATA[Grand total]]></text>
            </staticText>
            <textField pattern="#,##0.00">
                <reportElement x="430" y="6" width="85" height="16"/>
                <textElement textAlignment="Right"><font isBold="true"/></textElement>
                <textFieldExpression class="java.lang.Double"><![CDATA[$V{GrandTotal}]]></textFieldExpression>
            </textField>
        </band>
    </summary>
</jasperReport>
`;

// ── Wild template 3 ─────────────────────────────────────────────────────────
// The spreadsheet export everybody had: a flat grid with a column header that
// repeats, built to be opened in Excel rather than printed.
const PRICE_LIST_FOR_EXCEL = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports"
              name="price_list" pageWidth="842" pageHeight="595" orientation="Landscape"
              columnWidth="802" leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
    <style name="Header" isDefault="false" isBold="true"/>
    <queryString language="SQL"><![CDATA[SELECT c."CategoryName", p."ProductName", p."QuantityPerUnit",
       p."UnitPrice", p."UnitsInStock"
FROM "Products" p
JOIN "Categories" c ON c."CategoryID" = p."CategoryID"
ORDER BY c."CategoryName", p."ProductName"]]></queryString>
    <field name="CategoryName" class="java.lang.String"/>
    <field name="ProductName" class="java.lang.String"/>
    <field name="QuantityPerUnit" class="java.lang.String"/>
    <field name="UnitPrice" class="java.lang.Double"/>
    <field name="UnitsInStock" class="java.lang.Integer"/>
    <columnHeader>
        <band height="20">
            <staticText><reportElement style="Header" x="0" y="0" width="150" height="16"/><text><![CDATA[Category]]></text></staticText>
            <staticText><reportElement style="Header" x="160" y="0" width="250" height="16"/><text><![CDATA[Product]]></text></staticText>
            <staticText><reportElement style="Header" x="420" y="0" width="180" height="16"/><text><![CDATA[Pack size]]></text></staticText>
            <staticText><reportElement style="Header" x="610" y="0" width="90" height="16"/><text><![CDATA[Unit price]]></text></staticText>
            <staticText><reportElement style="Header" x="710" y="0" width="90" height="16"/><text><![CDATA[In stock]]></text></staticText>
        </band>
    </columnHeader>
    <detail>
        <band height="16">
            <textField><reportElement x="0" y="0" width="150" height="14"/><textFieldExpression class="java.lang.String"><![CDATA[$F{CategoryName}]]></textFieldExpression></textField>
            <textField><reportElement x="160" y="0" width="250" height="14"/><textFieldExpression class="java.lang.String"><![CDATA[$F{ProductName}]]></textFieldExpression></textField>
            <textField><reportElement x="420" y="0" width="180" height="14"/><textFieldExpression class="java.lang.String"><![CDATA[$F{QuantityPerUnit}]]></textFieldExpression></textField>
            <textField pattern="#,##0.00"><reportElement x="610" y="0" width="90" height="14"/><textElement textAlignment="Right"/><textFieldExpression class="java.lang.Double"><![CDATA[$F{UnitPrice}]]></textFieldExpression></textField>
            <textField><reportElement x="710" y="0" width="90" height="14"/><textElement textAlignment="Right"/><textFieldExpression class="java.lang.Integer"><![CDATA[$F{UnitsInStock}]]></textFieldExpression></textField>
        </band>
    </detail>
</jasperReport>
`;

// ── Wild template 4 ─────────────────────────────────────────────────────────
// The management one-pager: a classic <pieChart> and <barChart> over a GROUP BY,
// the reason jfreechart shipped inside JasperReports for fifteen years.
const SALES_BY_CATEGORY_CHART = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports"
              name="sales_by_category" pageWidth="595" pageHeight="842" columnWidth="515"
              leftMargin="40" rightMargin="40" topMargin="40" bottomMargin="40">
    <queryString language="SQL"><![CDATA[SELECT c."CategoryName" AS "Category",
       CAST(SUM(od."Quantity" * od."UnitPrice") AS REAL) AS "Revenue"
FROM "OrderDetails" od
JOIN "Products" p ON p."ProductID" = od."ProductID"
JOIN "Categories" c ON c."CategoryID" = p."CategoryID"
GROUP BY c."CategoryName"
ORDER BY 2 DESC]]></queryString>
    <field name="Category" class="java.lang.String"/>
    <field name="Revenue" class="java.lang.Double"/>
    <title>
        <band height="30">
            <staticText>
                <reportElement x="0" y="0" width="515" height="24"/>
                <textElement><font size="14" isBold="true"/></textElement>
                <text><![CDATA[Revenue by Category]]></text>
            </staticText>
        </band>
    </title>
    <summary>
        <band height="560">
            <pieChart>
                <chart><reportElement x="0" y="0" width="515" height="260"/></chart>
                <pieDataset>
                    <keyExpression><![CDATA[$F{Category}]]></keyExpression>
                    <valueExpression><![CDATA[$F{Revenue}]]></valueExpression>
                </pieDataset>
                <piePlot><plot/></piePlot>
            </pieChart>
            <barChart>
                <chart><reportElement x="0" y="280" width="515" height="260"/></chart>
                <categoryDataset>
                    <categorySeries>
                        <seriesExpression><![CDATA["Revenue"]]></seriesExpression>
                        <categoryExpression><![CDATA[$F{Category}]]></categoryExpression>
                        <valueExpression><![CDATA[$F{Revenue}]]></valueExpression>
                    </categorySeries>
                </categoryDataset>
                <barPlot><plot/></barPlot>
            </barChart>
        </band>
    </summary>
</jasperReport>
`;

/** A 1x1 PNG — stands in for the corporate logo the Server used to serve. */
const LOGO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// ── Renderer lifecycle ──────────────────────────────────────────────────────

function runTool(args: string[], label: string): string {
  const isWindows = process.platform === 'win32';
  const command = path.join(TOOL_DIR(), isWindows ? 'jr.bat' : 'jr.sh');
  const result = spawnSync(isWindows ? 'cmd' : 'bash', isWindows ? ['/c', command, ...args] : [command, ...args], {
    encoding: 'utf-8',
    timeout: 10 * 60_000,
    cwd: TOOL_DIR(),
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) {
    throw new Error(`${label} could not run: ${result.error.message}\n${output}`);
  }
  return output;
}

function runServiceScript(scriptName: string, label: string): void {
  const isWindows = process.platform === 'win32';
  const script = path.join(TOOL_DIR(), `${scriptName}${isWindows ? '.bat' : '.sh'}`);
  if (!fs.existsSync(script)) {
    throw new Error(
      `The JasperReports Legacy renderer is not installed at ${TOOL_DIR()} [${label}]. ` +
        `It ships under tools/jasper-legacy.`,
    );
  }
  spawnSync(isWindows ? 'cmd' : 'bash', isWindows ? ['/c', script] : [script], {
    encoding: 'utf-8',
    timeout: 15 * 60_000,
    cwd: TOOL_DIR(),
    env: { ...process.env, JASPER_LEGACY_REPORTS: LEGACY_REPORTS_DIR() },
  });
}

/**
 * Docker plus the renderer itself. Without the Docker guard the generate step
 * would not fail — it would sit in waitOnProcessingToFinish until the timeout,
 * which is the exact trap DockerTestHelper was written for.
 */
function startLegacyRenderer(): void {
  DockerTestHelper.assertDockerRunning('jasper legacy renderer');
  runServiceScript('startJasperLegacyServer', 'start');

  // The first start BUILDS the image, which is minutes rather than seconds.
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const probe = spawnSync('curl', ['-s', '-m', '3', 'http://localhost:9095/api/health'], {
      encoding: 'utf-8',
      timeout: 20_000,
    });
    if ((probe.stdout ?? '').includes('"status":"ok"')) {
      return;
    }
    // Cheap wait that needs no shell builtin on either platform.
    spawnSync('curl', ['-s', '-m', '5', 'http://localhost:9095/api/health'], { timeout: 20_000 });
  }

  throw new Error(
    `The JasperReports Legacy renderer did not answer on http://localhost:9095. ` +
      `Check that Docker is running, then re-run.`,
  );
}

/**
 * Nuclear stop: force-removes the renderer's container but KEEPS the built
 * image, so a re-run does not spend minutes rebuilding JasperReports 6 (and
 * works offline). Safe to call in a `finally` as the guaranteed no-leak net —
 * it does not care whether the graceful stop worked, or ran at all.
 */
function dockerComposeDownKeepImage(): void {
  spawnSync('docker', ['compose', 'down'], {
    cwd: path.join(TOOL_DIR(), 'internal'),
    shell: true,
  });
}

function stopLegacyRenderer(): void {
  try {
    // Graceful happy-path stop — the nuclear down below runs either way.
    runServiceScript('shutJasperLegacyServer', 'stop');
  } finally {
    dockerComposeDownKeepImage();
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Drops a legacy report into config/reports-jasper-legacy/, replacing any earlier run. */
function placeLegacyReport(folderName: string, fileName: string, content: string): string {
  const reportDir = path.join(LEGACY_REPORTS_DIR(), folderName);
  fs.rmSync(reportDir, { recursive: true, force: true });
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, fileName), content, 'utf-8');
  return reportDir;
}

/**
 * Points one report at a database connection — tier 1 of the three-tier
 * resolution, the same file the JasperReports 7 folder uses. Written here rather
 * than through the Connections screen because the "Use For JasperReports" button
 * writes only into config/reports-jasper/.
 */
function useConnectionForReport(reportDir: string, connectionCode: string): void {
  fs.writeFileSync(
    path.join(reportDir, 'datasource.properties'),
    `connectionCode=${connectionCode}\n`,
    'utf-8',
  );
}

test.describe('DataPallas - JasperReports Legacy Integration', async () => {

  FluentTester.setGlobalClickWaitMs(Constants.DELAY_ONE_SECOND);

  // Started once for the whole suite, not per test: the first start builds the
  // JasperReports 6 image, and paying that per test would be minutes each.
  test.beforeAll(async () => {
    // A hook inherits the test timeout, and this one can be BUILDING the image on
    // a fresh machine. When the hook times out mid-build, teardown tears down a
    // half-started container and the next run inherits the mess.
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    startLegacyRenderer();
  });

  test.afterAll(async () => {
    // Same reason as beforeAll: a teardown that times out is a teardown that
    // leaves the container running.
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    stopLegacyRenderer();
  });

  // ─── Test 1: A JasperReports Server export, migrated the way a customer would ───
  // Technical: the whole story in one test — jr analyze finds the Server repo:
  // reference, jr analyze --fix rewrites it and declares SUBREPORT_DIR, the report
  // is dropped into config/reports-jasper-legacy/, the scanner auto-generates its
  // settings.xml, and the JasperReports 6 container renders it.
  electronBeforeAfterAllTest(
    'should migrate a JasperReports Server export with jr analyze --fix and then generate it',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      // The export lands somewhere outside DataPallas, as a download would.
      const exportDir = path.resolve(process.env.PORTABLE_EXECUTABLE_DIR as string, 'temp', 'jasperserver-export');
      fs.rmSync(exportDir, { recursive: true, force: true });
      fs.mkdirSync(exportDir, { recursive: true });
      const reportJrxml = path.join(exportDir, 'monthly_headcount.jrxml');
      fs.writeFileSync(reportJrxml, SERVER_EXPORT_HEADCOUNT, 'utf-8');

      // Step 1 — ask what will run. Nothing is installed or started for this.
      const analysis = runTool(['analyze', exportDir], 'jr analyze');
      expect(analysis).toContain('classic JRXML');
      expect(analysis).toContain('repo:/images/corp_logo.png');
      expect(analysis).toContain('need something first');

      // Step 2 — accept the offer. The Server path is rewritten in place.
      const fixed = runTool(['analyze', exportDir, '--fix'], 'jr analyze --fix');
      expect(fixed).toContain('rewritten');

      let ft = new FluentTester(firstPage);
      ft = ft
        .fileShouldExist(`${reportJrxml}.bak`)
        .fileContentShouldNotContain(reportJrxml, 'repo:')
        .fileContentShouldContain(reportJrxml, '$P{SUBREPORT_DIR}')
        // Referencing SUBREPORT_DIR without declaring it is a compile error, so
        // --fix has to add the declaration as well as rewrite the path.
        .fileContentShouldContain(reportJrxml, 'name="SUBREPORT_DIR"');

      // Step 3 — copy in the files the analysis named, then drop the folder into
      // DataPallas. No settings.xml is written by hand: the scanner makes it.
      const reportDir = placeLegacyReport('monthly-headcount', 'monthly_headcount.jrxml',
        fs.readFileSync(reportJrxml, 'utf-8'));
      fs.mkdirSync(path.join(reportDir, 'images'), { recursive: true });
      fs.writeFileSync(path.join(reportDir, 'images', 'corp_logo.png'), new Uint8Array(Buffer.from(LOGO_PNG_BASE64, 'base64')));

      // Navigate away from Processing so that returning triggers a fresh config reload
      ft = ft
        .click('#topMenuConfiguration')
        .click('#topConfigurationCrud')
        .sleep(Constants.DELAY_ONE_SECOND)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("monthly_headcount")',
        )
        .click(
          'span.ng-option-label:has-text("monthly_headcount")',
        );

      // The parameter form is built from the classic .jrxml's own <parameter>
      ft = ft
        .waitOnElementToBecomeVisible('#formReportParameters')
        .waitOnElementToBecomeEnabled('#Department')
        .setValue('#Department', 'Engineering')
        .sleep(Constants.DELAY_ONE_SECOND);

      // The scanner wrote the configuration, pointing at the legacy engine
      const generatedReporting = path.join(reportDir, 'reporting.xml');
      ft = ft
        .fileShouldExist(generatedReporting)
        .fileContentShouldContain(generatedReporting, '<type>ds.jasperlegacy</type>')
        .fileContentShouldContain(generatedReporting, 'output.jasperlegacy');

      // Generate — expect 1 PDF, rendered by the JasperReports 6 container
      ft = ft
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedNFilesHavingSuffix(1, '.pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        // In-chain, so it runs AFTER the generation rather than before it: the
        // FluentTester chain is lazy and only executes once returned.
        .deleteFolder(reportDir)
        .deleteFolder(exportDir);

      return ft;
    },
  );

  // ─── Test 2: An order book straight off the database ───
  // Technical: DTD-era header, embedded SQL, a group with its own Sum variable,
  // a grand total in the summary band and $V{PAGE_NUMBER} in the page footer —
  // all of which only work because a standalone legacy report gets a real JDBC
  // connection rather than pre-fetched rows.
  electronBeforeAfterAllTest(
    '(sqlite) should print an order book grouped by order, with per-order and grand totals',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const dbVendor = 'sqlite';
      let ft = new FluentTester(firstPage);

      const dbConn = createDbConnection(ft, 'JasperLegacyOrderBook', 'dbcon-plain-schema-only', dbVendor, false);
      ft = dbConn.ft;
      const connectionCode = `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}`;

      const reportDir = placeLegacyReport('order-book', 'order_book.jrxml', LIBRARY_ERA_ORDER_BOOK);
      useConnectionForReport(reportDir, connectionCode);

      ft = ft
        .click('#topMenuConfiguration')
        .click('#topConfigurationCrud')
        .sleep(Constants.DELAY_ONE_SECOND)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("order_book")',
        )
        .click(
          'span.ng-option-label:has-text("order_book")',
        );

      ft = ft
        .waitOnElementToBecomeVisible('#formReportParameters')
        .waitOnElementToBecomeEnabled('#Country')
        .setValue('#Country', 'Germany')
        .sleep(Constants.DELAY_ONE_SECOND);

      ft = ft
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedNFilesHavingSuffix(1, '.pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .deleteFolder(reportDir);

      ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft,
        `${connectionCode}\\.xml`,
        dbVendor,
      );

      return ft;
    },
  );

  // ─── Test 3: The price list everybody opened in Excel ───
  // Technical: landscape flat grid with a repeating column header, exported as
  // .xlsx purely by changing the burst filename — proving the format still comes
  // from DataPallas when the render happens inside the container.
  electronBeforeAfterAllTest(
    '(sqlite) should export a product price list as Excel (.xlsx) for the buying team',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const dbVendor = 'sqlite';
      let ft = new FluentTester(firstPage);

      const dbConn = createDbConnection(ft, 'JasperLegacyPriceList', 'dbcon-plain-schema-only', dbVendor, false);
      ft = dbConn.ft;
      const connectionCode = `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}`;

      const reportDir = placeLegacyReport('price-list', 'price_list.jrxml', PRICE_LIST_FOR_EXCEL);
      useConnectionForReport(reportDir, connectionCode);

      // First visit starts the scan and auto-generates settings.xml; the second
      // reloads the list so the burst filename can be switched to .xlsx.
      ft = ft
        .gotoConfigurationReports()
        .sleep(Constants.DELAY_ONE_SECOND);
      ft = ConfigurationTestHelper.loadConfiguration(ft, 'price-list');
      ft = ft
        .waitOnElementToBecomeVisible('#burstFileName')
        .setValue('#burstFileName', '${burst_token}.xlsx')
        .sleep(3 * Constants.DELAY_ONE_SECOND);

      ft = ft
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("price_list")',
        )
        .click(
          'span.ng-option-label:has-text("price_list")',
        );

      ft = ft
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedNFilesHavingSuffix(1, '.xlsx')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .deleteFolder(reportDir);

      ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft,
        `${connectionCode}\\.xml`,
        dbVendor,
      );

      return ft;
    },
  );

  // ─── Test 4: The management one-pager, with charts ───
  // Technical: classic <pieChart> and <barChart> over a GROUP BY. Charts are the
  // feature most likely to be missing from a stripped-down engine — JasperReports
  // 6 carries jfreechart inside the core jar, and this proves the container's copy
  // is wired up.
  electronBeforeAfterAllTest(
    '(sqlite) should chart revenue by product category as a pie and a bar chart',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const dbVendor = 'sqlite';
      let ft = new FluentTester(firstPage);

      const dbConn = createDbConnection(ft, 'JasperLegacyCategoryChart', 'dbcon-plain-schema-only', dbVendor, false);
      ft = dbConn.ft;
      const connectionCode = `db-${_.kebabCase(dbConn.connectionName)}-${dbVendor}`;

      const reportDir = placeLegacyReport('sales-by-category', 'sales_by_category.jrxml', SALES_BY_CATEGORY_CHART);
      useConnectionForReport(reportDir, connectionCode);

      ft = ft
        .click('#topMenuConfiguration')
        .click('#topConfigurationCrud')
        .sleep(Constants.DELAY_ONE_SECOND)
        .gotoReportGenerationScreen()
        .click('#selectMailMergeClassicReport')
        .waitOnElementToBecomeVisible(
          'span.ng-option-label:has-text("sales_by_category")',
        )
        .click(
          'span.ng-option-label:has-text("sales_by_category")',
        );

      ft = ft
        .click('#btnGenerateReports')
        .clickYesDoThis()
        .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
        .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
        .processingShouldHaveGeneratedNFilesHavingSuffix(1, '.pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .deleteFolder(reportDir);

      ft = ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
        ft,
        `${connectionCode}\\.xml`,
        dbVendor,
      );

      return ft;
    },
  );

  // ─── Test 5: A classic report with a sub-report, shipped compiled ───
  // Technical: what a properly exported pack looks like — the sub-report
  // referenced as .jasper with the compiled file beside it. Nothing should be
  // compiled at render time; this is the path that must keep working untouched.
  electronBeforeAfterAllTest(
    'should generate a classic report whose sub-report was shipped already compiled (.jasper)',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const reportDir = placeLegacyReport('subreport-compiled', 'sub_lines.jrxml', LEGACY_SUBREPORT);
      fs.writeFileSync(
        path.join(reportDir, 'main_report.jrxml'),
        legacyMainReferencing('sub_lines.jasper'),
        'utf-8',
      );
      // Compiled by JasperReports 6 inside the container: a .jasper is
      // version-specific, so it has to be built by the engine that will read it.
      JasperCompileHelper.compileWithJasperLegacy(reportDir, 'sub_lines.jrxml', 'sub_lines.jasper');
      fs.rmSync(path.join(reportDir, 'sub_lines.jrxml'), { force: true });

      let ft = new FluentTester(firstPage);
      ft = selectLegacyReportAndGenerate(ft, 'main_report')
        .processingShouldHaveGeneratedNFilesHavingSuffix(1, '.pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .deleteFolder(reportDir);

      return ft;
    },
  );

  // ─── Test 6: A classic report whose sub-report was never compiled ───
  // Technical: what arrives when somebody copies .jrxml files out of source
  // control, and the shape JasperReports Server exports leave behind. The engine
  // cannot load a sub-report from XML, so DataPallas compiles it on demand and
  // holds it in memory — the customer's folder stays exactly as they left it.
  electronBeforeAfterAllTest(
    'should generate a classic report whose sub-report exists only as .jrxml source',
    async ({ beforeAfterEach: firstPage }) => {
      test.setTimeout(Constants.DELAY_FIVE_HUNDRED_SECONDS);

      const reportDir = placeLegacyReport('subreport-source-only', 'sub_lines.jrxml', LEGACY_SUBREPORT);
      fs.writeFileSync(
        path.join(reportDir, 'main_report.jrxml'),
        legacyMainReferencing('sub_lines.jrxml'),
        'utf-8',
      );

      let ft = new FluentTester(firstPage);
      ft = selectLegacyReportAndGenerate(ft, 'main_report')
        .processingShouldHaveGeneratedNFilesHavingSuffix(1, '.pdf')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        // Nothing was written next to the customer's sources.
        .fileShouldNotExist(path.join(reportDir, 'sub_lines.jasper'))
        .deleteFolder(reportDir);

      return ft;
    },
  );
});

// ─── Helpers: sub-report fixtures ───

const LEGACY_SUBREPORT = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports" name="sub_lines"
              pageWidth="400" pageHeight="200" columnWidth="400" leftMargin="0" rightMargin="0" topMargin="0" bottomMargin="0">
    <title><band height="30">
        <staticText><reportElement x="0" y="0" width="400" height="20"/><text><![CDATA[--- sub-report rendered ---]]></text></staticText>
    </band></title>
</jasperReport>
`;

function legacyMainReferencing(subreportFileName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports" name="main_report"
              pageWidth="595" pageHeight="842" columnWidth="515" leftMargin="40" rightMargin="40" topMargin="40" bottomMargin="40">
    <parameter name="SUBREPORT_DIR" class="java.lang.String" isForPrompting="false">
        <defaultValueExpression><![CDATA[""]]></defaultValueExpression>
    </parameter>
    <title><band height="150">
        <staticText><reportElement x="0" y="0" width="515" height="24"/><text><![CDATA[Main report]]></text></staticText>
        <subreport>
            <reportElement x="0" y="40" width="400" height="60"/>
            <subreportExpression class="java.lang.String"><![CDATA[$P{SUBREPORT_DIR} + "${subreportFileName}"]]></subreportExpression>
        </subreport>
    </band></title>
</jasperReport>
`;
}

/** Navigates away and back so the scan runs, then picks the report and generates. */
function selectLegacyReportAndGenerate(ft: FluentTester, reportName: string): FluentTester {
  return ft
    .click('#topMenuConfiguration')
    .click('#topConfigurationCrud')
    .sleep(Constants.DELAY_ONE_SECOND)
    .gotoReportGenerationScreen()
    .click('#selectMailMergeClassicReport')
    .waitOnElementToBecomeVisible(`span.ng-option-label:has-text("${reportName}")`)
    .click(`span.ng-option-label:has-text("${reportName}")`)
    .sleep(Constants.DELAY_ONE_SECOND)
    .click('#btnGenerateReports')
    .clickYesDoThis()
    .waitOnProcessingToStart(Constants.CHECK_PROCESSING_JAVA)
    .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS);
}

// ─── Helper: Create DB Connection (same pattern as reporting-jasper.spec.ts) ───

function createDbConnection(
  ft: FluentTester,
  testName: string,
  dbConnectionType: 'dbcon-no-schema' | 'dbcon-plain-schema-only' | 'dbcon-domaingrouped-schema' | 'dbcon-all-features' = 'dbcon-no-schema',
  dbVendor: string = 'sqlite',
  clearLogs: boolean = true,
): { ft: FluentTester; connectionName: string; dbConnectionType: string } {
  const connectionName = `${testName}-${dbVendor}-${dbConnectionType}`;

  ft = ConnectionsTestHelper.createAndAssertNewDatabaseConnection(
    ft,
    connectionName,
    dbVendor,
  );

  if (dbConnectionType !== 'dbcon-no-schema') {
    ft = ft
      .clickAndSelectTableRow(`#db-${_.kebabCase(connectionName)}-${dbVendor}\\.xml`)
      .waitOnElementToBecomeEnabled('#btnEdit')
      .click('#btnEdit')
      .waitOnElementToBecomeEnabled('#btnTestDbConnection')
      .click('#btnTestDbConnection');

    if (clearLogs) {
      ft = ft
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#btnClearLogsDbConnection')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#btnTestDbConnection');
    }

    ft = ft
      .confirmDialogShouldBeVisible()
      .clickYesDoThis()
      .waitOnElementToBecomeDisabled('#btnTestDbConnection')
      .waitOnElementToHaveClass('#btnTestDbConnectionIcon', 'animate-spin')
      .waitOnElementNotToHaveClass('#btnTestDbConnectionIcon', 'animate-spin')
      .waitOnToastToBecomeVisible(
        'success',
        'Successfully connected to the database',
        Constants.DELAY_HUNDRED_SECONDS,
      )
      .click('#btnCloseDbConnectionModal')
      .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');
  }

  return { ft, connectionName, dbConnectionType };
}
