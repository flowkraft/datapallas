import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { StateStoreService } from './state-store.service';
import { RbElectronService } from '../areas/electron-nodejs/electron.service';
import { ApiService } from './api.service';
import { ConfigurationRepository } from './configuration-repository.service';
import { WebSocketService } from './websocket.service';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class InitService {
  constructor(
    private stateStore: StateStoreService,
    private electronService: RbElectronService,
    private apiService: ApiService,
    private settingsService: ConfigurationRepository,
    private webSocketService: WebSocketService,
    private http: HttpClient,
  ) { }

  async initialize(): Promise<void> {
    if (this.electronService.isElectron) {
      const backendUrl = await this.electronService.getBackendUrl();
      this.stateStore.configSys.sysInfo.setup.BACKEND_URL = backendUrl;
      // Set API service URL after initialization
      this.apiService.BACKEND_URL = backendUrl;

      // Read API key from file system (secure - no HTTP endpoint exposed)
      const apiKey = await this.electronService.getApiKey();
      if (apiKey) {
        // TEMP: API key disabled during rollback - not setting on ApiService
        // this.apiService.setApiKey(apiKey);
      }

      const systemInfo = await this.electronService.getSystemInfo();
      this.stateStore.configSys.sysInfo.setup.chocolatey = {
        ...systemInfo.chocolatey,
      };
      this.stateStore.configSys.sysInfo.setup.java = { ...systemInfo.java };
      this.stateStore.configSys.sysInfo.setup.env = { ...systemInfo.env };

      // Load internal preferences (skin, copilotUrl, showsamples) once at
      // bootstrap so any feature that reads settingsService.showSamples works
      // regardless of whether the SkinsComponent (which is hidden in
      // RUNNING_IN_E2E mode) ever renders. Without this, the Processing tab's
      // dashboardReports filter sees showSamples=false and hides sample
      // dashboards even though config/_internal/settings.xml says true.
      try {
        const prefs = await this.settingsService.loadPreferences();
        this.settingsService.xmlInternalSettings.documentburster = prefs;
      } catch (e) {
        console.warn('[InitService] Failed to load preferences at bootstrap:', e);
      }
    } else {
      // TEMP (2025-12-19): API key handling is present below but intentionally skipped in web mode during rollback.
      // We return early to avoid accidentally setting an API key in normal web usage until a proper reimplementation is scheduled.
      return;

      try {
        const config = await firstValueFrom(
          this.http.get<{ apiKey?: string }>('/assets/config.json')
        );

        if (config?.apiKey) {
          // API key present: would set if rollback was not active
          this.apiService.setApiKey(config.apiKey);
        } else {
          //console.warn('No API key found in config.json');
        }
      } catch (error) {
          // Fallback API key (dev): would set if rollback not active
          this.apiService.setApiKey("123");
      }

    }
  }

  /** Re-read PATH/JAVA_HOME from the registry and re-fetch system info into the store, so
   *  a just-installed Chocolatey/Java is reflected in the UI without restarting DataPallas. */
  async refreshSystemInfo(): Promise<void> {
    if (!this.electronService.isElectron) return;
    await this.electronService.refreshEnv();
    const systemInfo = await this.electronService.getSystemInfo();
    this.stateStore.configSys.sysInfo.setup.chocolatey = { ...systemInfo.chocolatey };
    this.stateStore.configSys.sysInfo.setup.java = { ...systemInfo.java };
    this.stateStore.configSys.sysInfo.setup.env = { ...systemInfo.env };
  }

  /** Re-run the backend-dependent parts of bootstrap IN-PLACE after the server has just
   *  come up (e.g. right after a Java install). This brings the store/services to the same
   *  state a fresh start would, WITHOUT a full browser reload — which is unreliable from a
   *  packaged file:// origin. The caller then router-navigates so route components re-mount
   *  and fire their backend calls. */
  async reinitializeAfterBackendStarted(): Promise<void> {
    if (!this.electronService.isElectron) return;
    // isJavaOk flips true here (also refreshes env so the new Java is on PATH).
    await this.refreshSystemInfo();
    // BACKEND_URL was set at boot; re-assert it so ApiService points at the live backend.
    const backendUrl = await this.electronService.getBackendUrl();
    this.stateStore.configSys.sysInfo.setup.BACKEND_URL = backendUrl;
    this.apiService.BACKEND_URL = backendUrl;
    // Preferences (showSamples, skin, copilotUrl) likely failed to load at boot while the
    // backend was down — load them now so the Processing tab filters correctly.
    try {
      const prefs = await this.settingsService.loadPreferences();
      this.settingsService.xmlInternalSettings.documentburster = prefs;
    } catch (e) {
      console.warn('[InitService] reinitializeAfterBackendStarted: failed to load preferences', e);
    }
    // Establish the STOMP/WebSocket connection. This is normally done by
    // StatusBarComponent.ngOnInit, but that component mounted once at boot and
    // early-returned because Java was missing — and it never re-mounts. Without this,
    // real-time log streaming during report processing would NOT work, and the green
    // "server is UP" badge (driven by isJServerStarted on the first stats event) never
    // appears. The status bar is a singleton service consumer, so connecting here wires
    // up the same shared connection it would have made.
    try {
      this.webSocketService.BACKEND_URL = backendUrl;
      await this.webSocketService.makeWSConnectionAndHandleMessages();
    } catch (e) {
      console.warn('[InitService] reinitializeAfterBackendStarted: failed to open WebSocket', e);
    }
  }
}
