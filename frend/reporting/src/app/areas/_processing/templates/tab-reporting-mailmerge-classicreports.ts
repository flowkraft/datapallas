export const tabReportGenerationMailMergeTemplate = `<ng-template
  #tabReportGenerationMailMergeTemplate
>
  <div class="space-y-4">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-bottom: 3px">
      <div style="grid-column:span 1">
        {{
        'AREAS.PROCESSING.TAB-REPORTING-MAILMERGE-CLASSICREPORTS.CHOOSE-REPORT'
        | translate }}
      </div>
      <div style="grid-column:span 4">
        <ng-select
          id="selectMailMergeClassicReport"
          [(ngModel)]="processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport"
          [groupBy]="groupReportsByType"
          (change)="onReportSelectionChange($event)"
          appendTo="body"
        >
          @for (report of this.settingsService.getMailMergeConfigurations({samples: this.processingService.procReportingMailMergeInfo.isSample}); track $index) {
            <ng-option
              [value]="report"
              >{{report.templateName}}
              @if (report.type=='config-samples') {
                <span>(sample)</span>
              }
              @if (report.dsInputType=='ds.sqlquery') {
                <span id="{{report.folderName}}_{{report.dsInputType}}"
                  >(input SQL Query)</span
                >
              }
              @if (report.dsInputType=='ds.scriptfile') {
                <span id="{{report.folderName}}_{{report.dsInputType}}"
                  >(input Script File)</span
                >
              }
              @if (report.dsInputType=='ds.xmlfile') {
                <span id="{{report.folderName}}_{{report.dsInputType}}"
                  >(input XML)</span
                >
              }
              @if (report.dsInputType=='ds.csvfile') {
                <span id="{{report.folderName}}_{{report.dsInputType}}"
                  >(input CSV)</span
                >
              }
              @if (report.dsInputType=='ds.tsvfile') {
                <span id="{{report.folderName}}_{{report.dsInputType}}"
                  >(input TSV)</span
                >
              }
              @if (report.dsInputType=='ds.fixedwidthfile') {
                <span id="{{report.folderName}}_{{report.dsInputType}}"
                  >(input Fixed-Width)</span
                >
              }
              @if (report.dsInputType=='ds.excelfile') {
                <span id="{{report.folderName}}_{{report.dsInputType}}"
                  >(input Excel)</span
                >
              }
              @if (report.dsInputType=='ds.jasper') {
                <span id="{{report.folderName}}_{{report.dsInputType}}"
                  ><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3"/></svg> (JasperReport)</span
                >
              }
            </ng-option>
          }
        </ng-select>
      </div>
      
      @if (!numberOfGenerateReportsConfigured) {
      <div style="grid-column:span 7;padding-top: 6px;">
        no reports configured&nbsp;
        <a id="noReportsShowMeHowToConfigureReports" href="https://datapallas.com/docs/report-generation" target="_blank">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>&nbsp;{{'AREAS.PROCESSING.TAB-REPORTING-MAILMERGE-CLASSICREPORTS.SHOW-ME-HOW-TO' | translate
          }}
        </a>
      </div>
      }

      @if (numberOfGenerateReportsConfigured && allowedInputFileTypes() !== 'notused') {

        @if (processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport) {
        <div style="grid-column:span 4">
          <input
            id="mailMergeClassicReportInputFile"
            [ngModel]="processingService.procReportingMailMergeInfo.isSample ? processingService.procReportingMailMergeInfo.prefilledInputFilePath : processingService.procReportingMailMergeInfo.inputFileName"
            (ngModelChange)="processingService.procReportingMailMergeInfo.inputFileName = $event"
            class="input"
            [disabled]="!this.storeService.configSys.sysInfo.setup.java.isJavaOk"
            autofocus
            required
          />
        </div>
        }

        @if (processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport) {
        <div id="browseMailMergeClassicReportInputFile" style="grid-column:span 3">
          <label for="reportingFileUploadInput" class="btn btn-outline w-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"/></svg>&nbsp;Select File</label>
          <input
  style="display: none"
  type="file"
  id="reportingFileUploadInput"
  (change)="onMailMergeClassicReportFileSelected($event)"
  [attr.accept]="allowedInputFileTypes()"
  #reportingFileUploadInput
  [disabled]="!storeService.configSys.sysInfo.setup.java.isJavaOk"
/>
        <!--  
          <dburst-button-native-system-dialog
            value="{{
            'COMPONENTS.BUTTON-NATIVE-SYSTEM-DIALOG.SELECT-FILE' | translate }}"
            dialogType="file"
            (pathsSelected)="onMailMergeClassicReportFileSelected($event)"
          ></dburst-button-native-system-dialog>-->

        </div>
        }
      }
    
    </div>

    <p></p>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 1"></div>

      <div style="grid-column:span 1">
        <button
          id="btnGenerateReports"
          type="button"
          class="btn btn-primary"
          (click)="doGenerateReports()"
          [disabled]="shouldBeDisabledGenerateReportsButton()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/></svg>&nbsp;Burst
        </button>
      </div>

      <div style="grid-column:span 3">
        <dburst-button-clear-logs></dburst-button-clear-logs>
      </div>

      <div style="grid-column:span 4">
        <!--
        <dburst-button-native-system-dialog
          value="{{
          'AREAS.PROCESSING.TAB-BURST.VIEW-REPORTS' | translate }}"
          dialogType="file"
        >
        </dburst-button-native-system-dialog>
        -->
      </div>
    </div>

    @if (!storeService.configSys.sysInfo.setup.java.isJavaOk) {
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <br /><br />
      <span class="badge badge-warning"
        ><strong
          ><em>Java</em>
          {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.NOT-FOUND' | translate
          }}
        </strong></span
      >
      <br /><br />

      <strong
        id="checkPointJavaPreRequisite"
        [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INNER-HTML.REQUIRED-SHORT' | translate"
      ></strong>

      <br /><br /><span
        [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INNER-HTML.REQUIRED-LONG' | translate"
      ></span>

      <br /><br />

      <a href="#" [routerLink]="['/help', 'installSetupMenuSelected']" skipLocationChange="true"
        ><button type="button" class="btn btn-primary">
          {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.JAVA.INSTALL' | translate }}
          <em>Java</em>
        </button></a
      >
    </div>
    }
    @if (processingService.procReportingMailMergeInfo.inputFileName && !executionStatsService.logStats.foundDirtyLogFiles && executionStatsService.jobStats.numberOfActiveJobs === 0 && executionStatsService.jobStats.jobsToResume.length === 0) {
    <div
      style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem"
    >
      <div style="grid-column:span 1">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/></svg>
      </div>

      <div style="grid-column:span 11">
        <details>
        <summary
          id="qaReminderLink"
          style="cursor:pointer;list-style:none"
          >{{ 'AREAS.PROCESSING.TAB-BURST.DID-YOU-RUN-QA' | translate }}
          <em>{{processingService.procReportingMailMergeInfo.isSample ? processingService.procReportingMailMergeInfo.prefilledInputFilePath : processingService.procReportingMailMergeInfo.inputFileName}}</em>?</summary
        >
        <div id="qaReminder">
          {{ 'AREAS.PROCESSING.TAB-BURST.BEFORE-EMAILING' | translate }}
          <a
            href="#"
            [routerLink]="['/processingQa','qualityMenuSelected',processingService.procReportingMailMergeInfo.prefilledInputFilePath, processingService.procReportingMailMergeInfo.prefilledConfigurationFilePath, 'csv-generate-reports']"
            skipLocationChange="true">Quality Assurance</a
          >
          {{ 'AREAS.PROCESSING.TAB-BURST.FOR-THE-FILE' | translate }}
          <em>{{processingService.procReportingMailMergeInfo.isSample ? processingService.procReportingMailMergeInfo.prefilledInputFilePath : processingService.procReportingMailMergeInfo.inputFileName}}</em>&nbsp;&nbsp;
          <button
            id="goToQa"
            type="button"
            class="btn btn-primary btn-sm"
            [routerLink]="['/processingQa','qualityMenuSelected',processingService.procReportingMailMergeInfo.prefilledInputFilePath, processingService.procReportingMailMergeInfo.prefilledConfigurationFilePath, 'csv-generate-reports']"
            skipLocationChange="true">
            {{ 'AREAS.PROCESSING.TAB-BURST.RUN-QA' | translate }}
          </button>
        </div>
        </details>
      </div>
    </div>
    }

    @if (processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport && processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport.reportParameters &&processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport.reportParameters.length > 0) {
    <div
      style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px"
    >
      <div style="grid-column:span 3">
        <rb-parameters #reportParamsForm
          [parameters]="processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport.reportParameters"
          (validChange)="onReportParamsValidChange($event)"
          (valueChange)="onReportParamsValuesChange($event)"
        ></rb-parameters>
      </div>

    </div>
    }

    @if (processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport && (processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport.dsInputType == 'ds.sqlquery' || processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport.dsInputType == 'ds.scriptfile')) {
    <div
      style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px"
    >
      <div style="grid-column:span 3">

        <button
          id="btnViewData"
          type="button"
          class="btn btn-outline w-full"
          (click)="doViewData()"
          [disabled]="isViewDataLoading || shouldBeDisabledViewDataButton()"
        >
          @if (isViewDataLoading) {
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 animate-spin"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
          } @else {
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/></svg>
          }&nbsp;{{ isViewDataLoading ? 'Loading...' : 'View Data' }}
        </button>

      </div>

    </div>
    }

    @if (showViewDataTabulator) {
    <div
      style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px"
    >
       <div style="grid-column:span 12">

            <!-- Clear All Filters link — only visible when filters are active -->
            @if (viewDataHasActiveFilters) {
            <div style="text-align: right; margin-bottom: 6px;">
              <a href="javascript:void(0)" (click)="clearAllViewDataFilters()" style="font-weight: bold; cursor: pointer;">Clear All Filters</a>
            </div>
            }

            <!-- MODE 2 — Tabulator self-fetches config + data via [reportId] + [apiBaseUrl].
                 View Data uses Mode 2 (not Mode 1) because:
                 1. It needs server-side pagination support for large datasets (1M+ rows)
                 2. The component manages its own pagination state (page/size/sort/filter via ajaxRequestFunc)
                 3. Only Tabulator is shown here (no Chart/Pivot), so no need to share data across components
                 Unlike Config > Test button (Mode 1) where one fetch feeds Tabulator + Chart + Pivot,
                 here the component fetches its own data independently. -->
            <rb-tabulator
              [reportId]="processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport?.folderName"
              [apiBaseUrl]="reportingService.reportingApiBaseUrl"
              [reportParams]="viewDataParams || {}"
              (dataFetched)="onViewDataFetched($any($event))"
              (dataLoaded)="onViewDataFetched($any($event))"
              (dataFiltered)="onViewDataFiltered($any($event))"
              (fetchError)="onViewDataError($any($event))"
              (ready)="onTabReady($any($event))"
              (initError)="onTabError($any($event).detail.message)"
              (tableError)="onTabError($any($event).detail.message)"
            ></rb-tabulator>

            @if (viewDataResult) {
              <div>
                <br/>
                <p>Execution Time: {{ viewDataResult.executionTimeMillis }}ms</p>
                <p>Total Rows: {{ viewDataResult.totalRows || 0 }}</p>
              </div>
            }

          </div>
        </div>
    }

    @if (executionStatsService.jobStats.numberOfActiveJobs === 0 && executionStatsService.jobStats.jobsToResume.length > 0) {
    <div
      style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem"
    >
      <div style="grid-column:span 12">
        <ng-container [ngTemplateOutlet]="resumeJobs"> </ng-container>
      </div>
    </div>
    }

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <dburst-log-files-viewer-separate-tabs viewerId="logsViewerGenerateReportsTab"></dburst-log-files-viewer-separate-tabs>
    </div>
  </div>
</ng-template> `;
