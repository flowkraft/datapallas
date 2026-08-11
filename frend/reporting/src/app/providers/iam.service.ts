import { Injectable, inject } from '@angular/core';

import { ApiService } from './api.service';

/** Mirrors the backend `TenantUserDto` — identity plus the role held in the current tenant. */
export interface IamUser {
  id: number;
  username: string;
  email: string | null;
  status: string;
  platformAdmin: boolean;
  role: string | null;
  createdAt: string;
}

export interface IamTenant {
  id: number;
  code: string;
  displayName: string;
  homeDir: string;
  customerRef: string | null;
  status: string;
  createdAt: string;
}

/** The roles a tenant administrator can assign. PLATFORM_ADMIN is deliberately absent — it is not a
 *  tenant role and the backend refuses to grant it through this API. */
export const ASSIGNABLE_ROLES = ['ADMIN', 'REPORT_AUTHOR', 'JOB_OPERATOR'] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** One-line description of what each role can do, shown next to the picker. */
export const ROLE_DESCRIPTIONS: Record<AssignableRole, string> = {
  ADMIN: 'Everything, including connections and their passwords, users, and system settings.',
  REPORT_AUTHOR:
    'Everything except connections and users — reports, dashboards, cubes, scripts and templates, running jobs, and starting apps and starter packs.',
  JOB_OPERATOR:
    'The Processing screens only: run jobs, read output and logs. No configuration, no reports, no connections.',
};

/**
 * Client for `/api/iam`.
 *
 * Thin on purpose — every rule lives in the backend, and duplicating any of it here would just create
 * somewhere for the two to disagree.
 */
@Injectable({ providedIn: 'root' })
export class IamService {
  private readonly apiService = inject(ApiService);

  // ---- users ----

  listUsers(tenantCode?: string): Promise<IamUser[]> {
    return this.apiService.get('/iam/users', tenantCode ? { tenantCode } : undefined);
  }

  createUser(user: {
    username: string;
    email?: string;
    password: string;
    role: string;
    tenantCode?: string;
  }): Promise<IamUser> {
    return this.apiService.post('/iam/users', user);
  }

  setRole(username: string, role: string, tenantCode?: string): Promise<void> {
    return this.apiService.put(`/iam/users/${encodeURIComponent(username)}/role`, {
      role,
      tenantCode,
    });
  }

  changePassword(username: string, password: string): Promise<void> {
    return this.apiService.put(`/iam/users/${encodeURIComponent(username)}/password`, {
      password,
    });
  }

  disableUser(username: string): Promise<void> {
    return this.apiService.post(`/iam/users/${encodeURIComponent(username)}/disable`, {});
  }

  enableUser(username: string): Promise<void> {
    return this.apiService.post(`/iam/users/${encodeURIComponent(username)}/enable`, {});
  }

  deleteUser(username: string): Promise<void> {
    return this.apiService.delete(`/iam/users/${encodeURIComponent(username)}`);
  }

  // ---- tenants ----

  listTenants(): Promise<IamTenant[]> {
    return this.apiService.get('/iam/tenants');
  }

  createTenant(tenant: {
    code: string;
    displayName?: string;
    homeDir?: string;
  }): Promise<IamTenant> {
    return this.apiService.post('/iam/tenants', tenant);
  }
}
