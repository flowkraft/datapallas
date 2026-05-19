export const tabReportingDataSourceDataTablesTemplate = `<ng-template
  #tabReportingDataSourceDataTablesTemplate
>
  <dburst-connection-details
      #connectionDetailsModal
      [mode]="'viewMode'"
  ></dburst-connection-details>

  <div class="bg-base-200 rounded-box p-4">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
         {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.TYPE' | translate }}
      </div>

      <div style="grid-column:span 5">
        <select
            id="dsTypes"
            class="select select-bordered"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.type"
            (ngModelChange)="onDataSourceTypeChange($event)"
          >
            <option value="ds.sqlquery">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.TYPE-SQL-QUERY' | translate }}
            </option>
            <option value="ds.scriptfile">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.TYPE-SCRIPT' | translate }}
            </option>
            <option value="ds.dashboard">
              Script (for fetching dashboard data)
            </option>
            <option value="ds.xmlfile">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.TYPE-XML' | translate }}
            </option>
            <option value="ds.csvfile">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.TYPE-CSV' | translate }}
            </option>
            <option value="ds.tsvfile">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.TYPE-TSV' | translate }}
            </option>
            <option value="ds.fixedwidthfile">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.TYPE-FIXED-WIDTH' | translate }}
            </option>
            <option value="ds.excelfile">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.TYPE-EXCEL' | translate }}
            </option>
            <option value="ds.gsheet">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.TYPE-CLOUD-GSHEET' | translate }}
            </option>
            <option value="ds.o365sheet">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.TYPE-CLOUD-O365SHEET' | translate }}
            </option>
          </select>
      </div>

      <!-- SQL Query Section -->
      <div style="grid-column:span 5">
          @if (getDatabaseConnectionFilesForUI().length > 0 && (xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery' || xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' || xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard')) {
            <select
                  id="databaseConnection"
                  class="select select-bordered"
                  [ngModel]="selectedDbConnCode"
                  (ngModelChange)="onDatabaseConnectionChanged($event)"
                >
                  @for (connection of getDatabaseConnectionFilesForUI(); track $index) {
                    <option [value]="connection.connectionCode">
                      {{connection.connectionName}}
                      @if (connection.defaultConnection) {
                        <span>(default)</span>
                      }
                    </option>
                  }
                </select>
          }
          <!-- Help text below editor -->
          @if (getDatabaseConnectionFilesForUI().length > 0 && (xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery' || xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' || xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard')) {
            <small class="text-base-content/60" style="display: block; margin-top: 5px;">
              Database Connection
            </small>
          }
           <!-- Message when no database connections exist -->
          @if ((xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard') && getDatabaseConnectionFilesForUI().length === 0) {
            <div id="noDbConnectionsMessageSql" style="padding-top: 6px;">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>&nbsp;No database connections defined&nbsp;
              <a id="createDbConnectionLinkSql" [routerLink]="['/configuration-connections']" skipLocationChange="true" class="btn btn-primary btn-sm">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg>&nbsp;Create Database Connection
              </a>
            </div>
          }

        </div>
        
    </div>
    
    <p></p>

    <!-- START: New Report Parameters Section for SQL Query/Script -->
    @if (xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard') {
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      @if (xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery') {
      <div style="grid-column:span 12">
          <dp-tabs id="tabsetSqlQuery">
            <dp-tab id="tabSqlCode" heading="{{ 'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.SQL-QUERY-PLACEHOLDER' | translate }}">
                  
              <!-- SQL Query Editor with Label Above -->
              
              <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
                <div style="grid-column:span 12">
                  
                  <!-- SQL Editor -->
                  <ngx-codejar
                    id="sqlQueryEditor"
                    [(code)]="xmlReporting.documentburster.report.datasource.sqloptions.query"
                    (update)="onSqlQueryChanged($event)"
                    [highlightMethod]="highlightSqlCode"
                    [highlighter]="'prism'"
                    [showLineNumbers]="true"
                    style="height: 250px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; margin-top: 10px;"
                  ></ngx-codejar>
                </div>
              </div>
  
              <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px;">
                <div style="grid-column:span 6">
                  <div style="display: flex; gap: 6px;">
                    @if (hasCubesForCurrentConnection) {
                    <button id="btnReuseCubeSqlQuery" type="button"
                      title="Reuse a cube to generate SQL for this report"
                      class="btn btn-ghost"
                      style="flex: 0 0 25%;"
                      (click)="showCubesReuseModal()">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21 7.5L12 2.25L3 7.5M21 7.5L12 12.75M21 7.5V16.5L12 21.75M3 7.5L12 12.75M3 7.5V16.5L12 21.75M12 12.75V21.75"/></svg>&nbsp;<strong>Cubes</strong>
                    </button>
                    }
                    <button id="btnHelpWithSqlQueryAI" type="button"
                      title="Write SQL code to fetch report data from the database"
                      class="btn btn-ghost"
                      [ngStyle]="{ flex: hasCubesForCurrentConnection ? '0 0 calc(75% - 6px)' : '1 1 100%' }"
                      (click)="showDbConnectionModal()"
                      [disabled]="getDatabaseConnectionFilesForUI().length === 0 || !xmlReporting.documentburster.report.datasource.sqloptions.conncode">
                      <strong>Hey AI, Help Me With This SQL Query ...</strong>
                    </button>
                  </div>
                </div>
                <!-- MODE 1 — Angular fetches data via doTestSqlQuery(), stores in reportDataResult,
                     then pushes the SAME data to Tabulator, Chart, and Pivot preview tabs via [data] prop.
                     This is more efficient than Mode 2 here because one API call feeds three preview components. -->
                <div style="grid-column:span 3">
                  <button
                    id="btnTestSqlQuery"
                    type="button"
                    class="btn btn-primary w-full"
                    (click)="doTestSqlQuery()"
                    [disabled]="isReportDataLoading || getDatabaseConnectionFilesForUI().length === 0 || !xmlReporting.documentburster.report.datasource.sqloptions.conncode || !xmlReporting.documentburster.report.datasource.sqloptions.query"
                  >
                    @if (isReportDataLoading) {<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 animate-spin"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>} @else {<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.99972 12L3.2688 3.12451C9.88393 5.04617 16.0276 8.07601 21.4855 11.9997C16.0276 15.9235 9.884 18.9535 3.26889 20.8752L5.99972 12ZM5.99972 12L13.5 12"/></svg>}&nbsp;&nbsp;{{ isReportDataLoading ? 'Testing...' : 'Test SQL Query' }}
                  </button>
                </div>
                <div style="grid-column:span 3">
                  <dburst-button-clear-logs></dburst-button-clear-logs>
                </div>
              </div>

            </dp-tab>

            <dp-tab id="tabSqlReportParameters" heading="Report Parameters">
              <ngx-codejar
                id="paramsSpecEditor"
                [(code)]="activeParamsSpecScriptGroovy"
                (update)="onParametersSpecChanged($event)"
                [highlightMethod]="highlightGroovyCode"
                [highlighter]="'prism'"
                [showLineNumbers]="true"
                style="height: 250px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; margin-top: 10px;"
              ></ngx-codejar>
              <button id="btnAiHelpParamsSpecSqlInTab" type="button" class="btn btn-ghost w-full" style="margin-top: 10px;" (click)="askAiForHelp('dsl.reportparams')">
                <strong>Hey AI, Help Me Configure These Report Parameters ...</strong>
              </button>
            </dp-tab>
            <dp-tab id="tabSqlExampleReportParameters" heading="Example (Report Parameters)">
              <ngx-codejar
                id="paramsSpecExampleEditor"
                [code]="exampleParamsSpecScript"
                [highlightMethod]="highlightGroovyCode"
                [highlighter]="'prism'"
                [showLineNumbers]="true"
                [readonly]="true"
                style="height: 250px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; background-color: #f8f8f8; margin-top: 10px;"
              ></ngx-codejar>
              <button id="btnCopyToClipboardParametersSpecExampleSql" type="button" class="btn btn-ghost w-full" style="margin-top: 10px;" (click)="copyToClipboardParametersSpecExample()">
                Copy Example Params Script To Clipboard
              </button>
            </dp-tab>
            </dp-tabs>
          </div>
      }

          @if (xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' || xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard') {
          <div style="grid-column:span 12">

            <dp-tabs id="tabsetScriptFile">
            <dp-tab id="tabScriptCode" heading="{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.SCRIPT-CODE' | translate }}">
            
              <!-- Script Editor -->
              <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
                <div style="grid-column:span 12">
                  
                  <!-- Groovy Script Editor -->
                  <ngx-codejar
                    id="groovyScriptEditor"
                    [(code)]="activeDatasourceScriptGroovy"
                    (update)="onScriptContentChanged($event)"
                    [highlightMethod]="highlightGroovyCode"
                    [highlighter]="'prism'"
                    [showLineNumbers]="true"
                    style="height: 250px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; margin-top: 10px;"
                  ></ngx-codejar>
                  </div>
                </div>
                  
                <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px;">

                  @if (getDatabaseConnectionFilesForUI().length === 0 || !selectedDbConnCode) {
                  <div style="grid-column:span 6">
                    <button id="btnHelpWithScriptAI" type="button" class="btn btn-ghost w-full" (click)="askAiForHelp(xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard' ? 'script.ds.dashboard' : 'script.ds')">
                      <strong>{{ xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard' ? 'Hey AI, Help Me Build This Dashboard ...' : 'Hey AI, Help Me With This Groovy Script ...' }}</strong>
                    </button>
                  </div>
                  }
                  @if (getDatabaseConnectionFilesForUI().length > 0 && selectedDbConnCode) {
                  <div style="grid-column:span 6;display: flex; align-items: center;">
                    <div style="display: flex; width: 100%; gap: 6px;">
                      @if (hasCubesForCurrentConnection) {
                      <button id="btnReuseCubeScript" type="button"
                        title="Reuse a cube to generate SQL for this script"
                        class="btn btn-ghost"
                        style="flex: 0 0 25%;"
                        (click)="showCubesReuseModal()">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21 7.5L12 2.25L3 7.5M21 7.5L12 12.75M21 7.5V16.5L12 21.75M3 7.5L12 12.75M3 7.5V16.5L12 21.75M12 12.75V21.75"/></svg>&nbsp;<strong>Cubes</strong>
                      </button>
                      }
                      <div class="dropdown dropdown-end"
                        [ngStyle]="{ flex: hasCubesForCurrentConnection ? '0 0 calc(75% - 6px)' : '1 1 100%', display: 'flex' }">
                        <button id="btnHelpWithScriptAI" type="button" tabindex="0" role="button" class="btn btn-ghost" style="flex: 1; text-align: left;" (click)="showDbConnectionModal(xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard' ? 'dashboardScript' : 'scriptQuery')">
                          <strong>{{ xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard' ? 'Hey AI, Help Me Build This Dashboard ...' : 'Hey AI, Help Me With This Groovy Script ...' }} &#9660;</strong>
                        </button>
                        <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-[1050] min-w-max p-2">
                          <li>
                            <a id="btnHelpWithScriptAIDropdownItem" href="#" (click)="showDbConnectionModal(xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard' ? 'dashboardScript' : 'scriptQuery'); $event.preventDefault();">
                              {{ xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard' ? 'Hey AI, Help Me Build This Dashboard ...' : 'Hey AI, Help Me With This Groovy Script ...' }}
                            </a>
                          </li>
                          <li>
                            <a id="btnHelpWithSqlQueryAIDropdownItem" href="#" (click)="showDbConnectionModal(); $event.preventDefault();">
                              Hey AI, Help Me With This SQL Query ...
                            </a>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  }
                  <!-- MODE 1 — Angular fetches data via doRunTestScript(), stores in reportDataResult,
                       then pushes the SAME data to Tabulator, Chart, and Pivot preview tabs via [data] prop.
                       One API call feeds all three preview components. -->
                  <div style="grid-column:span 3">
                    <button
                      id="btnTestScript"
                      type="button"
                      class="btn btn-primary w-full"
                      (click)="doRunTestScript()"
                      [disabled]="isReportDataLoading"
                    >
                      @if (isReportDataLoading) {<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 animate-spin"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>} @else {<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.99972 12L3.2688 3.12451C9.88393 5.04617 16.0276 8.07601 21.4855 11.9997C16.0276 15.9235 9.884 18.9535 3.26889 20.8752L5.99972 12ZM5.99972 12L13.5 12"/></svg>}&nbsp;&nbsp;{{ isReportDataLoading ? 'Testing...' : 'Run / Test Script' }}
                    </button>
                  </div>
                  <div style="grid-column:span 3">
                    <dburst-button-clear-logs></dburst-button-clear-logs>
                  </div>
                
                </div>
            
            </dp-tab>
            <dp-tab id="tabScriptReportParameters" heading="Report Parameters">
              <ngx-codejar
                id="paramsSpecEditor"
                [(code)]="activeParamsSpecScriptGroovy"
                (update)="onParametersSpecChanged($event)"
                [highlightMethod]="highlightGroovyCode"
                [highlighter]="'prism'"
                [showLineNumbers]="true"
                style="height: 250px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; margin-top: 10px;"
              ></ngx-codejar>
              <button id="btnAiHelpParamsSpecScriptInTab" type="button" class="btn btn-ghost w-full" style="margin-top: 10px;" (click)="askAiForHelp('dsl.reportparams')">
                <strong>Hey AI, Help Me Configure These Report Parameters ...</strong>
              </button>
            </dp-tab>
            <dp-tab id="tabScriptExampleReportParameters" heading="Example (Report Parameters)">
              <ngx-codejar
                id="paramsSpecExampleEditor"
                [code]="exampleParamsSpecScript"
                [highlightMethod]="highlightGroovyCode"
                [highlighter]="'prism'"
                [showLineNumbers]="true"
                [readonly]="true"
                style="height: 250px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; background-color: #f8f8f8; margin-top: 10px;"
              ></ngx-codejar>
              <button id="btnCopyToClipboardParametersSpecExampleScript" type="button" class="btn btn-ghost w-full" style="margin-top: 10px;" (click)="copyToClipboardParametersSpecExample()">
                Copy Example Params Script To Clipboard
              </button>
            </dp-tab>
            </dp-tabs>

          </div>
          }
    </div>
    }
    
     
    @if (xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery') {
    <div>

      <br />
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 12">
          <label id="lblShowMoreSqlOptions" for="btnShowMoreSqlOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              @if (!xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u>Show More SQL Options</u>
              }
              @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u><em>Show Less SQL Options</em></u>
              }
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreSqlOptions"
            style="visibility: hidden;"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.showmoreoptions"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.showmoreoptions', $event)"
          />
        </div>
      </div>

      <br />

      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN' | translate }}
          </div>
          <div style="grid-column:span 5">
            <select
              id="sqlIdColumn"
              class="select select-bordered"
              [ngModel]="sqlIdColumnSelection"
              (ngModelChange)="onSqlIdColumnSelectionChange($event)"
            >
              <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-NOT-USED' | translate }}</option>
              <option value="firstcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-FIRST-COLUMN' | translate }}</option>
              <option value="lastcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LAST-COLUMN' | translate }}</option>
              <option value="custom">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LET-ME-SPECIFY' | translate }}</option>
            </select>
          </div>
          @if (sqlIdColumnSelection === 'custom') {
          <div style="grid-column:span 4">
            <input
              type="number"
              id="sqlCustomIdColumnIndex"
              class="input input-bordered"
              min="0"
              [ngModel]="xmlReporting.documentburster.report.datasource.sqloptions.idcolumn"
              (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.sqloptions.idcolumn', $event)"
              placeholder="Enter column index (0-based)"
            />
          </div>
          }
        </div>

      </div>
      }
    </div>
    }

    <!-- Script File Section -->
    @if (xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile') {
    <div>
      <br />
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 12">
          <label id="lblShowMoreScriptOptions" for="btnShowMoreScriptOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              @if (!xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u>Show More Script Options</u>
              }
              @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u><em>Show Less Script Options</em></u>
              }
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreScriptOptions"
            style="visibility: hidden;"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.showmoreoptions"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.showmoreoptions', $event)"
          />
        </div>
      </div>

      <br/>

      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN' | translate }}
          </div>
          <div style="grid-column:span 5">
            <select
              id="scriptIdColumn"
              class="select select-bordered"
              [ngModel]="scriptIdColumnSelection"
              (ngModelChange)="onScriptIdColumnSelectionChange($event)"
            >
              <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-NOT-USED' | translate }}</option>
              <option value="firstcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-FIRST-COLUMN' | translate }}</option>
              <option value="lastcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LAST-COLUMN' | translate }}</option>
              <option value="custom">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LET-ME-SPECIFY' | translate }}</option>
            </select>
          </div>
          @if (scriptIdColumnSelection === 'custom') {
          <div style="grid-column:span 4">
            <input
              type="number"
              id="scriptCustomIdColumnIndex"
              class="input input-bordered"
              min="0"
              [ngModel]="xmlReporting.documentburster.report.datasource.scriptoptions.idcolumn"
              (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.scriptoptions.idcolumn', $event)"
              placeholder="Enter column index (0-based)"
            />
          </div>
          }
        </div>
        <p></p>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.FILE-EXPLORER' | translate }}
          </div>
          <div style="grid-column:span 5">
            <select
              id="scriptFileExplorer"
              class="select select-bordered"
              [ngModel]="scriptFileExplorerSelection"
              (ngModelChange)="onScriptFileExplorerSelectionChange($event)"
            >
              <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.FILE-EXPLORER-NOT-USED' | translate }}</option>
              <option value="globpattern">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.FILE-EXPLORER-GLOB-PATTERN' | translate }}</option>
            </select>
          </div>
          @if (scriptFileExplorerSelection != 'notused') {
          <div style="grid-column:span 4">
            <input
              type="text"
              id="scriptFileExplorerAllowedFiles"
              class="input input-bordered"
              min="0"
              [ngModel]="xmlReporting.documentburster.report.datasource.scriptoptions.selectfileexplorer"
              (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.scriptoptions.selectfileexplorer', $event)"
              placeholder="Enter allowed file types (eg. *.xml, *.csv, *.txt)"
            />
          </div>
          }
        </div>


      </div>
      }

    </div>
    }

    <!-- XML Section -->
    @if (xmlReporting?.documentburster.report.datasource.type === 'ds.xmlfile') {
    <div>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          Repeating Node XPath
        </div>
        <div style="grid-column:span 9">
          <input
            id="xmlRepeatingNodeXPath"
            class="input input-bordered"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.xmloptions?.repeatingnodexpath"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.xmloptions.repeatingnodexpath', $event)"
            required
            placeholder="e.g. /root/records/record"
          />
        </div>
      </div>

      <br />

      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 12">
          <label id="lblShowMoreXmlOptions" for="btnShowMoreXmlOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              @if (!xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u>Show More XML Options</u>
              }
              @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u><em>Show Less XML Options</em></u>
              }
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreXmlOptions"
            style="visibility: hidden;"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.showmoreoptions"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.showmoreoptions', $event)"
          />
        </div>
      </div>

      <br />

      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          ID Column
        </div>
        <div style="grid-column:span 9">
          <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
            <div style="grid-column:span 6">
              <select
                id="xmlIdColumnSelect"
                class="select select-bordered"
                [ngModel]="xmlIdColumnSelection"
                (ngModelChange)="onXmlIdColumnSelectionChange($event)"
              >
                <option value="notused">Not Used</option>
                <option value="custom">Custom XPath Expression...</option>
              </select>
            </div>
            @if (xmlIdColumnSelection === 'custom') {
            <div style="grid-column:span 6">
              <input
                id="xmlIdColumnCustom"
                class="input input-bordered"
                [ngModel]="xmlReporting.documentburster.report.datasource.xmloptions.idcolumn"
                (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.xmloptions.idcolumn', $event)"
                placeholder=""
              />
              <small class="text-base-content/60">Example (using attribute): <code>&#64;id</code></small><br>
              <small class="text-base-content/60">Example (using node): <code>id</code></small>
            </div>
            }
          </div>
        </div>
      </div>
      }

      <p></p>

      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          Namespace Mappings
        </div>
        <div style="grid-column:span 9">
          <textarea
            id="xmlNamespaceMappings"
            class="textarea textarea-bordered"
            rows="3"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.xmloptions?.namespacemappings"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.xmloptions.namespacemappings', $event)"
            placeholder="e.g. ns=http://example.com/ns"
          ></textarea>
          <small class="text-base-content/60">Format: prefix=uri (one per line for multiple)</small>
        </div>
      </div>
      }

      <p></p>

      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          Trim Whitespaces
        </div>
        <div style="grid-column:span 9">
          <input
            type="checkbox"
            id="xmlIgnoreLeadingWhitespace"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.xmloptions?.ignoreleadingwhitespace"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.xmloptions.ignoreleadingwhitespace', $event)"
          />
        </div>
      </div>
      }
    </div>
    }

    <!-- CSV/TSV Section -->
    @if (xmlReporting?.documentburster.report.datasource.type === 'ds.csvfile' ||
                 xmlReporting?.documentburster.report.datasource.type === 'ds.tsvfile') {
    <div>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CSV-SEPARATOR-CHAR' | translate }}
        </div>
        <div style="grid-column:span 9">
          <input
            id="separatorChar"
            class="input input-bordered"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.csvoptions?.separatorchar"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.csvoptions.separatorchar', $event)"
            [readonly]="xmlReporting?.documentburster.report.datasource.type === 'ds.tsvfile'"
          />
        </div>
      </div>

      <p></p>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER' | translate }}
        </div>
        <div style="grid-column:span 9">
          <select
            id="selectHeader"
            class="select select-bordered"
            (change)="onSelectCsvHeader()"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.csvoptions?.header"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.csvoptions.header', $event)"
          >
            <option id="optionNoHeader" value="noheader">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER-NO-HEADER' | translate }}
            </option>
            <option id="optionFirstLine" value="firstline">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER-FIRST-LINE' | translate }}
            </option>
            <option id="optionFirstLine" value="multiline">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER-MULTI-LINE' | translate }}
            </option>
          </select>
        </div>
      </div>
      <p></p>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.SKIP-LINES' | translate }}
        </div>
        <div style="grid-column:span 9">
          <input
            id="skipLines"
            type="number"
            class="input input-bordered"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.csvoptions?.skiplines"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.csvoptions.skiplines', $event)"
            [disabled]="xmlReporting?.documentburster.report.datasource.csvoptions.header != 'multiline'"
          />
        </div>
      </div>

      <br />

      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 12">
          <label id="lblShowMoreCsvOptions" for="btnShowMoreCsvOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              @if (!xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u>Show More CSV Options</u>
              }
              @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u><em>Show Less CSV Options</em></u>
              }
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreCsvOptions"
            style="visibility: hidden;"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.showmoreoptions"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.showmoreoptions', $event)"
          />
        </div>
      </div>

      <br />

      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN' | translate }}
        </div>
        <div style="grid-column:span 5">
          <select
            id="csvIdColumn"
            class="select select-bordered"
            [ngModel]="csvIdColumnSelection"
            (ngModelChange)="onCsvIdColumnSelectionChange($event)"
          >
            <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-NOT-USED' | translate }}</option>
            <option value="firstcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-FIRST-COLUMN' | translate }}</option>
            <option value="lastcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LAST-COLUMN' | translate }}</option>
            <option value="custom">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LET-ME-SPECIFY' | translate }}</option>
          </select>
        </div>
        @if (csvIdColumnSelection === 'custom') {
        <div style="grid-column:span 4">
          <input
            type="number"
            id="csvCustomIdColumnIndex"
            class="input input-bordered"
            min="0"
            [ngModel]="xmlReporting.documentburster.report.datasource.csvoptions.idcolumn"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.csvoptions.idcolumn', $event)"
            placeholder="Enter column index (0-based)"
          />
        </div>
        }
      </div>
      }

      <p></p>

      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CSV-QUOTATION-CHAR' | translate }}
        </div>
        <div style="grid-column:span 9">
          <input
            id="quotationChar"
            class="input input-bordered"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.csvoptions?.quotationchar"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.csvoptions.quotationchar', $event)"
          />
        </div>
      </div>
      }

      <p></p>

      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CSV-ESCAPE-CHAR' | translate }}
        </div>
        <div style="grid-column:span 9">
          <input
            id="escapeChar"
            class="input input-bordered"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.csvoptions?.escapechar"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.csvoptions.escapechar', $event)"
          />
        </div>
      </div>
      }

      <p></p>
      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CSV-STRICT-QUOTATIONS' | translate }}
        </div>
        <div style="grid-column:span 9">
          <input
            type="checkbox"
            id="btnStrictQuotations"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.csvoptions?.strictquotations"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.csvoptions.strictquotations', $event)"
          />
        </div>
      </div>
      }

      <p></p>
      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CSV-IGNORE-QUOTATIONS' | translate }}
        </div>
        <div style="grid-column:span 9">
          <input
            type="checkbox"
            id="btnIgnoreQuotations"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.csvoptions?.ignorequotations"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.csvoptions.ignorequotations', $event)"
          />
        </div>
      </div>
      }

      <p></p>
      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.IGNORE-LEADING-WHITESPACE' | translate }}
        </div>
        <div style="grid-column:span 9">
          <input
            type="checkbox"
            id="btnIgnoreLeadingWhitespace"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.csvoptions?.ignoreleadingwhitespace"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.csvoptions.ignoreleadingwhitespace', $event)"
          />
        </div>
      </div>
      }

    </div>
    }

    <!-- Fixed Width Section -->
    @if (xmlReporting?.documentburster.report.datasource.type === 'ds.fixedwidthfile') {
    <div>
      
      <!-- Basic Options -->
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.FIXED-WIDTH-COLUMNS' | translate }}
        </div>
        <div style="grid-column:span 9">
          <textarea
            id="fixedWidthColumns"
            class="textarea textarea-bordered"
            rows="5"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.fixedwidthoptions?.columns"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.fixedwidthoptions.columns', $event)"
            placeholder="Column 1, 10
Column 2, 20
Column 3, 15"
          ></textarea>
        </div>
      </div>

      <p></p>

      <!-- Fixed Width Header -->
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER' | translate }}
        </div>
        <div style="grid-column:span 9">
          <select
            id="selectFixedWidthHeader"
            class="select select-bordered"
            (change)="onSelectFixedWidthHeader()"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.fixedwidthoptions?.header"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.fixedwidthoptions.header', $event)"
          >
            <option value="noheader">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER-NO-HEADER' | translate }}</option>
            <option value="firstline">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER-FIRST-LINE' | translate }}</option>
          </select>
        </div>
      </div>

      <p></p>

      <!-- Fixed Width Skip Lines -->
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.SKIP-LINES' | translate }}
        </div>
        <div style="grid-column:span 9">
          <input
            id="fixedWidthSkipLines"
            type="number"
            class="input input-bordered"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.fixedwidthoptions?.skiplines"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.fixedwidthoptions.skiplines', $event)"
            [disabled]="true"
          />
        </div>
      </div>

      <br />

      <!-- Show More Options Toggle -->
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 12">
          <label id="lblShowMoreFixedWidthOptions" for="btnShowMoreFixedWidthOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              @if (!xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u>Show More Fixed Width Options</u>
              }
              @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u><em>Show Less Fixed Width Options</em></u>
              }
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreFixedWidthOptions"
            style="visibility: hidden;"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.showmoreoptions"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.showmoreoptions', $event)"
          />
        </div>
      </div>

      <br />

      <!-- Advanced Fixed Width Options -->
      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN' | translate }}
        </div>
        <div style="grid-column:span 5">
          <select
            id="fixedWidthIdColumn"
            class="select select-bordered"
            [ngModel]="fixedWidthIdColumnSelection"
            (ngModelChange)="onFixedWidthIdColumnSelectionChange($event)"
          >
            <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-NOT-USED' | translate }}</option>
            <option value="firstcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-FIRST-COLUMN' | translate }}</option>
            <option value="lastcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LAST-COLUMN' | translate }}</option>
            <option value="custom">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LET-ME-SPECIFY' | translate }}</option>
          </select>
        </div>
        @if (fixedWidthIdColumnSelection === 'custom') {
        <div style="grid-column:span 4">
          <input
            type="number"
            id="fixedWidthCustomIdColumnIndex"
            class="input input-bordered"
            min="0"
            [ngModel]="xmlReporting.documentburster.report.datasource.fixedwidthoptions.idcolumn"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.fixedwidthoptions.idcolumn', $event)"
            placeholder="Enter column index (0-based)"
          />
        </div>
        }
      </div>
      }

      <p></p>

      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.IGNORE-LEADING-WHITESPACE' | translate }}
          </div>
          <div style="grid-column:span 9">
            <input
              type="checkbox"
              id="btnFixedWidthIgnoreLeadingWhitespace"
              [ngModel]="xmlReporting?.documentburster?.report?.datasource?.fixedwidthoptions?.ignoreleadingwhitespace"
              (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.fixedwidthoptions.ignoreleadingwhitespace', $event)"
            />
          </div>
        </div>
      </div>
      }

    </div>
    }

    <!-- Excel Section -->
    @if (xmlReporting?.documentburster.report.datasource.type === 'ds.excelfile') {
    <div>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER' | translate }}
        </div>
        <div style="grid-column:span 9">
          <select
            id="selectExcelHeader"
            class="select select-bordered"
            (change)="onSelectExcelHeader()"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.exceloptions?.header"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.exceloptions.header', $event)"
          >
            <option value="noheader">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER-NO-HEADER' | translate }}
            </option>
            <option value="firstline">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER-FIRST-LINE' | translate }}
            </option>
            <option value="multiline">
              {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER-MULTI-LINE' | translate }}
            </option>
          </select>
        </div>
      </div>

      <p></p>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.SKIP-LINES' | translate }}
        </div>
        <div style="grid-column:span 9">
          <input
            id="excelSkipLines"
            class="input input-bordered"
            type="number"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.exceloptions?.skiplines"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.exceloptions.skiplines', $event)"
            [disabled]="xmlReporting?.documentburster.report.datasource.exceloptions.header != 'multiline'"
          />
        </div>
      </div>

      <p></p>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.EXCEL-SHEET-INDEX' | translate }}
        </div>
        <div style="grid-column:span 9">
          <input
            id="excelSheetIndex"
            class="input input-bordered"
            type="number"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.exceloptions?.sheetindex"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.exceloptions.sheetindex', $event)"
          />
        </div>
      </div>

      <br />

      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 12">
          <label id="lblShowMoreExcelOptions" for="btnShowMoreExcelOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              @if (!xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u>Show More Excel Options</u>
              }
              @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
                <u><em>Show Less Excel Options</em></u>
              }
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreExcelOptions"
            style="visibility: hidden;"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.showmoreoptions"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.showmoreoptions', $event)"
          />
        </div>
      </div>

      <br />

      @if (xmlReporting?.documentburster.report.datasource.showmoreoptions) {
      <div>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN' | translate }}
          </div>
          <div style="grid-column:span 5">
            <select
              id="excelIdColumn"
              class="select select-bordered"
              [ngModel]="excelIdColumnSelection"
              (ngModelChange)="onExcelIdColumnSelectionChange($event)"
            >
              <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-NOT-USED' | translate }}</option>
              <option value="firstcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-FIRST-COLUMN' | translate }}</option>
              <option value="lastcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LAST-COLUMN' | translate }}</option>
              <option value="custom">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LET-ME-SPECIFY' | translate }}</option>
            </select>
          </div>
          @if (excelIdColumnSelection === 'custom') {
          <div style="grid-column:span 4">
            <input
              type="number"
              id="excelCustomIdColumnIndex"
              class="input input-bordered"
              min="0"
              [ngModel]="xmlReporting.documentburster.report.datasource.exceloptions.idcolumn"
              (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.exceloptions.idcolumn', $event)"
              placeholder="Enter column index (0-based)"
            />
          </div>
          }
        </div>

        <p></p>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.IGNORE-LEADING-WHITESPACE' | translate }}
          </div>
          <div style="grid-column:span 9">
            <input
              type="checkbox"
              id="btnExcelIgnoreLeadingWhitespace"
              [ngModel]="xmlReporting?.documentburster?.report?.datasource?.exceloptions?.ignoreleadingwhitespace"
              (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.exceloptions.ignoreleadingwhitespace', $event)"
            />
          </div>
        </div>

        <p></p>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.EXCEL-USE-FORMULA-RESULTS' | translate }}
          </div>
          <div style="grid-column:span 9">
            <input
              type="checkbox"
              id="btnExcelUseFormulaResults"
              [ngModel]="xmlReporting?.documentburster?.report?.datasource?.exceloptions?.useformularesults"
              (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.exceloptions.useformularesults', $event)"
            />
          </div>
        </div>
      </div>
      }

    </div>
    }

    <p></p>
      
    <!-- Add this after all datasource type sections but before the Request Feature section -->
    @if (xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.xmlfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.csvfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.tsvfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.fixedwidthfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.excelfile') {
    <div>
      
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 12">
          <label id="lblShowAdditionalTransformation" for="btnShowAdditionalTransformation" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              @if (!xmlReporting?.documentburster.report.datasource.showadditionaltransformation) {
                <u>Show Additional Data Transformation</u>
              }
              @if (xmlReporting?.documentburster.report.datasource.showadditionaltransformation) {
                <u><em>Hide Additional Data Transformation</em></u>
              }
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowAdditionalTransformation"
            style="visibility: hidden;"
            [ngModel]="xmlReporting?.documentburster?.report?.datasource?.showadditionaltransformation"
            (ngModelChange)="setXmlReportingPath('documentburster.report.datasource.showadditionaltransformation', $event)"
          />
        </div>
      </div>

      <br />
      
      @if (xmlReporting?.documentburster.report.datasource.showadditionaltransformation) {
      <div>
        
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 2">
            <!-- Label above the editor -->
            <label for="transformationCodeEditor" class="control-label" style="margin-bottom: 5px; display: block;">
              Groovy Script
            </label>
          </div>
          <div style="grid-column:span 6">
            <button id="btnHelpWithTransformationAI" type="button" class="btn btn-ghost" (click)="askAiForHelp('script.additionaltransformation')">
             <strong>Hey AI, Help Me With This Groovy Script ...</strong>
            </button>
          </div>
        </div>  
      
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
          <div style="grid-column:span 12">
            <!-- Transformation Code Editor -->
            <ngx-codejar
              id="transformationCodeEditor"
              [(code)]="activeTransformScriptGroovy"
              (update)="onTransformationCodeChanged($event)"
              [highlightMethod]="highlightGroovyCode"
              [highlighter]="'prism'"
              [showLineNumbers]="true"
              style="height: 200px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; margin-top: 10px;"
            ></ngx-codejar>
          </div>
        </div>
      </div>
      }
    </div>
    }

    <!-- Request Feature Section -->
    @if (!askForFeatureService.alreadyImplementedFeatures.includes(xmlReporting?.documentburster.report.datasource.type)) {
    <div>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2"></div>
        <div style="grid-column:span 5">
          <button
            type="button"
            class="btn btn-primary w-full"
            (click)="triggerFeatureRequestDialog(xmlReporting?.documentburster.report.datasource.type)"
          >
            Request <span class="badge">New</span> Feature
          </button>
        </div>
      </div>
    </div>
    }
  </div>
</ng-template>
<dp-dialog
    header="Enter Report Parameters"
    [(visible)]="isModalParametersVisible"
    [style]="{width: '50vw'}">
    @if (reportParameters && reportParameters.length > 0) {
    <rb-parameters
        [parameters]="reportParameters"
        (validChange)="onReportParamsValidChange($event)"
        (valueChange)="onReportParamsValuesChange($event)">
    </rb-parameters>
    }
    <div ngProjectAs="[footer]">
        <button
            type="button"
            id="btnTestQueryCancel"
            (click)="isModalParametersVisible = false"
            class="btn btn-ghost">Cancel</button>
        <button
            type="button"
            id="btnTestQueryRun"
            (click)="onRunQueryWithParams()"
            class="btn btn-primary"
            [disabled]="!reportParamsValid">Test Query</button>
    </div>
</dp-dialog>

<!-- ===================================================================== -->
<!-- Cubes Reuse Modal — pick fields, generate SQL, copy to clipboard      -->
<!-- ===================================================================== -->
@if (isCubesReuseModalVisible) {
<div class="modal fade in" style="display: block;" tabindex="-1">
  <div class="modal-dialog" style="max-width: 640px;">
    <div class="modal-content">
      <div class="modal-header" style="padding: 6px 15px;">
        <span style="font-size: 13px; font-weight: 600;">Cubes</span>
      </div>
      <div class="modal-body" style="max-height: calc(100vh - 240px); overflow-y: auto; padding-top: 12px;">
        <!-- Cube selector — only when more than one cube exists for this connection -->
        @if (cubesForCurrentConnection.length > 1) {
        <div style="margin-bottom: 10px;">
          <select id="cubeReuseSelect" class="select select-bordered"
            [ngModel]="selectedCubeForReuse?.id"
            (ngModelChange)="onCubeForReuseChanged($event)">
            @for (c of cubesForCurrentConnection; track $index) {
              <option [value]="c.id">
                {{ c.name }}
              </option>
            }
          </select>
        </div>
        }
        <!-- Cube renderer — same web component the cube admin uses -->
        <div style="border: 1px solid #ccc; border-radius: 4px; padding: 10px; background: #fafafa;">
          @if (parsedCubeForReuse && selectedCubeForReuse) {
          <rb-cube-renderer
            [cubeConfig]="parsedCubeForReuse"
            [connectionId]="selectedCubeForReuse.connectionId"
            [apiBaseUrl]="cubesReuseApiBaseUrl"
            (selectionChanged)="onCubeForReuseSelectionChanged($any($event))">
          </rb-cube-renderer>
          }
          @if (parseCubeForReuseError) {
          <div class="text-error" style="margin-top: 10px;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg> {{ parseCubeForReuseError }}
          </div>
          }
        </div>
      </div>
      <div class="modal-footer">
        <button id="btnCubeReuseShowSql" type="button" class="btn btn-primary"
          [disabled]="!hasCubesReuseFieldSelections"
          (click)="showCubesReuseSql()">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>&nbsp;Get SQL
        </button>
        <button id="btnCubeReuseClose" type="button" class="btn btn-ghost" (click)="closeCubesReuseModal()">Close</button>
      </div>
    </div>
  </div>
</div>
}
@if (isCubesReuseModalVisible) {
<div class="modal-backdrop fade in"></div>
}

<!-- ===================================================================== -->
<!-- Cubes Reuse — generated SQL preview + Copy to Clipboard               -->
<!-- ===================================================================== -->
@if (isCubesReuseSqlModalVisible) {
<div class="modal fade in" style="display: block; z-index: 1060;" tabindex="-1">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" (click)="closeCubesReuseSqlModal()">&times;</button>
        <h4 class="modal-title">Generated SQL</h4>
      </div>
      <div class="modal-body">
        @if (cubesReuseSqlLoading) {
        <div style="text-align: center; padding: 30px;">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-8 h-8 animate-spin"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
          <p style="margin-top: 10px;">Generating SQL...</p>
        </div>
        }
        @if (!cubesReuseSqlLoading) {
        <pre
          style="background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">{{ cubesReuseGeneratedSql }}</pre>
        }
      </div>
      <div class="modal-footer">
        <button id="btnCubeReuseCopySql" type="button" class="btn btn-primary"
          (click)="copyCubesReuseSqlToClipboard()" [disabled]="cubesReuseSqlLoading">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.262c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg>&nbsp;Copy SQL to Clipboard
        </button>
        <button id="btnCubeReuseSqlClose" type="button" class="btn btn-ghost" (click)="closeCubesReuseSqlModal()">Close</button>
      </div>
    </div>
  </div>
</div>
}
@if (isCubesReuseSqlModalVisible) {
<div class="modal-backdrop fade in" style="z-index: 1055;"></div>
}
`;
