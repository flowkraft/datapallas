import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { AppPathsService } from './app-paths.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(
    private apiService: ApiService,
    private appPathsService: AppPathsService,
  ) {}

  getDashboardUrl(reportCode: string): string {
    // BACKEND_URL is like "http://localhost:9090/api" — strip trailing /api
    // because /dashboard/{code} is a sibling of /api, not a child.
    const root = this.apiService.BACKEND_URL.replace(/\/api$/, '');
    return `${root}/dashboard/${encodeURIComponent(reportCode)}`;
  }

  openDashboard(reportCode: string, target: '_blank' | '_self' = '_blank'): Window | null {
    // Under e2e the spec drives the external browser via createExternalBrowser
    // and navigates to getDashboardUrl() itself; calling window.open here would
    // add a redundant shell.openExternal that pops the OS default-browser
    // handler dialog (e.g. the Firefox AppX prompt on Windows).
    if (this.appPathsService.RUNNING_IN_E2E) return null;
    return window.open(this.getDashboardUrl(reportCode), target);
  }
}
