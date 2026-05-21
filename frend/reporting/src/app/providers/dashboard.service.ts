import { Injectable } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private apiService: ApiService) {}

  getDashboardUrl(reportCode: string): string {
    // BACKEND_URL is like "http://localhost:9090/api" — strip trailing /api
    // because /dashboard/{code} is a sibling of /api, not a child.
    const root = this.apiService.BACKEND_URL.replace(/\/api$/, '');
    return `${root}/dashboard/${encodeURIComponent(reportCode)}`;
  }

  openDashboard(reportCode: string, target: '_blank' | '_self' = '_blank'): Window | null {
    return window.open(this.getDashboardUrl(reportCode), target);
  }
}
