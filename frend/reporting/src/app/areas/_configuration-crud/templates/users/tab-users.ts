export const tabUsersTemplate = `
<div class="p-2">

  <div class="flex items-center gap-2 mb-3">
    <button id="btnNewUser" type="button" class="btn btn-outline btn-primary btn-sm"
            (click)="openNewUser()">
      New User
    </button>
    <span class="text-sm opacity-70">{{ users.length }} user(s)</span>

    <!-- Search earns its space only once there is more than a page to search through. -->
    @if (users.length > pageSize || searchTerm) {
      <div class="join ml-auto">
        <span class="join-item btn btn-ghost btn-sm">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
        </span>
        <input id="userSearch" type="text" class="input input-sm join-item"
               placeholder="Search name, email or role"
               [ngModel]="searchTerm" (ngModelChange)="onSearchChange($event)" />
        @if (searchTerm) {
          <button id="btnClearUserSearch" type="button" class="join-item btn btn-ghost btn-sm"
                  (click)="onSearchChange('')" title="Clear search">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        }
      </div>
    }
  </div>

  @if (loadError) {
    <div id="usersLoadError" role="alert" class="alert alert-error mb-3">
      <span>{{ loadError }}</span>
    </div>
  }

  <table id="tableUsers" class="table table-zebra w-full">
    <thead>
      <tr>
        <th>User</th>
        <th>Role</th>
        <th>Status</th>
        <th class="text-right">Actions</th>
      </tr>
    </thead>
    <tbody>
      @for (user of pagedUsers; track user.username) {
        <tr [id]="'user-' + user.username">
          <td>
            <div class="font-medium">{{ user.username }}</div>
            @if (user.email) {
              <div class="text-xs opacity-60">{{ user.email }}</div>
            }
          </td>
          <td>
            <select
              [id]="'roleOf-' + user.username"
              class="select select-bordered select-sm"
              [ngModel]="roleOf(user.username)"
              (ngModelChange)="changeRole(user.username, $event)"
              [disabled]="isSelf(user.username)">
              @for (role of assignableRoles; track role) {
                <option [value]="role">{{ role }}</option>
              }
            </select>
          </td>
          <!-- The id sits on the cell rather than on either badge: only one of them is ever
               rendered, so one id names "this person's status" whichever way it reads. -->
          <td [id]="'statusOf-' + user.username">
            @if (user.status === 'ACTIVE') {
              <span class="badge badge-success badge-sm">Active</span>
            } @else {
              <span class="badge badge-ghost badge-sm">Disabled</span>
            }
          </td>
          <td class="text-right">
            <button [id]="'btnResetPassword-' + user.username" type="button"
                    class="btn btn-ghost btn-xs" (click)="openResetPassword(user.username)">
              Reset Password
            </button>
            @if (!isSelf(user.username) && user.status === 'ACTIVE') {
              <button [id]="'btnDisableUser-' + user.username" type="button"
                      class="btn btn-ghost btn-xs" (click)="disableUser(user.username)">
                Disable
              </button>
            }
            <!-- The way back. Disabling used to be undoable only by deleting the account. -->
            @if (!isSelf(user.username) && user.status !== 'ACTIVE') {
              <button [id]="'btnEnableUser-' + user.username" type="button"
                      class="btn btn-ghost btn-xs text-success" (click)="enableUser(user.username)">
                Enable
              </button>
            }
            @if (!isSelf(user.username)) {
              <button [id]="'btnDeleteUser-' + user.username" type="button"
                      class="btn btn-ghost btn-xs text-error" (click)="deleteUser(user.username)">
                Delete
              </button>
            }
          </td>
        </tr>
      } @empty {
        <tr>
          <td colspan="4" class="text-center opacity-60">
            @if (searchTerm) {
              No users match '{{ searchTerm }}'.
            } @else {
              No users yet.
            }
          </td>
        </tr>
      }
    </tbody>
  </table>

  <!-- Pagination — shown only when there is more than one page, so a three-user install sees none of
       it. "Showing 1-5 of 9" rather than a bare page number, because the count above the table now
       describes the whole list and not what is on screen. -->
  @if (totalPages > 1) {
    <nav class="mt-2">
      <div class="flex justify-between items-center">
        <span id="usersPageSummary" class="text-xs opacity-60">
          Showing {{ pageStart + 1 }}-{{ pageEnd }} of {{ filteredUsers.length }}
        </span>
        <div class="flex items-center gap-2">
          <div class="join">
            <button id="btnUsersPrevPage" type="button" class="join-item btn btn-xs"
                    [disabled]="page === 0" (click)="goToPage(page - 1)">&laquo;</button>
            @for (p of pageNumbers; track p) {
              <button [id]="'btnUsersPage-' + p" type="button" class="join-item btn btn-xs"
                      [class.btn-active]="p === page" (click)="goToPage(p)">{{ p + 1 }}</button>
            }
            <button id="btnUsersNextPage" type="button" class="join-item btn btn-xs"
                    [disabled]="page >= totalPages - 1" (click)="goToPage(page + 1)">&raquo;</button>
          </div>
          <select id="usersPageSize" class="select select-bordered select-xs"
                  [ngModel]="pageSize" (ngModelChange)="onPageSizeChange($event)"
                  title="Rows per page">
            @for (size of pageSizeOptions; track size) {
              <option [value]="size">{{ size }} / page</option>
            }
          </select>
        </div>
      </div>
    </nav>
  }

  <div class="mt-4 text-xs opacity-70">
    <div class="font-semibold mb-1">What the roles mean</div>
    @for (role of assignableRoles; track role) {
      <div><span class="font-mono">{{ role }}</span> — {{ roleDescriptions[role] }}</div>
    }
    <div class="mt-2">
      Note: anyone who can write Groovy, FreeMarker or JasperReports content can run code on this
      server. ADMIN and REPORT_AUTHOR are both trusted-operator roles.
    </div>
  </div>

</div>

<!-- New user -->
<dp-dialog header="New User" [(visible)]="newUserVisible" [style]="{ width: '520px' }">

  @if (newUserError) {
    <div id="newUserError" role="alert" class="alert alert-error mb-3">
      <span>{{ newUserError }}</span>
    </div>
  }

  <label class="form-control w-full mb-2">
    <div class="label"><span class="label-text">Username</span></div>
    <input id="newUserUsername" class="input input-bordered w-full" [(ngModel)]="newUser.username" />
  </label>

  <label class="form-control w-full mb-2">
    <div class="label"><span class="label-text">Email (optional)</span></div>
    <input id="newUserEmail" class="input input-bordered w-full" [(ngModel)]="newUser.email" />
  </label>

  <label class="form-control w-full mb-2">
    <div class="label"><span class="label-text">Password</span></div>
    <input id="newUserPassword" type="password" class="input input-bordered w-full"
           [(ngModel)]="newUser.password" />
  </label>

  <label class="form-control w-full mb-2">
    <div class="label"><span class="label-text">Role</span></div>
    <select id="newUserRole" class="select select-bordered w-full" [(ngModel)]="newUser.role">
      @for (role of assignableRoles; track role) {
        <option [value]="role">{{ role }}</option>
      }
    </select>
  </label>

  <div class="text-xs opacity-70">{{ roleDescriptions[newUser.role] }}</div>

  <div ngProjectAs="[footer]">
    <button id="btnSaveNewUser" type="button" class="btn btn-outline btn-primary"
            [disabled]="!newUser.username || !newUser.password" (click)="createUser()">
      Create
    </button>
    <button id="btnCancelNewUser" type="button" class="btn btn-outline"
            (click)="newUserVisible = false">
      Cancel
    </button>
  </div>
</dp-dialog>

<!-- Reset password -->
<dp-dialog header="Reset Password" [(visible)]="resetPasswordVisible" [style]="{ width: '460px' }">

  <div class="mb-2 text-sm">New password for <b>{{ resetPasswordUsername }}</b></div>

  <label class="form-control w-full">
    <input id="resetPasswordValue" type="password" class="input input-bordered w-full"
           [(ngModel)]="resetPasswordValue" />
  </label>

  <div ngProjectAs="[footer]">
    <button id="btnSaveResetPassword" type="button" class="btn btn-outline btn-primary"
            [disabled]="!resetPasswordValue" (click)="resetPassword()">
      Save
    </button>
    <button id="btnCancelResetPassword" type="button" class="btn btn-outline"
            (click)="resetPasswordVisible = false">
      Cancel
    </button>
  </div>
</dp-dialog>
`;
