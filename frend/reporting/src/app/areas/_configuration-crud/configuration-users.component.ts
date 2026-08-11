import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';

import { SHARED_IMPORTS } from '../../shared/shared-imports';
import { LicenseComponent } from '../../components/license/license.component';
import { ConfirmService } from '../../components/dialog-confirm/confirm.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { AuthService } from '../../providers/auth.service';
import {
  IamService,
  IamUser,
  ASSIGNABLE_ROLES,
  ROLE_DESCRIPTIONS,
  AssignableRole,
} from '../../providers/iam.service';

import { tabsTemplate } from './templates/users/_tabs';
import { tabUsersTemplate } from './templates/users/tab-users';
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
    ${tabLicenseTemplate}
  `,
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [...SHARED_IMPORTS, LicenseComponent],
})
export class ConfigurationUsersComponent implements OnInit {
  private readonly iamService = inject(IamService);
  private readonly authService = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
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
      });
      this.newUserVisible = false;
      this.messagesService.showSuccess(`User ${this.newUser.username} created`);
      await this.reload();
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


  /**
   * ApiService rethrows the HTTP status, so translate the two the backend uses deliberately —
   * 409 for "already exists" and 402 for "the license has no room" — into something actionable.
   */
  private describeFailure(status: unknown, fallback: string): string {
    if (status === 409) return 'That name is already taken.';
    if (status === 402) return 'Your license does not allow any more. Contact sales to add seats.';
    if (status === 403) return 'You do not have permission to do that.';
    return fallback;
  }
}
