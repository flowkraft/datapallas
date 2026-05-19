export const tabsTemplate = `<dp-tabs>
  @for (tab of visibleTabs; track tab.id) {
    <dp-tab [id]="tab.id">
      <ng-template dpTabHeading><span [innerHTML]="tab.heading | translate"></span></ng-template>
      <ng-container [ngTemplateOutlet]="this[tab.ngTemplateOutlet]">
      </ng-container>
    </dp-tab>
  }
</dp-tabs>`;
