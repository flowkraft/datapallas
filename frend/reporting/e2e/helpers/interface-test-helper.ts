import * as path from 'path';
import * as fs from 'fs';
import { expect } from '@playwright/test';
import * as jetpack from 'fs-jetpack';

/**
 * Shared assertion library for interface tests (CLI and REST).
 *
 * Both interface-client-cli.spec.ts and interface-client-rest.spec.ts use these
 * methods to verify identical results — if CLI produces correct output but REST
 * doesn't (or vice versa), the bug is in the interface layer, not the engine.
 */
export class InterfaceTestHelper {
  static readonly PORTABLE_DIR = process.env.PORTABLE_EXECUTABLE_DIR!;

  /**
   * Assert that burst produced the expected output files.
   *
   * @param expectedFiles array of expected output file names (e.g., ['clyde.grew@northridgehealth.org.pdf'])
   * @param extension file extension to match (default: 'pdf')
   */
  static async assertOutputFiles(
    expectedFiles: string[],
    extension: string = 'pdf',
  ): Promise<void> {
    const outputFilePaths = await jetpack.findAsync(this.PORTABLE_DIR, {
      matching: `output/**/*.${extension}`,
    });
    const outputFileNames = outputFilePaths.map((filePath) =>
      path.basename(filePath),
    );

    expect(outputFileNames.sort()).toEqual(expectedFiles.sort());
  }

  /**
   * Assert that processing produced exactly N output files with the given extension.
   *
   * @param expectedCount expected number of files
   * @param extension file extension to match
   */
  static async assertOutputFileCount(
    expectedCount: number,
    extension: string = 'pdf',
  ): Promise<void> {
    const outputFilePaths = await jetpack.findAsync(this.PORTABLE_DIR, {
      matching: `output/**/*.${extension}`,
    });

    expect(outputFilePaths.length).toEqual(expectedCount);
  }

  /**
   * Assert that at least one output file exists with the given extension.
   */
  static async assertOutputFilesExist(
    extension: string = 'pdf',
  ): Promise<void> {
    const outputFilePaths = await jetpack.findAsync(this.PORTABLE_DIR, {
      matching: `output/**/*.${extension}`,
    });

    expect(outputFilePaths.length).toBeGreaterThan(0);
  }

  /**
   * Assert that merge produced a single output file with the expected name.
   */
  static async assertMergeOutput(expectedFileName: string): Promise<void> {
    const outputFilePaths = await jetpack.findAsync(this.PORTABLE_DIR, {
      matching: `output/**/${expectedFileName}`,
    });

    expect(outputFilePaths.length).toEqual(1);
  }

  /**
   * Assert that no errors were logged during processing.
   */
  static async assertNoErrors(): Promise<void> {
    const errorsLogPath = path.join(this.PORTABLE_DIR, 'logs', 'errors.log');
    if (fs.existsSync(errorsLogPath)) {
      const content = fs.readFileSync(errorsLogPath, 'utf-8').trim();
      expect(content).toEqual('');
    }
  }

  /**
   * Assert that info.log contains a specific string (e.g., 'Execution Ended').
   */
  static async assertInfoLogContains(text: string): Promise<void> {
    const infoLogPath = path.join(this.PORTABLE_DIR, 'logs', 'info.log');
    expect(fs.existsSync(infoLogPath)).toBeTruthy();
    const content = fs.readFileSync(infoLogPath, 'utf-8');
    expect(content).toContain(text);
  }

  /**
   * Wait for a job to complete by polling for 'Execution Ended' in info.log.
   *
   * @param timeoutMs maximum wait time (default: 60 seconds)
   * @param pollIntervalMs poll interval (default: 500ms)
   */
  static async waitForJobCompletion(
    timeoutMs: number = 60000,
    pollIntervalMs: number = 500,
  ): Promise<void> {
    const infoLogPath = path.join(this.PORTABLE_DIR, 'logs', 'info.log');
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (fs.existsSync(infoLogPath)) {
        const content = fs.readFileSync(infoLogPath, 'utf-8');
        if (content.includes('Execution Ended')) {
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(
      `Job did not complete within ${timeoutMs}ms — 'Execution Ended' not found in info.log`,
    );
  }

  /**
   * Clean the output directory and logs before a test run.
   */
  static cleanOutputAndLogs(): void {
    const outputDir = path.join(this.PORTABLE_DIR, 'output');
    const logsDir = path.join(this.PORTABLE_DIR, 'logs');

    // Clean output
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });

    // Clean logs
    for (const logFile of ['info.log', 'errors.log', 'warnings.log']) {
      const logPath = path.join(logsDir, logFile);
      if (fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, '');
      }
    }
  }

  /**
   * Execute a CLI command via child_process and return the result.
   *
   * @param args CLI arguments (e.g., ['burst', 'Payslips.pdf'])
   * @param timeoutMs command timeout (default: 120 seconds)
   */
  static execCli(
    args: string[],
    timeoutMs: number = 120000,
  ): { exitCode: number; stdout: string; stderr: string } {
    const { spawnSync } = require('child_process');
    const os = require('os');
    const isWindows = os.platform() === 'win32';

    const absoluteDir = path.resolve(this.PORTABLE_DIR);
    const cmd = isWindows ? 'datapallas.bat' : './datapallas.sh';
    const fullCommand = `cd "${absoluteDir}" && set "PORTABLE_EXECUTABLE_DIR=" && ${cmd} ${args.join(' ')}`;

    // spawnSync (not execSync) — execSync returns *only* stdout and reveals
    // stderr only when the child throws. datapallas.bat launches Ant with
    // <java failonerror="false"/>, which prints "Java Result: <N>" to stderr
    // when the CLI returns non-zero but lets Ant (and the bat) still exit 0.
    // So the success path needs stderr too — spawnSync gives us both streams
    // unconditionally.
    const result = spawnSync(fullCommand, {
      shell: true,
      timeout: timeoutMs,
      encoding: 'utf-8',
    });
    const stdout: string = result.stdout ?? '';
    const stderr: string = result.stderr ?? '';
    let exitCode: number = result.status ?? 1;

    // Recover Java's real exit code from the Ant-printed line.
    const javaResultMatch = stderr.match(/Java Result:\s*(\d+)/);
    if (javaResultMatch) {
      exitCode = parseInt(javaResultMatch[1], 10);
    }
    return { exitCode, stdout, stderr };
  }

  /**
   * Submit a job via the REST API and wait for completion.
   *
   * JobsController exposes a single POST /api/jobs/ endpoint that dispatches on
   * a `type` discriminator in the body. The old per-type paths (POST /api/jobs/burst,
   * /api/jobs/generate, /api/jobs/merge) no longer exist.
   *
   * @param type job type — drives the controller switch
   * @param payload type-specific fields merged with `{type}` into the request body
   * @param baseUrl backend URL (default: http://localhost:9090)
   * @param timeoutMs wait timeout (default: 120 seconds)
   */
  static async execRest(
    type: 'burst' | 'generate' | 'merge',
    payload: any,
    baseUrl: string = 'http://localhost:9090',
    timeoutMs: number = 120000,
  ): Promise<void> {
    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...payload }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`REST POST /api/jobs (type=${type}) failed: ${response.status} ${text}`);
    }

    // POST /api/jobs/ returns 202 Accepted immediately with {jobId, status}.
    // Wait for the engine to complete by polling info.log for 'Execution Ended'.
    await this.waitForJobCompletion(timeoutMs);
  }
}
