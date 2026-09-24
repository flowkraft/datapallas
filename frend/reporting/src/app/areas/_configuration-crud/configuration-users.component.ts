import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';

import { SHARED_IMPORTS } from '../../shared/shared-imports';
import { LicenseComponent } from '../../components/license/license.component';
import { GroupPickerComponent } from '../../components/group-picker/group-picker.component';
import { ConfirmService } from '../../components/dialog-confirm/confirm.service';
import { InfoService } from '../../components/dialog-info/info.service';
import { ApiService } from '../../providers/api.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { AuthService } from '../../providers/auth.service';
import {
  IamService,
  IamUser,
  IamGroup,
  IamDashboard,
  IamReport,
  IamLimitSettings,
  describeGroupLimits,
  ASSIGNABLE_ROLES,
  ROLE_DESCRIPTIONS,
  AssignableRole,
} from '../../providers/iam.service';

import { tabsTemplate } from './templates/users/_tabs';
import { tabUsersTemplate } from './templates/users/tab-users';
import { tabGroupsTemplate } from './templates/users/tab-groups';
import { tabLicenseTemplate } from './templates/connections/tab-license';

/**
 * User administration.
 *
 * <p>Only rendered in multi-user deployments — the menu entry that reaches it is hidden in desktop
 * mode, so a desktop user never sees that DataPallas has a concept of users at all.
 *
 * <p>Tenants are not administered here. Every user belongs to the DEFAULT tenant, because a tenant
 * only means something once it owns its own reports, connections and output, and nothing outside the
 * IAM store scopes anything to one yet.
 *
 * <p>Roles are edited inline on the user row rather than in a screen of their own. A role is not an
 * entity here: it is one column on a membership, so a separate "Roles" screen would be a page that
 * lists four constants.
 */
@Component({
  selector: 'dburst-configuration-users',
  template: `
    ${tabsTemplate}

    <ng-template #tabUsersTemplate>
      ${tabUsersTemplate}
    </ng-template>

    <ng-template #tabGroupsTemplate>
      ${tabGroupsTemplate}
    </ng-template>
    ${tabLicenseTemplate}
  `,
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [...SHARED_IMPORTS, LicenseComponent, GroupPickerComponent],
})
export class ConfigurationUsersComponent implements OnInit {
  private readonly iamService = inject(IamService);
  private readonly authService = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
  private readonly infoService = inject(InfoService);
  /** Used for exactly one call — the admin's unfiltered database connection list for the group
   *  dialog. It belongs to connections, not to IAM, so it is not put on IamService. */
  private readonly apiService = inject(ApiService);
  private readonly messagesService = inject(ToastrMessagesService);

  readonly assignableRoles = ASSIGNABLE_ROLES;
  readonly roleDescriptions = ROLE_DESCRIPTIONS;

  users: IamUser[] = [];
  loadError = '';

  /**
   * Search and paging, matching the Reports and Cubes lists in this same sidebar — same default page
   * size, same "show the search box only once it earns its space" rule, same footer wording. A user
   * list that paged differently from its two siblings would just look like an oversight.
   *
   * <p>Five rows is also what fits above the fold here without pushing "What the roles mean" out of
   * sight, which is the part a first-time administrator most needs to read.
   */
  searchTerm = '';
  page = 0;
  pageSize = 5;
  readonly pageSizeOptions = [5, 10, 25, 50];

  /** Matches username and email, because "who is virgil.trasca@gmail.com?" is a question people ask. */
  get filteredUsers(): IamUser[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.users;
    return this.users.filter(
      (user) =>
        user.username.toLowerCase().includes(term) ||
        (user.email ?? '').toLowerCase().includes(term) ||
        (user.role ?? '').toLowerCase().includes(term),
    );
  }

  get totalPages(): number {
    return Math.ceil(this.filteredUsers.length / this.pageSize);
  }

  get pageStart(): number {
    return this.page * this.pageSize;
  }

  get pageEnd(): number {
    return Math.min(this.pageStart + this.pageSize, this.filteredUsers.length);
  }

  get pagedUsers(): IamUser[] {
    return this.filteredUsers.slice(this.pageStart, this.pageEnd);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index);
  }

  onSearchChange(term: string): void {
    this.searchTerm = term;
    // Back to the first page: staying on page 3 of a result set that now has one page shows nothing
    // and reads as "the search found nothing".
    this.page = 0;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = Number(size);
    this.page = 0;
  }

  goToPage(page: number): void {
    this.page = Math.max(0, Math.min(page, this.totalPages - 1));
  }

  newUserVisible = false;
  newUserError = '';
  newUser: { username: string; email: string; password: string; role: AssignableRole } = {
    username: '',
    email: '',
    password: '',
    role: 'JOB_OPERATOR',
  };

  resetPasswordVisible = false;
  resetPasswordUsername = '';
  resetPasswordValue = '';

  async ngOnInit(): Promise<void> {
    await this.reload();
    await this.reloadGroups();
    await this.loadDatabaseConnections();
    await this.loadDashboards();
    await this.loadAvailableReports();
  }

  async reload(): Promise<void> {
    this.loadError = '';
    try {
      this.users = await this.iamService.listUsers();
    } catch {
      this.loadError = 'Could not load users. You may not have permission to manage them.';
    }
  }

  /** The role the user holds in the current tenant, as returned with the list. */
  roleOf(username: string): string {
    return this.users.find((user) => user.username === username)?.role ?? 'JOB_OPERATOR';
  }

  /** Guards the UI against a user removing their own admin rights and locking themselves out. */
  isSelf(username: string): boolean {
    return this.authService.username() === username;
  }

  // ---- users ----

  openNewUser(): void {
    this.newUser = { username: '', email: '', password: '', role: 'JOB_OPERATOR' };
    this.newUserGroupIds = [];
    this.newUserError = '';
    this.newUserVisible = true;
  }

  async createUser(): Promise<void> {
    this.newUserError = '';
    try {
      await this.iamService.createUser({
        username: this.newUser.username,
        email: this.newUser.email || undefined,
        password: this.newUser.password,
        role: this.newUser.role,
        groupIds: this.newUserGroupIds,
      });
      this.newUserVisible = false;
      this.messagesService.showSuccess(`User ${this.newUser.username} created`);
      await this.reload();
      await this.reloadGroups();
    } catch (status) {
      this.newUserError = this.describeFailure(status, 'Could not create the user.');
    }
  }

  async changeRole(username: string, role: string): Promise<void> {
    try {
      await this.iamService.setRole(username, role);
      const user = this.users.find((candidate) => candidate.username === username);
      if (user) user.role = role;
      this.messagesService.showSuccess(`${username} is now ${role}`);
    } catch {
      this.messagesService.showError(`Could not change the role for ${username}`);
      await this.reload();
    }
  }

  openResetPassword(username: string): void {
    this.resetPasswordUsername = username;
    this.resetPasswordValue = '';
    this.resetPasswordVisible = true;
  }

  async resetPassword(): Promise<void> {
    try {
      await this.iamService.changePassword(this.resetPasswordUsername, this.resetPasswordValue);
      this.resetPasswordVisible = false;
      this.messagesService.showSuccess(`Password changed for ${this.resetPasswordUsername}`);
    } catch {
      this.messagesService.showError('Could not change the password');
    }
  }

  disableUser(username: string): void {
    this.confirmService.askConfirmation({
      message: `Disable ${username}? They will no longer be able to sign in, until you enable them again.`,
      confirmAction: async () => {
        try {
          await this.iamService.disableUser(username);
          this.messagesService.showSuccess(`${username} disabled`);
          await this.reload();
        } catch {
          this.messagesService.showError(`Could not disable ${username}`);
        }
      },
    });
  }

  /** No confirmation: letting someone back in is the reversible direction, and asking twice is noise. */
  async enableUser(username: string): Promise<void> {
    try {
      await this.iamService.enableUser(username);
      this.messagesService.showSuccess(`${username} enabled`);
      await this.reload();
    } catch {
      this.messagesService.showError(`Could not enable ${username}`);
    }
  }

  deleteUser(username: string): void {
    this.confirmService.askConfirmation({
      message: `Delete ${username}? This cannot be undone.`,
      confirmAction: async () => {
        try {
          await this.iamService.deleteUser(username);
          this.messagesService.showSuccess(`${username} deleted`);
          await this.reload();
        } catch {
          this.messagesService.showError(`Could not delete ${username}`);
        }
      },
    });
  }


  // ============================================================
  // groups
  // ============================================================

  groups: IamGroup[] = [];
  groupsLoadError = '';

  /** The admin's own unfiltered list — the group dialog offers every database connection there is. */
  databaseConnections: { connectionCode: string; connectionName: string }[] = [];

  /** Every published dashboard, sorted by name by the server: what a group can be granted. */
  dashboards: IamDashboard[] = [];

  /** Every report, sorted by name by the server: what a group can be restricted to. */
  availableReports: IamReport[] = [];

  groupVisible = false;
  groupError = '';
  groupDialogHeader = 'New Group';
  private editingGroupId: number | null = null;
  groupMembers: string[] = [];

  groupForm: {
    name: string;
    limitsEnabled: boolean;
    onlyTheseConnections: boolean;
    connections: string[];
    scripts: boolean;
    reports: string[];
    dashboards: string[];
    defaultDashboard: string | null;
  } = {
    name: '',
    limitsEnabled: false,
    onlyTheseConnections: false,
    connections: [],
    scripts: true,
    reports: [],
    dashboards: [],
    defaultDashboard: null,
  };

  async reloadGroups(): Promise<void> {
    this.groupsLoadError = '';
    try {
      this.groups = await this.iamService.listGroups();
    } catch {
      this.groupsLoadError = 'Could not load groups. You may not have permission to manage them.';
    }
  }

  private async loadDashboards(): Promise<void> {
    try {
      this.dashboards = (await this.iamService.listDashboards()) ?? [];
    } catch {
      // Same as the connections above: the dialog then shows only what a group already grants, each
      // marked "(missing)", instead of silently offering nothing to tick.
      this.dashboards = [];
    }
  }

  private async loadAvailableReports(): Promise<void> {
    try {
      this.availableReports = (await this.iamService.listAvailableReports()) ?? [];
    } catch {
      // Same as the dashboards and the connections: the dialog then shows only what a group already
      // names, each marked "(missing)", rather than silently offering nothing to tick.
      this.availableReports = [];
    }
  }

  private async loadDatabaseConnections(): Promise<void> {
    try {
      this.databaseConnections = (await this.apiService.get('/connections?type=database')) ?? [];
    } catch {
      // Not fatal: the dialog then offers only the connections a group already names, each marked
      // "(missing)", which is exactly what it does for a connection that was deleted.
      this.databaseConnections = [];
    }
  }

  /**
   * Every database connection, plus any id this group already names that no longer exists — those
   * are shown as "(missing)" rather than dropped, so unticking one is a decision.
   */
  get groupConnectionChoices(): { code: string; name: string; missing: boolean }[] {
    const choices = this.databaseConnections.map((connection) => ({
      code: connection.connectionCode,
      name: connection.connectionName || connection.connectionCode,
      missing: false,
    }));

    for (const code of this.groupForm.connections)
      if (!choices.some((choice) => choice.code === code))
        choices.push({ code, name: code, missing: true });

    return choices;
  }

  /**
   * Every published dashboard, plus any this group already grants that is no longer published —
   * deleted ones are shown as "(missing)" rather than dropped, exactly like the connections above,
   * because the server keeps the grant until an administrator unticks it.
   */
  get groupDashboardChoices(): { id: string; name: string; missing: boolean }[] {
    const choices = this.dashboards.map((dashboard) => ({
      id: dashboard.id,
      name: dashboard.name || dashboard.id,
      missing: false,
    }));

    for (const id of this.groupForm.dashboards)
      if (!choices.some((choice) => choice.id === id)) choices.push({ id, name: id, missing: true });

    return choices;
  }

  /**
   * Every report, plus any this group already names that no longer exists — shown as "(missing)"
   * rather than dropped, exactly like the dashboards and connections above, because the server keeps
   * the grant until an administrator unticks it.
   */
  get groupReportChoices(): { id: string; name: string; missing: boolean }[] {
    const choices = this.availableReports.map((report) => ({
      id: report.id,
      name: report.name || report.id,
      missing: false,
    }));

    for (const id of this.groupForm.reports)
      if (!choices.some((choice) => choice.id === id)) choices.push({ id, name: id, missing: true });

    return choices;
  }

  isGroupReportGranted(reportId: string): boolean {
    return this.groupForm.reports.includes(reportId);
  }

  toggleGroupReport(reportId: string): void {
    const reports = this.groupForm.reports;
    const at = reports.indexOf(reportId);

    if (at < 0) reports.push(reportId);
    else reports.splice(at, 1);
  }

  isGroupDashboardGranted(reportId: string): boolean {
    return this.groupForm.dashboards.includes(reportId);
  }

  /**
   * Unticking the dashboard a group opens on takes the default with it: the server refuses a default
   * that is not granted, so leaving it behind would only turn Save into a 400.
   */
  toggleGroupDashboard(reportId: string): void {
    const dashboards = this.groupForm.dashboards;
    const at = dashboards.indexOf(reportId);

    if (at < 0) dashboards.push(reportId);
    else {
      dashboards.splice(at, 1);
      if (this.groupForm.defaultDashboard === reportId) this.groupForm.defaultDashboard = null;
    }
  }

  /** Picking the Default radio of a dashboard that is not ticked yet grants it as well. */
  setGroupDefaultDashboard(reportId: string): void {
    if (!this.groupForm.dashboards.includes(reportId)) this.groupForm.dashboards.push(reportId);
    this.groupForm.defaultDashboard = reportId;
  }

  /** The Limits column. The group picker shows the same sentence, from the same function. */
  describeLimits = describeGroupLimits;

  openNewGroup(): void {
    this.editingGroupId = null;
    this.groupDialogHeader = 'New Group';
    this.groupForm = {
      name: '',
      limitsEnabled: false,
      onlyTheseConnections: false,
      connections: [],
      scripts: true,
      reports: [],
      dashboards: [],
      defaultDashboard: null,
    };
    this.groupMembers = [];
    this.groupError = '';
    this.groupVisible = true;
  }

  openEditGroup(group: IamGroup): void {
    const settings = group.settings ?? {};
    this.editingGroupId = group.id;
    this.groupDialogHeader = 'Edit Group';
    this.groupForm = {
      name: group.name,
      // A group with no setting at all is not limiting anybody, so the box starts off — which is
      // also what the server reads back from an empty settings object.
      limitsEnabled: !!settings.connections || settings.scripts === false,
      onlyTheseConnections: !!settings.connections,
      connections: [...(settings.connections ?? [])],
      scripts: settings.scripts !== false,
      reports: [...(group.reports ?? [])],
      dashboards: [...(group.dashboards ?? [])],
      defaultDashboard: group.defaultDashboard ?? null,
    };
    this.groupMembers = group.members ?? [];
    this.groupError = '';
    this.groupVisible = true;
  }

  toggleGroupConnection(connectionCode: string): void {
    const connections = this.groupForm.connections;
    const at = connections.indexOf(connectionCode);
    if (at < 0) connections.push(connectionCode);
    else connections.splice(at, 1);
  }

  /**
   * The form as the server stores it. "Limit the members of this group" off saves `{}`; "All
   * connections"
   * leaves `connections` out rather than listing them all, so a connection added tomorrow is
   * allowed without editing every group.
   */
  private settingsFromForm(): IamLimitSettings {
    if (!this.groupForm.limitsEnabled) return {};

    const settings: IamLimitSettings = {};
    if (this.groupForm.onlyTheseConnections) settings.connections = [...this.groupForm.connections];
    if (!this.groupForm.scripts) settings.scripts = false;
    return settings;
  }

  async saveGroup(): Promise<void> {
    this.groupError = '';
    const settings = this.settingsFromForm();

    try {
      const reports = [...this.groupForm.reports];
      const dashboards = [...this.groupForm.dashboards];
      const defaultDashboard = this.groupForm.defaultDashboard;

      if (this.editingGroupId === null)
        await this.iamService.createGroup({
          name: this.groupForm.name,
          settings,
          reports,
          dashboards,
          defaultDashboard,
        });
      else
        await this.iamService.updateGroup(this.editingGroupId, {
          name: this.groupForm.name,
          settings,
          reports,
          dashboards,
          defaultDashboard,
        });

      this.groupVisible = false;
      this.messagesService.showSuccess(`Group ${this.groupForm.name} saved`);
      await this.reloadGroups();
      // The users list carries each user's groups and effective limits, so it is now stale.
      await this.reload();
    } catch (status) {
      this.groupError =
        status === 409
          ? 'A group with that name already exists.'
          : this.describeFailure(status, 'Could not save the group.');
    }
  }

  deleteGroup(group: IamGroup): void {
    this.confirmService.askConfirmation({
      message: `Delete the group ${group.name}? This cannot be undone.`,
      confirmAction: async () => {
        try {
          await this.iamService.deleteGroup(group.id);
          this.messagesService.showSuccess(`Group ${group.name} deleted`);
          await this.reloadGroups();
          await this.reload();
        } catch (status) {
          // 409 means it still has members. Said in the info dialog rather than a toast, because it
          // names the next step and a toast would be gone before it was read.
          if (status === 409)
            this.infoService.showInformation({
              title: 'Group not deleted',
              message: `${group.name} still has members. Take them out of the group first — Users tab, Edit on each user — and then delete it.`,
            });
          else this.messagesService.showError(`Could not delete the group ${group.name}`);
        }
      },
    });
  }

  // ============================================================
  // a user's groups
  // ============================================================

  editUserVisible = false;
  editUserError = '';
  editUsername = '';
  editUserEmail = '';
  editUserRole = '';
  editUserStatus = '';
  editUserEffectiveLimits = 'None';
  editUserEffectiveReports = '';
  editUserOpensOn = '';
  editUserGroupIds: number[] = [];

  newUserGroupIds: number[] = [];

  /** The Groups column. */
  groupNamesOf(user: IamUser): string {
    const groups = user.groups ?? [];
    return groups.length ? groups.map((group) => group.name).join(', ') : '\u2014';
  }

  /**
   * The user's own limits as the server worked them out, not as this screen guesses them: the
   * union of their groups, which is the only place that calculation is made.
   */
  describeEffectiveLimits(user: IamUser): string {
    const limits = user.effectiveLimits;
    if (!limits || (!limits.connections && limits.scripts !== false)) return 'None';

    const connections = limits.connections
      ? limits.connections.length
        ? limits.connections.join(', ')
        : 'none'
      : 'all';

    return `Connections: ${connections}. Scripts: ${limits.scripts === false ? 'off' : 'on'}.`;
  }

  /**
   * Where a dashboard viewer lands, by name. The server resolved it from the user's groups — this
   * only puts a name on the report id, and says so plainly when nothing has been shared yet, since
   * that is the state an administrator has to act on.
   */
  /**
   * Which reports this person's groups give them, by name. Null from the server means their groups
   * name none, which is every report — said in words here, because "Reports: (nothing)" next to an
   * empty list would read as the opposite of what it means.
   */
  describeEffectiveReports(user: IamUser): string {
    if (!user.effectiveReports) return 'All reports (no group of theirs names any)';
    if (!user.effectiveReports.length)
      return 'None — the reports their groups name no longer exist.';

    return user.effectiveReports
      .map((id) => this.availableReports.find((report) => report.id === id)?.name ?? id)
      .join(', ');
  }

  describeOpensOn(user: IamUser): string {
    if (!user.opensOn) return 'Nothing yet — no dashboard has been shared with their groups.';
    return this.dashboards.find((dashboard) => dashboard.id === user.opensOn)?.name ?? user.opensOn;
  }

  openEditUser(user: IamUser): void {
    this.editUsername = user.username;
    this.editUserEmail = user.email ?? '';
    this.editUserRole = user.role ?? '';
    this.editUserStatus = user.status === 'ACTIVE' ? 'Active' : 'Disabled';
    this.editUserEffectiveLimits = this.describeEffectiveLimits(user);
    this.editUserEffectiveReports = this.describeEffectiveReports(user);
    this.editUserOpensOn = this.describeOpensOn(user);
    this.editUserGroupIds = (user.groups ?? []).map((group) => group.id);
    this.editUserError = '';
    this.editUserVisible = true;
  }

  async saveUserGroups(): Promise<void> {
    this.editUserError = '';
    try {
      await this.iamService.setUserGroups(this.editUsername, this.editUserGroupIds);
      this.editUserVisible = false;
      this.messagesService.showSuccess(`Groups saved for ${this.editUsername}`);
      await this.reload();
      // Member counts and the members line in the group dialog move with this.
      await this.reloadGroups();
    } catch (status) {
      this.editUserError = this.describeFailure(status, 'Could not save the groups.');
    }
  }

  /**
   * ApiService rethrows the HTTP status, so translate the two the backend uses deliberately —
   * 409 for "already exists" and 402 for "the license has no room" — into something actionable.
   */
  private describeFailure(status: unknown, fallback: string): string {
    if (status === 409) return 'That name is already taken.';
    if (status === 402) return 'Your license does not allow any more. Contact sales to add seats.';
    if (status === 403) return 'You do not have permission to do that.';
    if (status === 400) return 'The server refused that. Check the name and the groups.';
    return fallback;
  }
}
