import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

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

  /**
   * Tears down the compose project of ONE folder - and only that folder's.
   *
   * `docker compose` with no `-f` resolves the project from the working directory by walking UP the
   * parent folders until it finds a compose file. On the shipped Docker server the first one it finds
   * above an app folder is the DataPallas server's own docker-compose.yml at the installation root, so
   * a teardown aimed at an app that never scaffolded tore the SERVER down instead, `-v` and
   * `--rmi local` included (F2 run 1, 2026-09-17: 211 tests then ran against a dead server). On a
   * desktop installation the same walk finds no compose file at all, which is the only reason this
   * never showed on Windows - there `docker compose down` just exited "no configuration file
   * provided" into a result nobody looked at.
   *
   * So: point `-f` at the folder's own compose file, and do nothing when there is none - an app that
   * was never scaffolded has nothing to tear down. `-f` also makes the project directory that file's
   * folder, so relative bind mounts and the project name stay exactly what they were. Same behaviour
   * on Windows and on Linux, with no branch on either.
   *
   * @param projectDir absolute folder holding the compose file (e.g. <installation>/_apps/<stack>).
   * @param args       the compose subcommand, e.g. ['down'] or ['down', '-v', '--rmi', 'local'].
   */
  static composeDown(projectDir: string, args: string[] = ['down']): void {
    const dir = path.resolve(projectDir);
    const file = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']
      .map((name) => path.join(dir, name))
      .find((candidate) => fs.existsSync(candidate));

    if (!file) {
      console.log(`[compose] no compose file in ${dir} - nothing to tear down`);
      return;
    }
    // Belt and braces for the next caller: never act on a compose file this folder does not own,
    // whatever path was passed in. Without this the walk could come back through a wrong argument.
    if (path.dirname(file) !== dir)
      throw new Error(`[compose] refusing to run '${args.join(' ')}' on ${file} - outside ${dir}`);

    // No `shell: true`: it joins the args with spaces, so an installation path containing a space
    // ("C:\\Program Files\\...") would mangle the absolute `-f`. assertDockerRunning() above has been
    // spawning `docker` shell-less on Windows all along, so this resolves the CLI the same way there.
    const result = spawnSync('docker', ['compose', '-f', file, ...args], {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 600_000,
    });
    // Never silent again: ignoring this result is what let the bug above live unseen on Windows.
    if (result.error || result.status !== 0)
      console.warn(
        `[compose] '${args.join(' ')}' failed in ${dir} (status=${result.status}): ` +
          `${(result.stderr || result.error || '').toString().trim()}`,
      );
  }
}
