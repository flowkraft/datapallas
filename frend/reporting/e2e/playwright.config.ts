// Screenshot/docs generators are named *.screens.ts, so functional runs (which
// match *.spec.ts) never pick them up. E2E_SCREENSHOTS=1 flips testMatch to run
// ONLY the *.screens.ts set. E2E_GREP narrows within either mode by test title.
// E2E_SPEC restricts the run to spec files whose path matches the given regex
// (e.g. a file name), running ALL tests in those files regardless of title.
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
      slowMo: 750,
    },
    trace: 'on',
  },
  expect: {
    toMatchSnapshot: { threshold: 0.2 },
  },
  // Give failing tests 3 retry attempts
  retries: 1,
  //retries: 2,
  //retries: 3,
  //retries: 0,
  // Limit the number of workers on CI, use default locally
  workers: 1,
};

module.exports = config;
