export class Constants {
  // Linux CI caps (plan §4 D0). Only asbl/ci/dp-ci.sh sets these variables; unset (Windows, Electron,
  // local runs) every delay below keeps its own value.
  //   E2E_MAX_TEST_MS — ceiling for the long whole-test budgets and the helper defaults built on them
  //   E2E_MAX_WAIT_MS — ceiling for each single wait FluentTester hands to Playwright
  static capLong(ms: number): number {
    const max = Number(process.env.E2E_MAX_TEST_MS);
    return max > 0 ? Math.min(ms, max) : ms;
  }

  static capWait(ms?: number): number | undefined {
    const max = Number(process.env.E2E_MAX_WAIT_MS);
    return ms !== undefined && max > 0 ? Math.min(ms, max) : ms;
  }

  static DELAY_ONE_SECOND = 1000;
  static DELAY_HALF_SECOND = Constants.DELAY_ONE_SECOND / 2;

  static DELAY_TEN_SECONDS = 10 * Constants.DELAY_ONE_SECOND;
  // How long the per-test fixture waits for the status bar to report a clean app before it stops waiting and
  // reads the logs instead. The log sizes reach the bar over the stats websocket, so a second or two is the
  // normal case and a minute is far past it. Waiting longer cannot help: while either log file has content the
  // green button does not render at all, so more time only turns a readable failure into a test timeout.
  static DELAY_SIXTY_SECONDS = 60 * Constants.DELAY_ONE_SECOND;
  static DELAY_HUNDRED_MILISECONDS = 100;
  static DELAY_HUNDRED_SECONDS = 100 * Constants.DELAY_ONE_SECOND;

  static DELAY_FIVE_THOUSANDS_SECONDS = Constants.capLong(5000 * Constants.DELAY_ONE_SECOND);
  static DELAY_FIVE_HUNDRED_SECONDS = 500 * Constants.DELAY_ONE_SECOND;
  static DELAY_THOUSAND_SECONDS = Constants.capLong(1000 * Constants.DELAY_ONE_SECOND);

  static STATUS_GREAT_NO_ERRORS_NO_WARNINGS = 'great-no-errors-no-warning';
  static STATUS_WARNINGS = 'warnings';
  static STATUS_ERRORS = 'errors';

  static BTN_CONFIRM_SELECTOR = '.dburst-button-question-confirm';
  static BTN_DECLINE_SELECTOR = '.dburst-button-question-decline';

  static CHECK_PROCESSING_JAVA = 'check-java';
  static CHECK_PROCESSING_STATUS_BAR = 'check-status-bar';
  static CHECK_PROCESSING_LOGS = 'check-logs';

  static ATTACHMENTS_CLEAR = 'attachments-clear';
  static ATTACHMENTS_ADD_AND_ZIP = 'attachments-add-and-zip';
  static ATTACHMENTS_DEFAULT = 'attachments-default';
  static ATTACHMENTS_XLS_ONLY = 'attachments-xls-only';
  static ATTACHMENTS_PDF_AND_XLS = 'attachments-pdf-and-xls';

  static QA_TA = 'qa-ta';
  static QA_TL = 'qa-tl';
  static QA_TR = 'qa-tr';

  static PROC_BURST = 'proc-burst';
  static PROC_GENERATE = 'proc-generate';

  static SMS_DEFAULT = 'sms-default';
  static SMS_TWILIO = 'sms-twilio';

  static PAYSLIPS_PDF_BURST_TOKENS = [
    'clyde.grew@northridgehealth.org',
    'kyle.butford@northridgehealth.org',
    'alfreda.waldback@northridgehealth.org',
  ];

  static PAYSLIPS_XLS_BURST_TOKENS = [
    'awaldback@northridgehealth.org',
    'cgrew@northridgehealth.org',
    'kbutford@northridgehealth.org',
  ];

  static INPUT_FILE_PAYSLIPS_PDF: 'Payslips.pdf';
  static INPUT_FILE_CUSTOMERS_PAYSLIPS_DISTINCT_SHEETS_XLS =
    'Payslips-Distinct-Sheets.xls';
  static INPUT_FILE_CUSTOMERS_DISTINCT_COLUMN_VALUES_XLS =
    'Customers-Distinct-Column-Values.xls';

  static TEST_LICENSE_KEY =
    process.env.TEST_LICENSE_KEY || '12345678909876543210123456789';
}
