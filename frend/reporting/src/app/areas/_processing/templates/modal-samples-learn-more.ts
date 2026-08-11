export const modalSamplesLearnMoreTemplate = `@if (isModalSamplesLearnMoreVisible) {
<dp-dialog
  [header]="modalSampleInfo.title"
  [(visible)]="isModalSamplesLearnMoreVisible"
  [style]="{width: '800px'}"
>
  <div style="margin: 25px;">

  <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

  <div style="grid-column:span 2">
    <strong>{{
      'AREAS.TOP-MENU-HEADER.DOCUMENTATION' | translate
    }}</strong>
  </div>

  <div style="grid-column:span 10">
      <a href="{{modalSampleInfo.documentation}}" target="_blank">{{modalSampleInfo.documentation}}</a>
  </div>

 </div>
  <br/>
  <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
      {{
        'SAMPLES.MODAL.FEATURES' | translate
      }}
      </div>

      <div style="grid-column:span 10">

      <input
          type="checkbox"
          id="btnCapReportSplitting"
          [ngModel]="modalSampleInfo.capReportSplitting" onclick="return false;"
          />
        <label
          for="btnCapReportSplitting" class="checkboxlabel">
          &nbsp;{{'AREAS.CONFIGURATION-TEMPLATES.MODAL-CONF-TEMPLATE.CAP-REPORT-SPLITTING' | translate}}
        </label>
        &nbsp;&nbsp;

        <input
          type="checkbox"
          id="btnCapReportDistribution"
          [ngModel]="modalSampleInfo.capReportDistribution" onclick="return false;"
          />
        <label
          for="btnCapReportDistribution" class="checkboxlabel">
          &nbsp;{{'AREAS.CONFIGURATION-TEMPLATES.MODAL-CONF-TEMPLATE.CAP-REPORT-DISTRIBUTION' | translate}}
        </label>
        &nbsp;&nbsp;
        <input
          type="checkbox"
          id="btnCapReportGenerationMailMerge"
          [ngModel]="modalSampleInfo.capReportGenerationMailMerge" onclick="return false;"
          />
        <label
          for="btnCapReportGenerationMailMerge" class="checkboxlabel">
          &nbsp;{{'AREAS.CONFIGURATION-TEMPLATES.MODAL-CONF-TEMPLATE.CAP-REPORT-GENERATION' | translate}}
        </label>

      </div>

    </div>
    <p></p>

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
    <div style="grid-column:span 2">
    {{
      'SAMPLES.MODAL.INPUT' | translate
    }}
    </div>

    <div style="grid-column:span 10">

        <div id="modalInputDetails"
         [innerHTML]="modalSampleInfo.inputDetails"
         style="
           display: block;
           white-space: pre-wrap !important;
           word-break: break-word;
           word-wrap: break-word;
           overflow-wrap: break-word;
           line-height: 2;
           margin: 10px 0;
         ">
    </div>

    </div>
  </div>

  <br/>
  <br/>

  <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
  <div style="grid-column:span 2">
  {{
    'SAMPLES.MODAL.EXPECTED-OUTPUT' | translate
  }}
  </div>

  <div id="modalOutputDetails" style="grid-column:span 10" [innerHTML]="modalSampleInfo.outputDetails">
  </div>
</div>

<br/>
<br/>

  <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 2">{{
        'SAMPLES.MODAL.NOTES' | translate
      }}
      </div>

      <div id="div{{modalSampleInfo.id}}" style="grid-column:span 10" [innerHTML] = "modalSampleInfo.notes">


      </div>
  </div>

  <p></p>

  @if (!modalSampleInfo.capReportGenerationMailMerge) {
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
      {{
        'SAMPLES.MODAL.CONFIGURATION' | translate
      }}
        </div>

        <div style="grid-column:span 10">
          <input type="text" id="templateHowTo" class="input"
            [ngModel]="modalSampleInfo.configurationFilePath" readonly />

        </div>
      </div>
  }
    <br/>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

    <div style="grid-column:span 2">

    </div>

    <!-- Samples are a Processing screen, but this button leaves it for the Configuration editor —
         REPORT_AUTHOR and above. Without the guard an operator lands on a screen that refuses to save. -->
    @if (authService.canViewConfiguration()) {
    <div style="grid-column:span 10">
      <button type="button" id="btnViewConfigurationFile{{modalSampleInfo.id}}" class="btn btn-outline btn-primary btn-xs" (click)="doSampleViewConfigurationFile(modalSampleInfo.configurationFilePath, modalSampleInfo.configurationFileName)">&nbsp;&nbsp;&nbsp;&nbsp;View Configuration&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</button>
    </div>
    }

   </div>

    </div>


    <p></p>

  <div ngProjectAs="[footer]">
    <button id="btnCloseSamplesLearnMoreModal" class="btn btn-ghost" type="button" (click)="doCloseSamplesLearnMoreModal()">
      {{ 'BUTTONS.CLOSE' | translate }}
    </button>
  </div>
</dp-dialog>
}
`;
