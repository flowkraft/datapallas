export const tabsTemplate = `<dp-tabs>
  <dp-tab heading="Cubes">
    <ng-container [ngTemplateOutlet]="tabCubeDefinitionsTemplate">
    </ng-container>
  </dp-tab>

  <dp-tab heading="{{ 'SHARED-TABS.LICENSE' | translate }}">
    <ng-container [ngTemplateOutlet]="tabLicenseTemplate">
    </ng-container>
  </dp-tab>
</dp-tabs>`;
