import { spawnSync } from 'child_process';

/**
 * Guards test steps that REALLY start a container (DB starter packs, apps).
 *
 * Without this, starting a pack/app while the Docker daemon is down doesn't fail —
 * it hangs: the pack never reaches "running", so the `waitOn...` sits until the
 * multi-thousand-second timeout. `assertDockerRunning()` turns that silent hang
 * into an immediate, explicit failure with a clear "start Docker" message.
 */
export class DockerTestHelper {
  /**
   * Throw LOUDLY and immediately if Docker is not installed, or installed but the
   * daemon is not running. No-op (fast) when Docker is usable.
   *
   * @param context short label of the caller, surfaced in the error message.
   */
  static assertDockerRunning(context = ''): void {
    const where = context ? ` [${context}]` : '';

    // 1) Is the Docker CLI even present?
    const cli = spawnSync('docker', ['--version'], { encoding: 'utf-8', timeout: 15_000 });
    if (cli.error || cli.status !== 0) {
      throw new Error(
        `Docker is NOT installed${where}. Docker is NEEDED to run this — ` +
          `install Docker Desktop, start it, then re-run.`,
      );
    }

    // 2) Is the daemon up? `docker info` exits non-zero when the daemon is down.
    const info = spawnSync('docker', ['info'], { encoding: 'utf-8', timeout: 30_000 });
    if (info.error || info.status !== 0) {
      throw new Error(
        `Please start Docker before — Docker is NEEDED to run this${where}. ` +
          `The Docker CLI is present but the daemon is not running ` +
          `(start "Docker Desktop" and wait until it is fully running, then re-run).`,
      );
    }
  }
}
