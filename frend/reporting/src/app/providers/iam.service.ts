import { Injectable, inject } from '@angular/core';

import { ApiService } from './api.service';

/**
 * Mirrors the backend `LimitSettings`. Both fields are optional and mean "not limited" when they
 * are absent: no `connections` is every connection, no `scripts` is scripts allowed. An empty
 * object is a group that only organises people.
 */
export interface IamLimitSettings {
  connections?: string[] | null;
  scripts?: boolean | null;
}

/** Mirrors `GroupRefDto` — what a user's row says about a group they are in. */
export interface IamGroupRef {
  id: number;
  name: string;
}

/** One published dashboard, as `PublishedDashboard` writes it: the report id and its template name. */
export interface IamDashboard {
  id: string;
  name: string;
}

/** One report an admin can grant, as `CatalogReport` writes it: the report id and its name. */
export interface IamReport {
  id: string;
  name: string;
}

/** Mirrors `GroupDto`. `members` is read-only here: membership is edited on the user. */
export interface IamGroup {
  id: number;
  name: string;
  settings: IamLimitSettings;
  members: string[];
  /**
   * The report ids this group's members may see and run. Empty is not "no reports": a person no
   * group of whose names a single report may see every report, which is what keeps an existing
   * installation working after an upgrade. Ticking one here narrows every member of the group.
   */
  reports: string[];
  /** The report ids this group's dashboard viewers may open. */
  dashboards: string[];
  /** One of `dashboards`, or null: where a viewer of this group lands. */
  defaultDashboard: string | null;
}

/**
 * One group's limits as a sentence: "sales-pg, hr-mysql \u00b7 scripts off", or "None" for a group
 * that only organises people. Written next to the type it reads so the Groups tab and the group
 * pickers cannot drift apart.
 */
export function describeGroupLimits(group: IamGroup): string {
  const settings = group.settings ?? {};
  const parts: string[] = [];

  if (settings.connections)
    parts.push(settings.connections.length ? settings.connections.join(', ') : 'no connections');

  if (settings.scripts === false) parts.push('scripts off');

  return parts.length ? parts.join(' \u00b7 ') : 'None';
}

/** Mirrors the backend `TenantUserDto` — identity plus the role held in the current tenant. */
export interface IamUser {
  id: number;
  username: string;
  email: string | null;
  status: string;
  platformAdmin: boolean;
  role: string | null;
  createdAt: string;
  groups: IamGroupRef[];
  /** The union of the groups' limits, already worked out by the server. Null for an unlimited user. */
  effectiveLimits: IamLimitSettings | null;
  /**
   * The reports this person's groups name, already reconciled by the server. Null means their
   * groups name none, which is every report — the opposite of an empty list, which is a person
   * whose groups grant only reports that no longer exist.
   */
  effectiveReports: string[] | null;
  /**
   * The dashboard a dashboard viewer lands on, already resolved from their groups by the server.
   * Null for everybody else, and for a viewer who has been granted nothing.
   */
  opensOn: string | null;
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
export const ASSIGNABLE_ROLES = ['ADMIN', 'REPORT_AUTHOR', 'JOB_OPERATOR', 'DASHBOARD_VIEWER'] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** One-line description of what each role can do, shown next to the picker. */
export const ROLE_DESCRIPTIONS: Record<AssignableRole, string> = {
  ADMIN: 'Everything, including connections and their passwords, users, and system settings.',
  REPORT_AUTHOR:
    'Everything except connections and users — reports, dashboards, cubes, scripts and templates, running jobs, and starting apps and starter packs.',
  JOB_OPERATOR:
    'The Processing screens only: run jobs, read output and logs. No configuration, no reports, no connections.',
  DASHBOARD_VIEWER:
    'Opens the dashboards shared with their groups, in the AI Hub. Cannot build or run anything.',
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
    groupIds?: number[];
  }): Promise<IamUser> {
    return this.apiService.post('/iam/users', user);
  }

  /** Replaces the user's groups with exactly this list — an empty list takes them out of all of them. */
  setUserGroups(username: string, groupIds: number[]): Promise<void> {
    return this.apiService.put(`/iam/users/${encodeURIComponent(username)}/groups`, { groupIds });
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

  // ---- groups ----

  listGroups(tenantCode?: string): Promise<IamGroup[]> {
    return this.apiService.get('/iam/groups', tenantCode ? { tenantCode } : undefined);
  }

  createGroup(group: {
    name: string;
    settings: IamLimitSettings;
    reports: string[];
    dashboards: string[];
    defaultDashboard: string | null;
    tenantCode?: string;
  }): Promise<IamGroup> {
    return this.apiService.post('/iam/groups', group);
  }

  updateGroup(
    groupId: number,
    group: {
      name: string;
      settings: IamLimitSettings;
      reports: string[];
      dashboards: string[];
      defaultDashboard: string | null;
    },
  ): Promise<IamGroup> {
    return this.apiService.put(`/iam/groups/${groupId}`, group);
  }

  deleteGroup(groupId: number): Promise<void> {
    return this.apiService.delete(`/iam/groups/${groupId}`);
  }

  // ---- dashboards ----

  /**
   * The published dashboards an administrator can grant, sorted by name by the server. The group
   * dialog offers exactly these; a grant on a report that is no longer one of them is shown as
   * missing rather than dropped, so it can be unticked.
   */
  listDashboards(): Promise<IamDashboard[]> {
    return this.apiService.get('/iam/dashboards');
  }

  // ---- reports ----

  /**
   * Every report an administrator can grant, sorted by name by the server — deliberately not the
   * Reports screen's list, which is already narrowed to what its caller may run. A grant on a report
   * that has since been deleted is shown as missing rather than dropped, so it can be unticked.
   */
  listAvailableReports(): Promise<IamReport[]> {
    return this.apiService.get('/iam/reports');
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
