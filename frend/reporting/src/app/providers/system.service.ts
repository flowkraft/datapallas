import { Injectable } from '@angular/core';
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
  constructor(protected apiService: ApiService) {}

  async getServicesStatus(skipProbe?: boolean): Promise<any> {
    return this.apiService.get('/system/services/status', { skipProbe });
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
