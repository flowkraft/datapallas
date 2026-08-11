export const tabCustomerPortalTemplate = `<ng-template
  #tabCustomerPortalTemplate
>
  <div class="space-y-4 pb-0">

    <!-- Leads to Help > Apps / Starter Packs, which is ADMIN. -->
    @if (authService.canManageApps()) {
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 14px">
      <div class="text-center" style="grid-column:span 12">
        <a
          id="btnExploreCustomerPortalApps"
          href="#"
          [routerLink]="['/help','appsMenuSelected']"
          skipLocationChange="true"
          class="btn btn-outline btn-primary"
        >
          Explore More Apps That Go Well Together with DataPallas
        </a>
      </div>
    </div>
    }

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px">
      <div style="grid-column:span 12">
        <dburst-apps-manager
          [dropdownDirection]="'expandedList'"
          [inputAppsToShow]="['flowkraft-grails']"
          [showDevButtons]="false"
        >
        </dburst-apps-manager>
      </div>
    </div>

  </div>
</ng-template> `;
