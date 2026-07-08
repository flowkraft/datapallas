import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

/**
 * System domain service — wraps /api/system/* endpoints.
 * Consolidates system status, info, and utility calls that were
 * previously duplicated across starter-packs, apps-manager, and processing components.
 */
@Injectable({
  providedIn: 'root',
})
export class SystemService {
  protected apiService = inject(ApiService);

  async getServicesStatus(skipProbe?: boolean): Promise<any> {
    return this.apiService.get('/system/services/status', { skipProbe });
  }

  /** Custom-app manifests discovered from _apps/<app>/_custom/app.json (ManagedApp shape) */
  async getManagedApps(): Promise<any[]> {
    return this.apiService.get('/system/apps');
  }

  async getSystemInfo(): Promise<any> {
    return this.apiService.get('/system/info');
  }

  async checkUrl(url: string): Promise<any> {
    return this.apiService.get('/system/test-url', { url });
  }

  async getBlogPosts(): Promise<any> {
    return this.apiService.get('/system/info/news');
  }

  async getChangelog(itemName: string): Promise<any> {
    return this.apiService.get(
      `/system/info/changelog?itemName=${encodeURIComponent(itemName)}`,
    );
  }
}
