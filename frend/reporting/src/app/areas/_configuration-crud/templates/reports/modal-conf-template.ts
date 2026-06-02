import { html } from 'code-tag';
export const modalConfigurationTemplateTemplate = /*html*/ `@if (isModalConfigurationTemplateVisible) {
<dp-dialog
  [header]="modalConfigurationTemplateInfo.modalTitle"
  [(visible)]="isModalConfigurationTemplateVisible"
  [style]="{width: '800px'}"
>
  <div class="space-y-4" style="margin: 35px;">
    @if (modalConfigurationTemplateInfo.fileInfo.type == 'config-jasper-reports') {
    <div class="alert alert-info" style="margin-bottom: 15px;">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3"/></svg>&nbsp;
      <strong>JasperReport</strong> — This report is defined by a <code>.jrxml</code> template. Configuration is read-only. To modify the report, edit the <code>.jrxml</code> file in Jaspersoft Studio.
    </div>
    }

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION-TEMPLATES.MODAL-CONF-TEMPLATE.NAME' | translate
        }}
      </div>

      <div style="grid-column:span 10">
        <input
          type="text"
          class="input"
          id="templateName"
          [(ngModel)]="modalConfigurationTemplateInfo.fileInfo.templateName"
          (ngModelChange)="updateModelAndForm()"
          placeholder="e.g. Payslips, Invoices, Statements, etc."
          autofocus
          required
          [readonly]="modalConfigurationTemplateInfo.fileInfo.type == 'config-jasper-reports'"
        />
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION-TEMPLATES.MODAL-CONF-TEMPLATE.CAPABILITIES' |
        translate }}
      </div>

      <div style="grid-column:span 10">
        <input
          type="checkbox"
          id="btnCapReportDistribution"
          [(ngModel)]="modalConfigurationTemplateInfo.fileInfo.capReportDistribution"
          [disabled]="modalConfigurationTemplateInfo.fileInfo.type == 'config-jasper-reports'"
        />
        <label
          for="btnCapReportDistribution" class="checkboxlabel">
          &nbsp;{{'AREAS.CONFIGURATION-TEMPLATES.MODAL-CONF-TEMPLATE.CAP-REPORT-DISTRIBUTION'
          | translate}}
        </label>
        &nbsp;&nbsp;
        @if (modalConfigurationTemplateInfo.fileInfo.type == 'config-reports' || modalConfigurationTemplateInfo.fileInfo.type == 'config-jasper-reports') {
          <input
            type="checkbox"
            id="btnCapReportGenerationMailMerge"
            [(ngModel)]="modalConfigurationTemplateInfo.fileInfo.capReportGenerationMailMerge"
            [disabled]="modalConfigurationTemplateInfo.fileInfo.type == 'config-jasper-reports'"
          />
          <label for="btnCapReportGenerationMailMerge" class="checkboxlabel">
            &nbsp;{{'AREAS.CONFIGURATION-TEMPLATES.MODAL-CONF-TEMPLATE.CAP-REPORT-GENERATION'
            | translate}}
          </label>
        }
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION-TEMPLATES.MODAL-CONF-TEMPLATE.NOTES' | translate
        }}
      </div>

      <div style="grid-column:span 10">
        <dp-editor
          [style]="{'height':'200px', 'width':'500px'}"
          id="notes"
          [(ngModel)]="modalConfigurationTemplateInfo.fileInfo.notes"
          [readonly]="modalConfigurationTemplateInfo.fileInfo.type == 'config-jasper-reports'"
        ></dp-editor>
      </div>
    </div>

    <p></p>

    @if (!this.modalConfigurationTemplateInfo.fileInfo.capReportGenerationMailMerge) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION-TEMPLATES.MODAL-CONF-TEMPLATE.HOW-TO-USE' |
          translate }}
        </div>

        <div style="grid-column:span 10">
          @if (!modalConfigurationTemplateInfo.fileInfo.isFallback) {
            <input
              type="text"
              id="templateHowTo"
              class="input"
              [ngModel]="modalConfigurationTemplateInfo.templateHowTo"
              readonly
            />
          }
          @if (!modalConfigurationTemplateInfo.fileInfo.isFallback) {
            <em
              id="templateHowToSnipped"
              style="font-size: 9px"
            >
              <strong
                >{{
                'AREAS.CONFIGURATION-TEMPLATES.MODAL-CONF-TEMPLATE.ABOVE-SNIPPED' |
                translate }}</strong
              >
            </em>
          }
          @if (modalConfigurationTemplateInfo.fileInfo.isFallback) {
            <span
              id="fallbackTemplateSpan"
              style="font-size: 9px"
              [innerHTML]="'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.INNER-HTML.DEFAULT-CONFIGURATION' | translate"
            >
            </span>
          }
        </div>
      </div>
    }
  </div>

  <div ngProjectAs="[footer]">
    <span>
      @if (modalConfigurationTemplateInfo.templateFilePathExists == 'file') {
        <span
          id="alreadyExistsWarning"
          style="font-size: 9px"
          class="badge badge-warning"
          >{{
          'AREAS.CONFIGURATION-TEMPLATES.MODAL-CONF-TEMPLATE.FILE-ALREADY-EXISTS'
          | translate }}</span
        >
      }&nbsp;
    </span>
    <button
      id="btnOKConfirmation"
      class="btn btn-outline btn-primary dburst-button-question-confirm"
      type="button"
      (click)="onModalOK()"
      [disabled]="
        !modalConfigurationTemplateInfo.fileInfo.templateName ||
        (modalConfigurationTemplateInfo.crudMode == 'create' &&
        (modalConfigurationTemplateInfo.templateFilePathExists == 'file')) ||
        modalConfigurationTemplateInfo.fileInfo.type == 'config-jasper-reports' ||
        !isModalDirty()
      "
    >
      {{ modalConfigurationTemplateInfo.crudMode === 'create' ? 'Create &amp; Continue Configuration' : 'Save &amp; Continue Configuration' }}
    </button>

    <button
      id="btnClose"
      class="btn btn-ghost dburst-button-question-decline"
      type="button"
      (click)="onModalClose()"
    >
      {{ 'BUTTONS.CANCEL' | translate }}
    </button>
  </div>
</dp-dialog>
} `;
