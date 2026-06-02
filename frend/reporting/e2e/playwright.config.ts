/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: '.',
  testMatch: '**/*.spec.ts',
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
  //retries: 1,
  retries: 2,
  //retries: 3,
  //retries: 0,
  // Limit the number of workers on CI, use default locally
  workers: 1,
};

module.exports = config;
