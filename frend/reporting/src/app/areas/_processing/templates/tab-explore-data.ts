export const tabExploreDataTemplate = `<ng-template
  #tabExploreDataTemplate
>
  <div class="space-y-4 pb-0">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 14px">
      <div class="text-center" style="grid-column:span 12">
        <a
          id="btnExploreCmsWebPortalApps"
          href="#"
          [routerLink]="['/help','appsMenuSelected']"
          skipLocationChange="true"
          class="btn btn-outline btn-primary"
        >
          Explore More Apps That Go Well Together with DataPallas
        </a>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px">
      <div style="grid-column:span 12">
        <dburst-apps-manager
          [dropdownDirection]="'expandedList'"
          [inputAppsToShow]="['flowkraft-data-canvas']"
          [showDevButtons]="false"
        >
        </dburst-apps-manager>
      </div>
    </div>

    <!-- Dashboard Reports Table -->
    @if (dashboardReports.length > 0) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 12px">
        <div style="grid-column:span 12">
          <div style="display: flex; align-items: center; justify-content: space-between; margin: 10px 0 8px;">
            <h4 style="margin: 0; font-weight: 600;">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4" style="margin-right: 8px; color: #5a9bb8;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg>
              Dashboards
            </h4>
            <button
              id="btnRefreshDashboards"
              type="button"
              class="btn btn-ghost btn-sm"
              (click)="refreshDashboards()"
              [disabled]="isDashboardRefreshing"
              title="Refresh dashboard list"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" [class]="isDashboardRefreshing ? 'inline-block w-4 h-4 animate-spin' : 'inline-block w-4 h-4'"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
            </button>
          </div>
          <table id="dashboardsTable" class="table" style="background-color: var(--color-base-100); color: var(--color-base-content); margin-bottom: 8px;">
            <thead>
              <tr>
                <th>Name</th>
                <th style="width:90px; text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (r of dashboardPagedReports; track $index) {
                <tr>
                  <td>
                    {{ r.templateName || r.folderName }}
                    @if (r.type === 'config-samples') {
                      <span
                        class="badge badge-ghost"
                        style="margin-left: 8px; font-size: 0.78em;"
                      >sample</span>
                    }
                  </td>
                  <td style="text-align:center;">
                    <a
                      [id]="'btnViewDashboard_' + r.folderName"
                      [href]="dashboardService.getDashboardUrl(r.folderName)"
                      target="_blank"
                      class="btn btn-xs btn-ghost"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>&nbsp;View
                    </a>
                  </td>
                </tr>
              }
              @if (dashboardPagedReports.length === 0) {
                <tr>
                  <td colspan="2" style="text-align: center; color: #999; padding: 20px;">
                    @if (dashboardSearchTerm) {
                      <span>No dashboards match '{{ dashboardSearchTerm }}'</span>
                    }
                    @if (!dashboardSearchTerm) {
                      <span>No dashboards yet</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <!-- Pagination (reports-list style) -->
          @if (dashboardFilteredReports.length > dashboardPageSize) {
            <nav style="margin-top: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #777; font-size: 12px;">
                  Showing {{ dashboardPageStart + 1 }}-{{ dashboardPageEnd }} of {{ dashboardFilteredReports.length }}
                </span>
                <ul class="pagination pagination-sm" style="margin: 0;">
                  <li [ngClass]="{ 'disabled': dashboardPage === 0 }">
                    <a href="#" (click)="dashboardPrevPage(); $event.preventDefault()">&laquo;</a>
                  </li>
                  @for (p of dashboardPageNumbers; track $index) {
                    <li
                      [ngClass]="{ 'active': p === dashboardPage }"
                    >
                      <a href="#" (click)="dashboardGoToPage(p); $event.preventDefault()">{{ p + 1 }}</a>
                    </li>
                  }
                  <li [ngClass]="{ 'disabled': dashboardPage >= dashboardTotalPages - 1 }">
                    <a href="#" (click)="dashboardNextPage(); $event.preventDefault()">&raquo;</a>
                  </li>
                </ul>
              </div>
            </nav>
          }

        </div>
      </div>
    }

    <!-- Search box — only shown when there are enough dashboards for 2+ pages -->
    @if (dashboardTotalPages >= 2 || dashboardSearchTerm) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 6px;margin-bottom: 10px;">
        <div style="grid-column:span 12">
          <div class="join">
            <span class="join-item btn btn-ghost"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg></span>
            <input
              type="text"
              id="dashboardSearch"
              class="input join-item"
              placeholder="Search by name"
              [ngModel]="dashboardSearchTerm"
              (ngModelChange)="onDashboardSearchChange($event)"
            />
            @if (dashboardSearchTerm) {
              <button
                type="button"
                class="join-item btn btn-ghost"
                (click)="onDashboardSearchChange('')"
                title="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            }
          </div>
        </div>
      </div>
    }

  </div>
</ng-template> `;
