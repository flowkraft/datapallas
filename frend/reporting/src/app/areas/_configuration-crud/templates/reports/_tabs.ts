export const tabsTemplate = `<dp-tabs>
  <dp-tab heading="{{ 'AREAS.CONFIGURATION-TEMPLATES.TABS.CONFIGURATION-TEMPLATES' | translate }}">
    <ng-container [ngTemplateOutlet]="tabConfTemplates"> </ng-container>
  </dp-tab>

  <dp-tab heading="{{ 'SHARED-TABS.LICENSE' | translate }}">
    <ng-container [ngTemplateOutlet]="tabLicenseTemplate"> </ng-container>
  </dp-tab>
</dp-tabs>`;
