import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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
 *
 * Where lib/burst is depends on how the installation was installed. A desktop
 * installation keeps its program files next to its data, so lib/burst sits in
 * the installation folder. The Docker bundle is the same installation with the
 * program files inside the image: the extracted folder holds the data alone and
 * has no lib/ at all (plan §3 O19). Both are handled below, the same way the
 * legacy jars are already taken out of their image.
 */
export class JasperCompileHelper {
  // Lives under _resources with the other non-TypeScript test assets, not in
  // helpers/, which is TypeScript only.
  private static readonly COMPILER_SOURCE = path.resolve(
    __dirname, '..', '_resources', 'jasper', 'CompileJasperTemplate.java',
  );

  /** Compiles with the JasperReports 7 jars the installation under test ships. */
  static compileWithJasper7(jrxmlPath: string, jasperPath: string): void {
    const installationDir = process.env.PORTABLE_EXECUTABLE_DIR as string;
    const shippedJars = path.resolve(installationDir, 'lib', 'burst');

    if (fs.existsSync(shippedJars)) {
      JasperCompileHelper.compile(`${shippedJars}${path.sep}*`, jrxmlPath, jasperPath, 'JasperReports 7');
      return;
    }

    // No lib/ next to the data: this is the Docker bundle, whose program files are in the image its
    // own docker-compose.yml names — the file the customer runs, so it is the authority on which
    // image this installation is.
    JasperCompileHelper.withJarsFromImage(
      JasperCompileHelper.bundleServerImage(installationDir),
      '/app/lib/burst/.',
      (jarsDir) =>
        JasperCompileHelper.compile(`${jarsDir}${path.sep}*`, jrxmlPath, jasperPath, 'JasperReports 7'),
      // Never reach out to the registry for this one: the released tag also exists on Docker Hub, and
      // a published image quietly standing in for the one under test would compile with the wrong
      // jars and prove nothing. Missing means the bundle was not built here — say so.
      'never',
    );
  }

  /** The server image the extracted bundle runs, as its own docker-compose.yml names it. */
  private static bundleServerImage(installationDir: string): string {
    const composePath = path.join(installationDir, 'docker-compose.yml');
    const image = fs.readFileSync(composePath, 'utf-8').match(/^\s*image:\s*(\S*datapallas-server\S*)\s*$/m);
    if (!image) {
      throw new Error(`Could not read the DataPallas Server image out of ${composePath}.`);
    }
    return image[1];
  }

  /**
   * Copies a folder out of an image into a temporary folder, hands it to `use`, and cleans up after
   * it. The jars decide which JasperReports writes the .jasper, not the JVM that runs them, so it is
   * the local JDK that compiles with them — the images themselves are JREs and have no compiler.
   */
  private static withJarsFromImage(
    image: string,
    dirInImage: string,
    use: (jarsDir: string) => void,
    pull: 'missing' | 'never' = 'missing',
  ): void {
    const jarsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jasper-jars-'));
    const container = `jasper-jars-${process.pid}-${Date.now()}`;

    try {
      const created = spawnSync('docker', ['create', '--pull', pull, '--name', container, image], {
        encoding: 'utf-8',
        timeout: 60_000,
      });
      if (created.status !== 0) {
        throw new Error(`Could not create a container from ${image} to copy its jars.\n${created.stdout}${created.stderr}`);
      }
      const copied = spawnSync('docker', ['cp', `${container}:${dirInImage}`, jarsDir], {
        encoding: 'utf-8',
        timeout: 5 * 60_000,
      });
      if (copied.status !== 0) {
        throw new Error(`Could not copy ${dirInImage} out of ${image}.\n${copied.stdout}${copied.stderr}`);
      }

      use(jarsDir);
    } finally {
      spawnSync('docker', ['rm', '-f', container], { timeout: 60_000 });
      fs.rmSync(jarsDir, { recursive: true, force: true });
    }
  }

  private static compile(classpath: string, jrxmlPath: string, jasperPath: string, engine: string): void {
    const result = spawnSync(
      'java',
      ['-cp', classpath, JasperCompileHelper.COMPILER_SOURCE, jrxmlPath, jasperPath],
      { encoding: 'utf-8', timeout: 5 * 60_000 },
    );

    JasperCompileHelper.assertCompiled(result, jasperPath, engine);
  }

  /**
   * Compiles with the JasperReports 6 jars of the legacy image. That image is a JRE
   * (eclipse-temurin:17-jre): it has no jdk.compiler module, so it cannot run the
   * single-file compiler source ("Module jdk.compiler not in boot Layer"). So the jars
   * are copied out of the image and the local JDK compiles — exactly how
   * compileWithJasper7 uses lib/burst. The jars decide which JasperReports writes the
   * .jasper, not the JVM that runs them.
   */
  static compileWithJasperLegacy(folder: string, jrxmlFileName: string, jasperFileName: string): void {
    const jasperPath = path.join(folder, jasperFileName);

    JasperCompileHelper.withJarsFromImage(
      'flowkraft/datapallas-jasper-legacy:6.21.5',
      '/opt/jr/lib/.',
      (jarsDir) =>
        JasperCompileHelper.compile(
          `${jarsDir}${path.sep}*`,
          path.join(folder, jrxmlFileName),
          jasperPath,
          'JasperReports 6',
        ),
    );
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
