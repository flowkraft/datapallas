export const tabsTemplate = `<dp-tabs>
  <dp-tab heading="Users">
    <ng-container [ngTemplateOutlet]="tabUsersTemplate">
    </ng-container>
  </dp-tab>

  <!-- No Tenants tab. A tenant's meaning is its own home directory — its own reports, connections
       and output — and nothing outside the IAM store scopes anything to one yet, so a second tenant
       would silently share everything with the first. Until that separation exists, offering the
       screen would promise a boundary the product does not enforce. Everyone belongs to the DEFAULT
       tenant, which is exactly what a single-department server needs. -->

  <dp-tab heading="{{ 'SHARED-TABS.LICENSE' | translate }}">
    <ng-container [ngTemplateOutlet]="tabLicenseTemplate">
    </ng-container>
  </dp-tab>
</dp-tabs>`;
