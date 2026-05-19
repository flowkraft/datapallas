export const tabReportingChartTemplate = `<ng-template
  #tabReportingChartTemplate
>
  <div class="well">
    <dp-tabs>
      <dp-tab heading="Preview">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 20px;">
          <div style="grid-column:span 12">
            <!-- Named components (aggregator report) -->
            @if (getNamedChartIds().length > 0) {
              @for (cid of getNamedChartIds(); track $index) {
                <div class="card card-bordered" style="margin-bottom: 15px;">
                  <div class="card-title"><strong>{{cid}}</strong></div>
                  <div class="card-body">
                    @if (showChartPreview) {
                      <rb-chart
                        [reportId]="getCurrentReportCode()"
                        [componentId]="cid"
                        [apiBaseUrl]="reportingService.reportingApiBaseUrl"
                        [reportParams]="previewParams || {}"
                        [testMode]="true"
                        (dataFetched)="onChartDataFetched($any($event))"
                        (fetchError)="onChartFetchError($any($event))"
                        (ready)="onChartReady($event)"
                        (initError)="onChartError($any($event).detail.message)"
                        (chartError)="onChartError($any($event).detail.message)"
                      ></rb-chart>
                    }
                  </div>
                </div>
              }
            }

            <!-- Single unnamed component (standard report) — Mode 1: Angular fetches data once, pushes via [data] prop -->
            @if (getNamedChartIds().length === 0) {
              <div class="card card-bordered">
                <div class="card-body">
                  <!-- Only show chart if Chart Options script is configured and data exists -->
                  @if (reportDataResult && !reportDataResultIsError && activeChartConfigScriptGroovy?.trim() && reportDataResult?.data?.length > 0) {
                    <rb-chart #chart
                      [data]="{ chartConfig: activeChartConfigOptions, reportData: reportDataResult?.data }"
                      [options]="activeChartConfigOptions?.options || {}"
                      [type]="activeChartConfigOptions?.type || 'bar'"
                      [loading]="isReportDataLoading"
                      (ready)="onChartReady($event)"
                      (initError)="onChartError($any($event).detail.message)"
                      (chartError)="onChartError($any($event).detail.message)"
                    ></rb-chart>
                  }

                  <!-- Show message when Chart Options are not configured -->
                  @if (!activeChartConfigScriptGroovy?.trim()) {
                    <div class="text-center" style="padding: 20px;">
                      <strong>Chart is not yet configured.</strong> To display a chart, go to the <strong>Chart Options</strong> tab and configure your chart settings.
                    </div>
                  }

                  <!-- Show 'No Data' when chart is configured but no data -->
                  @if (activeChartConfigScriptGroovy?.trim() && (!reportDataResult || (!reportDataResultIsError && (!reportDataResult?.data || reportDataResult?.data?.length === 0)))) {
                    <div class="text-center" style="padding: 20px;">
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
                        id="errorsLogChart"
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

      <dp-tab heading="Chart Options" id="chartOptionsTab">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px;">
          <div style="grid-column:span 12">
            <ngx-codejar
              id="chartConfigEditor"
              #chartConfigEditor
              [(code)]="activeChartConfigScriptGroovy"
              (update)="onChartConfigChanged($event)"
              [highlightMethod]="highlightGroovyCode"
              [highlighter]="'prism'"
              [showLineNumbers]="true"
              style="height: 350px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; margin-top: 10px;"
            ></ngx-codejar>
            <button id="btnAiHelpChartConfig" type="button" class="btn btn-ghost w-full" style="margin-top: 10px;" (click)="askAiForHelp('dsl.chart')">
              <strong>Hey AI, Help Me Configure This Chart ...</strong>
            </button>
          </div>
        </div>
      </dp-tab>

      <dp-tab heading="Example (Chart Options)">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px;">
          <div style="grid-column:span 12">
            <a id="btnSeeMoreChartExamples" href="https://datapallas.com/docs/bi-analytics/web-components/charts" target="_blank" class="btn btn-ghost w-full" style="color: #337ab7; text-decoration: underline; margin-bottom: 10px;">
              See More Chart Examples
            </a>
            <ngx-codejar
              id="chartConfigExampleEditor"
              [code]="exampleChartConfigScript"
              [highlightMethod]="highlightGroovyCode"
              [highlighter]="'prism'"
              [showLineNumbers]="true"
              [readonly]="true"
              style="height: 350px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; background-color: #f8f8f8; margin-top: 10px;"
            ></ngx-codejar>
            <button id="btnCopyToClipboardChartConfigExample" type="button" class="btn btn-ghost w-full" style="margin-top: 10px;" (click)="copyToClipboardChartConfigExample()">
              Copy Example Chart Options To Clipboard
            </button>
          </div>
        </div>
      </dp-tab>
    </dp-tabs>
  </div>
</ng-template>`;
