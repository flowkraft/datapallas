import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

/**
 * Produces a real compiled .jasper for the e2e suites.
 *
 * A sub-report can reach DataPallas two ways: as a compiled .jasper, which is
 * what Jaspersoft Studio leaves behind, or as .jrxml source alone. Both have to
 * work, so both need testing — and the compiled case is only honest if the
 * .jasper is genuinely compiled rather than a binary checked into the repo,
 * which would silently rot against a library upgrade.
 *
 * A .jasper is version-specific: one compiled by JasperReports 6 will not load
 * in 7, or the reverse. So each engine compiles with its own jars — the ones in
 * lib/burst for JasperReports 7, the ones inside the container for legacy.
 */
export class JasperCompileHelper {
  // Lives under _resources with the other non-TypeScript test assets, not in
  // helpers/, which is TypeScript only.
  private static readonly COMPILER_SOURCE = path.resolve(
    __dirname, '..', '_resources', 'jasper', 'CompileJasperTemplate.java',
  );

  /** Compiles with the JasperReports 7 jars the installation already ships. */
  static compileWithJasper7(jrxmlPath: string, jasperPath: string): void {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    const classpath = `${path.resolve(portableDir, 'lib', 'burst')}${path.sep}*`;

    const result = spawnSync(
      'java',
      ['-cp', classpath, JasperCompileHelper.COMPILER_SOURCE, jrxmlPath, jasperPath],
      { encoding: 'utf-8', timeout: 5 * 60_000 },
    );

    JasperCompileHelper.assertCompiled(result, jasperPath, 'JasperReports 7');
  }

  /**
   * Compiles with the JasperReports 6 jars inside the legacy image. The folder
   * is mounted read-write for this one call — unlike rendering, which never
   * writes to the customer's files.
   */
  static compileWithJasperLegacy(folder: string, jrxmlFileName: string, jasperFileName: string): void {
    const image = 'flowkraft/datapallas-jasper-legacy:6.21.5';
    // The compiler source has to be visible inside the container too.
    const localCompiler = path.join(folder, 'CompileJasperTemplate.java');
    fs.copyFileSync(JasperCompileHelper.COMPILER_SOURCE, localCompiler);

    const result = spawnSync(
      'docker',
      [
        'run', '--rm',
        '-v', `${folder}:/work`,
        '--entrypoint', 'java',
        image,
        '-cp', '/opt/jr/lib/*',
        '/work/CompileJasperTemplate.java',
        `/work/${jrxmlFileName}`,
        `/work/${jasperFileName}`,
      ],
      { encoding: 'utf-8', timeout: 10 * 60_000, shell: true },
    );

    fs.rmSync(localCompiler, { force: true });
    JasperCompileHelper.assertCompiled(result, path.join(folder, jasperFileName), 'JasperReports 6');
  }

  private static assertCompiled(
    result: ReturnType<typeof spawnSync>,
    jasperPath: string,
    engine: string,
  ): void {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (!fs.existsSync(jasperPath)) {
      throw new Error(
        `Could not compile the sub-report with ${engine}. Expected ${jasperPath}.\n${output}`,
      );
    }
  }
}
