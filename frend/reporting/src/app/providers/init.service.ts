import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { StateStoreService } from './state-store.service';
import { RbElectronService } from '../areas/electron-nodejs/electron.service';
import { ApiService } from './api.service';
import { ConfigurationRepository } from './configuration-repository.service';
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
}
