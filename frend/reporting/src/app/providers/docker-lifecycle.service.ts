import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { SystemService } from './system.service';
import { StateStoreService } from './state-store.service';

/**
 * Shared Docker lifecycle service — single source of truth for Docker container
 * start/stop commands issued from the UI. Used by both AppsManagerService and
 * StarterPacksComponent (apps and starter packs go through the same backend path).
 *
 * Owns:
 * - In-flight command tracking (so polling can preserve transitional states)
 * - The execute endpoint wrapper
 * - The status-resolution guard logic (preserve 'starting'/'stopping' until Docker
 *   truly reflects the new state — protects long-startup containers like Oracle
 *   from flipping back to 'stopped' mid-transition)
 * - Docker daemon status sync (isDockerInstalled/isDockerDaemonRunning/version)
 */
@Injectable({ providedIn: 'root' })
export class DockerLifecycleService {
  private commandsInFlight = new Set<string>();

  constructor(
    private apiService: ApiService,
    private systemService: SystemService,
    private stateStore: StateStoreService,
  ) {}

  /**
   * Fetch authoritative Docker status from the backend and update the shared
   * stateStore. Only overwrites values when the backend returns valid booleans —
   * guards against transient API failures clearing a known-good state.
   */
  async refreshSystemInfo(): Promise<void> {
    try {
      const backendSystemInfo = await this.systemService.getSystemInfo();
      if (!backendSystemInfo) return;

      const dockerSetup = this.stateStore.configSys.sysInfo.setup.docker;

      if (typeof backendSystemInfo.isDockerInstalled === 'boolean') {
        dockerSetup.isDockerInstalled = backendSystemInfo.isDockerInstalled;
      }
      if (typeof backendSystemInfo.isDockerDaemonRunning === 'boolean') {
        dockerSetup.isDockerDaemonRunning = backendSystemInfo.isDockerDaemonRunning;
      }
      dockerSetup.isDockerOk = dockerSetup.isDockerInstalled && dockerSetup.isDockerDaemonRunning;

      if (backendSystemInfo.dockerVersion && backendSystemInfo.dockerVersion !== 'DOCKER_NOT_INSTALLED') {
        dockerSetup.version = backendSystemInfo.dockerVersion;
      }
    } catch (e) {
      // On API failure, keep existing Docker status (don't set isDockerOk = false)
      console.warn('[DockerLifecycle] Failed to fetch backend system info, keeping existing Docker status', e);
    }
  }

  // --- In-flight tracking ---

  markCommandStart(id: string): void {
    this.commandsInFlight.add(id);
  }

  markCommandEnd(id: string): void {
    this.commandsInFlight.delete(id);
  }

  isCommandInFlight(id: string): boolean {
    return this.commandsInFlight.has(id);
  }

  /** Clear all in-flight markers — call when polling reaches max iterations. */
  clearAllInFlight(): void {
    this.commandsInFlight.clear();
  }

  // --- Execute ---

  /**
   * Execute a Docker lifecycle command (start/stop/reprovision).
   * Both apps and starter packs go through /starter-packs/execute on the backend.
   */
  executeCommand(command: string): Promise<any> {
    return this.apiService.post('/system/services/execute', { command });
  }

  // --- Status guard ---

  /**
   * Decide what status to apply given the current UI status and the newly-observed
   * Docker status. Preserves transitional states while a command is in-flight so
   * long-startup containers don't flicker back to 'stopped' / 'running' before
   * Docker actually reflects the new state.
   *
   * @param id              item id (to look up in-flight state)
   * @param currentStatus   current UI status
   * @param dockerStatus    newly-mapped Docker status, or null if no matching container was found
   * @returns status to apply + whether the caller should clear the in-flight marker
   */
  resolveNextStatus(
    id: string,
    currentStatus: string | undefined,
    dockerStatus: string | null,
  ): { status: string; clearInFlight: boolean } {
    const inFlight = this.commandsInFlight.has(id);

    if (dockerStatus === null) {
      // No container in docker ps
      if (inFlight && currentStatus === 'stopping') {
        // Container gone mid-stop → stop completed
        return { status: 'stopped', clearInFlight: true };
      }
      if (inFlight && currentStatus === 'starting') {
        // Start still in-flight (image downloading, container not yet created) — preserve
        return { status: 'starting', clearInFlight: false };
      }
      // No container + no command → truly stopped
      return { status: 'stopped', clearInFlight: true };
    }

    if (inFlight) {
      // docker compose down still running → container reports 'running' but we're mid-stop
      if (currentStatus === 'stopping' && dockerStatus === 'running') {
        return { status: 'stopping', clearInFlight: false };
      }
      // Long startup (Oracle, etc.) → container not yet healthy → preserve 'starting'
      if (currentStatus === 'starting' && dockerStatus === 'stopped') {
        return { status: 'starting', clearInFlight: false };
      }
    }

    const isStable = dockerStatus !== 'starting' && dockerStatus !== 'stopping';
    return { status: dockerStatus, clearInFlight: isStable };
  }
}
