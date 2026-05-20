export const tabReportingTabulatorTemplate = `<ng-template
  #tabReportingTabulatorTemplate
>
  <div class="space-y-4">
    <dp-tabs>
      <dp-tab heading="Preview">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 20px;">
          <div style="grid-column:span 12">
            <!-- Named components (aggregator report) -->
            @if (getNamedTabulatorIds().length > 0) {
              @for (cid of getNamedTabulatorIds(); track $index) {
                <div class="card card-border" style="margin-bottom: 15px;">
                  <div class="card-title"><strong>{{cid}}</strong></div>
                  <div class="card-body">
                    @if (showTabulatorPreview) {
                      <rb-tabulator
                        [reportId]="getCurrentReportCode()"
                        [componentId]="cid"
                        [apiBaseUrl]="reportingService.reportingApiBaseUrl"
                        [reportParams]="previewParams || {}"
                        [testMode]="true"
                        (dataFetched)="onTabulatorDataFetched($any($event))"
                        (fetchError)="onTabulatorFetchError($any($event))"
                        (ready)="onTabReady($event)"
                        (initError)="onTabError($any($event).detail.message)"
                        (tableError)="onTabError($any($event).detail.message)"
                      ></rb-tabulator>
                    }
                  </div>
                </div>
              }
            }

            <!-- Single unnamed component (standard report) — Mode 1: Angular fetches data once, pushes via [data] prop -->
            @if (getNamedTabulatorIds().length === 0) {
              <div class="card card-border">
                <div class="card-body">
                  <!-- Clear All Filters link — only visible when filters are active -->
                  @if (tabulatorHasActiveFilters) {
                    <div style="text-align: right; margin-bottom: 6px;">
                      <a href="javascript:void(0)" (click)="clearAllTabulatorFilters()" style="font-weight: bold; cursor: pointer;">Clear All Filters</a>
                    </div>
                  }

                  <!-- Show table when data exists -->
                  @if (reportDataResult && !reportDataResultIsError && reportDataResult?.data?.length > 0) {
                    <rb-tabulator #tabulator
                      [data]="reportDataResult?.data"
                      [columns]="activeTabulatorConfigOptions?.columns || (reportDataResult?.reportColumnNames | tabulatorColumns)"
                      [options]="activeTabulatorConfigOptions || {}"
                      [loading]="isReportDataLoading"
                      (ready)="onTabReady($event)"
                      (dataFiltered)="onTabulatorFiltered($any($event))"
                      (initError)="onTabError($any($event).detail.message)"
                      (tableError)="onTabError($any($event).detail.message)"
                    ></rb-tabulator>
                  }

                  <!-- Show 'No Data' when no query run or query returned empty -->
                  @if (!reportDataResult || (!reportDataResultIsError && (!reportDataResult?.data || reportDataResult?.data?.length === 0))) {
                    <div id="noDataTabulator" class="text-center" style="padding: 20px;">
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
                        id="errorsLogTabulator"
                        class="card-body"
                        style="
                          color: red;
                          height: 421px;
                          overflow-y: scroll;
                          overflow-x: auto;
                          -webkit-user-select: all;
                          user-select: all;
                        "
                      >
                        <dburst-log-file-viewer
                          logFileName="errors.log"
                        ></dburst-log-file-viewer>
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

      <dp-tab heading="Tabulator Options" id="tabulatorOptionsTab">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px;">
          <div style="grid-column:span 12">
            <ngx-codejar
              id="tabulatorConfigEditor"
              #tabulatorConfigEditor
              [(code)]="activeTabulatorConfigScriptGroovy"
              (update)="onTabulatorConfigChanged($event)"
              [highlightMethod]="highlightGroovyCode"
              [highlighter]="'prism'"
              [showLineNumbers]="true"
              style="height: 350px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; margin-top: 10px;"
            ></ngx-codejar>
            <button id="btnAiHelpTabulatorConfig" type="button" class="btn btn-outline w-full" style="margin-top: 10px;" (click)="askAiForHelp('dsl.tabulator')">
              <strong>Hey AI, Help Me Configure This Tabulator Table ...</strong>
            </button>
          </div>
        </div>
      </dp-tab>

      <dp-tab heading="Example (Tabulator Options)">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px;">
          <div style="grid-column:span 12">
            <a id="btnSeeMoreTabulatorExamples" href="https://datapallas.com/docs/bi-analytics/web-components/datatables" target="_blank" class="btn btn-outline w-full" style="color: #337ab7; text-decoration: underline; margin-bottom: 10px;">
              See More Tabulator Configuration Examples
            </a>
            <ngx-codejar
              id="tabulatorConfigExampleEditor"
              [code]="exampleTabulatorConfigScript"
              [highlightMethod]="highlightGroovyCode"
              [highlighter]="'prism'"
              [showLineNumbers]="true"
              [readonly]="true"
              style="height: 350px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; background-color: #f8f8f8; margin-top: 10px;"
            ></ngx-codejar>
            <button id="btnCopyToClipboardTabulatorConfigExample" type="button" class="btn btn-outline w-full" style="margin-top: 10px;" (click)="copyToClipboardTabulatorConfigExample()">
              Copy Example Tabulator Options To Clipboard
            </button>
          </div>
        </div>
      </dp-tab>
    </dp-tabs>
  </div>
</ng-template>`;
