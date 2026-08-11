import { Injectable } from '@angular/core';
import { StateStoreService } from './state-store.service';
import { RbElectronService } from '../areas/electron-nodejs/electron.service';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ConfigurationRepository } from './configuration-repository.service';
import { WebSocketService } from './websocket.service';

@Injectable({
  providedIn: 'root',
})
export class InitService {
  constructor(
    private stateStore: StateStoreService,
    private electronService: RbElectronService,
    private apiService: ApiService,
    private authService: AuthService,
    private settingsService: ConfigurationRepository,
    private webSocketService: WebSocketService,
  ) { }

  async initialize(): Promise<void> {
    if (this.electronService.isElectron) {
      const backendUrl = await this.electronService.getBackendUrl();
      this.stateStore.configSys.sysInfo.setup.BACKEND_URL = backendUrl;
      // Set API service URL after initialization
      this.apiService.BACKEND_URL = backendUrl;

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
    }

    // Resolve the identity before the first navigation. withDisabledInitialNavigation() means the
    // router has not run yet, so the guard and every screen see a settled mode and never flash a
    // login screen at a desktop user. It answers without a credential — that is the point: the
    // deployment mode is what decides which credential is allowed to be used at all.
    const identity = await this.authService.loadIdentity();

    // The installation API key is a MACHINE credential: presenting it means "I hold this
    // installation's filesystem". That is exactly DataPallas Desktop's trust model — the person at
    // the keyboard already owns the folder, so asking them to log in protects nothing.
    //
    // It is exactly NOT DataPallas Server's. A server must ask the person in front of it to sign in
    // even when the app is opened through DataPallas.exe on the server machine itself, so the key is
    // never presented there — otherwise every desktop shell would silently be an administrator and
    // the login screen would never appear.
    //
    // Web mode never gets a key in either edition: anything a page can read, any visitor can read.
    if (this.electronService.isElectron && identity?.mode === 'standalone') {
      const apiKey = await this.electronService.getApiKey();
      if (apiKey) {
        this.apiService.setApiKey(apiKey);
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
