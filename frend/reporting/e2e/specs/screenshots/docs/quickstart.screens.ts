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

import { test, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as jetpack from 'fs-jetpack';
import sharp from 'sharp';
const slash = require('slash');

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { Helpers } from '../../../utils/helpers';
import { FluentTester } from '../../../helpers/fluent-tester';
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
