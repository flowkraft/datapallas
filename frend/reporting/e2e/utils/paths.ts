const path = require('path');

import { APP_CONFIG } from '../../src/environments/environment';

export const CONFIG_PATH = APP_CONFIG.folders.config;
export const LOGS_PATH = APP_CONFIG.folders.logs;
export const TEMP_PATH = APP_CONFIG.folders.temp;
export const QUARANTINE_PATH = APP_CONFIG.folders.quarantine;

export const E2E_RESOURCES_PATH = 'e2e/_resources';
export const E2E_SAMPLE_PAYSLIPS_PATH =
  E2E_RESOURCES_PATH + '/samples/burst/Payslips.pdf';

export const BKEND_REPORTING_FOLDER_PATH = '../../bkend/reporting';

export const E2E_ASSEMBLY_EXTERNAL_RESOURCES_FOLDER_PATH =
  '../../asbl/src/main/external-resources';

export const E2E_ASSEMBLY_FOLDER_PATH =
  '../../asbl/target/package/verified-db-noexe';

export const SETTINGS_CONFIG_FILE = 'settings\\.xml';

export const EML_CONTACT_FILE = 'eml-contact\\.xml';

export const TEST_CONFIG_FILE = 'test\\.xml';

export const EXECUTABLE_DIR_PATH = path.resolve(
  process.env.PORTABLE_EXECUTABLE_DIR,
);

/**
 * E2E_MODE - what the specs run against:
 *   dev (the default)    the build tree; each test's clean state comes from verified-db-noexe.
 *   production-packaged  a shipped zip, unzipped and started as a user starts it; each test's clean state comes from
 *                        E2E_PRISTINE_INSTALL_DIR, an untouched copy of that installation taken right after the unzip.
 * e.g. E2E_MODE=production-packaged PORTABLE_EXECUTABLE_DIR=C:/dp-ci/installed/DataPallas
 *      E2E_PRISTINE_INSTALL_DIR=C:/dp-ci/pristine/DataPallas
 */
export type E2eMode = 'dev' | 'production-packaged';

export function e2eMode(env: NodeJS.ProcessEnv = process.env): E2eMode {
  const mode = env.E2E_MODE || 'dev';
  if (mode !== 'dev' && mode !== 'production-packaged')
    throw new Error(`E2E_MODE=${mode}: expected dev or production-packaged`);
  return mode;
}
