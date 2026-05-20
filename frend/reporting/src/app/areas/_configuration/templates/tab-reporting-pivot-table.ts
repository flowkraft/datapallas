export const tabReportingPivotTableTemplate = `<ng-template
  #tabReportingPivotTableTemplate
>
  <div class="space-y-4">
    <dp-tabs>
      <dp-tab heading="Preview">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 20px;">
          <div style="grid-column:span 12">
            <!-- Named components (aggregator report) -->
            @if (getNamedPivotIds().length > 0) {
              @for (cid of getNamedPivotIds(); track $index) {
                <div class="card card-border" style="margin-bottom: 15px;">
                  <div class="card-title"><strong>{{cid}}</strong></div>
                  <div class="card-body">
                    @if (showPivotPreview) {
                      <rb-pivot-table
                        [reportId]="getCurrentReportCode()"
                        [componentId]="cid"
                        [apiBaseUrl]="reportingService.reportingApiBaseUrl"
                        [reportParams]="previewParams || {}"
                        [testMode]="true"
                        (dataFetched)="onPivotDataFetched($any($event))"
                        (error)="onPivotFetchError($any($event))"
                      ></rb-pivot-table>
                    }
                  </div>
                </div>
              }
            }

            <!-- Single unnamed component (standard report) — Mode 1: Angular fetches data once, pushes via [data] prop -->
            @if (getNamedPivotIds().length === 0) {
              <div class="card card-border">
                <div class="card-body">
                  <!-- Show message when Pivot Table Options are not configured -->
                  @if (!activePivotTableConfigScriptGroovy?.trim()) {
                    <div class="text-center" style="padding: 20px;">
                      <strong>Pivot Table is not yet configured.</strong> To display a pivot table, go to the <strong>Pivot Table Options</strong> tab and configure your pivot table settings.
                    </div>
                  }

                  <!-- Pivot Table Web Component -->
                  @if (activePivotTableConfigScriptGroovy?.trim() && reportDataResult && !reportDataResultIsError && reportDataResult?.data?.length > 0) {
                    <rb-pivot-table #pivotTable
                      [data]="reportDataResult?.data"
                      [rows]="activePivotTableConfigOptions?.rows || []"
                      [cols]="activePivotTableConfigOptions?.cols || []"
                      [vals]="activePivotTableConfigOptions?.vals || []"
                      [aggregatorName]="activePivotTableConfigOptions?.aggregatorName || 'Count'"
                      [rendererName]="activePivotTableConfigOptions?.rendererName || 'Table'"
                      [rowOrder]="activePivotTableConfigOptions?.rowOrder || 'key_a_to_z'"
                      [colOrder]="activePivotTableConfigOptions?.colOrder || 'key_a_to_z'"
                      [valueFilter]="activePivotTableConfigOptions?.valueFilter || {}"
                    ></rb-pivot-table>
                  }

                  <!-- Show 'No Data' when pivot table is configured but no data -->
                  @if (activePivotTableConfigScriptGroovy?.trim() && (!reportDataResult || (!reportDataResultIsError && (!reportDataResult?.data || reportDataResult?.data?.length === 0)))) {
                    <div id="noDataPivotTable" class="text-center" style="padding: 20px;">
                      <strong>No Data</strong>
                    </div>
                  }

                  @if (reportDataResult && reportDataResultIsError) {
                    <div>
                      <div class="alert alert-error">
                        <strong>Error:</strong> Query failed. Check Logs below.
                      </div>
                      <pre style="white-space:pre-wrap;max-height:300px;overflow:auto;">
                        {{ reportDataResult.data?.[0]?.ERROR_MESSAGE }}
                      </pre>
                      <div
                        id="errorsLogPivotTable"
                        class="card-body"
                        style="
                          color: red;
                          height: 420px;
                          overflow-y: scroll;
                          overflow-x: auto;
                          -webkit-user-select: all;
                          user-select: all;
                        "
                      >
                        <dburst-log-file-viewer logFileName="errors.log"></dburst-log-file-viewer>
                      </div>
                    </div>
                  }

                  @if (reportDataResult) {
                    <div>
                      <br/>
                      <p>Execution Time: {{ reportDataResult.executionTimeMillis }}ms</p>
                      <p>Total Rows: {{ reportDataResult.data?.length || 0 }}</p>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      </dp-tab>

      <dp-tab heading="Pivot Table Options" id="pivotTableOptionsTab">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px;">
          <div style="grid-column:span 12">
            <ngx-codejar
              id="pivotTableConfigEditor"
              #pivotTableConfigEditor
              [(code)]="activePivotTableConfigScriptGroovy"
              (update)="onPivotTableConfigChanged($event)"
              [highlightMethod]="highlightGroovyCode"
              [highlighter]="'prism'"
              [showLineNumbers]="true"
              style="height: 350px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; margin-top: 10px;"
            ></ngx-codejar>
            <button id="btnAiHelpPivotTableConfig" type="button" class="btn btn-outline w-full" style="margin-top: 10px;" (click)="askAiForHelp('dsl.pivottable')">
              <strong>Hey AI, Help Me Configure This Pivot Table ...</strong>
            </button>
          </div>
        </div>
      </dp-tab>

      <dp-tab heading="Example (Pivot Table Options)">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px;">
          <div style="grid-column:span 12">
            <a id="btnSeeMorePivotTableExamples" href="https://datapallas.com/docs/bi-analytics/web-components/pivottables" target="_blank" class="btn btn-outline w-full" style="color: #337ab7; text-decoration: underline; margin-bottom: 10px;">
              See More Pivot Tables Examples
            </a>
            <ngx-codejar
              id="pivotTableConfigExampleEditor"
              [code]="examplePivotTableConfigScript"
              [highlightMethod]="highlightGroovyCode"
              [highlighter]="'prism'"
              [showLineNumbers]="true"
              [readonly]="true"
              style="height: 350px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; background-color: #f8f8f8; margin-top: 10px;"
            ></ngx-codejar>
            <button id="btnCopyToClipboardPivotTableConfigExample" type="button" class="btn btn-outline w-full" style="margin-top: 10px;" (click)="copyToClipboardPivotTableConfigExample()">
              Copy Example Pivot Table Options To Clipboard
            </button>
          </div>
        </div>
      </dp-tab>
    </dp-tabs>
  </div>
</ng-template>`;
