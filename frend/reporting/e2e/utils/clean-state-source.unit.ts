// Fast checks of E2E_MODE and the clean-state restore on temp folders: no app, no server, no browser.
// Named *.unit.ts so the sets (*.spec.ts) never pick it up; run it alone (paths.ts needs PORTABLE_EXECUTABLE_DIR set,
// the tests point it at their own temp folders):
//   cd frend/reporting && PORTABLE_EXECUTABLE_DIR=. E2E_SPEC='clean-state-source\.unit\.ts' \
//     npx playwright test --config e2e/playwright.config.ts
import { test, expect } from '@playwright/test';
import * as jetpack from 'fs-jetpack';
import * as os from 'os';
import * as path from 'path';

import * as PATHS from './paths';
import { Helpers } from './helpers';

const ENV_NAMES = ['E2E_MODE', 'E2E_PRISTINE_INSTALL_DIR', 'PORTABLE_EXECUTABLE_DIR', 'E2E_CLEAN_STATE_ATTEMPTS', 'E2E_LICENSE_INSTANCE_ID'];
let savedEnv: Record<string, string | undefined>;
let tempFolder: string;

test.beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  tempFolder = jetpack.tmpDir({ basePath: os.tmpdir(), prefix: 'clean-state-source-' }).cwd();
});

test.afterEach(() => {
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  jetpack.remove(tempFolder);
});

/** A shipped installation as it is right after the unzip. */
function writeShippedInstall(folder: string, { withLauncherScript }: { withLauncherScript: boolean }) {
  jetpack.write(`${folder}/config/burst/settings.xml`, '<settings>shipped</settings>');
  jetpack.write(`${folder}/config/_defaults/settings.xml`, '<settings>defaults</settings>');
  jetpack.write(`${folder}/config/_defaults/reporting.xml`, '<reporting>defaults</reporting>');
  jetpack.write(`${folder}/config/_internal/settings.xml`, '<settings><showsamples>false</showsamples></settings>');
  jetpack.write(`${folder}/config/_internal/license.xml`, '<license>\n</license>');
  jetpack.write(`${folder}/samples/reports/payslips/payslips-template.docx`, 'docx');
  jetpack.write(`${folder}/samples/reports/payslips/payslips-template.html`, 'html');
  jetpack.dir(`${folder}/output`);
  jetpack.dir(`${folder}/temp`);
  if (withLauncherScript) jetpack.write(`${folder}/datapallas.bat`, '@echo shipped launcher');
}

test('E2E_MODE is dev by default, accepts production-packaged and rejects anything else', () => {
  expect(PATHS.e2eMode({})).toBe('dev');
  expect(PATHS.e2eMode({ E2E_MODE: 'dev' })).toBe('dev');
  expect(PATHS.e2eMode({ E2E_MODE: 'production-packaged' })).toBe('production-packaged');
  expect(() => PATHS.e2eMode({ E2E_MODE: 'full' })).toThrow('E2E_MODE=full: expected dev or production-packaged');
});

test('dev mode reads the clean state from verified-db-noexe and the e2e default datapallas.bat, as before', async () => {
  expect(PATHS.E2E_ASSEMBLY_FOLDER_PATH).toBe('../../asbl/target/package/verified-db-noexe');

  const source = await Helpers.cleanStateSource({});

  expect(path.resolve(source.installFolder)).toBe(path.resolve(PATHS.E2E_ASSEMBLY_FOLDER_PATH, 'DataPallas'));
  expect(source.launcherScript).toBe('e2e/_resources/java-versions/documentburster-java-default.bat');
});

test('production-packaged mode without E2E_PRISTINE_INSTALL_DIR fails with a clear message', async () => {
  await expect(Helpers.cleanStateSource({ E2E_MODE: 'production-packaged' })).rejects.toThrow(
    'E2E_MODE=production-packaged needs E2E_PRISTINE_INSTALL_DIR',
  );
});

test('production-packaged restore brings the installation back to the pristine copy', async () => {
  const installed = `${tempFolder}/installed/DataPallas`;
  const pristine = `${tempFolder}/pristine/DataPallas`;
  writeShippedInstall(installed, { withLauncherScript: true });
  jetpack.copy(installed, pristine);

  // what earlier tests leave behind
  jetpack.write(`${installed}/config/burst/settings.xml`, '<settings>changed by a test</settings>');
  jetpack.write(`${installed}/config/reports/my-report/settings.xml`, '<settings>added by a test</settings>');
  jetpack.write(`${installed}/config/_internal/iam.db`, 'held open by the server');
  jetpack.write(`${installed}/datapallas.bat`, '@echo changed by a test');
  jetpack.write(`${installed}/output/burst-result.pdf`, 'pdf');
  jetpack.write(`${installed}/temp/work.tmp`, 'tmp');

  Object.assign(process.env, {
    E2E_MODE: 'production-packaged',
    E2E_PRISTINE_INSTALL_DIR: pristine,
    PORTABLE_EXECUTABLE_DIR: installed,
    E2E_CLEAN_STATE_ATTEMPTS: '1',
    E2E_LICENSE_INSTANCE_ID: 'ci-instance',
  });
  await Helpers.restoreDocumentBursterCleanState(false);

  expect(jetpack.read(`${installed}/config/burst/settings.xml`)).toBe('<settings>shipped</settings>');
  expect(jetpack.exists(`${installed}/config/reports`)).toBe(false);
  expect(jetpack.read(`${installed}/config/_defaults/reporting.xml`)).toBe('<reporting>defaults</reporting>');
  expect(jetpack.read(`${installed}/config/_internal/iam.db`)).toBe('held open by the server');
  expect(jetpack.read(`${installed}/datapallas.bat`)).toBe('@echo shipped launcher');
  expect(jetpack.list(`${installed}/output`)).toEqual([]);
  expect(jetpack.list(`${installed}/temp`)).toEqual([]);
  // as in dev: the samples shown and the CI licence instance id written
  expect(jetpack.read(`${installed}/config/_internal/settings.xml`)).toContain('<showsamples>true</showsamples>');
  expect(jetpack.read(`${installed}/config/_internal/license.xml`)).toContain('<instanceid>ci-instance</instanceid>');
  // the pristine copy itself stays untouched
  expect(jetpack.read(`${pristine}/config/_internal/settings.xml`)).toContain('<showsamples>false</showsamples>');

  await Helpers.setupConfigurationTemplate('My-Report', 'docx');
  expect(jetpack.read(`${installed}/config/reports/my-report/reporting.xml`)).toBe('<reporting>defaults</reporting>');
});

test('production-packaged restore of the Docker server zip leaves datapallas.bat alone (the zip has none)', async () => {
  const installed = `${tempFolder}/installed/DataPallas`;
  const pristine = `${tempFolder}/pristine/DataPallas`;
  writeShippedInstall(installed, { withLauncherScript: false });
  jetpack.copy(installed, pristine);

  Object.assign(process.env, {
    E2E_MODE: 'production-packaged',
    E2E_PRISTINE_INSTALL_DIR: pristine,
    PORTABLE_EXECUTABLE_DIR: installed,
    E2E_CLEAN_STATE_ATTEMPTS: '1',
  });
  expect((await Helpers.cleanStateSource()).launcherScript).toBeUndefined();
  await Helpers.restoreDocumentBursterCleanState(false);

  expect(jetpack.exists(`${installed}/datapallas.bat`)).toBe(false);
  expect(jetpack.read(`${installed}/config/burst/settings.xml`)).toBe('<settings>shipped</settings>');
});
