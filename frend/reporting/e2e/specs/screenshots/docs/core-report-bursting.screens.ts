// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS — core processing docs  (report-bursting.mdx + report-distribution-qa.mdx)
// ═══════════════════════════════════════════════════════════════════════════════
//
// App-driven shots for the core processing docs pages — "Report Bursting"
// (report-bursting.mdx, + the 0005-reportbursting video) and "Report Distribution /
// QA" (report-distribution-qa.mdx) — captured as `<orig>-dp.png` into DOCS_IMAGES_DIR
// (…/reportburster.com/public/images/docs/). Three independent blocks:
//   • BLOCK 1 — report-bursting.mdx (Excel + merge + custom burst filename)
//   • BLOCK 2 — report-distribution-qa.mdx (QA + settings)
//   • BLOCK 3 — configuration.mdx (Advanced tab, Email Message, New/Duplicate modals, config dropdown)
//
// This lives in its OWN spec file (not quickstart.screens.ts) on purpose: it gets a
// fresh Electron app, so it starts cleanly on the Burst screen with no tab state
// inherited from the quickstart-video blocks (which end on the Customer Portal tab).
//
// NOT reproduced here (no DataPallas app UI — kept as their existing screenshots):
//   • PDF burst-token document content (035_00/05)
//   • OS-native output / file-picker listings (035_15/20/45/60)
//   • Excel document content (035_65/70/75)
// The 005_05 "after file selected" shot is produced by quickstart.screens.ts BLOCK C
// (it is shared with quickstart.mdx) — report-bursting.mdx reuses that -dp.
//
// Shot → state:
//   025_07 — Burst screen with Invoices-Oct.pdf selected (ready)
//   035_30 — Excel "distinct sheets" sample selected (ready)
//   035_35 — the burst confirmation dialog
//   035_40 — after bursting the distinct-sheets .xls (done)
//   035_50 — Excel "distinct column values" sample selected (ready)
//   035_55 — after bursting the distinct-column-values .xls (done)
//   035_10 — Configuration → General Settings, custom Burst File Name (Invoice-…)
//   035_25 — the Merge screen with three invoices queued to merge
//
// HOW TO RUN (only this block): E2E_SPEC="core-report-bursting.screens.ts"
// E2E_GREP="Core Report Bursting".

import { test, Page } from '@playwright/test';
import * as path from 'path';
const slash = require('slash');

import { electronBeforeAfterAllTest } from '../../../utils/common-setup';
import { Constants } from '../../../utils/constants';
import { FluentTester } from '../../../helpers/fluent-tester';
import { ConfTemplatesTestHelper } from '../../../helpers/areas/conf-templates-test-helper';
import {
  captureDocsScreenshot,
  captureDocsScreenshotWithHighlights,
  hideToastsForScreenshots,
} from '../../../utils/docs-screenshot-helper';

// Every shot is saved next to its original as `<name>-dp.png` (same convention as
// quickstart.screens.ts / reporting.screens.ts).
const dp = (base: string) => `${base}-dp.png`;

// Open the Processing sidebar ONLY if it is currently closed. #btnToggleSidebar is a
// TOGGLE (flips the `sidebar-visible` class on <html>), and doEnsureSidebarOpen() is
// a no-op in screenshot mode — plus the shared Electron app carries the sidebar's
// open/closed state across blocks. A blind toggle can therefore CLOSE an already-open
// sidebar, leaving the target #leftMenu* item behind the main content (which then
// intercepts the click). Open conditionally, then let the slide-open animation settle.
async function ensureSidebarOpen(page: Page): Promise<void> {
  const isOpen = await page.evaluate(() =>
    document.documentElement.classList.contains('sidebar-visible'),
  );
  if (!isOpen) {
    await new FluentTester(page).click('#btnToggleSidebar');
  }
  await page.waitForTimeout(500);
}

electronBeforeAfterAllTest(
  'Core Report Bursting — report-bursting.mdx Excel + merge',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const abs = (rel: string) =>
      slash(path.resolve(`${process.env.PORTABLE_EXECUTABLE_DIR}/${rel}`));

    const oct = abs('samples/burst/Invoices-Oct.pdf');

    // Explicitly select the Burst Reports tab, like a user, before capturing. The
    // fixture already lands on the burst screen in a fresh app, but selecting the tab
    // is the correct, defensive thing to do — #burstFile stays in the DOM even when
    // its tab panel is inactive, so relying on it alone can capture the wrong tab.
    // Selecting a file is done via setInputFiles on the hidden upload input:
    // onBurstFileSelected sets inputFileName to the file's clean name and enables
    // #btnBurst, and it replaces cleanly across samples — so we never leave the burst
    // screen between the .pdf/.xls captures.
    await new FluentTester(firstPage)
      .click('#tab-btn-burstTab')
      .waitOnElementToBecomeVisible('#burstFile');
    await hideToastsForScreenshots(firstPage);

    // ── PDF — Invoices-Oct.pdf selected (025_07); captured first, logs still clean ──
    await new FluentTester(firstPage)
      .setInputFiles('#burstFileUploadInput', oct)
      .waitOnElementToBecomeEnabled('#btnBurst');
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('025_07_variables_invoice-pdf'));

    // ── Excel — Burst by Distinct Sheets (035_30/35/40) via the SAMPLES flow ──
    // The legacy shots come from Samples → Try It (not manual file selection): the
    // "Try It" confirmation ("OK and I'll click Burst…") then the burst. Same flow
    // as samples.spec.ts (02_excel_distinct_sheets_split_only). #btnBurstSamples opens
    // the Samples page (screenshot-mode safe, unlike the collapsed-sidebar #leftMenuSamples).
    await new FluentTester(firstPage)
      .click('#btnBurstSamples')
      .waitOnElementToBecomeVisible('#samplesTable')
      .scrollIntoViewIfNeeded('#trEXCEL-DISTINCT-SHEETS-SPLIT-ONLY')
      .waitOnElementToContainText('#tdEXCEL-DISTINCT-SHEETS-SPLIT-ONLY', 'Monthly Payslips Excel')
      .click('#trEXCEL-DISTINCT-SHEETS-SPLIT-ONLY');
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    // 035_30 — the distinct-sheets sample SELECTED in the gallery (input + expected output).
    await captureDocsScreenshot(firstPage, dp('035_30_payslips-distinct-sheets-xls-tryit'));

    // 035_35 — the "Try It" confirmation dialog ("… OK and I'll click Burst …").
    await new FluentTester(firstPage)
      .click('#btnSampleTryItEXCEL-DISTINCT-SHEETS-SPLIT-ONLY')
      .waitOnConfirmDialogToBecomeVisible();
    await firstPage.waitForTimeout(300);
    await captureDocsScreenshot(firstPage, dp('035_35_payslips-distinct-sheets-xls-confirm'));

    // 035_40 — after "OK and I'll click Burst": the Burst screen with the sample file
    // loaded, ready to burst. The legacy shows this PRE-burst state (file loaded, clean
    // logs), NOT the result — so we capture before clicking Burst and do not run it.
    await new FluentTester(firstPage)
      .clickYesDoThis()
      .waitOnElementToBecomeVisible('#burstFile')
      .waitOnElementToBecomeEnabled('#btnBurst');
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('035_40_payslips-distinct-sheets-xls-burst'));

    // ── Excel — Burst by Distinct Column Values (035_50/55) via the SAMPLES flow ──
    // 035_50 — after clicking "Try It" for this sample: the "OK and I'll click Burst"
    //          confirmation dialog over the Samples gallery.
    await new FluentTester(firstPage)
      .click('#btnBurstSamples')
      .waitOnElementToBecomeVisible('#samplesTable')
      .scrollIntoViewIfNeeded('#trEXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY')
      .waitOnElementToContainText('#tdEXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY', 'Customer List/Country Excel')
      .click('#trEXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY')
      .click('#btnSampleTryItEXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY')
      .waitOnConfirmDialogToBecomeVisible();
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(300);
    await captureDocsScreenshot(firstPage, dp('035_50_burst-distinct-column-values-excel'));

    // 035_55 — "OK and I'll click Burst" → the Burst screen with the sample file loaded,
    // ready to burst (PRE-burst, matching the legacy).
    await new FluentTester(firstPage)
      .clickYesDoThis()
      .waitOnElementToBecomeVisible('#burstFile')
      .waitOnElementToBecomeEnabled('#btnBurst');
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('035_55_burst-distinct-column-values-excel-burst'));

    // ── Configuration → General Settings, custom Burst File Name (035_10) ────
    // The doc shows a descriptive name (Invoice-…) rather than the default. Set it
    // for the shot, capture, then restore the default so the shared default burst
    // config isn't left mutated. Values are single-quoted → the ${…} are literal
    // FreeMarker tokens, not JS interpolation. This nav uses the config editor's own
    // (always-visible) left menu, so it is screenshot-mode safe.
    const DEFAULT_BURST_FILENAME = '${burst_token}.${output_type_extension}';
    const CUSTOM_BURST_FILENAME = 'Invoice-${burst_token}.${output_type_extension}';
    await new FluentTester(firstPage)
      .gotoConfigurationGeneralSettings()
      .waitOnElementToBecomeVisible('#burstFileName')
      .setValue('#burstFileName', CUSTOM_BURST_FILENAME)
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    // Ring the Burst File Name INPUT box (not the label).
    await captureDocsScreenshotWithHighlights(firstPage, dp('035_10_invoices-pdf-custom-burst-filename'), [
      { selector: '#burstFileName', inset: true },
    ]);
    await new FluentTester(firstPage)
      .setValue('#burstFileName', DEFAULT_BURST_FILENAME)
      .sleep(Constants.DELAY_ONE_SECOND);

    // ── PDF — Merge three quarterly invoices (035_25) ────────────────────────
    // The Merge screen lives in the Processing left sidebar, which stays COLLAPSED
    // in screenshot mode (#leftMenu* are zero-size). So — same proven pattern as
    // quickstart's QA nav — navigate to Processing, open the sidebar via
    // #btnToggleSidebar to reach #leftMenuMergeBurst, then land on the merge screen.
    await new FluentTester(firstPage).gotoBurstScreen();
    await ensureSidebarOpen(firstPage);
    await new FluentTester(firstPage)
      .waitOnElementToBecomeVisible('#leftMenuMergeBurst')
      .click('#leftMenuMergeBurst')
      .waitOnElementToBecomeVisible('#mergedFileName')
      .setInputFiles('#mergeFilesUploadInput', oct)
      .setInputFiles('#mergeFilesUploadInput', abs('samples/burst/Invoices-Nov.pdf'))
      .setInputFiles('#mergeFilesUploadInput', abs('samples/burst/Invoices-Dec.pdf'))
      // Match the legacy shot: descriptive merged name + "Burst Merged File" checked.
      .setValue('#mergedFileName', 'Invoices-Quarter.pdf')
      .click('#btnBurstMergedFile')
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshotWithHighlights(firstPage, dp('035_25_invoices-quarter-merge-burst'), [
      { selector: '#mergedFileName', inset: true },
    ]);

    console.log('[DONE] report-bursting.mdx Excel + merge screenshots captured.');
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 2 — report-distribution-qa.mdx  (QA + settings)
// ─────────────────────────────────────────────────────────────────────────────
// App-driven QA / settings shots as `<orig>-dp.png`. NOT reproduced here: the
// MailHog inbox shots (020_10/15/20) — they need the Test Email Server running +
// an external :8025 browser with real sent emails (a heavier flow), so they keep
// their existing screenshots.
//
// The QA screen is reached the way a user would: select a file on the Burst screen,
// then click the "Run Quality Assurance" (#goToQa) button in the QA reminder — no
// sidebar needed. Config settings load their own always-visible config left menu.
//
// Shot → state:
//   020_00 — Burst screen, Payslips.pdf selected, QA reminder expanded (Run QA button)
//   020_05 — QA screen, "Test 2 random burst tokens" selected + the "Start Test Email Server?" dialog
//   020_35 — Configuration → General Settings, the Quarantine Folder ringed
//   020_25 — Configuration → Error Handling settings (retry policy, under Advanced)
//   020_30 — Configuration → Enable/Disable Distribution, "Send documents by Email" checked + "Quarantine documents" ringed
electronBeforeAfterAllTest(
  'Core Report Bursting — report-distribution-qa.mdx QA + settings',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    const qaPdf = slash(
      path.resolve(`${process.env.PORTABLE_EXECUTABLE_DIR}/samples/burst/Payslips.pdf`),
    );

    // ── 020_00 — Burst screen: Payslips.pdf selected, the QA reminder expanded
    // ("Did you run Quality Assurance…?" + the "Run Quality Assurance" button). The
    // reminder is a collapsed <details> — click its summary (#qaReminderLink) to
    // reveal the #goToQa button, matching the legacy shot.
    await new FluentTester(firstPage)
      .click('#tab-btn-burstTab')
      .waitOnElementToBecomeVisible('#burstFile')
      .setInputFiles('#burstFileUploadInput', qaPdf)
      .waitOnElementToBecomeVisible('#qaReminderLink')
      .click('#qaReminderLink')
      .waitOnElementToBecomeVisible('#goToQa');
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('020_00_did_you_do_qa'));

    // ── 020_05 — Quality Assurance screen (via the "Run Quality Assurance" button):
    // "Test 2 random burst tokens" selected, then the "Start Test Email Server?"
    // confirmation dialog. Dismiss with No afterwards (starting the server needs Docker).
    await new FluentTester(firstPage)
      .click('#goToQa')
      .waitOnElementToBecomeVisible('#testTokensRandom')
      .click('#testTokensRandom')
      .waitOnElementToBecomeVisible('#startTestEmailServer')
      .click('#startTestEmailServer')
      .confirmDialogShouldBeVisible();
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(300);
    await captureDocsScreenshot(firstPage, dp('020_05_qa_start_test_es'));
    await new FluentTester(firstPage).clickNoDontDoThis();

    // ── Configuration → General Settings (quarantine folder) ─────────────────
    await new FluentTester(firstPage)
      .gotoConfigurationGeneralSettings()
      .waitOnElementToBecomeVisible('#quarantineFolder');
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshotWithHighlights(firstPage, dp('020_35_general_settings'), [
      { selector: '#quarantineFolder', inset: true },
    ]);

    // ── Error Handling settings (retry policy) ───────────────────────────────
    // Error Handling lives under the collapsible "Advanced" config submenu — it only
    // renders when openSidebarSection === 'advanced'. Click #leftMenuAdvancedSettings
    // first to expand it, then the nested #leftMenuErrorHandlingSettings appears.
    await new FluentTester(firstPage)
      .click('#leftMenuAdvancedSettings')
      .waitOnElementToBecomeVisible('#leftMenuErrorHandlingSettings')
      .click('#leftMenuErrorHandlingSettings')
      .waitOnElementToBecomeVisible('#retryPolicyDelay');
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('020_25_advanced_error_handling'));

    // ── Enable/Disable Distribution — "Send documents by Email" checked (matches the
    // legacy config state) + "Quarantine documents" ringed. Check email for the shot,
    // then restore the default (unchecked) so the shared config isn't left mutated.
    await new FluentTester(firstPage)
      .click('#leftMenuEnableDisableDistribution')
      .waitOnElementToBecomeVisible('#btnQuarantineDocuments')
      .click('#btnSendDocumentsEmail')
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshotWithHighlights(firstPage, dp('020_30_enable_quarantine'), [
      { selector: '#btnQuarantineDocuments' },
    ]);
    await new FluentTester(firstPage)
      .click('#btnSendDocumentsEmail')
      .sleep(Constants.DELAY_ONE_SECOND);

    console.log('[DONE] report-distribution-qa.mdx QA + settings screenshots captured.');
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 3 — configuration.mdx (config screens the other docs blocks don't cover)
// ═══════════════════════════════════════════════════════════════════════════════
// Selectors mirror the working functional spec configuration.spec.ts and its helpers
// (configuration-test-helper.ts / conf-templates-test-helper.ts) — if any of these
// nav paths break, that is a real regression in the configuration area.
//
// Shot → state:  (all driven on a REAL, temporary "Invoices" report so the shots match
// the legacy composition — "Configuration (Invoices)", "Update Report", "Duplicating
// 'Invoices'", the Invoices row selected — then the report is deleted at the end.)
//   020_35 — General Settings, clean (no highlight; all settings equally important)
//   030_06 — General Settings, custom Burst File Name "invoice-${var0}.pdf" (ringed)
//   020_22 — Advanced tab (delay, # user variables, delimiters)
//   030_08 — Email → Email Message tab (Subject + Message filled like the legacy)
//   010_00 — Enable/Disable Delivery, "Send by Email" checked, clean (no highlight)
//   030_05 — Reports, Connections & Cubes → Reports → the Invoices report selected
//   030_00 — Update Report modal (config How-To-Use path ringed)
//   030_10 — Duplicate report modal (title + Duplicate button ringed)
electronBeforeAfterAllTest(
  'Core Report Bursting — configuration.mdx config screens',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Create a real (temporary) "Invoices" report — every shot below is driven on it so
    // the top-nav/sidebar read "Invoices" and the modals name it, exactly like the legacy
    // screenshots. It is deleted at the very end. This is the same create flow as the
    // working configuration.spec.ts (ConfTemplatesTestHelper.createNewTemplate).
    await ConfTemplatesTestHelper.createNewTemplate(new FluentTester(firstPage), 'Invoices');

    // ── 020_35 (clean) — General Settings, no highlight (all settings equally important).
    // createNewTemplate leaves us on the Invoices report's General Settings.
    await new FluentTester(firstPage).waitOnElementToBecomeVisible('#burstFileName');
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('020_35_general_settings_clean'));

    // ── 030_06 — custom Burst File Name "invoice-${var0}.pdf", ringed (as in the legacy).
    await new FluentTester(firstPage)
      .setValue('#burstFileName', 'invoice-${var0}.pdf')
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshotWithHighlights(firstPage, dp('030_06_configuration-invoices-burst-file-name'), [
      { selector: '#burstFileName', inset: true },
    ]);

    // ── 020_22 — Advanced tab (delay / # user variables / burst-token delimiters).
    await new FluentTester(firstPage)
      .click('#leftMenuAdvancedSettings')
      .waitOnElementToBecomeVisible('#numberOfUserVariables');
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('020_22_advanced_settings'));

    // ── 030_08 — Email → Email Message tab, Subject + Message filled like the legacy.
    await new FluentTester(firstPage)
      .click('#leftMenuEmailSettings')
      .waitOnElementToBecomeVisible('#tab-btn-emailMessageTab')
      .click('#tab-btn-emailMessageTab')
      .waitOnElementToBecomeVisible('#emailToAddress')
      .setValue('#emailSubject', 'Invoice ${var0}')
      .setQuillContent(
        '#wysiwygEmailMessage',
        'Dear Customer,\n\nAttached you find the invoice for our services.\n\nJane Doe,\n\nHead of Finance\nNorthridge Pharmaceuticals',
      )
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('030_08_configuration-invoices-email'));

    // ── 010_00 (clean) — Enable/Disable Delivery, "Send by Email" checked, no highlight.
    await new FluentTester(firstPage)
      .click('#leftMenuEnableDisableDistribution')
      .waitOnElementToBecomeVisible('#btnSendDocumentsEmail')
      .click('#btnSendDocumentsEmail')
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('010_00_enablesendbyemail'));

    // ── 030_05 — Reports, Connections & Cubes → Reports (left menu) → the Invoices report
    // row selected (clicked at capture time).
    await new FluentTester(firstPage)
      .gotoConfigurationReports()
      .clickAndSelectTableRow('#invoices_settings\\.xml')
      .waitOnElementToHaveClass('#invoices_settings\\.xml', 'info', Constants.DELAY_FIVE_THOUSANDS_SECONDS);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('030_05_configuration-invoices'));

    // ── 030_00 — Update Report modal for the selected Invoices report (config How-To-Use
    // path ringed). #btnClose only hides the modal — no changes are saved.
    await new FluentTester(firstPage)
      .waitOnElementToBecomeEnabled('#btnEdit')
      .click('#btnEdit')
      .waitOnElementToBecomeVisible('#templateHowTo');
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshotWithHighlights(firstPage, dp('030_00_configuration-template-create'), [
      { selector: '#templateHowTo', inset: true },
    ]);
    await new FluentTester(firstPage).click('#btnClose');

    // ── 030_10 — "Duplicate" modal for the Invoices report (title "…Duplicating 'Invoices'…"
    // + the Duplicate button both ringed). Cancel afterwards — nothing is duplicated.
    await new FluentTester(firstPage)
      .clickAndSelectTableRow('#invoices_settings\\.xml')
      .waitOnElementToBecomeEnabled('#btnDuplicate')
      .click('#btnDuplicate')
      .waitOnElementToBecomeVisible('#btnCapReportDistribution');
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    // #btnDuplicate sits at the right edge — an OUTSIDE ring clips its right vertical
    // line, so ring it INSET (drawn inside the button bounds → all 4 sides visible).
    await captureDocsScreenshotWithHighlights(firstPage, dp('030_10_configuration-duplicate'), [
      { selector: '.dp-dialog-box h3' },
      { selector: '#btnDuplicate', inset: true },
    ]);
    await new FluentTester(firstPage).click('#btnClose');

    // ── Cleanup — delete the temporary Invoices report so re-runs stay idempotent.
    await ConfTemplatesTestHelper.deleteTemplate(new FluentTester(firstPage), 'invoices');

    console.log('[DONE] configuration.mdx config screens captured.');
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 4 — variables.mdx (variables interpolation/templating screens)
// ═══════════════════════════════════════════════════════════════════════════════
// Driven on a temporary "Invoices" report (created → shot → deleted), reusing the
// variables flow proven by the functional spec variables.spec.ts (#btnBurstFileNameVariables
// → #modalSelectVariable → variable rows → #btnClose). Document-content / Excel / OS-native
// composite shots (025_10, 025_25) are NOT reproduced here — kept as-is. 025_05 / 025_15 /
// 025_00 / 025_20 are hand-drawn daisyUI-dark SVGs (focused field/expansion illustrations),
// NOT captured here.
//
// Shot → state:
//   025_01 — the "Select Variable" modal (built-in + user variables list, Show More)
//   025_04 — Upload → FTP tab, Command using ${extracted_file_path} (ringed)
//   025_22 — Email → Email Message, Subject + Message using ${var0}/${var1}/${var2}
electronBeforeAfterAllTest(
  'Core Report Bursting — variables.mdx variables screens',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    // Temporary "Invoices" report so the shots read "Configuration (Invoices)" like the
    // legacy; deleted at the end (same pattern as BLOCK 3, via ConfTemplatesTestHelper).
    await ConfTemplatesTestHelper.createNewTemplate(new FluentTester(firstPage), 'Invoices');

    // ── 025_01 — the "Select Variable" modal (opened from the Burst File Name Variables
    // button). Click "Show More" so the full built-in + user-variable list is visible.
    await new FluentTester(firstPage)
      .waitOnElementToBecomeVisible('#burstFileName')
      .click('#btnBurstFileNameVariables')
      .waitOnElementToBecomeVisible('#modalSelectVariable')
      .click('#btnShowMoreVariables')
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('025_01_variables_modal'));
    await new FluentTester(firstPage).click('#btnClose');

    // ── 025_04 — Upload → FTP tab, Command using the ${extracted_file_path} variable (ringed).
    await new FluentTester(firstPage)
      .click('#leftMenuUploadSettings')
      .waitOnElementToBecomeVisible('#tab-btn-ftpTab')
      .click('#tab-btn-ftpTab')
      .waitOnElementToBecomeVisible('#ftpCommand')
      .setValue('#ftpCommand', '--ftp-create-dirs -T ${extracted_file_path} -u user:password ftp://ftp.example.com/reports/')
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshotWithHighlights(firstPage, dp('025_04_variables_upload_settings'), [
      { selector: '#ftpCommand', inset: true },
    ]);

    // ── 025_22 — Email → Email Message, Subject + Message using user variables.
    await new FluentTester(firstPage)
      .click('#leftMenuEmailSettings')
      .waitOnElementToBecomeVisible('#tab-btn-emailMessageTab')
      .click('#tab-btn-emailMessageTab')
      .waitOnElementToBecomeVisible('#emailToAddress')
      .setValue('#emailSubject', 'Invoice for the month of ${var1}')
      .setQuillContent(
        '#wysiwygEmailMessage',
        'Hi ${var0},\n\nAttached you can find the invoice for the month of ${var1}.\n\nThank you,\n${var2}',
      )
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('025_22_custom_email_messages_user-variables'));

    // ── Cleanup — delete the temporary Invoices report so re-runs stay idempotent.
    await ConfTemplatesTestHelper.deleteTemplate(new FluentTester(firstPage), 'invoices');

    console.log('[DONE] variables.mdx variables screens captured.');
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 5 — report-distribution-email.mdx (Email connection + message)
// ═══════════════════════════════════════════════════════════════════════════════
// Temp "Invoices" report (create → shot → delete).
//   010_00 — Enable/Disable Delivery, "Send documents by Email" checked + RINGED (email
//            doc's own version; configuration.mdx keeps the clean 010_00_enablesendbyemail-dp)
//   010_05 — Email → Connection Settings (manual SMTP mode, default values)
//   010_10 — Email → Email Message (Subject + Message, payslip example)
electronBeforeAfterAllTest(
  'Core Report Bursting — report-distribution-email.mdx email screens',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    await ConfTemplatesTestHelper.createNewTemplate(new FluentTester(firstPage), 'Invoices');

    // ── 010_00 (email-highlighted) — Enable/Disable Delivery, "Send documents by Email"
    // checked and ringed (this doc is about email). Separate file from config's clean one.
    await new FluentTester(firstPage)
      .click('#leftMenuEnableDisableDistribution')
      .waitOnElementToBecomeVisible('#btnSendDocumentsEmail')
      .click('#btnSendDocumentsEmail')
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshotWithHighlights(firstPage, dp('010_00_enablesendbyemail_highlighted'), [
      { selector: '#btnSendDocumentsEmail' },
    ]);

    // ── 010_05 — Email → Connection Settings. Uncheck "Re-use existing email connection"
    // so the manual SMTP fields (with their default values) show, matching the legacy.
    await new FluentTester(firstPage)
      .click('#leftMenuEmailSettings')
      .waitOnElementToBecomeVisible('#btnUseExistingEmailConnection')
      .click('#btnUseExistingEmailConnection')
      .waitOnElementToBecomeVisible('#fromName');
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('010_05_emailconnection'));

    // ── 010_10 — Email → Email Message, Subject + Message like the legacy payslip example.
    await new FluentTester(firstPage)
      .click('#tab-btn-emailMessageTab')
      .waitOnElementToBecomeVisible('#emailToAddress')
      .setValue('#emailSubject', 'Paycheck for July')
      .setQuillContent(
        '#wysiwygEmailMessage',
        'Good morning ${var0},\n\nAttached you find your payslip for the month of July.\n\nHR Department',
      )
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('010_10_emailmessage'));

    await ConfTemplatesTestHelper.deleteTemplate(new FluentTester(firstPage), 'invoices');
    console.log('[DONE] report-distribution-email.mdx email screens captured.');
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 6 — report-distribution-upload.mdx (Output Folder + Upload targets)
// ═══════════════════════════════════════════════════════════════════════════════
// Temp "Invoices" report (create → shot → delete). 040_00 (default General Settings) is
// REUSED from the clean 020_35_general_settings_clean-dp (BLOCK 3).
//   040_02 — General Settings, custom quarter-based Output Folder
//   040_10 — Upload → FTP tab, example cURL command
//   040_05 — Upload → Cloud Upload tab (S3 / Azure / Google / Dropbox / …)
electronBeforeAfterAllTest(
  'Core Report Bursting — report-distribution-upload.mdx upload screens',
  async ({ beforeAfterEach: firstPage }) => {
    test.setTimeout(Constants.DELAY_FIVE_THOUSANDS_SECONDS);

    await ConfTemplatesTestHelper.createNewTemplate(new FluentTester(firstPage), 'Invoices');

    // ── 040_02 — General Settings with a custom "financial reports by quarter" Output Folder.
    await new FluentTester(firstPage)
      .waitOnElementToBecomeVisible('#outputFolder')
      .setValue('#outputFolder', 'Financials/${now?string["yyyy"]}/Q${now?string["q"]}/${input_document_name}')
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshotWithHighlights(firstPage, dp('040_02_output-folder-financial-reports-by-quarter-configuration'), [
      { selector: '#outputFolder', inset: true },
    ]);

    // ── 040_10 — Upload → FTP tab, example cURL command (clean, no highlight).
    await new FluentTester(firstPage)
      .click('#leftMenuUploadSettings')
      .waitOnElementToBecomeVisible('#tab-btn-ftpTab')
      .click('#tab-btn-ftpTab')
      .waitOnElementToBecomeVisible('#ftpCommand')
      .setValue('#ftpCommand', '--ftp-create-dirs -T ${extracted_file_path} -u user:password ftp://ftp.example.com/reports/')
      .sleep(Constants.DELAY_ONE_SECOND);
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('040_10_upload-reports-ftp-example'));

    // ── 040_05 — Upload → Cloud Upload tab (the cloud-provider grid).
    await new FluentTester(firstPage)
      .click('#tab-btn-cloudUploadTab')
      .waitOnElementToBecomeVisible('#cloudUploadCommand');
    await hideToastsForScreenshots(firstPage);
    await firstPage.waitForTimeout(400);
    await captureDocsScreenshot(firstPage, dp('040_05_upload-reports-ftp-ssh-cloud-s3'));

    await ConfTemplatesTestHelper.deleteTemplate(new FluentTester(firstPage), 'invoices');
    console.log('[DONE] report-distribution-upload.mdx upload screens captured.');
  },
);
