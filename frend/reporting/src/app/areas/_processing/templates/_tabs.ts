export const tabsTemplate = `
<dp-tabs>
  @for (tab of visibleTabs; track tab.id) {
    <dp-tab [id]="tab.id" [heading]="tab.heading | translate">
      <ng-container [ngTemplateOutlet]="this[tab.ngTemplateOutlet]">
      </ng-container>
    </dp-tab>
  }
</dp-tabs>
`;
