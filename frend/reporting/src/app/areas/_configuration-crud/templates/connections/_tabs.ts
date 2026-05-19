export const tabsTemplate = `<dp-tabs>
  <dp-tab heading="{{ 'AREAS.CONFIGURATION-CONNECTIONS.TABS.CONFIGURATION-CONNECTIONS' | translate }}">
    <ng-container [ngTemplateOutlet]="tabExternalConnectionsTemplate">
    </ng-container>
  </dp-tab>

  <dp-tab heading="{{ 'SHARED-TABS.LICENSE' | translate }}">
    <ng-container [ngTemplateOutlet]="tabLicenseTemplate">
    </ng-container>
  </dp-tab>
</dp-tabs>`;
