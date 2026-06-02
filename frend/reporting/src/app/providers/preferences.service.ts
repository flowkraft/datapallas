import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ApiService } from './api.service';
import { DP_DEFAULT_THEME } from '../shared/theme-defaults';

@Injectable({
  providedIn: 'root',
})
export class PreferencesService {
  xmlInternalSettings = {
    documentburster: {
      settings: {
        theme: DP_DEFAULT_THEME,
        backendurl: 'http://localhost:9090',
        copiloturl: 'https://chatgpt.com/',
        showsamples: false,
      },
    },
  };

  // Emits whenever the showsamples preference changes.
  // CRUD list views (Connections, Reports, Cube Definitions) subscribe and reload.
  // Decision Log: BehaviorSubject over Angular Signals — Signals require zone-less change
  // detection (Angular 17+ provideExperimentalZonelessChangeDetection). Migration deferred
  // to Phase A3+; do not pre-empt it here.
  showSamples$ = new BehaviorSubject<boolean>(false);

  get showSamples(): boolean {
    const v: any = this.xmlInternalSettings?.documentburster?.settings?.showsamples;
    // Robust to both boolean and string XML representations
    return v === true || v === 'true';
  }

  public apiService = inject(ApiService);

  async loadPreferences(): Promise<any> {
    const loaded = await this.apiService.get('/system/preferences');
    // Defensive default: if the loaded XML doesn't have the new field, it's false
    if (loaded?.settings && loaded.settings.showsamples === undefined) {
      loaded.settings.showsamples = false;
    }
    // Sync the BehaviorSubject with the loaded value (robust to bool/string)
    const v = loaded?.settings?.showsamples;
    this.showSamples$.next(v === true || v === 'true');
    return loaded;
  }

  async savePreferences(
    xmlSettings: { documentburster: {} },
  ): Promise<any> {
    const result = await this.apiService.put(
      '/system/preferences',
      xmlSettings.documentburster,
    );
    // Notify subscribers (CRUD list views) that the preference may have changed
    this.showSamples$.next(this.showSamples);
    return result;
  }

  getCopilotUrl(): string {
    return (
      this.xmlInternalSettings?.documentburster?.settings?.copiloturl ||
      'https://copilot.microsoft.com'
    );
  }
}
