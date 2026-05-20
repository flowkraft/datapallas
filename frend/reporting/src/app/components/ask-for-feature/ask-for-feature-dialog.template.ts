export const askForFeatureDialogTemplate = `
<dp-dialog [header]="title" [(visible)]="isVisible" (visibleChange)="onVisibleChange($event)"
  [style]="{ width: '800px' }">

  @if (!settingsService.isDefaultEmailConnectionConfigured()) {
    <div
      [innerHTML]="'COMPONENTS.ASK-FOR-FEATURE-DIALOG.INNER-HTML.EMAIL-NOT-CONFIGURED-PROPERLY' | translate">
    </div>
  }

  @if (settingsService.isDefaultEmailConnectionConfigured()) {
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.TO' | translate }}
      </div>
      <div style="grid-column:span 10">
        <input id="emailToAddress" [ngModel]="msgTo" class="input" readonly />
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.SUBJECT' | translate }}
      </div>
      <div style="grid-column:span 10">
        <input id="emailSubject" [(ngModel)]="msgSubject" class="input" />
      </div>
    </div>
    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.MESSAGE' | translate }}
      </div>
      <div style="grid-column:span 10">
        <textarea class="textarea textarea-bordered" rows="20" id="htmlCodeEmailMessage" [(ngModel)]="msgMessage"></textarea>
      </div>
    </div>
  }

  <div ngProjectAs="[footer]">
    @if (settingsService.isDefaultEmailConnectionConfigured()) {
      <button
        type="button"
        class="btn btn-primary dburst-button-question-confirm"
        (click)="confirm('send-message')"
        [innerHTML]="confirmLabel"
      ></button>
    }
    @if (!settingsService.isDefaultEmailConnectionConfigured()) {
      <button
        type="button"
        class="btn btn-primary dburst-button-question-confirm"
        (click)="confirm('configure-email-properly')"
        [innerHTML]="'COMPONENTS.ASK-FOR-FEATURE-DIALOG.INNER-HTML.CONFIGURE-EMAIL-PROPERLY' | translate"
      ></button>
    }
    <button id="btnCloseAskForFeatureModal" class="btn btn-ghost dburst-button-question-decline"
      type="button" (click)="confirm()">
      {{ 'BUTTONS.CANCEL' | translate }}
    </button>
  </div>
</dp-dialog>
`;
