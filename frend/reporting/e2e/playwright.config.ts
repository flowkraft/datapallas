// Screenshot/docs generators are named *.screens.ts, so functional runs (which
// match *.spec.ts) never pick them up. E2E_SCREENSHOTS=1 flips testMatch to run
// ONLY the *.screens.ts set. E2E_GREP narrows within either mode by test title.
// E2E_SPEC restricts the run to spec files whose path matches the given regex
// (e.g. a file name), running ALL tests in those files regardless of title.
// The day that seeds the specs' daily vendor rotation, fixed once per run. Workers re-load the spec files
// and inherit this env: without it a run that crosses midnight (UTC) gives the workers other titles than
// the runner listed, and those tests fail as "Test not found in the worker process".
if (!process.env.E2E_ROTATION_DATE) process.env.E2E_ROTATION_DATE = new Date().toISOString().split('T')[0];

const SCREENSHOTS = !!process.env.E2E_SCREENSHOTS;
const DEFAULT_TEST_MATCH = SCREENSHOTS ? '**/*.screens.ts' : '**/*.spec.ts';

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: '.',
  testMatch: process.env.E2E_SPEC
    ? new RegExp(process.env.E2E_SPEC)
    : DEFAULT_TEST_MATCH,
  grep: process.env.E2E_GREP ? new RegExp(process.env.E2E_GREP) : undefined,
  timeout: 180000,
  use: {
    headless: false,
    viewport: { width: 1400, height: 1000 },
    launchOptions: {
      // No pause after actions — the same on every OS and target: Electron runs never got launchOptions, so the
      // Electron runs had no slowMo anyway, and the 750 ms here slowed only the web runs (about 2/3 of their time).
      // Owner decision 2026-09-15 (plan §3 O16). Set E2E_SLOW_MO=750 (ms) to watch a web run in slow motion.
      slowMo: Number(process.env.E2E_SLOW_MO) || 0,
      // Linux CI (asbl/ci/dp-ci.sh, plan §4 D2): the Chromium of the Windows-tested engine (Electron's)
      // instead of Playwright's bundled one; unset = Playwright's bundled Chromium, as before.
      ...(process.env.E2E_CHROMIUM_EXECUTABLE ? { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE } : {}),
    },
    trace: 'on',
    // Linux CI (asbl/ci/dp-ci.sh, plan §4 D0): a click or fill gives up after E2E_ACTION_TIMEOUT_MS
    // instead of retrying until the test timeout; unset = 0 = no action timeout, as before.
    actionTimeout: Number(process.env.E2E_ACTION_TIMEOUT_MS) || 0,
  },
  expect: {
    toMatchSnapshot: { threshold: 0.2 },
  },
  // Give failing tests 3 retry attempts
  //retries: 2,
  //retries: 2,
  //retries: 3,
  // Linux CI (asbl/ci/dp-ci.sh): E2E_RETRIES (2 on a full run); unset = 0, as before
  retries: Number(process.env.E2E_RETRIES) || 0,
  // Linux CI (asbl/ci/dp-ci.sh): E2E_JSON_REPORT also writes every result, with its errors and attachment paths,
  // to that file; unset = Playwright's default reporter, as before.
  ...(process.env.E2E_JSON_REPORT
    ? { reporter: [['list'], ['json', { outputFile: process.env.E2E_JSON_REPORT }]] }
    : {}),
  // E2E_REPEAT_EACH=3 proves a flaky test fixed (plan §4 D0); unset = 1, as before
  repeatEach: Number(process.env.E2E_REPEAT_EACH) || 1,
  // Limit the number of workers on CI, use default locally
  workers: 1,
};

module.exports = config;
