export const tabReportGenerationMailMergeTemplate = `<ng-template
  #tabReportGenerationMailMergeTemplate
>
  <div class="well">
    <div class="row" style="margin-bottom: 3px">
      <div class="col-xs-1">
        {{
        'AREAS.PROCESSING.TAB-REPORTING-MAILMERGE-CLASSICREPORTS.CHOOSE-REPORT'
        | translate }}
      </div>
      <div class="col-xs-4">
        <ng-select
          id="selectMailMergeClassicReport"
          [(ngModel)]="processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport"
          [groupBy]="groupReportsByType"
          (change)="onReportSelectionChange($event)"
          appendTo="body"
        >
          <ng-option
            *ngFor="let report of this.settingsService.getMailMergeConfigurations({samples: this.processingService.procReportingMailMergeInfo.isSample})"
            [value]="report"
            >{{report.templateName}}
            <span *ngIf="report.type=='config-samples'">(sample)</span
            ><span id="{{report.folderName}}_{{report.dsInputType}}" *ngIf="report.dsInputType=='ds.sqlquery'"
              >(input SQL Query)</span
            >
            <span id="{{report.folderName}}_{{report.dsInputType}}" *ngIf="report.dsInputType=='ds.scriptfile'"
              >(input Script File)</span
            >
            <span id="{{report.folderName}}_{{report.dsInputType}}" *ngIf="report.dsInputType=='ds.xmlfile'"
              >(input XML)</span
            >
             <span id="{{report.folderName}}_{{report.dsInputType}}" *ngIf="report.dsInputType=='ds.csvfile'"
              >(input CSV)</span
            >  
                       <span id="{{report.folderName}}_{{report.dsInputType}}" *ngIf="report.dsInputType=='ds.tsvfile'"
              >(input TSV)</span
            >  
            <span id="{{report.folderName}}_{{report.dsInputType}}" *ngIf="report.dsInputType=='ds.fixedwidthfile'"
              >(input Fixed-Width)</span
            >
            <span id="{{report.folderName}}_{{report.dsInputType}}" *ngIf="report.dsInputType=='ds.excelfile'"
              >(input Excel)</span
            >
            <span id="{{report.folderName}}_{{report.dsInputType}}" *ngIf="report.dsInputType=='ds.jasper'"
              ><i class="fa fa-diamond"></i> (JasperReport)</span
            >
            </ng-option
          >
        </ng-select>
      </div>
      
      <div class="col-xs-7" *ngIf="!numberOfGenerateReportsConfigured" style="padding-top: 6px;">
        no reports configured&nbsp;
        <a id="noReportsShowMeHowToConfigureReports" href="https://datapallas.com/docs/report-generation" target="_blank">
            <i class="fa fa-book"></i>&nbsp;{{'AREAS.PROCESSING.TAB-REPORTING-MAILMERGE-CLASSICREPORTS.SHOW-ME-HOW-TO' | translate
          }}
        </a>
      </div>
      
      <ng-container *ngIf="numberOfGenerateReportsConfigured && allowedInputFileTypes() !== 'notused'">
    
        <div class="col-xs-4" *ngIf="processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport">
          <input
            id="mailMergeClassicReportInputFile"
            [(ngModel)]="processingService.procReportingMailMergeInfo.isSample ? processingService.procReportingMailMergeInfo.prefilledInputFilePath : processingService.procReportingMailMergeInfo.inputFileName"
            class="form-control"
            [disabled]="!this.storeService.configSys.sysInfo.setup.java.isJavaOk"
            autofocus
            required
          />
        </div>

        <div id="browseMailMergeClassicReportInputFile" class="col-xs-3" *ngIf="processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport">
          <label for="reportingFileUploadInput" class="btn btn-default btn-block"><i class="fa fa-folder-open-o' }}"></i>&nbsp;Select File</label>
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
      </ng-container>
    
    </div>

    <p></p>
    <div class="row">
      <div class="col-xs-1"></div>

      <div class="col-xs-1">
        <button
          id="btnGenerateReports"
          type="button"
          class="btn btn-primary"
          (click)="doGenerateReports()"
          [disabled]="shouldBeDisabledGenerateReportsButton()"
        >
          <i class="fa fa-play"></i>&nbsp;Burst
        </button>
      </div>

      <div class="col-xs-3">
        <dburst-button-clear-logs></dburst-button-clear-logs>
      </div>

      <div class="col-xs-4">
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

    <div class="row" *ngIf="!storeService.configSys.sysInfo.setup.java.isJavaOk">
      <br /><br />
      <span class="label label-warning"
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
    <div
      class="row"
      *ngIf="processingService.procReportingMailMergeInfo.inputFileName && !executionStatsService.logStats.foundDirtyLogFiles && executionStatsService.jobStats.numberOfActiveJobs === 0 && executionStatsService.jobStats.jobsToResume.length === 0"
    >
      <div class="col-xs-1">
        <i class="fa fa-flag-checkered fa-2x"></i>
      </div>

      <div class="col-xs-11">
        <a
          id="qaReminderLink"
          href="#qaReminder"
          data-toggle="collapse"
          >{{ 'AREAS.PROCESSING.TAB-BURST.DID-YOU-RUN-QA' | translate }}
          <em>{{processingService.procReportingMailMergeInfo.isSample ? processingService.procReportingMailMergeInfo.prefilledInputFilePath : processingService.procReportingMailMergeInfo.inputFileName}}</em>?</a
        >
        <div id="qaReminder" class="collapse">
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
      </div>
    </div>

    <div
      *ngIf="processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport && processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport.reportParameters &&processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport.reportParameters.length > 0"
      class="row" style="margin-top: 10px"
    >
      <div class="col-xs-3">
        <rb-parameters #reportParamsForm
          [parameters]="processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport.reportParameters"
          (validChange)="onReportParamsValidChange($event)"
          (valueChange)="onReportParamsValuesChange($event)"
        ></rb-parameters>
      </div>
    
    </div>

    <div
      *ngIf="processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport && (processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport.dsInputType == 'ds.sqlquery' || processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport.dsInputType == 'ds.scriptfile')"
      class="row" style="margin-top: 10px"
    >
      <div class="col-xs-3">

        <button
          id="btnViewData"
          type="button"
          class="btn btn-default btn-block"
          (click)="doViewData()"
          [disabled]="isViewDataLoading || shouldBeDisabledViewDataButton()"
        >
          <i [ngClass]="isViewDataLoading ? 'fa fa-spinner fa-spin' : 'fa fa-play'"></i>&nbsp;{{ isViewDataLoading ? 'Loading...' : 'View Data' }}
        </button>
        
      </div>
    
    </div>

    <div
      *ngIf="showViewDataTabulator"
      class="row" style="margin-top: 10px"
    >
       <div class="col-xs-12">

            <!-- Clear All Filters link — only visible when filters are active -->
            <div *ngIf="viewDataHasActiveFilters" style="text-align: right; margin-bottom: 6px;">
              <a href="javascript:void(0)" (click)="clearAllViewDataFilters()" style="font-weight: bold; cursor: pointer;">Clear All Filters</a>
            </div>

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

            <div *ngIf="viewDataResult">
              <br/>
              <p>Execution Time: {{ viewDataResult.executionTimeMillis }}ms</p>
              <p>Total Rows: {{ viewDataResult.totalRows || 0 }}</p>
            </div>

          </div>
        </div>

    <div
      *ngIf="executionStatsService.jobStats.numberOfActiveJobs === 0 && executionStatsService.jobStats.jobsToResume.length > 0"
      class="row"
    >
      <div class="col-xs-12">
        <ng-container [ngTemplateOutlet]="resumeJobs"> </ng-container>
      </div>
    </div>

    <div class="row">
      <dburst-log-files-viewer-separate-tabs viewerId="logsViewerGenerateReportsTab"></dburst-log-files-viewer-separate-tabs>
    </div>
  </div>
</ng-template> `;
