export const tabReportingDataSourceDataTablesTemplate = `<ng-template
  #tabReportingDataSourceDataTablesTemplate
>
  <dburst-connection-details
      #connectionDetailsModal
      [mode]="'viewMode'"
  ></dburst-connection-details>

  <div class="well">
    <div class="row">
      <div class="col-xs-2">
         {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.TYPE' | translate }}
      </div>

      <div class="col-xs-5">
        <select
            id="dsTypes"
            class="form-control"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.type"
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
      <div class="col-xs-5">
          <select
                id="databaseConnection"
                *ngIf="getDatabaseConnectionFilesForUI().length > 0 && (xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery' || xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' || xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard')"
                class="form-control"
                [(ngModel)]="selectedDbConnCode"
                (ngModelChange)="onDatabaseConnectionChanged($event)"
              >
                <option *ngFor="let connection of getDatabaseConnectionFilesForUI()" [value]="connection.connectionCode">
                  {{connection.connectionName}} 
                  <span *ngIf="connection.defaultConnection">(default)</span>
                </option>
              </select>
          <!-- Help text below editor -->
          <small class="text-muted" style="display: block; margin-top: 5px;" *ngIf="getDatabaseConnectionFilesForUI().length > 0 && (xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery' || xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' || xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard')"
                >
            Database Connection
          </small>
           <!-- Message when no database connections exist -->
          <div id="noDbConnectionsMessageSql" *ngIf="(xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard') && getDatabaseConnectionFilesForUI().length === 0" style="padding-top: 6px;">
            <i class="fa fa-info-circle"></i>&nbsp;No database connections defined&nbsp;
            <a id="createDbConnectionLinkSql" [routerLink]="['/configuration-connections']" skipLocationChange="true" class="btn btn-primary btn-sm">
              <i class="fa fa-database"></i>&nbsp;Create Database Connection
            </a>
          </div>
      
        </div>
        
    </div>
    
    <p></p>

    <!-- START: New Report Parameters Section for SQL Query/Script -->
    <div class="row" *ngIf="xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard'">
      <div class="col-xs-12" *ngIf="xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery'">
          <tabset id="tabsetSqlQuery">
            <tab id="tabSqlCode" heading="{{ 'AREAS.CONFIGURATION.TAB-EMAIL-CONNECTION-SETTINGS.SQL-QUERY-PLACEHOLDER' | translate }}">
                  
              <!-- SQL Query Editor with Label Above -->
              
              <div class="row">
                <div class="col-xs-12">
                  
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
  
              <div class="row" style="margin-top: 10px;">
                <div class="col-xs-6">
                  <div style="display: flex; gap: 6px;">
                    <button id="btnReuseCubeSqlQuery" type="button"
                      *ngIf="hasCubesForCurrentConnection"
                      title="Reuse a cube to generate SQL for this report"
                      class="btn btn-default"
                      style="flex: 0 0 25%;"
                      (click)="showCubesReuseModal()">
                      <i class="fa fa-cube"></i>&nbsp;<strong>Cubes</strong>
                    </button>
                    <button id="btnHelpWithSqlQueryAI" type="button"
                      title="Write SQL code to fetch report data from the database"
                      class="btn btn-default"
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
                <div class="col-xs-3">
                  <button
                    id="btnTestSqlQuery"
                    type="button"
                    class="btn btn-primary btn-block"
                    (click)="doTestSqlQuery()"
                    [disabled]="isReportDataLoading || getDatabaseConnectionFilesForUI().length === 0 || !xmlReporting.documentburster.report.datasource.sqloptions.conncode || !xmlReporting.documentburster.report.datasource.sqloptions.query"
                  >
                    <i [ngClass]="isReportDataLoading ? 'fa fa-spinner fa-spin' : 'fa fa-paper-plane'"></i>&nbsp;&nbsp;{{ isReportDataLoading ? 'Testing...' : 'Test SQL Query' }}
                  </button>
                </div>
                <div class="col-xs-3">
                  <dburst-button-clear-logs></dburst-button-clear-logs>
                </div>
              </div>

            </tab>
          
            <tab id="tabSqlReportParameters" heading="Report Parameters">
              <ngx-codejar
                id="paramsSpecEditor"
                [(code)]="activeParamsSpecScriptGroovy"
                (update)="onParametersSpecChanged($event)"
                [highlightMethod]="highlightGroovyCode"
                [highlighter]="'prism'"
                [showLineNumbers]="true"
                style="height: 250px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; margin-top: 10px;"
              ></ngx-codejar>
              <button id="btnAiHelpParamsSpecSqlInTab" type="button" class="btn btn-default btn-block" style="margin-top: 10px;" (click)="askAiForHelp('dsl.reportparams')">
                <strong>Hey AI, Help Me Configure These Report Parameters ...</strong>
              </button>
            </tab>
            <tab id="tabSqlExampleReportParameters" heading="Example (Report Parameters)">
              <ngx-codejar
                id="paramsSpecExampleEditor"
                [code]="exampleParamsSpecScript"
                [highlightMethod]="highlightGroovyCode"
                [highlighter]="'prism'"
                [showLineNumbers]="true"
                [readonly]="true"
                style="height: 250px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; background-color: #f8f8f8; margin-top: 10px;"
              ></ngx-codejar>
              <button id="btnCopyToClipboardParametersSpecExampleSql" type="button" class="btn btn-default btn-block" style="margin-top: 10px;" (click)="copyToClipboardParametersSpecExample()">
                Copy Example Params Script To Clipboard
              </button>
            </tab>
            </tabset>
          </div>

          <div class="col-xs-12" *ngIf="xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' || xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard'">

            <tabset id="tabsetScriptFile">
            <tab id="tabScriptCode" heading="{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.SCRIPT-CODE' | translate }}">
            
              <!-- Script Editor -->
              <div class="row">
                <div class="col-xs-12">
                  
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
                  
                <div class="row" style="margin-top: 10px;">

                  <div class="col-xs-6" *ngIf="getDatabaseConnectionFilesForUI().length === 0 || !selectedDbConnCode">
                    <button id="btnHelpWithScriptAI" type="button" class="btn btn-default btn-block" (click)="askAiForHelp(xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard' ? 'script.ds.dashboard' : 'script.ds')">
                      <strong>{{ xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard' ? 'Hey AI, Help Me Build This Dashboard ...' : 'Hey AI, Help Me With This Groovy Script ...' }}</strong>
                    </button>
                  </div>
                  <div class="col-xs-6" style="display: flex; align-items: center;" *ngIf="getDatabaseConnectionFilesForUI().length > 0 && selectedDbConnCode">
                    <div style="display: flex; width: 100%; gap: 6px;">
                      <button id="btnReuseCubeScript" type="button"
                        *ngIf="hasCubesForCurrentConnection"
                        title="Reuse a cube to generate SQL for this script"
                        class="btn btn-default"
                        style="flex: 0 0 25%;"
                        (click)="showCubesReuseModal()">
                        <i class="fa fa-cube"></i>&nbsp;<strong>Cubes</strong>
                      </button>
                      <div class="btn-group"
                        [ngStyle]="{ flex: hasCubesForCurrentConnection ? '0 0 calc(75% - 6px)' : '1 1 100%', display: 'flex' }">
                        <button id="btnHelpWithScriptAI" type="button" class="btn btn-default" style="flex: 1; text-align: left;" (click)="showDbConnectionModal(xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard' ? 'dashboardScript' : 'scriptQuery')">
                          <strong>{{ xmlReporting?.documentburster.report.datasource.type === 'ds.dashboard' ? 'Hey AI, Help Me Build This Dashboard ...' : 'Hey AI, Help Me With This Groovy Script ...' }}</strong>
                        </button>
                        <button
                          id="btnHelpWithScriptAIDropdownToggle"
                          type="button"
                          class="btn btn-default dropdown-toggle"
                          data-toggle="dropdown"
                          aria-haspopup="true"
                          aria-expanded="false"
                          style="flex: 0; margin-left: 6px; display: flex; align-items: center; justify-content: center; padding: 6px 10px;"
                        >
                          <span class="caret"></span>
                        </button>
                        <ul class="dropdown-menu" style="min-width: 220px;">
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
                  <!-- MODE 1 — Angular fetches data via doRunTestScript(), stores in reportDataResult,
                       then pushes the SAME data to Tabulator, Chart, and Pivot preview tabs via [data] prop.
                       One API call feeds all three preview components. -->
                  <div class="col-xs-3">
                    <button
                      id="btnTestScript"
                      type="button"
                      class="btn btn-primary btn-block"
                      (click)="doRunTestScript()"
                      [disabled]="isReportDataLoading"
                    >
                      <i [ngClass]="isReportDataLoading ? 'fa fa-spinner fa-spin' : 'fa fa-paper-plane'"></i>&nbsp;&nbsp;{{ isReportDataLoading ? 'Testing...' : 'Run / Test Script' }}
                    </button>
                  </div>
                  <div class="col-xs-3">
                    <dburst-button-clear-logs></dburst-button-clear-logs>
                  </div>
                
                </div>
            
            </tab>
            <tab id="tabScriptReportParameters" heading="Report Parameters">
              <ngx-codejar
                id="paramsSpecEditor"
                [(code)]="activeParamsSpecScriptGroovy"
                (update)="onParametersSpecChanged($event)"
                [highlightMethod]="highlightGroovyCode"
                [highlighter]="'prism'"
                [showLineNumbers]="true"
                style="height: 250px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; margin-top: 10px;"
              ></ngx-codejar>
              <button id="btnAiHelpParamsSpecScriptInTab" type="button" class="btn btn-default btn-block" style="margin-top: 10px;" (click)="askAiForHelp('dsl.reportparams')">
                <strong>Hey AI, Help Me Configure These Report Parameters ...</strong>
              </button>
            </tab>
            <tab id="tabScriptExampleReportParameters" heading="Example (Report Parameters)">
              <ngx-codejar
                id="paramsSpecExampleEditor"
                [code]="exampleParamsSpecScript"
                [highlightMethod]="highlightGroovyCode"
                [highlighter]="'prism'"
                [showLineNumbers]="true"
                [readonly]="true"
                style="height: 250px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto; display: block; font-family: 'Courier New', monospace; background-color: #f8f8f8; margin-top: 10px;"
              ></ngx-codejar>
              <button id="btnCopyToClipboardParametersSpecExampleScript" type="button" class="btn btn-default btn-block" style="margin-top: 10px;" (click)="copyToClipboardParametersSpecExample()">
                Copy Example Params Script To Clipboard
              </button>
            </tab>
            </tabset>
           
          </div>
    </div>
    
     
    <div *ngIf="xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery'">
     
      <br />
      <div class="row">
        <div class="col-xs-12">
          <label id="lblShowMoreSqlOptions" for="btnShowMoreSqlOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              <u *ngIf="!xmlReporting?.documentburster.report.datasource.showmoreoptions">Show More SQL Options</u>
              <u *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions"><em>Show Less SQL Options</em></u>
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreSqlOptions"
            style="visibility: hidden;"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.showmoreoptions"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <br />

      <div *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="row">
          <div class="col-xs-2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN' | translate }}
          </div>
          <div class="col-xs-5">
            <select
              id="sqlIdColumn"
              class="form-control"
              [(ngModel)]="sqlIdColumnSelection"
              (ngModelChange)="onSqlIdColumnSelectionChange($event)"
            >
              <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-NOT-USED' | translate }}</option>
              <option value="firstcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-FIRST-COLUMN' | translate }}</option>
              <option value="lastcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LAST-COLUMN' | translate }}</option>
              <option value="custom">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LET-ME-SPECIFY' | translate }}</option>
            </select>
          </div>
          <div class="col-xs-4" *ngIf="sqlIdColumnSelection === 'custom'">
            <input
              type="number"
              id="sqlCustomIdColumnIndex"
              class="form-control"
              min="0"
              [(ngModel)]="xmlReporting.documentburster.report.datasource.sqloptions.idcolumn"
              (ngModelChange)="markSettingsDirty($event)"
              placeholder="Enter column index (0-based)"
            />
          </div>
        </div>
        
      </div>
    </div>
    
    <!-- Script File Section -->
    <div *ngIf="xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile'">
      <br />
      <div class="row">
        <div class="col-xs-12">
          <label id="lblShowMoreScriptOptions" for="btnShowMoreScriptOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              <u *ngIf="!xmlReporting?.documentburster.report.datasource.showmoreoptions">Show More Script Options</u>
              <u *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions"><em>Show Less Script Options</em></u>
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreScriptOptions"
            style="visibility: hidden;"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.showmoreoptions"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <br/>

      <div *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="row">
          <div class="col-xs-2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN' | translate }}
          </div>
          <div class="col-xs-5">
            <select
              id="scriptIdColumn"
              class="form-control"
              [(ngModel)]="scriptIdColumnSelection"
              (ngModelChange)="onScriptIdColumnSelectionChange($event)"
            >
              <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-NOT-USED' | translate }}</option>
              <option value="firstcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-FIRST-COLUMN' | translate }}</option>
              <option value="lastcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LAST-COLUMN' | translate }}</option>
              <option value="custom">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LET-ME-SPECIFY' | translate }}</option>
            </select>
          </div>
          <div class="col-xs-4" *ngIf="scriptIdColumnSelection === 'custom'">
            <input
              type="number"
              id="scriptCustomIdColumnIndex"
              class="form-control"
              min="0"
              [(ngModel)]="xmlReporting.documentburster.report.datasource.scriptoptions.idcolumn"
              (ngModelChange)="markSettingsDirty($event)"
              placeholder="Enter column index (0-based)"
            />
          </div>
        </div>
        <p></p>
        <div class="row">
          <div class="col-xs-2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.FILE-EXPLORER' | translate }}
          </div>
          <div class="col-xs-5">
            <select
              id="scriptFileExplorer"
              class="form-control"
              [(ngModel)]="scriptFileExplorerSelection"
              (ngModelChange)="onScriptFileExplorerSelectionChange($event)"
            >
              <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.FILE-EXPLORER-NOT-USED' | translate }}</option>
              <option value="globpattern">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.FILE-EXPLORER-GLOB-PATTERN' | translate }}</option>
            </select>
          </div>
          <div class="col-xs-4" *ngIf="scriptFileExplorerSelection != 'notused'">
            <input
              type="text"
              id="scriptFileExplorerAllowedFiles"
              class="form-control"
              min="0"
              [(ngModel)]="xmlReporting.documentburster.report.datasource.scriptoptions.selectfileexplorer"
              (ngModelChange)="markSettingsDirty($event)"
              placeholder="Enter allowed file types (eg. *.xml, *.csv, *.txt)"
            />
          </div>
        </div>
        

      </div>

    </div>
 
    <!-- XML Section -->
    <div *ngIf="xmlReporting?.documentburster.report.datasource.type === 'ds.xmlfile'">
      <div class="row">
        <div class="col-xs-2">
          Repeating Node XPath
        </div>
        <div class="col-xs-9">
          <input
            id="xmlRepeatingNodeXPath"
            class="form-control"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.xmloptions.repeatingnodexpath"
            (ngModelChange)="markSettingsDirty($event)"
            required
            placeholder="e.g. /root/records/record"
          />
        </div>
      </div>

      <br />

      <div class="row">
        <div class="col-xs-12">
          <label id="lblShowMoreXmlOptions" for="btnShowMoreXmlOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              <u *ngIf="!xmlReporting?.documentburster.report.datasource.showmoreoptions">Show More XML Options</u>
              <u *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions"><em>Show Less XML Options</em></u>
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreXmlOptions"
            style="visibility: hidden;"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.showmoreoptions"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <br />

      <div class="row" *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="col-xs-2">
          ID Column
        </div>
        <div class="col-xs-9">
          <div class="row">
            <div class="col-xs-6">
              <select
                id="xmlIdColumnSelect"
                class="form-control"
                [(ngModel)]="xmlIdColumnSelection"
                (ngModelChange)="onXmlIdColumnSelectionChange($event)"
              >
                <option value="notused">Not Used</option>
                <option value="custom">Custom XPath Expression...</option>
              </select>
            </div>
            <div class="col-xs-6" *ngIf="xmlIdColumnSelection === 'custom'">
              <input
                id="xmlIdColumnCustom"
                class="form-control"
                [(ngModel)]="xmlReporting.documentburster.report.datasource.xmloptions.idcolumn"
                (ngModelChange)="markSettingsDirty($event)"
                placeholder=""
              />
              <small class="text-muted">Example (using attribute): <code>@id</code></small><br>
              <small class="text-muted">Example (using node): <code>id</code></small>
            </div>
          </div>
        </div>
      </div>

      <p></p>

      <div class="row" *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="col-xs-2">
          Namespace Mappings
        </div>
        <div class="col-xs-9">
          <textarea
            id="xmlNamespaceMappings"
            class="form-control"
            rows="3"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.xmloptions.namespacemappings"
            (ngModelChange)="markSettingsDirty($event)"
            placeholder="e.g. ns=http://example.com/ns"
          ></textarea>
          <small class="text-muted">Format: prefix=uri (one per line for multiple)</small>
        </div>
      </div>

      <p></p>

      <div class="row" *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="col-xs-2">
          Trim Whitespaces
        </div>
        <div class="col-xs-9">
          <input
            type="checkbox"
            id="xmlIgnoreLeadingWhitespace"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.xmloptions.ignoreleadingwhitespace"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>
    </div>
    
    <!-- CSV/TSV Section -->
    <div *ngIf="xmlReporting?.documentburster.report.datasource.type === 'ds.csvfile' || 
                 xmlReporting?.documentburster.report.datasource.type === 'ds.tsvfile'">
      <div class="row">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CSV-SEPARATOR-CHAR' | translate }}
        </div>
        <div class="col-xs-9">
          <input
            id="separatorChar"
            class="form-control"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.csvoptions.separatorchar"
            (ngModelChange)="markSettingsDirty($event)"
            [readonly]="xmlReporting?.documentburster.report.datasource.type === 'ds.tsvfile'"
          />
        </div>
      </div>

      <p></p>
      <div class="row">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER' | translate }}
        </div>
        <div class="col-xs-9">
          <select
            id="selectHeader"
            class="form-control"
            (change)="onSelectCsvHeader()"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.csvoptions.header"
            (ngModelChange)="markSettingsDirty($event)"
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
      <div class="row">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.SKIP-LINES' | translate }}
        </div>
        <div class="col-xs-9">
          <input
            id="skipLines"
            type="number"
            class="form-control"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.csvoptions.skiplines"
            (ngModelChange)="markSettingsDirty($event)"
            [disabled]="xmlReporting?.documentburster.report.datasource.csvoptions.header != 'multiline'"
          />
        </div>
      </div>

      <br />

      <div class="row">
        <div class="col-xs-12">
          <label id="lblShowMoreCsvOptions" for="btnShowMoreCsvOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              <u *ngIf="!xmlReporting?.documentburster.report.datasource.showmoreoptions">Show More CSV Options</u>
              <u *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions"><em>Show Less CSV Options</em></u>
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreCsvOptions"
            style="visibility: hidden;"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.showmoreoptions"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <br />

      <div class="row" *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN' | translate }}
        </div>
        <div class="col-xs-5">
          <select
            id="csvIdColumn"
            class="form-control"
            [(ngModel)]="csvIdColumnSelection"
            (ngModelChange)="onCsvIdColumnSelectionChange($event)"
          >
            <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-NOT-USED' | translate }}</option>
            <option value="firstcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-FIRST-COLUMN' | translate }}</option>
            <option value="lastcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LAST-COLUMN' | translate }}</option>
            <option value="custom">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LET-ME-SPECIFY' | translate }}</option>
          </select>
        </div>
        <div class="col-xs-4" *ngIf="csvIdColumnSelection === 'custom'">
          <input
            type="number"
            id="csvCustomIdColumnIndex"
            class="form-control"
            min="0"
            [(ngModel)]="xmlReporting.documentburster.report.datasource.csvoptions.idcolumn"
            (ngModelChange)="markSettingsDirty($event)"
            placeholder="Enter column index (0-based)"
          />
        </div>
      </div>

      <p></p>
      
      <div class="row" *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CSV-QUOTATION-CHAR' | translate }}
        </div>
        <div class="col-xs-9">
          <input
            id="quotationChar"
            class="form-control"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.csvoptions.quotationchar"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <p></p>

      <div class="row" *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CSV-ESCAPE-CHAR' | translate }}
        </div>
        <div class="col-xs-9">
          <input
            id="escapeChar"
            class="form-control"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.csvoptions.escapechar"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <p></p>
      <div class="row" *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CSV-STRICT-QUOTATIONS' | translate }}
        </div>
        <div class="col-xs-9">
          <input
            type="checkbox"
            id="btnStrictQuotations"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.csvoptions.strictquotations"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <p></p>
      <div class="row" *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CSV-IGNORE-QUOTATIONS' | translate }}
        </div>
        <div class="col-xs-9">
          <input
            type="checkbox"
            id="btnIgnoreQuotations"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.csvoptions.ignorequotations"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <p></p>
      <div class="row" *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.IGNORE-LEADING-WHITESPACE' | translate }}
        </div>
        <div class="col-xs-9">
          <input
            type="checkbox"
            id="btnIgnoreLeadingWhitespace"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.csvoptions.ignoreleadingwhitespace"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>
    
    </div>

    <!-- Fixed Width Section -->
    <div *ngIf="xmlReporting?.documentburster.report.datasource.type === 'ds.fixedwidthfile'">
      
      <!-- Basic Options -->
      <div class="row">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.FIXED-WIDTH-COLUMNS' | translate }}
        </div>
        <div class="col-xs-9">
          <textarea
            id="fixedWidthColumns"
            class="form-control"
            rows="5"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.fixedwidthoptions.columns"
            (ngModelChange)="markSettingsDirty($event)"
            placeholder="Column 1, 10
Column 2, 20
Column 3, 15"
          ></textarea>
        </div>
      </div>

      <p></p>

      <!-- Fixed Width Header -->
      <div class="row">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER' | translate }}
        </div>
        <div class="col-xs-9">
          <select
            id="selectFixedWidthHeader"
            class="form-control"
            (change)="onSelectFixedWidthHeader()"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.fixedwidthoptions.header"
            (ngModelChange)="markSettingsDirty($event)"
          >
            <option value="noheader">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER-NO-HEADER' | translate }}</option>
            <option value="firstline">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER-FIRST-LINE' | translate }}</option>
          </select>
        </div>
      </div>

      <p></p>

      <!-- Fixed Width Skip Lines -->
      <div class="row">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.SKIP-LINES' | translate }}
        </div>
        <div class="col-xs-9">
          <input
            id="fixedWidthSkipLines"
            type="number"
            class="form-control"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.fixedwidthoptions.skiplines"
            (ngModelChange)="markSettingsDirty($event)"
            [disabled]="true"
          />
        </div>
      </div>

      <br />

      <!-- Show More Options Toggle -->
      <div class="row">
        <div class="col-xs-12">
          <label id="lblShowMoreFixedWidthOptions" for="btnShowMoreFixedWidthOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              <u *ngIf="!xmlReporting?.documentburster.report.datasource.showmoreoptions">Show More Fixed Width Options</u>
              <u *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions"><em>Show Less Fixed Width Options</em></u>
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreFixedWidthOptions"
            style="visibility: hidden;"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.showmoreoptions"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <br />

      <!-- Advanced Fixed Width Options -->
      <div class="row" *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN' | translate }}
        </div>
        <div class="col-xs-5">
          <select
            id="fixedWidthIdColumn"
            class="form-control"
            [(ngModel)]="fixedWidthIdColumnSelection"
            (ngModelChange)="onFixedWidthIdColumnSelectionChange($event)"
          >
            <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-NOT-USED' | translate }}</option>
            <option value="firstcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-FIRST-COLUMN' | translate }}</option>
            <option value="lastcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LAST-COLUMN' | translate }}</option>
            <option value="custom">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LET-ME-SPECIFY' | translate }}</option>
          </select>
        </div>
        <div class="col-xs-4" *ngIf="fixedWidthIdColumnSelection === 'custom'">
          <input
            type="number"
            id="fixedWidthCustomIdColumnIndex"
            class="form-control"
            min="0"
            [(ngModel)]="xmlReporting.documentburster.report.datasource.fixedwidthoptions.idcolumn"
            (ngModelChange)="markSettingsDirty($event)"
            placeholder="Enter column index (0-based)"
          />
        </div>
      </div>
      
      <p></p>

      <div *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="row">
          <div class="col-xs-2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.IGNORE-LEADING-WHITESPACE' | translate }}
          </div>
          <div class="col-xs-9">
            <input
              type="checkbox"
              id="btnFixedWidthIgnoreLeadingWhitespace"
              [(ngModel)]="xmlReporting?.documentburster.report.datasource.fixedwidthoptions.ignoreleadingwhitespace"
              (ngModelChange)="markSettingsDirty($event)"
            />
          </div>
        </div>
      </div>
    
    </div>
    
    <!-- Excel Section -->
    <div *ngIf="xmlReporting?.documentburster.report.datasource.type === 'ds.excelfile'">
      <div class="row">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.HEADER' | translate }}
        </div>
        <div class="col-xs-9">
          <select
            id="selectExcelHeader"
            class="form-control"
            (change)="onSelectExcelHeader()"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.exceloptions.header"
            (ngModelChange)="markSettingsDirty($event)"
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
      <div class="row">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.SKIP-LINES' | translate }}
        </div>
        <div class="col-xs-9">
          <input
            id="excelSkipLines"
            class="form-control"
            type="number"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.exceloptions.skiplines"
            (ngModelChange)="markSettingsDirty($event)"
            [disabled]="xmlReporting?.documentburster.report.datasource.exceloptions.header != 'multiline'"
          />
        </div>
      </div>

      <p></p>
      <div class="row">
        <div class="col-xs-2">
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.EXCEL-SHEET-INDEX' | translate }}
        </div>
        <div class="col-xs-9">
          <input
            id="excelSheetIndex"
            class="form-control"
            type="number"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.exceloptions.sheetindex"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <br />

      <div class="row">
        <div class="col-xs-12">
          <label id="lblShowMoreExcelOptions" for="btnShowMoreExcelOptions" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              <u *ngIf="!xmlReporting?.documentburster.report.datasource.showmoreoptions">Show More Excel Options</u>
              <u *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions"><em>Show Less Excel Options</em></u>
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowMoreExcelOptions"
            style="visibility: hidden;"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.showmoreoptions"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <br />

      <div *ngIf="xmlReporting?.documentburster.report.datasource.showmoreoptions">
        <div class="row">
          <div class="col-xs-2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN' | translate }}
          </div>
          <div class="col-xs-5">
            <select
              id="excelIdColumn"
              class="form-control"
              [(ngModel)]="excelIdColumnSelection"
              (ngModelChange)="onExcelIdColumnSelectionChange($event)"
            >
              <option value="notused">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-NOT-USED' | translate }}</option>
              <option value="firstcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-FIRST-COLUMN' | translate }}</option>
              <option value="lastcolumn">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LAST-COLUMN' | translate }}</option>
              <option value="custom">{{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.CODE-COLUMN-LET-ME-SPECIFY' | translate }}</option>
            </select>
          </div>
          <div class="col-xs-4" *ngIf="excelIdColumnSelection === 'custom'">
            <input
              type="number"
              id="excelCustomIdColumnIndex"
              class="form-control"
              min="0"
              [(ngModel)]="xmlReporting.documentburster.report.datasource.exceloptions.idcolumn"
              (ngModelChange)="markSettingsDirty($event)"
              placeholder="Enter column index (0-based)"
            />
          </div>
        </div>

        <p></p>
        <div class="row">
          <div class="col-xs-2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.IGNORE-LEADING-WHITESPACE' | translate }}
          </div>
          <div class="col-xs-9">
            <input
              type="checkbox"
              id="btnExcelIgnoreLeadingWhitespace"
              [(ngModel)]="xmlReporting?.documentburster.report.datasource.exceloptions.ignoreleadingwhitespace"
              (ngModelChange)="markSettingsDirty($event)"
            />
          </div>
        </div>

        <p></p>
        <div class="row">
          <div class="col-xs-2">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-DATASOURCE-DATATABLES.EXCEL-USE-FORMULA-RESULTS' | translate }}
          </div>
          <div class="col-xs-9">
            <input
              type="checkbox"
              id="btnExcelUseFormulaResults"
              [(ngModel)]="xmlReporting?.documentburster.report.datasource.exceloptions.useformularesults"
              (ngModelChange)="markSettingsDirty($event)"
            />
          </div>
        </div>
      </div>

    </div>

    <p></p>
      
    <!-- Add this after all datasource type sections but before the Request Feature section -->
    <div *ngIf="xmlReporting?.documentburster.report.datasource.type === 'ds.sqlquery' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.scriptfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.xmlfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.csvfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.tsvfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.fixedwidthfile' ||
                xmlReporting?.documentburster.report.datasource.type === 'ds.excelfile'">
      
      <div class="row">
        <div class="col-xs-12">
          <label id="lblShowAdditionalTransformation" for="btnShowAdditionalTransformation" class="checkboxlabel" style="cursor: pointer;">
            <span><strong>
              <u *ngIf="!xmlReporting?.documentburster.report.datasource.showadditionaltransformation">Show Additional Data Transformation</u>
              <u *ngIf="xmlReporting?.documentburster.report.datasource.showadditionaltransformation"><em>Hide Additional Data Transformation</em></u>
            </strong></span>
          </label>
          <input
            type="checkbox"
            id="btnShowAdditionalTransformation"
            style="visibility: hidden;"
            [(ngModel)]="xmlReporting?.documentburster.report.datasource.showadditionaltransformation"
            (ngModelChange)="markSettingsDirty($event)"
          />
        </div>
      </div>

      <br />
      
      <div *ngIf="xmlReporting?.documentburster.report.datasource.showadditionaltransformation">
        
        <div class="row">
          <div class="col-xs-2">
            <!-- Label above the editor -->
            <label for="transformationCodeEditor" class="control-label" style="margin-bottom: 5px; display: block;">
              Groovy Script
            </label>
          </div>
          <div class="col-xs-6">
            <button id="btnHelpWithTransformationAI" type="button" class="btn btn-default" (click)="askAiForHelp('script.additionaltransformation')">
             <strong>Hey AI, Help Me With This Groovy Script ...</strong>
            </button>
          </div>
        </div>  
      
        <div class="row">
          <div class="col-xs-12">
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
    </div>

    <!-- Request Feature Section -->
    <div *ngIf="!askForFeatureService.alreadyImplementedFeatures.includes(xmlReporting?.documentburster.report.datasource.type)">
      <div class="row">
        <div class="col-xs-2"></div>
        <div class="col-xs-5">
          <button
            type="button"
            class="btn btn-primary btn-block"
            (click)="triggerFeatureRequestDialog(xmlReporting?.documentburster.report.datasource.type)"
          >
            Request <span class="badge">New</span> Feature
          </button>
        </div>
      </div>
    </div>
  </div>
</ng-template>
<p-dialog 
    header="Enter Report Parameters"
    [(visible)]="isModalParametersVisible"
    [modal]="true"
    [style]="{width: '50vw'}">
    <rb-parameters
        *ngIf="reportParameters && reportParameters.length > 0"
        [parameters]="reportParameters"
        (validChange)="onReportParamsValidChange($event)"
        (valueChange)="onReportParamsValuesChange($event)">
    </rb-parameters>
    <p-footer>
        <button pButton
            type="button"
            label="Cancel"
            id="btnTestQueryCancel"
            (click)="isModalParametersVisible = false"
            class="p-button-secondary"></button>
        <button pButton
            type="button"
            label="Test Query"
            id="btnTestQueryRun"
            (click)="onRunQueryWithParams()"
            [disabled]="!reportParamsValid"></button>
    </p-footer>
</p-dialog>

<!-- ===================================================================== -->
<!-- Cubes Reuse Modal — pick fields, generate SQL, copy to clipboard      -->
<!-- ===================================================================== -->
<div *ngIf="isCubesReuseModalVisible" class="modal fade in" style="display: block;" tabindex="-1">
  <div class="modal-dialog" style="max-width: 640px;">
    <div class="modal-content">
      <div class="modal-header" style="padding: 6px 15px;">
        <span style="font-size: 13px; font-weight: 600;">Cubes</span>
      </div>
      <div class="modal-body" style="max-height: calc(100vh - 240px); overflow-y: auto; padding-top: 12px;">
        <!-- Cube selector — only when more than one cube exists for this connection -->
        <div *ngIf="cubesForCurrentConnection.length > 1" style="margin-bottom: 10px;">
          <select id="cubeReuseSelect" class="form-control"
            [ngModel]="selectedCubeForReuse?.id"
            (ngModelChange)="onCubeForReuseChanged($event)">
            <option *ngFor="let c of cubesForCurrentConnection" [value]="c.id">
              {{ c.name }}
            </option>
          </select>
        </div>
        <!-- Cube renderer — same web component the cube admin uses -->
        <div style="border: 1px solid #ccc; border-radius: 4px; padding: 10px; background: #fafafa;">
          <rb-cube-renderer
            *ngIf="parsedCubeForReuse && selectedCubeForReuse"
            [cubeConfig]="parsedCubeForReuse"
            [connectionId]="selectedCubeForReuse.connectionId"
            [apiBaseUrl]="cubesReuseApiBaseUrl"
            (selectionChanged)="onCubeForReuseSelectionChanged($any($event))">
          </rb-cube-renderer>
          <div *ngIf="parseCubeForReuseError" class="text-danger" style="margin-top: 10px;">
            <i class="fa fa-exclamation-triangle"></i> {{ parseCubeForReuseError }}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="btnCubeReuseShowSql" type="button" class="btn btn-primary"
          [disabled]="!hasCubesReuseFieldSelections"
          (click)="showCubesReuseSql()">
          <i class="fa fa-eye"></i>&nbsp;Get SQL
        </button>
        <button id="btnCubeReuseClose" type="button" class="btn btn-default" (click)="closeCubesReuseModal()">Close</button>
      </div>
    </div>
  </div>
</div>
<div *ngIf="isCubesReuseModalVisible" class="modal-backdrop fade in"></div>

<!-- ===================================================================== -->
<!-- Cubes Reuse — generated SQL preview + Copy to Clipboard               -->
<!-- ===================================================================== -->
<div *ngIf="isCubesReuseSqlModalVisible" class="modal fade in" style="display: block; z-index: 1060;" tabindex="-1">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" (click)="closeCubesReuseSqlModal()">&times;</button>
        <h4 class="modal-title">Generated SQL</h4>
      </div>
      <div class="modal-body">
        <div *ngIf="cubesReuseSqlLoading" style="text-align: center; padding: 30px;">
          <i class="fa fa-spinner fa-spin fa-2x"></i>
          <p style="margin-top: 10px;">Generating SQL...</p>
        </div>
        <pre *ngIf="!cubesReuseSqlLoading"
          style="background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">{{ cubesReuseGeneratedSql }}</pre>
      </div>
      <div class="modal-footer">
        <button id="btnCubeReuseCopySql" type="button" class="btn btn-primary"
          (click)="copyCubesReuseSqlToClipboard()" [disabled]="cubesReuseSqlLoading">
          <i class="fa fa-clipboard"></i>&nbsp;Copy SQL to Clipboard
        </button>
        <button id="btnCubeReuseSqlClose" type="button" class="btn btn-default" (click)="closeCubesReuseSqlModal()">Close</button>
      </div>
    </div>
  </div>
</div>
<div *ngIf="isCubesReuseSqlModalVisible" class="modal-backdrop fade in" style="z-index: 1055;"></div>
`;
