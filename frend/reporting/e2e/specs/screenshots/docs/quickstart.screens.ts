// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — docs/quickstart.mdx  (DataPallas UI, dark theme)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Regenerates the quickstart screenshots in the NEW DataPallas UI. Every shot is
// written next to its original as `<name>-dp.png` (e.g. 000_03_JavaNotPresent.png
// → 000_03_JavaNotPresent-dp.png) so the old/new pair can be compared, then the
// `-dp` suffix dropped once approved.
//
// Output dir: DOCS_IMAGES_DIR (…/reportburster.com/public/images/docs/).
//
// Two kinds of shots:
//   • DataPallas UI            → captured live from the running app.
//   • OS-native modals/windows → NOT capturable from the DOM, so we rasterise a
//     DataPallas-branded SVG replica (e2e/_resources/screenshots/svgs/) → PNG.
//
// Java/Choco prerequisite states are faked the same way the gulp
// `utils:start-java*-choco*-and-ui` tasks do it — the app reads installed-status
// from two log files, so we write the desired content instead of changing the
// machine (see setPrereqState).
//
// HOW TO RUN (only this spec):
//   cd frend/reporting
//   # set E2E_GREP="Quickstart" in custom:start-server-and-e2e-electron-screens-grep
//   npm run custom:start-server-and-e2e-electron-screens-grep
//
// ═══════════════════════════════════════════════════════════════════════════════

import { test, Page, Browser } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as jetpack from 'fs-jetpack';
import sharp from 'sharp';
const slash = require('slash');

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { Helpers } from '../../../utils/helpers';
import { FluentTester } from '../../../helpers/fluent-tester';
import { ConnectionsTestHelper } from '../../../helpers/areas/connections-test-helper';
import { DockerTestHelper } from '../../../helpers/docker-test-helper';
import { SelfServicePortalsTestHelper } from '../../../helpers/areas/self-service-portals-test-helper';
import {
  DOCS_IMAGES_DIR,
  captureDocsScreenshot,
  captureDocsScreenshotCenteredOn,
  captureDocsScreenshotWithHighlights,
  hideToastsForScreenshots,
} from '../../../utils/docs-screenshot-helper';

// ── PATHS ───────────────────────────────────────────────────────────────────
const SVG_DIR = path.resolve(__dirname, '..', '..', '..', '_resources', 'screenshots', 'svgs');
const LOG_DIR = `${process.env.PORTABLE_EXECUTABLE_DIR}/logs`;
const RBSJ_EXE_LOG = `${LOG_DIR}/rbsj-exe.log`;   // java -version output lives here
const ELECTRON_LOG = `${LOG_DIR}/electron.log`;   // choco version output lives here

const SAMPLE_PDF = 'samples/burst/Payslips.pdf';

// `<base>` → `<base>-dp.png` (writes beside the original for visual diffing).
const dp = (base: string) => `${base}-dp.png`;

// ── PREREQUISITE-STATE FAKING ────────────────────────────────────────────────
// Hints from gulp `_startJavaYesAndUI` / `_startJavaNoAndUI`: the app decides
// whether Java/Chocolatey are installed by parsing these two logs. Writing them
// lets us render the "Java not found" / "Chocolatey not installed" UI on a
// machine that actually has both — no uninstall, no admin tricks.
const JAVA_PRESENT =
  'openjdk version "17.0.14" 2025-01-21\n' +
  'OpenJDK Runtime Environment Temurin-17.0.14+7 (build 17.0.14+7)\n' +
  'OpenJDK 64-Bit Server VM Temurin-17.0.14+7 (build 17.0.14+7, mixed mode, sharing)\n' +
  'Started ServerApplication with PID 13404';
const JAVA_MISSING = "bla bla\n'java' is not recognized";
const CHOCO_PRESENT = 'bla bla\nchoco version: 0.11.2';
const CHOCO_MISSING = "bla bla\n'choco' is not recognized";

/**
 * Reboot the SINGLE Electron app into the requested prerequisite state and land on
 * the Install & Setup page, where the Java/Chocolatey prerequisite screens render.
 *
 * Why reboot the one app instead of spawning a fresh one: main.ts holds an
 * `app.requestSingleInstanceLock()` — a 2nd Electron process quits itself
 * immediately (and focuses the first), so `electron.launch` of a second instance
 * dies with "Target page... closed". We therefore REUSE the one app slot: close
 * the running app, relaunch fresh so init (`_getSystemInfo`) re-reads the logs.
 *
 * This is the SAME mechanism as gulp `_startJavaNoAndUI` / `_startJavaYesAndUI`
 * (the `custom:start-java*-choco*-and-ui` tasks): writing the two logs IS the
 * whole setup. We then boot and behave EXACTLY like production — no navigation:
 * the default ('') route is NOT Java-guarded (app.routes.ts), so a Java-missing
 * app lands on ProcessingComponent and renders the burst tab's inline "Java not
 * found / Install Java" block (tab-burst.ts) once ngOnInit's backend loads finish.
 * We just WAIT for that block — ngOnInit runs several awaits before it populates
 * the tabset, so on a fresh boot it can take a few seconds to appear.
 *
 * Java/Choco faking, "as close as possible to reality":
 *  - Choco is log-driven in every mode: main.ts:_getSystemInfo flips to "not
 *    installed" when electron.log contains "'choco' is not recognized".
 *  - Java is detected LIVE (`java -version`). The `javaMissing` launch flag makes
 *    Helpers strip java/jdk/jre out of the app's PATH (+ clear JAVA_HOME/JRE_HOME),
 *    so the UNTOUCHED probe genuinely finds nothing and the production fallback
 *    reads detectJavaVersion(rbsj-exe.log) — our JAVA_MISSING text. This mirrors
 *    launching the real .exe from a shell with Java removed — no code seam at all.
 *    Java-present launches keep the full PATH → the real probe finds the machine's Java.
 */
async function bootWithPrereqState(opts: { java: boolean; choco: boolean }): Promise<Page> {
  // Write the status logs BEFORE boot, exactly like gulp `_startJava*AndUI`.
  await jetpack.writeAsync(RBSJ_EXE_LOG, opts.java ? JAVA_PRESENT : JAVA_MISSING);
  await jetpack.writeAsync(ELECTRON_LOG, opts.choco ? CHOCO_PRESENT : CHOCO_MISSING);

  // Single-instance lock (main.ts) forbids a 2nd Electron process, so REUSE the
  // one app slot: close + relaunch so init re-reads the logs and reports the new
  // Java/Choco state.
  await Helpers.electronAppClose();
  const app = await Helpers.electronAppLaunch('../..', { javaMissing: !opts.java });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // Production-faithful: NO navigation. Wait for the inline "Java not found" block
  // to render on its own (ProcessingComponent.ngOnInit finishes its backend loads,
  // then refreshTabs() populates the tabset and the block appears). Generous
  // timeout because the fresh boot + sequential ngOnInit awaits take a few seconds.
  if (!opts.java) {
    await new FluentTester(page).waitOnElementToBecomeVisible(
      '#checkPointJavaPreRequisite',
      Constants.DELAY_HUNDRED_SECONDS,
    );
  }

  await hideToastsForScreenshots(page);
  return page;
}

// ── SVG → PNG (OS-native modals we can't screenshot) ─────────────────────────
/**
 * Rasterise a DataPallas-branded SVG replica to `<base>-dp.png` in the docs
 * folder. `targetWidth` matches the original PNG's width so the pair lines up.
 */
async function renderSvgToPng(svgFile: string, base: string, targetWidth: number): Promise<void> {
  await jetpack.dirAsync(DOCS_IMAGES_DIR);
  const svg = fs.readFileSync(path.join(SVG_DIR, svgFile));
  const out = path.join(DOCS_IMAGES_DIR, dp(base));
  // density 192 ≈ 2.7× → crisp source; resize down to the original's width.
  await sharp(svg, { density: 192 })
    .resize({ width: targetWidth, fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toFile(out);
  console.log(`[svg→png] ${dp(base)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK A — OS-native modal replicas (no app interaction needed)
// ─────────────────────────────────────────────────────────────────────────────
electronBeforeAfterAllTest(
  'Quickstart — native modal replicas (SVG)',
  async () => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // 000_00 — right-click DataPallas.exe → Run as administrator (Windows menu).
    await renderSvgToPng('000_00_run-as-administrator-dp.svg', '000_00_ExeRunAsAdministrator', 504);

    // 000_10 — the in-app "Are you sure…?" confirmation shown when the user clicks
    // Install Chocolatey / Install Java. That mid-install moment isn't capturable
    // from the DOM (it would require actually running the install), so it's a replica.
    await renderSvgToPng('000_10_are-you-sure-perform-action-dp.svg', '000_10_AreYouSureYouWantToPerformAction', 749);

    // 000_15 — the OS "Command execution completed" info box shown after the choco
    // install finishes (also not DOM-capturable).
    await renderSvgToPng('command-execution-completed-dp.svg', '000_15_ChocoInstalled', 506);

    // 005_23 — the Burst Reports toolbar with the "Samples" button ringed, a
    // clean replica that points the reader at the button which opens the Samples
    // gallery shown in the 005_25 screenshot right below it.
    await renderSvgToPng('005_23_burst-samples-button-dp.svg', '005_23_Quickstart_Samples_Button', 1400);

    // 005_02 (native file picker) and 005_25_split-pdf (Explorer showing the 3 output
    // files) are OS-native; they intentionally keep their existing screenshots — no
    // -dp replica.
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK B — Java/Chocolatey prerequisite screens (DataPallas UI, faked logs)
// ─────────────────────────────────────────────────────────────────────────────
electronBeforeAfterAllTest(
  'Quickstart — prerequisite screens',
  // `beforeAfterEach` runs the harness clean-state + a worker-app boot; we then
  // reboot that SAME single app per prereq state (single-instance lock forbids a
  // 2nd process). The final reboot leaves a healthy Java+Choco app so the next
  // block's beforeAfterEach inherits a burst-enabled window (it reads the LIVE
  // app via Helpers.currentElectronApp).
  async ({ beforeAfterEach: _firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // 000_03 — Java not present → the burst screen's inline "Java not found" block
    // (production: this is what the app shows on boot, no navigation).
    {
      const page = await bootWithPrereqState({ java: false, choco: false });
      // ASSERT the "meat": the Java-not-found prerequisite is actually rendered.
      await new FluentTester(page).elementShouldContainText(
        '#checkPointJavaPreRequisite',
        'as a prerequisite',
      );
      await captureDocsScreenshot(page, dp('000_03_JavaNotPresent'));
    }

    // 000_05 — Chocolatey NOT installed + Java NOT installed → "Install Chocolatey".
    // Reached the production way: click the inline "Install Java" button, which
    // routes to the Install & Setup page (tab-burst.ts:#btnInstallJavaTabBurst).
    {
      const page = await bootWithPrereqState({ java: false, choco: false });
      await new FluentTester(page)
        .click('#btnInstallJavaTabBurst')                        // user clicks "Install Java"
        .waitOnElementToBecomeVisible('#checkPointChocolatey')   // choco prereq present
        .waitOnElementToBecomeVisible('#btnInstallChocolatey');  // "Install Chocolatey" offered
      await captureDocsScreenshot(page, dp('000_05_ChocoNoJavaNo'));
    }

    // 000_08 — Chocolatey installed, Java still missing → "Install Java" offered.
    // Center on the Install Java button so it's in the shot (it sits below the fold).
    {
      const page = await bootWithPrereqState({ java: false, choco: true });
      await new FluentTester(page)
        .click('#btnInstallJavaTabBurst')
        .waitOnElementToBecomeVisible('#checkPointInstallJava')
        .waitOnElementToBecomeVisible('#btnInstallJava');
      await captureDocsScreenshotCenteredOn(page, dp('000_08_ChocoYesJavaNo'), '#btnInstallJava');
    }

    // 000_10 (in-app "Are you sure…?" confirmation) and 000_15 (OS "Command execution
    // completed" info box) are SVG replicas rendered in Block A — those mid-install
    // moments aren't capturable from the DOM without actually running the install.

    // Leave a healthy Java+Choco app so Block C inherits a burst-enabled window.
    await bootWithPrereqState({ java: true, choco: true });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK C — Burst a sample report (Payslips.pdf) — the 005_* flow
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors e2e/specs/features/quick-start.spec.ts: click #burstFile, set the
// upload input directly (bypassing the native picker), #btnBurst → confirm.
electronBeforeAfterAllTest(
  'Quickstart — burst sample Payslips.pdf',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const ft = new FluentTester(firstPage);

    // Java IS installed on the machine, so the Burst UI is enabled — no prereq
    // faking needed here; this is a normal live burst capture.
    const expectedOutputFiles = Constants.PAYSLIPS_PDF_BURST_TOKENS.map(
      (token: string) => `${token}.pdf`,
    );

    // ASSERT the burst screen is actually ready (Select File present). The sidebar
    // stays closed on its own now — doEnsureSidebarOpen() is a no-op in screenshot
    // mode (E2E_SCREENSHOTS), so it never flashes open.
    await ft.waitOnElementToBecomeVisible('#burstFile');

    // 005_00 — app launched, before selecting a file.
    await captureDocsScreenshot(firstPage, dp('005_00_Quickstart_Before_Selecting_File'));

    // 005_02 — the native "select file" picker is OS-native → SVG (Block A TODO).

    const pdfPath = slash(path.resolve(`${process.env.PORTABLE_EXECUTABLE_DIR}/${SAMPLE_PDF}`));

    // Select the sample PDF — type the path into the visible field + set the
    // hidden upload input, exactly like quick-start.spec.ts (bypasses the native picker).
    await ft
      .click('#burstFile')
      .typeText(pdfPath)
      .setInputFiles('#burstFileUploadInput', pdfPath);
    await firstPage.waitForTimeout(800);

    // ASSERT the file actually landed → Burst becomes enabled (the "meat").
    await ft.waitOnElementToBecomeEnabled('#btnBurst');

    // 005_05 — after the file is selected.
    await captureDocsScreenshot(firstPage, dp('005_05_Quickstart_After_File_Selected'));

    // 005_10 — click Burst → in-app confirm dialog visible ("Are you sure…").
    await ft.click('#btnBurst').confirmDialogShouldBeVisible();
    await hideToastsForScreenshots(firstPage);
    await captureDocsScreenshot(firstPage, dp('005_10_Quickstart_Asking_Confirmation_to_Burst'));
    // (000_10 — the generic "Are you sure…?" confirmation — is an SVG replica in
    // Block A; the burst-context capture here was out of context for the doc.)

    // 005_15 — capture the REAL mid-processing state (streaming logs + "Working on
    // Payslips.pdf" banner). We DON'T use waitOnProcessingToStart: the burst is
    // sub-second, so by the time it polls, the `.java-started` banner is already
    // gone and it hangs on the long timeout. Instead we WAIT FOR THE LOG TEXT to
    // land — the Info Log Preview (#infoLog) is fed by the WS tailer — which is both
    // a sufficient "processing happened" signal AND guarantees a non-empty preview.
    // With the tailer at 250ms, the lines arrive while the ~1s burst is still running.
    await ft.clickYesDoThis();
    await firstPage.waitForFunction(
      () => {
        const root = document.getElementById('logsViewerBurstReportsTab');
        const el = root?.querySelector('#infoLog');
        return !!el && (el.textContent || '').trim().length > 0;
      },
      undefined,
      { timeout: Constants.DELAY_TEN_SECONDS, polling: 100 },
    );
    await captureDocsScreenshot(firstPage, dp('005_15_Quickstart_While_Working_On'));

    // 005_20 — wait for completion; ASSERT the 3 outputs were generated and the
    // status bar is green BEFORE capturing the done/statistics view (proven
    // quick-start.spec.ts tail).
    await ft
      .waitOnProcessingToFinish(Constants.CHECK_PROCESSING_LOGS)
      .processingShouldHaveGeneratedOutputFiles(expectedOutputFiles)
      .appStatusShouldBeGreatNoErrorsNoWarnings();
    
    //I actually want the toast here
    //await hideToastsForScreenshots(firstPage);
    await captureDocsScreenshot(firstPage, dp('005_20_Quickstart_Done_Bursting'));

    // 005_30 — "Change the Color Scheme": the burst just finished so the Info Log
    // Preview is full (makes the recoloured screen look alive). Open the theme
    // picker (#btnChangeSkin — top-right swatch), switch to the Retro theme, and
    // ring both the picker trigger and the Retro item. The theme list is an
    // overflow-y-auto dropdown, so the Retro row uses an inset ring. Afterwards
    // restore the original theme so every later shot stays on the default theme.
    const prevTheme = await firstPage.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    await ft
      .hover('#btnChangeSkin')
      .click('#btnChangeSkin')
      .waitOnElementToBecomeVisible('#theme-retro')
      .click('#theme-retro');
    await hideToastsForScreenshots(firstPage);
    await captureDocsScreenshotWithHighlights(firstPage, dp('005_30_Quickstart_Change_Theme'), [
      '#btnChangeSkin',
      { selector: '#theme-retro', inset: true },   // row inside an overflow-y-auto dropdown → inset ring
    ]);
    // Restore the original theme (plain #theme-<name> id) and close the picker.
    if (prevTheme) {
      await ft.click(`#theme-${prevTheme}`);
    }
    await firstPage.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });

    // 005_25 — the Samples page ("More Ideas" in the doc), reached the user way:
    // the "Samples" button on the burst screen.
    await ft.click('#btnBurstSamples').waitOnElementToBecomeVisible('#samplesTable');
    await hideToastsForScreenshots(firstPage);
    await captureDocsScreenshot(firstPage, dp('005_25_Quickstart_View_Samples'));

    // 005_25_split-pdf — Explorer view of the 3 outputs is OS-native; keeps its
    // existing screenshot (no -dp replica).

    // ─────────────────────────────────────────────────────────────────────────
    // 020–023 — "Where things live" orientation shots for the quickstart doc.
    // Each rings (DataPallas-orange) the tab the reader should click + the one
    // control on it that matters, matching the user's annotated references.
    // ─────────────────────────────────────────────────────────────────────────

    // 005_25 navigated to the Samples left-menu page (its own Samples/Logging/
    // License tabset), so the Burst Reports tab is no longer in the DOM. Return to
    // Processing ▸ Burst Reports via the existing gotoBurstScreen() helper (clicks
    // the top-nav "Processing" link #topMenuBurst) before the orientation shots below.
    await ft
      .gotoBurstScreen()
      .waitOnElementToBecomeVisible('#btnClearLogsBurstReportsTab');

    // Clean slate first: clear the burst logs so these orientation shots aren't
    // cluttered by the Payslips run above. #btnClearLogsBurstReportsTab is the
    // <dburst-button-clear-logs> on the Burst Reports tab; it pops the standard
    // "Are you sure" confirm, which we accept with Yes.
    await ft
      .click('#btnClearLogsBurstReportsTab')
      .waitOnConfirmDialogToBecomeVisible()
      .clickYesDoThis()
      .waitOnConfirmDialogToBecomeInvisible();
    await hideToastsForScreenshots(firstPage);

    // 020 — Configuration ▸ "Bursting": on the Burst Reports tab, open the
    // Configuration dropdown (daisyUI dropdown opens on hover/focus/click), then
    // ring the Burst Reports tab button + the "Bursting" fallback config item.
    await ft.click('#tab-btn-burstTab');
    await ft
      .hover('#topMenuConfiguration')
      .click('#topMenuConfiguration')
      .waitOnElementToBecomeVisible('#topMenuConfigBursting');
    await captureDocsScreenshotWithHighlights(firstPage, dp('020_config-bursting'), [
      { selector: '#tab-btn-burstTab', inset: true },   // tab flush under the sticky header → inset ring
      '#topMenuConfigBursting',
    ]);
    // Close the Configuration dropdown the same way the app does — closeDropdown()
    // blurs the active element, since the daisyUI menu is held open by
    // :focus-within and the dropdown trigger keeps focus after a Playwright click.
    // Without this its overlay intercepts the next tab's click. Then refresh state.
    await firstPage.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await ft.gotoBurstScreen();

    // 021 — Configuration ▸ "Reports, Connections & Cubes": go to Generate
    // Reports, open the Configuration dropdown, ring that tab + #topConfigurationCrud.
    await ft.click('#tab-btn-reportGenerationMailMergeTab');
    await ft
      .hover('#topMenuConfiguration')
      .click('#topMenuConfiguration')
      .waitOnElementToBecomeVisible('#topConfigurationCrud');
    await captureDocsScreenshotWithHighlights(firstPage, dp('021_config-reports-connections-cubes'), [
      { selector: '#tab-btn-reportGenerationMailMergeTab', inset: true },   // tab flush under the sticky header → inset ring
      '#topConfigurationCrud',
    ]);
    // Same as 020: blur to close the Configuration dropdown (its overlay would
    // otherwise intercept the next tab's click), then refresh state.
    await firstPage.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await ft.gotoBurstScreen();

    // 022 — Explore Data & Build Dashboards: click that tab, ring the tab button,
    // the app name, and the action button. The Explore Data tab renders the
    // `flowkraft-data-canvas` app card (sanitizeAppId is whitespace-strip only, so
    // the id is unchanged). In e2e the app is STOPPED, so the action button is
    // `#btnStartStop_flowkraft-data-canvas` ("Start") and Launch is disabled — we
    // pass both action selectors and the helper rings whichever is present.
    await ft
      .click('#tab-btn-cmsWebPortalTab')
      .waitOnElementToBecomeVisible('#appName_flowkraft-data-canvas');
    await captureDocsScreenshotWithHighlights(firstPage, dp('022_explore-data-dashboards'), [
      { selector: '#tab-btn-cmsWebPortalTab', inset: true },   // tab flush under the sticky header → inset ring
      '#appName_flowkraft-data-canvas',
      '#btnLaunch_flowkraft-data-canvas',
      '#btnStartStop_flowkraft-data-canvas',
      { selector: '#dashboardsTable', inset: true },   // table reaches the viewport bottom → inset ring (SalesDashboard, SalesPivotTable)
    ]);
    await ft.gotoBurstScreen();

    // 023 — Customer Portal: click that tab, ring the tab button, the Grails app
    // name, and the action button. The Customer Portal tab renders the
    // `flowkraft-grails` app card; STOPPED in e2e → ring the "Start" button.
    await ft
      .click('#tab-btn-customerPortalTab')
      .waitOnElementToBecomeVisible('#appName_flowkraft-grails');
    await captureDocsScreenshotWithHighlights(firstPage, dp('023_customer-portal'), [
      { selector: '#tab-btn-customerPortalTab', inset: true },   // tab flush under the sticky header → inset ring
      '#appName_flowkraft-grails',
      '#btnLaunch_flowkraft-grails',
      '#btnStartStop_flowkraft-grails',
    ]);
    await ft.gotoBurstScreen();
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// QUICKSTART2 — the data & dashboards quickstart (feeds the 0000-quickstart2
// Remotion video + docs/quickstart.mdx + docs/advanced/work-well-apps.mdx)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Two blocks, both titled "Quickstart2 — …" so a single grep targets ONLY these
// (without dragging in the "Quickstart — …" bursting blocks above):
//
//   E2E_GREP="Quickstart2"
//
//   BLOCK D — Docker, Apps & DB Server Packs   (cheap: navigation-only captures)
//   BLOCK E — PostgreSQL start & connection     (heavy: really starts Postgres,
//                                                creates + tests a live connection,
//                                                nuclear `docker compose down -v`
//                                                in finally)
//
// Output dir: DOCS_IMAGES_DIR, `q2_*-dp.png` naming — same home + `-dp` convention
// as every other quickstart shot, so the PNGs serve the two docs pages AND get
// copied into the video's asset folder (…/cli-remotion/public/assets/rb/
// 0000-quickstart2/) the same way the 000_*/005_*/020-023 shots feed 0000-quickstart.
// ═══════════════════════════════════════════════════════════════════════════════

// PostgreSQL Northwind starter pack (starter-packs.service.ts): id
// 'db-northwind-postgres' → card #starterPack_db-northwind-postgres, Start/Stop
// button #btnStartStop_db-northwind-postgres.
const PG_PACK_CARD = '#starterPack_db-northwind-postgres';
const PG_PACK_BTN = '#btnStartStop_db-northwind-postgres';

// Live connection the video creates against the running Postgres pack. kebabCase
// ("Northwind") + "-postgres" → db-northwind-postgres (matches connections.spec.ts
// + learn.screens.ts BLOCK 2). The Connections-list row id appends `.xml`.
const PG_CONN_NAME = 'Northwind';
const PG_CONN_CODE = 'db-northwind-postgres';

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK D — Docker, Apps & DB Server Packs (navigation-only, nothing started)
// ─────────────────────────────────────────────────────────────────────────────
electronBeforeAfterAllTest(
  'Quickstart2 — Docker, Apps & DB Server Packs',
  async ({ beforeAfterEach: _firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // The Extra Utilities (extraPackagesTab) content is gated on
    // `chocolatey.isChocoOk` (extra-packages.template.ts). Boot with Java+Choco
    // present — the file's own faked-log idiom — so the Docker package card
    // renders deterministically regardless of the machine's real choco state.
    const page = await bootWithPrereqState({ java: true, choco: true });
    const ft = new FluentTester(page);

    // ── q2_021 — Processing ▸ the "Explore Data & Build Dashboards" tab open, with
    // the "Explore More Apps That Go Well Together with DataPallas" button. Ring the
    // active tab title + that button (the entry point to Apps / Starter Packs / Docker).
    await ft
      .gotoBurstScreen()
      .waitOnElementToBecomeVisible('#tab-btn-cmsWebPortalTab')
      .click('#tab-btn-cmsWebPortalTab')
      .waitOnElementToBecomeVisible('#btnExploreCmsWebPortalApps');
    await hideToastsForScreenshots(page);
    await captureDocsScreenshotWithHighlights(page, dp('q2_021_explore-more-apps-button'), [
      { selector: '#tab-btn-cmsWebPortalTab', inset: true },   // active Explore Data tab title
      '#btnExploreCmsWebPortalApps',
    ]);

    // ── q2_023 — Start the dashboard app. Still on the Explore Data tab; ring the
    // tab title, the app title, the "Our App" badge, and the Start button so the
    // reader sees exactly where it lives and how to launch it.
    await ft.waitOnElementToBecomeVisible('#appName_flowkraft-data-canvas');
    await hideToastsForScreenshots(page);
    await captureDocsScreenshotWithHighlights(page, dp('q2_023_start-explore-data-app'), [
      { selector: '#tab-btn-cmsWebPortalTab', inset: true },   // tab flush under the sticky header → inset ring
      '#appName_flowkraft-data-canvas',
      '#appSourceBadge_flowkraft-data-canvas',
      '#btnStartStop_flowkraft-data-canvas',
    ]);

    // ── q2_022 — the Apps / Starter Packs / Docker · Extra Utilities tabs (reached
    // by that button). Click it, then ring all three sub-tabs so the reader sees
    // everything lives in one place.
    await ft
      .click('#btnExploreCmsWebPortalApps')
      .waitOnElementToBecomeVisible('#tab-btn-appsTab');
    await hideToastsForScreenshots(page);
    await captureDocsScreenshotWithHighlights(page, dp('q2_022_apps-starter-packs-docker-tabs'), [
      { selector: '#tab-btn-appsTab', inset: true },
      { selector: '#tab-btn-starterPacksTab', inset: true },
      { selector: '#tab-btn-extraPackagesTab', inset: true },
    ]);

    // ── q2_031 — Apps ▸ an "Our App" card (the badge reads "Our App"). Surface a
    // single DataPallas-built app by searching, then ring its card so the reader
    // sees which tab Apps live in + a representative Our-App entry. Athena's
    // narration enumerates the rest (Explore Data, Grails, Backend, Next.js, WebPortal).
    await ft
      .gotoApps()
      .waitOnElementToBecomeVisible('#appSearch')
      .setValue('#appSearch', 'Explore Data')
      .sleep(600)
      .waitOnElementToBecomeVisible('#appName_flowkraft-data-canvas')
      .elementShouldContainText('#appName_flowkraft-data-canvas', 'Explore Data');
    await hideToastsForScreenshots(page);
    await captureDocsScreenshotWithHighlights(page, dp('q2_031_apps-our-app'), [
      '#tab-btn-appsTab',                                          // active Help-area tab: outer ring (has headroom above)
      '#appSearch',
      { selector: '#appPanel_flowkraft-data-canvas', inset: true }, // full-width card → inset so all four sides survive the crop
    ]);

    // ── q2_032 — Apps ▸ a "3rd Party" card. Search for Rundeck — a DIFFERENT 3rd-party
    // app than the CloudBeaver demo that follows — then ring the full card + the
    // "3rd Party" badge so viewers learn to spot 3rd-party apps.
    await ft
      .setValue('#appSearch', 'Rundeck')
      .sleep(600)
      .waitOnElementToBecomeVisible('#appName_rundeck')
      .elementShouldContainText('#appName_rundeck', 'Rundeck');
    await hideToastsForScreenshots(page);
    await captureDocsScreenshotWithHighlights(page, dp('q2_032_apps-third-party'), [
      '#tab-btn-appsTab',
      '#appSearch',
      { selector: '#appPanel_rundeck', inset: true },
      '#appSourceBadge_rundeck',   // the "3rd Party" badge — so viewers learn to spot 3rd-party apps
    ]);
    // Clear the search so it doesn't bleed into the next tab's state.
    await ft.setValue('#appSearch', '').sleep(400);

    // ── q2_030 — Docker / Extra Utilities ("how to install Docker"). This frame
    // must show the NOT-INSTALLED state (the "Install Now" button), but the e2e
    // machine normally has Docker installed/running (Block E needs it), so the
    // card would otherwise render "already installed ✓ / Uninstall Now". Rather
    // than actually uninstall Docker (slow, reboot-prone, destructive), we present
    // the not-installed card with a NON-DESTRUCTIVE DOM swap — the docs-screenshot
    // injection technique used elsewhere (cubes.screens.ts). The card-body (name,
    // website, `choco install docker-desktop --yes`) is identical in both states,
    // so we only rebuild the card-title header to the template's not-installed
    // branch (website link · "not installed" · primary "Install Now" button —
    // verbatim from extra-packages.template.ts + en.json). Real Docker is untouched.
    await ft
      .click('#tab-btn-extraPackagesTab')
      .waitOnElementToBecomeVisible('#package-docker-desktop');
    await page.evaluate(() => {
      // ID-only selection (semantic IDs added to extra-packages.template.ts).
      // We own both the app and the test, so these IDs are guaranteed — `!` asserts
      // that; a missing one throws loudly instead of faking a bad screenshot.
      const card = document.getElementById('extraPackageCard-docker-desktop')!;
      const h3 = document.getElementById('extraPackageHeader-docker-desktop')!;
      // If Docker really is not installed, the Install button is already there.
      if (document.getElementById('btnInstallPackage-docker-desktop')) return;
      h3.innerHTML =
        '<a href="https://www.docker.com/products/docker-desktop/" target="_blank">https://www.docker.com/products/docker-desktop/</a>' +
        '      ' +
        '<em id="extraPackageStatus-docker-desktop">not installed</em>  ' +
        '<button id="btnInstallPackage-docker-desktop" type="button" ' +
        'class="btn btn-outline btn-primary btn-xs align-middle">Install Now</button>';
      // Not-installed cards use the plain border, not the primary one.
      card.classList.remove('border-primary');
      card.classList.add('card-border');
    });
    await hideToastsForScreenshots(page);
    await captureDocsScreenshotWithHighlights(page, dp('q2_030_docker-extra-utilities'), [
      { selector: '#tab-btn-extraPackagesTab', inset: true },   // the Docker / Extra Utilities sub-tab title
      { selector: '#package-docker-desktop', inset: true },
      '#btnInstallPackage-docker-desktop',   // present after the not-installed DOM swap
    ]);

    // ── q2_033 — DB Server Packs grid. Switch to the Starter Packs tab and capture
    // the full list (all 10 Northwind/Redis/TimescaleDB packs + their tags) — the
    // "enumerate the other available DB starter packs" frame. No search, so every
    // pack shows; ring the tab + search box for orientation.
    await ft
      .click('#tab-btn-starterPacksTab')
      .waitOnElementToBecomeVisible('#packSearch');
    await hideToastsForScreenshots(page);
    await captureDocsScreenshotWithHighlights(page, dp('q2_033_db-starter-packs'), [
      '#tab-btn-starterPacksTab',
      '#packSearch',
    ]);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK E — PostgreSQL start & connection (REALLY starts Postgres — needs Docker)
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors learn.screens.ts BLOCK 2 (the proven postgres flow) but captures the
// transient "Starting" pack state mid-flight (algo-trading.screens.ts pattern)
// and targets the 0000-quickstart2 frames. The connection is created, tested
// (real schema auto-discovery), then deleted; `docker compose down -v` in the
// finally guarantees Postgres can never be left running after this spec.
electronBeforeAfterAllTest(
  'Quickstart2 — PostgreSQL start & connection',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let ft = new FluentTester(firstPage);

    try {
      // Block E really starts a Postgres container — fail fast + loud if Docker is
      // down instead of hanging until the multi-thousand-second timeout.
      DockerTestHelper.assertDockerRunning('Quickstart2 — PostgreSQL start & connection');

      // ── Navigate to Starter Packs ONCE and filter to the Postgres pack. (Doing
      // a second gotoStarterPacks() later would wait on #appSearch — the Apps-tab
      // input, which is hidden once the Starter Packs tab is active — so we keep a
      // single navigation and operate on the visible pack button directly.)
      await ft
        .gotoStarterPacks()
        .setValue('#packSearch', 'postgres')
        .sleep(400)
        .waitOnElementToBecomeVisible(PG_PACK_BTN)
        .waitOnElementToBecomeEnabled(PG_PACK_BTN);

      // ── Baseline: if a prior interrupted run left Postgres running, stop it
      // first — by clicking the visible button (no re-navigation) — so the
      // Start→Starting→running capture below is deterministic. Clean state means
      // this is usually a no-op (button already reads "Start").
      const pgBtnText = (
        (await firstPage.locator(PG_PACK_BTN).textContent({ timeout: 5_000 }).catch(() => '')) || ''
      )
        .toLowerCase()
        .trim();
      if (pgBtnText.includes('stop') && !pgBtnText.includes('start')) {
        await ft
          .click(PG_PACK_BTN)
          .confirmDialogShouldBeVisible()
          .clickYesDoThis()
          .waitOnElementToHaveText(PG_PACK_BTN, 'Start', Constants.DELAY_FIVE_THOUSANDS_SECONDS)
          .waitOnElementToBecomeEnabled(PG_PACK_BTN, Constants.DELAY_FIVE_THOUSANDS_SECONDS);
      }

      // ── q2_035 — Start Postgres and capture it once RUNNING. Click Start, confirm,
      // wait through the transient "Starting" state until the pack is running (button
      // re-enables and reads "Stop"), then capture the started card.
      await ft
        .elementShouldContainText(PG_PACK_BTN, 'Start')
        .click(PG_PACK_BTN)
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToHaveText(PG_PACK_BTN, 'Starting', Constants.DELAY_FIVE_THOUSANDS_SECONDS)
        .waitOnElementToBecomeEnabled(PG_PACK_BTN, Constants.DELAY_FIVE_THOUSANDS_SECONDS)
        .waitOnElementToHaveText(PG_PACK_BTN, 'Stop', Constants.DELAY_FIVE_THOUSANDS_SECONDS);
      await hideToastsForScreenshots(firstPage);
      await captureDocsScreenshotWithHighlights(firstPage, dp('q2_035_postgres-pack-running'), [
        { selector: PG_PACK_CARD, inset: true },
      ]);

      // ── Open New Database Connection and fill Postgres/"Northwind" details (modal
      // stays open, not yet saved) — exactly the connections.spec / learn.screens flow.
      await ft
        .gotoConnections()
        .waitOnElementToBecomeEnabled('#btnNewDropdown')
        .click('#btnNewDropdown')
        .waitOnElementToBecomeVisible('#btnNewDatabase')
        .click('#btnNewDatabase')
        .waitOnElementToBecomeVisible('#modalDbConnection')
        .waitOnElementToBecomeEnabled('#dbConnectionName');
      ft = ConnectionsTestHelper.fillNewDatabaseConnectionDetails(ft, PG_CONN_NAME, 'postgres');
      await ft.waitOnElementToBecomeEnabled('#btnTestDbConnection');
      await hideToastsForScreenshots(firstPage);

      // ── q2_036 — Connection Details filled, Test Connection ringed — the
      // "making a real connection to Postgres" frame.
      await captureDocsScreenshotWithHighlights(firstPage, dp('q2_036_postgres-connection-details'), [
        // w-full button → inset so all four ring sides survive the container edges
        { selector: '#btnTestDbConnection', inset: true },
      ]);

      // ── Test Connection → schema auto-discovery. Server-vendor dance mirrors
      // connections.spec.ts / learn.screens.ts: starting Postgres produced log
      // output, so the first Test click pops the info dialog + clear-logs step; a
      // second click then asks to save (which runs the test against the live DB).
      await ft
        .click('#btnTestDbConnection')
        .infoDialogShouldBeVisible()
        .clickYesDoThis()
        .click('#btnClearLogsDbConnection')
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled('#btnClearLogsDbConnection')
        .waitOnElementToBecomeVisible('#btnGreatNoErrorsNoWarnings')
        .appStatusShouldBeGreatNoErrorsNoWarnings()
        .click('#btnTestDbConnection')
        .waitOnElementToContainText(
          '#confirmDialog .modal-box',
          'The connection must be saved before being able to test it. Save now?',
        )
        .clickYesDoThis()
        .waitOnElementToHaveClass('#btnTestDbConnectionIcon', 'animate-spin')
        .waitOnElementNotToHaveClass('#btnTestDbConnectionIcon', 'animate-spin');

      // ── q2_037 — Database Schema tab: the Northwind tables DataPallas
      // auto-discovered from the live Postgres connection (proves it's real).
      await ft
        .click('#tab-btn-databaseSchemaTab')
        .waitOnElementToBecomeVisible('#databaseSchemaPicklistContainer');
      await hideToastsForScreenshots(firstPage);
      await captureDocsScreenshotWithHighlights(firstPage, dp('q2_037_postgres-schema-discovered'), [
        { selector: '#tab-btn-databaseSchemaTab', inset: true },
      ]);

      // Close the Create Database Connection modal BEFORE the graceful stop. The
      // stop navigates to Starter Packs, and an OPEN modal's overlay blocks that
      // navigation — leaving the test hung (and flickering) on the schema tab.
      await ft
        .click('#btnCloseDbConnectionModal')
        .waitOnElementToBecomeInvisible('#btnCloseDbConnectionModal');

      // ── Teardown (happy path): stop the Postgres pack the user way — its Stop
      // button — so nothing is left running. The nuclear `docker compose down -v`
      // in the finally below ALWAYS runs too, as the guaranteed safety net (the
      // same belt-and-suspenders pattern as connections.spec.ts).
      ft = ConnectionsTestHelper.setStarterPackStateForVendor(ft, 'postgres', 'stop');
      await ft;
    } finally {
      // ── CLEANUP: close the modal, delete the connection, then nuke the Postgres
      // container + volumes so the next run starts clean (same guaranteed teardown
      // learn.screens.ts BLOCK 2 uses for server-based vendors).
      try {
        const modalCloseBtn = firstPage.locator('#btnCloseDbConnectionModal');
        if (await modalCloseBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await modalCloseBtn.click();
          await firstPage
            .locator('#btnCloseDbConnectionModal')
            .waitFor({ state: 'hidden', timeout: 5_000 })
            .catch(() => {});
        }
      } catch (e) {
        console.error('[CLEANUP] Failed to close modal:', e);
      }

      try {
        await ConnectionsTestHelper.deleteAndAssertDatabaseConnection(
          new FluentTester(firstPage),
          `${PG_CONN_CODE}\\.xml`,
          'postgres',
        );
      } catch (e) {
        console.error('[CLEANUP] Failed to delete connection:', e);
      }

      // NUCLEAR STOP — runs on the happy path OR any exception above. `docker
      // compose down -v` in the db/ folder force-removes the Postgres container +
      // volumes, so Postgres can never be left running after this spec. Synchronous.
      try {
        ConnectionsTestHelper.dockerComposeDownInDbFolder();
      } catch (e) {
        console.error('[CLEANUP] Nuclear docker compose down failed:', e);
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK F — Customer Portal (Grails app): start it, then the live portal + admin
// ─────────────────────────────────────────────────────────────────────────────
// REALLY starts the flowkraft-grails app (needs Docker). Shows how to reach + start
// it in the Electron UI, then captures the live portal (/portal/invoices) and admin
// (/admin/invoices) pages in an external Edge browser. Leak-safe: graceful stopApp
// on the happy path + nuclear `docker compose down -v` (KEEPING the image, so a
// re-run doesn't rebuild) in finally — same belt-and-suspenders as Block E.
electronBeforeAfterAllTest(
  'Quickstart2 — Customer Portal (Grails app)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const ft = new FluentTester(firstPage);
    const GRAILS_APP = 'flowkraft-grails';
    const GRAILS_STACK = 'flowkraft/grails-playground';
    const PORTAL = SelfServicePortalsTestHelper.GRAILS_BASE_URL; // http://localhost:8400
    let browser: Browser | undefined;

    try {
      // Really boots the Grails container — fail fast + loud if Docker is down.
      DockerTestHelper.assertDockerRunning('Quickstart2 — Customer Portal (Grails app)');

      // ── q2_050 — Customer Portal tab (app STOPPED). Ring the tab title, the app
      // title, the "Our App" badge, and the Start button.
      await ft
        .gotoBurstScreen()
        .waitOnElementToBecomeVisible('#tab-btn-customerPortalTab')
        .click('#tab-btn-customerPortalTab')
        .waitOnElementToBecomeVisible('#appName_flowkraft-grails');
      await hideToastsForScreenshots(firstPage);
      await captureDocsScreenshotWithHighlights(firstPage, dp('q2_050_customer-portal-tab'), [
        { selector: '#tab-btn-customerPortalTab', inset: true },   // tab flush under the sticky header → inset ring
        '#appName_flowkraft-grails',
        '#appSourceBadge_flowkraft-grails',
        '#btnStartStop_flowkraft-grails',
      ]);

      // ── Start the Grails app the user way (leak-safe; really boots the container).
      await SelfServicePortalsTestHelper.startApp(ft, GRAILS_APP);

      // ── q2_051 — app RUNNING. Open the Launch dropdown, ring the Launch button +
      // the "Customer Portal Area" link (the way to open the live portal).
      await ft
        .click('#btnLaunch_flowkraft-grails')
        .waitOnElementToBecomeVisible('#launchLink_flowkraft-grails_0');
      await hideToastsForScreenshots(firstPage);
      await captureDocsScreenshotWithHighlights(firstPage, dp('q2_051_launch-customer-portal'), [
        { selector: '#btnLaunch_flowkraft-grails', inset: true },   // ring inset so the open dropdown (z-index 9999) can't hide its top edge
        '#launchLink_flowkraft-grails_0',
      ]);

      // ── External Edge browser: wait for the live portal HTTP server to be ready
      // (the app reports "running" before Grails has finished booting).
      const ext = await SelfServicePortalsTestHelper.createExternalBrowser(false, {
        viewport: { width: 1500, height: 1000 },
      });
      browser = ext.browser;
      const web = ext.page;
      await SelfServicePortalsTestHelper.waitForServerReady(web, `${PORTAL}/portal/invoices`);

      // ── q2_052 — /portal/invoices: ring ONLY the Admin menu link (how to reach admin).
      await web.goto(`${PORTAL}/portal/invoices`, { waitUntil: 'networkidle' });
      await web.waitForSelector('#portalNavAdmin', { timeout: 15_000 });
      await captureDocsScreenshotWithHighlights(web, dp('q2_052_portal-invoices-admin-link'), [
        '#portalNavAdmin',
      ]);

      // ── q2_053 — /admin/invoices: open the theme switcher + HOVER the Corporate
      // theme (do NOT click it), and ring the "New" button, the theme toggle, and
      // the Corporate option (shows people themes + manual invoice creation).
      await web.goto(`${PORTAL}/admin/invoices`, { waitUntil: 'networkidle' });
      await web.waitForSelector('#btn-new-invoice', { timeout: 15_000 });
      await web.click('#btnChangeSkin');                                   // open the theme dropdown
      await web.waitForSelector('#theme-corporate', { state: 'visible', timeout: 5_000 });
      await web.hover('#theme-corporate');                                 // hover only — no click
      await captureDocsScreenshotWithHighlights(web, dp('q2_053_admin-invoices-new-and-theme'), [
        '#btn-new-invoice',
        '#btnChangeSkin',
        '#theme-corporate',
      ]);

      await SelfServicePortalsTestHelper.closeExternalBrowser(browser);
      browser = undefined;

      // ── Teardown (happy path): stop the Grails app the user way (its Stop button).
      await SelfServicePortalsTestHelper.stopApp(ft, GRAILS_APP);
    } finally {
      // Close the external browser if an error left it open.
      if (browser) {
        try {
          await SelfServicePortalsTestHelper.closeExternalBrowser(browser);
        } catch (e) {
          console.error('[CLEANUP] Failed to close external browser:', e);
        }
      }
      // NUCLEAR STOP — ALWAYS runs, the guaranteed safety net: force-remove the
      // Grails container + volumes (keeping the image so re-runs don't rebuild).
      try {
        SelfServicePortalsTestHelper.dockerComposeDownKeepImage(GRAILS_STACK);
      } catch (e) {
        console.error('[CLEANUP] Nuclear grails docker compose down failed:', e);
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK G — CloudBeaver (3rd-party app): the single "starting" frame
// ─────────────────────────────────────────────────────────────────────────────
// REALLY starts the cloudbeaver app (needs Docker; the dbeaver/cloudbeaver image is
// pre-pulled) and captures ONE frame in the "starting" state — ringing the
// "3rd Party" badge (so viewers learn how to spot a 3rd-party app), the app title,
// and Launch. Leak-safe: waits for running, graceful stopApp, then nuclear
// `docker compose down -v` (keeping the image) in finally.
electronBeforeAfterAllTest(
  'Quickstart2 — CloudBeaver (3rd-party app)',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    let ft = new FluentTester(firstPage);
    const CB_APP = 'cloudbeaver';
    const cbBtn = '#btnStartStop_cloudbeaver';
    const cbState = '#appState_cloudbeaver';

    try {
      // Really boots the CloudBeaver container — fail fast + loud if Docker is down.
      DockerTestHelper.assertDockerRunning('Quickstart2 — CloudBeaver (3rd-party app)');

      // Find CloudBeaver in the Apps list, press Start, and let it enter the
      // "starting" state — that transient frame is exactly what we capture.
      await ft
        .gotoApps()
        .waitOnElementToBecomeVisible('#appSearch')
        .setValue('#appSearch', 'CloudBeaver')
        .sleep(600)
        .waitOnElementToBecomeVisible('#appName_cloudbeaver')
        .elementShouldContainText('#appName_cloudbeaver', 'CloudBeaver')
        .waitOnElementToBecomeEnabled(cbBtn)
        .click(cbBtn)
        .confirmDialogShouldBeVisible()
        .clickYesDoThis()
        .waitOnElementToBecomeDisabled(cbBtn)
        .waitOnElementToContainText(cbState, 'starting', Constants.DELAY_FIVE_THOUSANDS_SECONDS);

      // ── q2_038 — CloudBeaver "starting". Ring the app title, the "3rd Party" badge
      // (how to identify a 3rd-party app), and Launch.
      await hideToastsForScreenshots(firstPage);
      await captureDocsScreenshotWithHighlights(firstPage, dp('q2_038_cloudbeaver-starting'), [
        '#appName_cloudbeaver',
        '#appSourceBadge_cloudbeaver',
        '#btnLaunch_cloudbeaver',
      ]);

      // Let CloudBeaver finish starting, then stop it the user way (its Stop button).
      await ft
        .waitOnElementToBecomeEnabled(cbBtn, Constants.DELAY_FIVE_THOUSANDS_SECONDS)
        .waitOnElementToContainText(cbState, 'running', Constants.DELAY_FIVE_THOUSANDS_SECONDS);
      ft = SelfServicePortalsTestHelper.stopApp(ft, CB_APP);
      await ft;
    } finally {
      // NUCLEAR STOP — ALWAYS runs, the guaranteed safety net: force-remove the
      // CloudBeaver container + volumes (keeping the image so re-runs don't rebuild).
      try {
        SelfServicePortalsTestHelper.dockerComposeDownKeepImage(CB_APP);
      } catch (e) {
        console.error('[CLEANUP] Nuclear cloudbeaver docker compose down failed:', e);
      }
    }
  },
);
