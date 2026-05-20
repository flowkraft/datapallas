import {
  Component,
  OnInit,
  ChangeDetectorRef,
  DestroyRef,
  ViewChild,
  TemplateRef,
  ElementRef,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { interval, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import * as _ from 'lodash';

import { ExecutionStatsService } from '../../providers/execution-stats.service';

import { leftMenuTemplate } from './templates/_left-menu';
import { tabsTemplate } from './templates/_tabs';

import { tabBurstTemplate } from './templates/tab-burst';
import { tabReportGenerationMailMergeTemplate } from './templates/tab-reporting-mailmerge-classicreports';
import { tabCmsWebPortalTemplate } from './templates/tab-cms-webportal';

import { tabMergeBurstTemplate } from './templates/tab-merge-burst';
import { tabQualityAssuranceTemplate } from './templates/tab-quality-assurance';
import { tabLogsTemplate } from './templates/tab-logs';
import { tabSamplesTemplate } from './templates/tab-samples';
import { modalSamplesLearnMoreTemplate } from './templates/modal-samples-learn-more';

import { tabLicenseTemplate } from './templates/tab-license';

import { resumeJobsTemplate } from './templates/resume-jobs';

import Utilities from '../../helpers/utilities';
import { ConfirmService } from '../../components/dialog-confirm/confirm.service';
import { InfoService } from '../../components/dialog-info/info.service';
import { SampleInfo, SamplesService } from '../../providers/samples.service';
import {
  CfgTmplFileInfo,
  ReportParameter,
  ConfigurationRepository,
} from '../../providers/configuration-repository.service';
import { ApiService } from '../../providers/api.service';
import { JobsService } from '../../providers/jobs.service';
import { SystemService } from '../../providers/system.service';
import { ProcessingService } from '../../providers/processing.service';
import { StateStoreService } from '../../providers/state-store.service';
import { ReportsService } from '../../providers/reports.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  ReportingService,
  ReportDataResult,
} from '../../providers/reporting.service';
import { AppsManagerService, ManagedApp } from '../../components/apps-manager/apps-manager.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { AiManagerComponent, AiManagerLaunchConfig } from '../../components/ai-manager/ai-manager.component';

@Component({
    selector: 'dburst-processing',
    template: `
    <aside class="app-sidebar fixed overflow-y-auto z-[810]"
           style="top:calc(64px + var(--cet-offset)); left:0; bottom:30px; width:var(--sidebar-w); overflow-x:hidden; transition:width 0.2s ease; background-color:var(--app-sidebar-bg); border-right:1px solid var(--app-sidebar-border);">
      ${leftMenuTemplate}
    </aside>
    <div class="relative" style="margin-left:var(--sidebar-w); transition:margin-left 0.2s ease; padding-left:1rem; padding-right:1rem; min-height: calc(100vh - var(--app-header-h) - var(--app-statusbar-h) - var(--cet-offset) - var(--app-main-pt));">
      <section class="content"><div>${tabsTemplate}</div></section>
    </div>
    ${tabBurstTemplate} ${tabReportGenerationMailMergeTemplate}
    ${tabCmsWebPortalTemplate} ${tabMergeBurstTemplate}
    ${tabQualityAssuranceTemplate} ${tabLogsTemplate} ${tabSamplesTemplate}
    ${modalSamplesLearnMoreTemplate} ${tabLicenseTemplate} ${resumeJobsTemplate}
  `,
    standalone: false
})
export class ProcessingComponent implements OnInit {
  isModalSamplesLearnMoreVisible = false;

  modalSampleInfo = {
    id: '',
    title: '',
    capReportSplitting: false,
    capReportDistribution: false,
    capReportGenerationMailMerge: false,
    inputDetails: '' as string | SafeHtml,
    outputDetails: '',
    notes: '',
    configurationFilePath: '',
    configurationFileName: '',
    documentation: '',
  };

  private destroyRef = inject(DestroyRef);

  @ViewChild('tabBurstTemplate', { static: true })
  tabBurstTemplate: TemplateRef<any>;

  @ViewChild('tabReportGenerationMailMergeTemplate', { static: true })
  tabReportGenerationMailMergeTemplate: TemplateRef<any>;

  @ViewChild('tabCmsWebPortalTemplate', { static: true })
  tabCmsWebPortalTemplate: TemplateRef<any>;

  @ViewChild('tabMergeBurstTemplate', { static: true })
  tabMergeBurstTemplate: TemplateRef<any>;

  @ViewChild('tabQualityAssuranceTemplate', { static: true })
  tabQualityAssuranceTemplate: TemplateRef<any>;
  @ViewChild('tabLogsTemplate', { static: true })
  tabLogsTemplate: TemplateRef<any>;

  @ViewChild('tabSamplesTemplate', { static: true })
  tabSamplesTemplate: TemplateRef<any>;

  @ViewChild('tabLicenseTemplate', { static: true })
  tabLicenseTemplate: TemplateRef<any>;
  @ViewChild('resumeJobsTemplate', { static: true })
  resumeJobsTemplate: TemplateRef<any>;

  @ViewChild('burstFileUploadInput') burstFileUploadInput: ElementRef;
  @ViewChild('reportingFileUploadInput') reportingFileUploadInput: ElementRef;

  @ViewChild('qaFileUploadInput') qaFileUploadInput: ElementRef;
  @ViewChild('mergeFilesUploadInput') mergeFilesUploadInput: ElementRef;

  numberOfGenerateReportsConfigured: number = 0;

  visibleTabs: {
    id: string;
    heading: string;
    ngTemplateOutlet: string;
    active: boolean;
  }[];

  ALL_TABS = [
    {
      id: 'burstTab',
      heading: 'AREAS.PROCESSING.TABS.BURST',
      ngTemplateOutlet: 'tabBurstTemplate',
    },
    {
      id: 'reportGenerationMailMergeTab',
      heading: 'AREAS.PROCESSING.TABS.MAILMERGE-CLASSICREPORTS',
      ngTemplateOutlet: 'tabReportGenerationMailMergeTemplate',
    },
    {
      id: 'cmsWebPortalTab',
      heading: 'AREAS.PROCESSING.TABS.CMS-WEBPORTAL',
      ngTemplateOutlet: 'tabCmsWebPortalTemplate',
    },
    {
      id: 'mergeBurstTab',
      heading: 'AREAS.PROCESSING.TABS.MERGE-BURST',
      ngTemplateOutlet: 'tabMergeBurstTemplate',
    },
    {
      id: 'procQualityTab',
      heading: 'AREAS.PROCESSING.TABS.QUALITY-ASSURANCE',
      ngTemplateOutlet: 'tabQualityAssuranceTemplate',
    },
    {
      id: 'procSamplesTab',
      heading: 'AREAS.PROCESSING.TABS.SAMPLES',
      ngTemplateOutlet: 'tabSamplesTemplate',
    },
    {
      id: 'logsTab',
      heading: 'AREAS.PROCESSING.TABS.LOGGING-TRACING',
      ngTemplateOutlet: 'tabLogsTemplate',
    },
    {
      id: 'licenseTab',
      heading: 'SHARED-TABS.LICENSE',
      ngTemplateOutlet: 'tabLicenseTemplate',
    },
  ];

  MENU_SELECTED_X_VISIBLE_TABS = [
    {
      selectedMenu: 'burstMenuSelected',
      visibleTabs: [
        'burstTab',
        'reportGenerationMailMergeTab',
        'cmsWebPortalTab',
        'logsTab',
        'licenseTab',
      ],
    },
    {
      selectedMenu: 'mergeBurstMenuSelected',
      visibleTabs: ['mergeBurstTab', 'logsTab', 'licenseTab'],
    },
    {
      selectedMenu: 'qualityMenuSelected',
      visibleTabs: ['procQualityTab', 'logsTab', 'licenseTab'],
    },
    {
      selectedMenu: 'logsMenuSelected',
      visibleTabs: ['logsTab', 'licenseTab'],
    },
    {
      selectedMenu: 'samplesMenuSelected',
      visibleTabs: ['procSamplesTab', 'logsTab', 'licenseTab'],
    },
  ];

  protected xmlSettings = {
    documentburster: {
      settings: null,
    },
  };
  currentLeftMenu: string;

  protected reportgenerationmailmerge = [
    { id: 'payslips.xml', name: 'Payslips' },
    { id: 'invoices.xml', name: 'Invoices' },
    { id: 'bills.xml', name: 'Bills' },
  ];

  cmsPortalApp: ManagedApp[] = [];
  dashboardReports: CfgTmplFileInfo[] = [];
  dashboardFilteredReports: CfgTmplFileInfo[] = [];
  dashboardPage = 0;
  readonly dashboardPageSize = 3;
  dashboardSearchTerm = '';
  isDashboardRefreshing = false;
  private dashboardSearchSubject = new Subject<string>();

  get dashboardTotalPages(): number {
    return Math.max(1, Math.ceil(this.dashboardFilteredReports.length / this.dashboardPageSize));
  }
  get dashboardPageStart(): number {
    return this.dashboardPage * this.dashboardPageSize;
  }
  get dashboardPageEnd(): number {
    return Math.min(this.dashboardFilteredReports.length, this.dashboardPageStart + this.dashboardPageSize);
  }
  get dashboardPageNumbers(): number[] {
    return Array.from({ length: this.dashboardTotalPages }, (_, i) => i);
  }
  get dashboardPagedReports(): CfgTmplFileInfo[] {
    return this.dashboardFilteredReports.slice(this.dashboardPageStart, this.dashboardPageEnd);
  }

  onDashboardSearchChange(term: string) {
    this.dashboardSearchSubject.next(term ?? '');
  }

  dashboardGoToPage(i: number) {
    this.dashboardPage = i;
  }
  dashboardPrevPage() {
    if (this.dashboardPage > 0) this.dashboardPage--;
  }
  dashboardNextPage() {
    if (this.dashboardPage < this.dashboardTotalPages - 1) this.dashboardPage++;
  }

  async refreshDashboards(): Promise<void> {
    if (this.isDashboardRefreshing) return;
    this.isDashboardRefreshing = true;
    try {
      this.settingsService.configurationFiles =
        await this.settingsService.loadAllReports({ forceReload: true });
      this.applyDashboardFilter();
    } finally {
      this.isDashboardRefreshing = false;
    }
  }

  /** Rebuild dashboardReports respecting the "Show sample connections & cubes" toggle and search. */
  applyDashboardFilter(): void {
    const all = this.settingsService.configurationFiles.filter(
      (r) => r.dsInputType === 'ds.dashboard'
    );
    this.dashboardReports = this.settingsService.showSamples
      ? all
      : all.filter((r) => r.type !== 'config-samples');

    // Apply search filter
    const term = (this.dashboardSearchTerm || '').trim().toLowerCase();
    this.dashboardFilteredReports = term
      ? this.dashboardReports.filter((r) =>
          (r.templateName || r.folderName || '').toLowerCase().includes(term)
        )
      : [...this.dashboardReports];

    // Reset to first page if current page is now out of range
    if (this.dashboardPage >= this.dashboardTotalPages) {
      this.dashboardPage = 0;
    }
  }

  protected processingService     = inject(ProcessingService);
  protected apiService            = inject(ApiService);
  protected jobsService           = inject(JobsService);
  protected systemService         = inject(SystemService);
  protected settingsService       = inject(ConfigurationRepository);
  protected appsManagerService    = inject(AppsManagerService);
  protected confirmService        = inject(ConfirmService);
  protected infoService           = inject(InfoService);
  protected messagesService       = inject(ToastrMessagesService);
  protected route                 = inject(ActivatedRoute);
  protected router                = inject(Router);
  protected changeDetectorRef     = inject(ChangeDetectorRef);
  protected storeService          = inject(StateStoreService);
  protected reportingService      = inject(ReportingService);
  protected executionStatsService = inject(ExecutionStatsService);
  protected samplesService        = inject(SamplesService);
  protected sanitizer             = inject(DomSanitizer);
  protected reportsService        = inject(ReportsService);

  ngOnDestroy() {
    this.reportDataResult = null;
    this.isReportDataLoading = false;
  }

  // ==========================================================================
  //  Lifecycle & route initialization
  // ==========================================================================

  /**
   * Normalize a config file path for CLI execution.
   * Ensures the path includes the PORTABLE_EXECUTABLE_DIR_PATH prefix.
   */
  private normalizeConfigPath(configFilePath: string): string {
    if (!configFilePath) return configFilePath;
    const slashed = Utilities.slash(configFilePath);
    if (slashed.includes('PORTABLE_EXECUTABLE_DIR_PATH')) return slashed;
    return slashed.replace('/config/', 'PORTABLE_EXECUTABLE_DIR_PATH/config/');
  }

  /**
   * Upload a single input file and return the uploaded file path.
   * Returns null if upload fails.
   */
  private async uploadInputFile(
    inputFile: any,
    inputFileName: string,
    useQaEndpoint: boolean = false,
  ): Promise<string | null> {
    const formData = new FormData();
    formData.append('file', inputFile, inputFileName);
    const uploadedFilesInfo = useQaEndpoint
      ? await this.jobsService.uploadQa(formData)
      : await this.jobsService.uploadSingle(formData);
    if (!uploadedFilesInfo || !uploadedFilesInfo.length) return null;
    return uploadedFilesInfo[0].filePath;
  }

  async ngOnInit() {
    this.cmsPortalApp = [await this.appsManagerService.getAppById('cms-webportal')];

    this.settingsService.currentConfigurationTemplateName = '';
    this.settingsService.currentConfigurationTemplatePath = '';
    delete this.processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport;

    await this.settingsService.loadAllConnections();
    this.settingsService.configurationFiles =
      await this.settingsService.loadAllReports({ forceReload: true });
    // Dashboard search debounce
    this.dashboardSearchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.dashboardSearchTerm = term;
        this.dashboardPage = 0;
        this.applyDashboardFilter();
      });

    this.applyDashboardFilter();
    await this.samplesService.fillSamplesNotes();

    // Reload dashboard list when the user toggles "Show sample connections & cubes".
    // BehaviorSubject fires the current value synchronously on subscribe — skip
    // that first emission since we already loaded above.
    let firstEmission = true;
    this.settingsService.showSamples$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (firstEmission) {
          firstEmission = false;
          return;
        }
        this.applyDashboardFilter();
        this.changeDetectorRef.detectChanges();
      });

    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async (params) => { await this.handleRouteParams(params); });

    this.xmlSettings = await this.reportsService.loadReportSettings('burst');
    if (this.xmlSettings?.documentburster)
      this.processingService.procMergeBurstInfo.mergedFileName =
        this.xmlSettings.documentburster.settings.mergefilename;
  }

  private async handleRouteParams(params: any) {
    const processingMode = this.detectProcessingMode(params);

    this.currentLeftMenu = params.leftMenu || 'burstMenuSelected';

    if (this.currentLeftMenu === 'qualityMenuSelected') {
      this.initQualityAssuranceFromParams(params);
    } else {
      this.initProcessingFromParams(params, processingMode);
    }

    this.refreshTabs();
    this.activateTabForMode(processingMode);
    this.changeDetectorRef.detectChanges();
  }

  private detectProcessingMode(params: any): string {
    this.processingService.procReportingMailMergeInfo.isSample = false;
    this.processingService.procBurstInfo.isSample = false;

    if (params.prefilledSelectedMailMergeClassicReport) {
      this.processingService.procReportingMailMergeInfo.isSample = true;
      this.processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport =
        this.settingsService
          .getMailMergeConfigurations({ samples: true })
          .find((c: CfgTmplFileInfo) =>
            c.filePath.includes(params.prefilledSelectedMailMergeClassicReport),
          );
      if (this.processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport) {
        this.settingsService.loadReportDetails(
          this.processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport,
        );
      }
      return 'processing-sample-generate';
    }

    if (params.prefilledInputFilePath) {
      this.processingService.procBurstInfo.isSample = true;
      return 'processing-sample-burst';
    }

    return 'processing';
  }

  private initQualityAssuranceFromParams(params: any) {
    if (params.prefilledInputFilePath)
      this.processingService.procQualityAssuranceInfo.prefilledInputFilePath = params.prefilledInputFilePath;
    if (params.prefilledConfigurationFilePath)
      this.processingService.procQualityAssuranceInfo.prefilledConfigurationFilePath = params.prefilledConfigurationFilePath;
    if (params.whichAction)
      this.processingService.procQualityAssuranceInfo.whichAction = params.whichAction;

    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.checkIfTestEmailServerIsStarted(); });
  }

  private initProcessingFromParams(params: any, processingMode: string) {
    if (processingMode === 'processing-sample-burst' || processingMode === 'processing-sample-generate') {
      if (this.currentLeftMenu !== 'mergeBurstMenuSelected') {
        if (processingMode === 'processing-sample-burst')
          this.processingService.procBurstInfo.prefilledInputFilePath = params.prefilledInputFilePath;
        if (processingMode === 'processing-sample-generate')
          this.processingService.procReportingMailMergeInfo.prefilledInputFilePath = params.prefilledInputFilePath;
      }

      if (this.currentLeftMenu === 'mergeBurstMenuSelected') {
        this.initMergeBurstFromParams(params);
      }
    }

    if (processingMode === 'processing-sample-burst')
      this.processingService.procBurstInfo.prefilledConfigurationFilePath = params.prefilledConfigurationFilePath;
    if (processingMode === 'processing-sample-generate')
      this.processingService.procReportingMailMergeInfo.prefilledConfigurationFilePath = params.prefilledSelectedMailMergeClassicReport;
  }

  private initMergeBurstFromParams(params: any) {
    let filePath = params.prefilledInputFilePath;
    this.processingService.procMergeBurstInfo.shouldBurstResultedMergedFile =
      filePath.endsWith('#burst-merged-file');

    if (this.processingService.procMergeBurstInfo.shouldBurstResultedMergedFile)
      filePath = filePath.replace('#burst-merged-file', '');

    filePath.split('#').forEach((fp: string) => {
      this.processingService.procMergeBurstInfo.inputFiles.push({
        name: Utilities.basename(fp),
        path: fp,
      });
    });
  }

  private activateTabForMode(processingMode: string) {
    if (processingMode === 'processing-sample-generate') {
      this.visibleTabs[1].active = true;
      this.visibleTabs[0].active = false;
    } else {
      this.visibleTabs[0].active = true;
      this.visibleTabs[1].active = false;
    }
  }

  // ==========================================================================
  //  Tab & dashboard view state
  // ==========================================================================

  refreshTabs() {
    this.visibleTabs = [];
    this.changeDetectorRef.detectChanges();

    let visibleTabsIds = this.MENU_SELECTED_X_VISIBLE_TABS.find((item) => {
      return item.selectedMenu === this.currentLeftMenu;
    }).visibleTabs;

    const mailMergeConfigurations =
      this.settingsService.getMailMergeConfigurations({
        samples: this.processingService.procReportingMailMergeInfo.isSample,
      });

    this.numberOfGenerateReportsConfigured =
      mailMergeConfigurations?.length || 0;

    this.visibleTabs = this.ALL_TABS.filter((item) =>
      visibleTabsIds.includes(item.id),
    ).map((tab) => ({
      ...tab,
      active: false,
    }));
  }

  // ==========================================================================
  //  Input file handling (upload + selection)
  // ==========================================================================

  onBurstFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;

    // Set burst info
    this.processingService.procBurstInfo.inputFile = target.files[0];
    this.processingService.procBurstInfo.inputFileName = target.files[0].name;
    this.processingService.procBurstInfo.isSample = false;
    this.processingService.procBurstInfo.prefilledInputFilePath = '';

    // Set QA info
    this.processingService.procQualityAssuranceInfo.inputFile =
      this.processingService.procBurstInfo.inputFile;
    this.processingService.procQualityAssuranceInfo.inputFileName =
      this.processingService.procBurstInfo.inputFileName;
    this.processingService.procQualityAssuranceInfo.prefilledInputFilePath = '';
    this.processingService.procQualityAssuranceInfo.whichAction = 'burst';
  }

  resetProcInfo() {
    this.processingService.procBurstInfo.inputFile = null;
    this.processingService.procBurstInfo.prefilledInputFilePath = null;

    this.processingService.procBurstInfo.inputFileName = '';

    this.processingService.procBurstInfo.prefilledConfigurationFilePath = '';
    this.processingService.procBurstInfo.isSample = false;

    this.processingService.procQualityAssuranceInfo.inputFile = null;
    this.processingService.procQualityAssuranceInfo.inputFileName = '';
    this.processingService.procQualityAssuranceInfo.prefilledInputFilePath = '';

    this.processingService.procMergeBurstInfo.inputFiles = [];
    this.processingService.procMergeBurstInfo.inputFilesNames = [];
    this.processingService.procMergeBurstInfo.shouldBurstResultedMergedFile =
      false;
    this.processingService.procMergeBurstInfo.mergedFileName = 'merged.pdf';

    this.processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport =
      null;

    // Reset View Data state so rb-tabulator isn't rendered with null reportId
    this.showViewDataTabulator = false;
    this.isViewDataLoading = false;
    this.viewDataResult = null;

    this.processingService.procReportingMailMergeInfo.inputFile = null;
    this.processingService.procReportingMailMergeInfo.inputFileName = '';

    this.processingService.procReportingMailMergeInfo.prefilledInputFilePath =
      '';
    this.processingService.procReportingMailMergeInfo.prefilledConfigurationFilePath =
      '';

    this.clearAllFileInputs();
  }

  private clearAllFileInputs(): void {
    if (this.burstFileUploadInput?.nativeElement) this.burstFileUploadInput.nativeElement.value = '';
    if (this.reportingFileUploadInput?.nativeElement) this.reportingFileUploadInput.nativeElement.value = '';
    if (this.qaFileUploadInput?.nativeElement) this.qaFileUploadInput.nativeElement.value = '';
    if (this.mergeFilesUploadInput?.nativeElement) this.mergeFilesUploadInput.nativeElement.value = '';
  }

  async onMailMergeClassicReportFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;

    this.processingService.procReportingMailMergeInfo.inputFile =
      target.files[0];
    this.processingService.procReportingMailMergeInfo.inputFileName =
      this.processingService.procReportingMailMergeInfo.inputFile.name;

    this.processingService.procReportingMailMergeInfo.prefilledConfigurationFilePath =
      Utilities.slash(
        this.processingService.procReportingMailMergeInfo
          .selectedMailMergeClassicReport.filePath,
      );

    this.processingService.procQualityAssuranceInfo.inputFile =
      this.processingService.procReportingMailMergeInfo.inputFile;
    this.processingService.procQualityAssuranceInfo.inputFileName =
      this.processingService.procReportingMailMergeInfo.inputFileName;

    this.processingService.procQualityAssuranceInfo.prefilledConfigurationFilePath =
      this.processingService.procReportingMailMergeInfo.prefilledConfigurationFilePath;

    this.processingService.procQualityAssuranceInfo.whichAction =
      'csv-generate-reports';
  }

  // ==========================================================================
  //  Job submission — Burst / Generate / Merge / QA
  // ==========================================================================

  private blockedByDirtyLogs(): boolean {
    if (!this.executionStatsService.logStats.foundDirtyLogFiles) return false;
    this.infoService.showInformation({
      message: 'Log files are not empty. You need to press the Clear Logs button first.',
    });
    return true;
  }

  private async confirmAndStartJob(
    question: string,
    workingOnLabel: string,
    jobAction: () => void | Promise<void>,
  ): Promise<void> {
    this.confirmService.askConfirmation({
      message: question,
      confirmAction: async () => {
        this.messagesService.showInfo(
          `Working on ${workingOnLabel}. Please wait.`, '', { messageClass: 'java-started' },
        );
        await jobAction();
        this.resetProcInfo();
      },
    });
  }

  doBurst() {
    if (this.blockedByDirtyLogs()) return;

    if (this.processingService.procBurstInfo.isSample) {
      this.processingService.procBurstInfo.inputFileName = Utilities.basename(
        this.processingService.procBurstInfo.prefilledInputFilePath,
      );
    }
    const dialogQuestion = `Burst file ${this.processingService.procBurstInfo.inputFileName}?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        let inputFilePath =
          this.processingService.procBurstInfo.prefilledInputFilePath;
        let configFilePath =
          this.processingService.procBurstInfo.prefilledConfigurationFilePath;

        if (!this.processingService.procBurstInfo.isSample) {
          const uploaded = await this.uploadInputFile(
            this.processingService.procBurstInfo.inputFile,
            this.processingService.procBurstInfo.inputFileName,
          );
          if (!uploaded) return;
          inputFilePath = uploaded;
        }

        this.messagesService.showInfo(
          'Working on ' + this.processingService.procBurstInfo.inputFileName + '. Please wait.',
          '', { messageClass: 'java-started' },
        );

        const burstReportId = configFilePath
          ? Utilities.basename(Utilities.dirname(configFilePath))
          : undefined;

        const { jobId: burstJobId } = await this.jobsService.submitJob('burst', {
          inputFile: inputFilePath,
          reportId: burstReportId,
        });
        this.executionStatsService.jobStats.currentJobId = burstJobId;

        this.resetProcInfo();
      },
    });
  }

  doGenerateReports() {
    if (this.blockedByDirtyLogs()) return;

    const selectedReport =
      this.processingService.procReportingMailMergeInfo
        .selectedMailMergeClassicReport;
    const doesSelectedReportRequiresAnInputFile =
      this.requiresInputFile();

    const doesSelectedReportRequiresParameters =
      this.requiresParameters();

    if (this.processingService.procReportingMailMergeInfo.isSample) {
      if (doesSelectedReportRequiresAnInputFile)
        this.processingService.procReportingMailMergeInfo.inputFileName =
          Utilities.basename(
            this.processingService.procReportingMailMergeInfo
              .prefilledInputFilePath,
          );
    }
    let dialogQuestion = `Burst file ${this.processingService.procReportingMailMergeInfo.inputFileName}?`;

    if (!this.requiresInputFile())
      dialogQuestion = `Burst report ${selectedReport.templateName}?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {

        let inputFilePath = '';

        if (doesSelectedReportRequiresAnInputFile) {
          inputFilePath =
            this.processingService.procReportingMailMergeInfo
              .prefilledInputFilePath;
          if (!this.processingService.procReportingMailMergeInfo.isSample) {
            const uploaded = await this.uploadInputFile(
              this.processingService.procReportingMailMergeInfo.inputFile,
              this.processingService.procReportingMailMergeInfo.inputFileName,
            );
            if (!uploaded) return;
            inputFilePath = uploaded;
          }
        }

        this.messagesService.showInfo(
          'Working on ' + this.processingService.procReportingMailMergeInfo.inputFileName + '. Please wait.',
          '', { messageClass: 'java-started' },
        );

        // Determine the input: either a file path (CSV/Excel) or the template name (SQL/Script/Jasper)
        let input = inputFilePath || undefined;
        if (!input && (selectedReport.dsInputType === 'ds.sqlquery' || selectedReport.dsInputType === 'ds.scriptfile' || selectedReport.dsInputType === 'ds.jasper')) {
          input = selectedReport.templateName;
        }

        // Build params map from reportParamsValues
        let paramsMap: Record<string, string> | undefined;
        if (doesSelectedReportRequiresParameters && this.reportParamsValues && Object.keys(this.reportParamsValues).length > 0) {
          paramsMap = {};
          for (const [key, value] of Object.entries(this.reportParamsValues)) {
            paramsMap[key] = String(value);
          }
        }

        const { jobId: generateJobId } = await this.jobsService.submitJob('generate', {
          reportId: selectedReport.folderName,
          input,
          params: paramsMap,
        });
        this.executionStatsService.jobStats.currentJobId = generateJobId;

        this.resetProcInfo();
      },
    });
  }

  // ==========================================================================
  //  Merge file list management
  // ==========================================================================

  doMergeBurst() {
    if (this.blockedByDirtyLogs()) return;

    const dialogQuestion = 'Post a new job?';

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        let mergeFilePath = '';

        if (!this.processingService.procBurstInfo.isSample) {
          const formData = new FormData();
          this.processingService.procMergeBurstInfo.inputFiles.forEach(
            (inputFile, index) => {
              formData.append('files', inputFile.file, inputFile.name);
            },
          );

          const uploadedFilesInfo = await this.jobsService.uploadMultiple(formData);
          if (!uploadedFilesInfo || !uploadedFilesInfo.length) {
            return;
          }

          const uploadResult = await this.jobsService.prepareMergeList(
              uploadedFilesInfo.map((fileInfo: { filePath: string }) => fileInfo.filePath),
            );
          mergeFilePath = uploadResult.listFile;
        } else if (this.processingService.procBurstInfo.isSample) {
          const sampleResult = await this.jobsService.prepareMergeList(
              this.processingService.procMergeBurstInfo.inputFiles.map(
                (fileInfo: { path: string }) => fileInfo.path,
              ),
            );
          mergeFilePath = sampleResult.listFile;
        }

        this.messagesService.showInfo(
          'Working on ' + this.processingService.procMergeBurstInfo.mergedFileName + '. Please wait.',
          '', { messageClass: 'java-started' },
        );

        const { jobId: mergeJobId } = await this.jobsService.submitJob('merge', {
          listFile: mergeFilePath,
          outputName: this.processingService.procMergeBurstInfo.mergedFileName,
          burst: this.processingService.procMergeBurstInfo.shouldBurstResultedMergedFile,
        });
        this.executionStatsService.jobStats.currentJobId = mergeJobId;

        this.resetProcInfo();
      },
    });
  }

  onFilesAdded(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = Array.from(target.files);

    files.forEach((file) => {
      this.processingService.procMergeBurstInfo.inputFiles.push({
        id: this.processingService.procMergeBurstInfo.inputFiles.length,
        name: file.name,
        file: file,
      });
    });

    target.value = '';
  }

  onFileSelected(file: { id: string }) {
    this.processingService.procMergeBurstInfo.inputFiles.forEach((each) => {
      if (each.id === file.id) {
        each.selected = true;
        this.processingService.procMergeBurstInfo.selectedFile = file;
      } else {
        each.selected = false;
      }
    });
  }

  onSelectedFileDelete() {
    const dialogQuestion = 'Delete selected item?';

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: () => {
        _.remove(
          this.processingService.procMergeBurstInfo.inputFiles,
          (o) =>
            o.id === this.processingService.procMergeBurstInfo.selectedFile.id,
        );
      },
    });
  }

  onSelectedFileUp() {
    const index = _.indexOf(
      this.processingService.procMergeBurstInfo.inputFiles,
      this.processingService.procMergeBurstInfo.selectedFile,
    );

    if (index > 0) {
      this.moveItemInArray(
        this.processingService.procMergeBurstInfo.inputFiles,
        index,
        index - 1,
      );
      this.onFileSelected(
        this.processingService.procMergeBurstInfo.selectedFile,
      );
    }
  }

  onSelectedFileDown() {
    const index = _.indexOf(
      this.processingService.procMergeBurstInfo.inputFiles,
      this.processingService.procMergeBurstInfo.selectedFile,
    );

    if (
      index <
      this.processingService.procMergeBurstInfo.inputFiles.length - 1
    ) {
      this.moveItemInArray(
        this.processingService.procMergeBurstInfo.inputFiles,
        index,
        index + 1,
      );
      this.onFileSelected(
        this.processingService.procMergeBurstInfo.selectedFile,
      );
    }
  }

  onClearFiles() {
    const dialogQuestion = 'Clear all items?';

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: () => {
        this.processingService.procMergeBurstInfo.inputFiles = [];
      },
    });
  }

  async saveMergedFileSetting() {
    const xmlSettings = await this.reportsService.loadReportSettings('burst');

    xmlSettings.documentburster.settings.mergefilename =
      this.processingService.procMergeBurstInfo.mergedFileName;

    this.reportsService.saveReportSettings('burst', xmlSettings);
  }

  moveItemInArray<T>(array: T[], from: number, to: number): void {
    array.splice(to, 0, array.splice(from, 1)[0]);
  }

  onQAFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    this.processingService.procQualityAssuranceInfo.inputFile = target.files[0];
    this.processingService.procQualityAssuranceInfo.inputFileName =
      this.processingService.procQualityAssuranceInfo.inputFile.name;
  }

  doRunTest() {
    if (this.blockedByDirtyLogs()) return;

    if (this.processingService.procBurstInfo.isSample) {
      this.processingService.procQualityAssuranceInfo.inputFileName =
        Utilities.basename(
          this.processingService.procQualityAssuranceInfo
            .prefilledInputFilePath,
        );
    }

    const dialogQuestion = `Test file ${this.processingService.procQualityAssuranceInfo.inputFileName}?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        let inputFilePath =
          this.processingService.procQualityAssuranceInfo
            .prefilledInputFilePath;
        const configFilePath =
          this.processingService.procQualityAssuranceInfo
            .prefilledConfigurationFilePath;

        // Handle file upload if needed
        if (!this.processingService.procBurstInfo.isSample) {
          const uploaded = await this.uploadInputFile(
            this.processingService.procQualityAssuranceInfo.inputFile,
            this.processingService.procQualityAssuranceInfo.inputFileName,
            true, // useQaEndpoint
          );
          if (uploaded) {
            inputFilePath = uploaded;
          }
        }

        // Build QA testing params
        const qaMode = this.processingService.procQualityAssuranceInfo.mode;
        const qaParams: any = { inputFile: inputFilePath };

        if (qaMode === 'ta') {
          qaParams.testAll = true;
        } else if (qaMode === 'tl') {
          qaParams.testList = this.processingService.procQualityAssuranceInfo.listOfTokens
            .toString()
            .replace(/, +/g, ',');
        } else if (qaMode === 'tr') {
          qaParams.testRandom = Number(this.processingService.procQualityAssuranceInfo.numberOfRandomTokens);
        }

        // Resolve reportId for generate QA
        if (this.processingService.procQualityAssuranceInfo.whichAction === 'csv-generate-reports' && configFilePath) {
          qaParams.reportId = Utilities.basename(Utilities.dirname(configFilePath));
        }

        this.messagesService.showInfo(
          'Working on ' + Utilities.basename(inputFilePath) + '. Please wait.',
          '', { messageClass: 'java-started' },
        );

        // Execute via REST — burst or generate with QA params
        let qaJobId: string;
        if (this.processingService.procQualityAssuranceInfo.whichAction === 'burst') {
          ({ jobId: qaJobId } = await this.jobsService.submitJob('burst', qaParams));
        } else {
          ({ jobId: qaJobId } = await this.jobsService.submitJob('generate', { ...qaParams, input: inputFilePath }));
        }
        this.executionStatsService.jobStats.currentJobId = qaJobId;

        this.resetProcInfo();
      },
    });
  }

  selectQualityAssuranceMode(mode) {
    switch (mode) {
      case 'tl':
        document.getElementById('listOfTokens').focus();
        break;
      case 'tr':
        document.getElementById('numberOfRandomTokens').focus();
        break;
      case 'listOfTokens':
        this.processingService.procQualityAssuranceInfo.mode = 'tl';
        break;
      case 'numberOfRandomTokens':
        this.processingService.procQualityAssuranceInfo.mode = 'tr';
        break;
      default:
        document.getElementById('listOfTokens').focus();
        this.processingService.procQualityAssuranceInfo.mode = 'ta';
    }
  }

  runTestShouldBeDisabled() {
    let disableRunTest = true;

    let isInputFileSelected = false;
    if (
      this.processingService.procQualityAssuranceInfo.inputFile ||
      (this.processingService.procBurstInfo.isSample &&
        this.processingService.procQualityAssuranceInfo.prefilledInputFilePath)
    ) {
      isInputFileSelected = true;
    }

    if (isInputFileSelected) {
      switch (this.processingService.procQualityAssuranceInfo.mode) {
        case 'ta':
          disableRunTest = false;
          break;
        case 'tl':
          if (this.processingService.procQualityAssuranceInfo.listOfTokens) {
            disableRunTest = false;
          }
          break;
        case 'tr':
          if (
            Utilities.isPositiveInteger(
              this.processingService.procQualityAssuranceInfo
                .numberOfRandomTokens,
            )
          ) {
            disableRunTest = false;
          }
          break;
        default:
          disableRunTest = true;
      }
    }
    return disableRunTest;
  }

  // ==========================================================================
  //  Test Email Server (MailHog start/stop)
  // ==========================================================================

  async checkIfTestEmailServerIsStarted() {
    let testEmailServerStatus = 'stopped';
    const qaEmailServerStarted = await this.systemService.checkUrl(
      encodeURIComponent(
        this.xmlSettings.documentburster.settings.qualityassurance.emailserver
          .weburl,
      ),
    );

    if (qaEmailServerStarted) testEmailServerStatus = 'started';

    if (
      this.processingService.procQualityAssuranceInfo.testEmailServerStatus !==
      testEmailServerStatus
    )
      this.processingService.procQualityAssuranceInfo.testEmailServerStatus =
        testEmailServerStatus;
  }

  doStartStopTestEmailServer(command: string) {
    let dialogQuestion = 'Start Test Email Server?';

    if (command === 'shut') {
      dialogQuestion = 'Stop Test Email Server?';
    }

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        this.processingService.procQualityAssuranceInfo.testEmailServerStatus =
          'starting';
        if (command === 'shut') {
          this.processingService.procQualityAssuranceInfo.testEmailServerStatus =
            'stopping';
        }

        const action = command === 'shut' ? 'shut' : 'start';
        this.messagesService.showInfo('Working ... Please wait.', '', { messageClass: 'java-started' });

        // Fire and forget — startTestEmailServer.bat runs MailHog in the foreground
        // so the HTTP response never returns while MailHog is running.
        const endpoint = command === 'shut' ? '/system/test-email-server/stop' : '/system/test-email-server/start';
        this.apiService.post(endpoint).catch(() => {});

        // Poll until the email server reaches the expected state
        const expectedStatus = command === 'shut' ? 'stopped' : 'started';
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          await this.checkIfTestEmailServerIsStarted();
          if (this.processingService.procQualityAssuranceInfo.testEmailServerStatus === expectedStatus) break;
        }
        this.messagesService.showSuccess('Done', '', { messageClass: 'java-exited' });
      },
    });
  }

  // ==========================================================================
  //  Job control — resume / cancel
  // ==========================================================================

  doResumeJob(jobFilePath: string) {
    if (this.blockedByDirtyLogs()) return;

    const dialogQuestion = 'Resume processing this job?';

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: () => {
        this.executionStatsService.jobStats.jobsToResume = [];

        this.messagesService.showInfo(
          'Working on ' + Utilities.basename(jobFilePath) + '. Please wait.',
          '', { messageClass: 'java-started' },
        );

        this.apiService.post('/jobs/resume', {
          id: jobFilePath,
          info: jobFilePath,
        });

        this.executionStatsService.jobStats.jobsToResume = [];
      },
    });
  }

  clearResumeJob(jobFilePath: string) {
    const dialogQuestion = 'Clear this job?';

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        await this.jobsService.clearResumeJobFile(jobFilePath);
        this.messagesService.showInfo('Job was cleared.');
        this.executionStatsService.jobStats.jobsToResume = [];
      },
    });
  }

  // ==========================================================================
  //  Report parameter form handling
  // ==========================================================================

  reportParamsValid = false;
  reportParamsValues: { [key: string]: any } = {};

  reportDataResult: ReportDataResult | null = null;
  isReportDataLoading = false;

  // View Data — Mode 2 (self-fetch) state
  isViewDataLoading = false;
  showViewDataTabulator = false;
  viewDataParams: { [key: string]: string } = {};
  viewDataResult: { executionTimeMillis: number; totalRows: number } | null = null;

  onReportParamsValidChange(event: Event) {
    // Web component emits CustomEvent with data in .detail
    const isValid = (event as CustomEvent<boolean>).detail;
    this.reportParamsValid = isValid;
    this.changeDetectorRef.detectChanges();
  }

  onReportParamsValuesChange(event: Event) {
    // Web component emits CustomEvent with data in .detail
    const values = (event as CustomEvent<{ [key: string]: any }>).detail;
    this.reportParamsValues = values;
  }

  groupReportsByType(report: any) {
    if (report.type === 'config-jasper-reports') return 'JasperReports';
    if (report.type === 'config-reports') return 'Reports';
    return 'Samples';
  }

  viewDataTabulatorTable: any = null;
  viewDataHasActiveFilters = false;

  onTabReady(event?: any) {
    const detail = event?.detail || event;
    if (detail?.table) {
      this.viewDataTabulatorTable = detail.table;
    }
  }

  onTabError(msg: string) {
  }

  onViewDataFiltered(event: any) {
    const detail = event?.detail || event;
    const filters = detail?.filters || [];
    this.viewDataHasActiveFilters = filters.length > 0;
    this.changeDetectorRef.detectChanges();
  }

  clearAllViewDataFilters() {
    this.confirmService.askConfirmation({
      message: 'Clear All Filters?',
      confirmAction: () => {
        if (this.viewDataTabulatorTable) {
          this.viewDataTabulatorTable.clearHeaderFilter();
        }
      },
    });
  }

  getTabulatorColumns(
    columnNames: string[],
  ): { title: string; field: string }[] {
    if (!columnNames || !Array.isArray(columnNames)) {
      return [];
    }

    return columnNames
      .map((name) => {
        if (typeof name !== 'string') {
          console.warn('Invalid column name:', name);
          return null;
        }
        return {
          title: name.replace(/([A-Z])/g, ' $1').trim(),
          field: name,
        };
      })
      .filter(Boolean); // Remove any null values
  }

  // ==========================================================================
  //  Sample mode (Try It / Learn More / visibility toggle)
  // ==========================================================================

  async doShowSamplesLearnMoreModal(clickedSample: SampleInfo) {
    this.modalSampleInfo.id = clickedSample.id;

    this.modalSampleInfo.title = clickedSample.name;

    this.modalSampleInfo.capReportSplitting = clickedSample.capReportSplitting;
    this.modalSampleInfo.capReportDistribution =
      clickedSample.capReportDistribution;
    this.modalSampleInfo.capReportGenerationMailMerge =
      clickedSample.capReportGenerationMailMerge;

    this.modalSampleInfo.notes = clickedSample.notes;

    this.modalSampleInfo.configurationFilePath =
      clickedSample.configurationFilePath;

    this.modalSampleInfo.configurationFileName =
      clickedSample.configurationFileName;

    const inputDetailsHTML = this.samplesService.getInputHtml(
      clickedSample.id,
      true,
    );

    this.modalSampleInfo.inputDetails =
      this.sanitizer.bypassSecurityTrustHtml(inputDetailsHTML);

    this.modalSampleInfo.outputDetails = this.samplesService.getOutputHtml(
      clickedSample.id,
      true,
    );

    this.modalSampleInfo.documentation = clickedSample.documentation;

    this.isModalSamplesLearnMoreVisible = true;
  }

  async doCloseSamplesLearnMoreModal() {
    this.isModalSamplesLearnMoreVisible = false;
  }

  onSampleClick(clickedSample: { id: string }) {
    for (const sample of this.samplesService.samples) {
      sample.activeClicked = sample.id === clickedSample.id ? true : false;
    }
  }

  getSelectedSample() {
    return this.samplesService.samples.find((sample: SampleInfo) => {
      return sample.activeClicked;
    });
  }

  doToggleSampleVisibility(visibility: string) {
    const selectedSample = this.getSelectedSample();

    let dialogQuestion = `Show '${selectedSample.name}' sample in the menu?`;

    if (visibility == 'hidden')
      dialogQuestion = `Hide '${selectedSample.name}' sample from the menu?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        await this.samplesService.toggleSampleVisibility(
          selectedSample,
          visibility,
        );
      },
    });
  }

  doHideAllSamples() {
    const dialogQuestion = `Hide all samples from the menu and other places in the user interface?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        await this.samplesService.hideAllSamples();
      },
    });
  }

  doSampleViewConfigurationFile(
    configFilePath: string,
    configFileName: string,
  ) {
    this.router.navigate(
      [
        '/configuration',
        'generalSettingsMenuSelected',
        configFilePath,
        configFileName,
      ],
      { skipLocationChange: true },
    );
  }

  doSampleTryIt(clickedSample: SampleInfo) {
    if (clickedSample.jobType === 'dashboard') {
      window.open(`http://localhost:9090/dashboard/${clickedSample.configurationFileName}`, '_blank');
      return;
    }

    this.confirmService.askConfirmation({
      message: clickedSample.notes,
      confirmLabel: "OK and I'll click 'Burst' in the following screen",
      declineLabel: "No, I'll do it later",
      confirmAction: () => {
        this.processingService.procBurstInfo.isSample = false;
        this.processingService.procReportingMailMergeInfo.isSample = false;
        if (clickedSample.jobType === 'burst') this.navigateToBurstSample(clickedSample);
        if (clickedSample.jobType === 'merge-burst') this.navigateToMergeBurstSample(clickedSample);
        if (clickedSample.jobType === 'generate') this.navigateToGenerateSample(clickedSample);
      },
    });
  }

  private navigateToBurstSample(sample: SampleInfo): void {
    this.processingService.procBurstInfo.isSample = true;
    const inputDocumentShortPath = sample.input.data[0].replace('file:', '');
    this.router.navigate(
      [
        '/processingSampleBurst',
        'burstMenuSelected',
        Utilities.slash(inputDocumentShortPath),
        Utilities.slash(sample.configurationFilePath),
      ],
      { skipLocationChange: true },
    );
  }

  private navigateToMergeBurstSample(sample: SampleInfo): void {
    this.processingService.procBurstInfo.isSample = true;
    let filePaths = '';
    sample.input.data.forEach((fileToMerge: string) => {
      const filePath = Utilities.slash(fileToMerge.replace('file:', ''));
      filePaths = filePaths.length === 0 ? filePath : `${filePaths}#${filePath}`;
    });
    filePaths = `${filePaths}#burst-merged-file`;
    this.router.navigate(
      [
        '/processingSampleBurst',
        'mergeBurstMenuSelected',
        filePaths,
        Utilities.slash(sample.configurationFilePath),
      ],
      { skipLocationChange: true },
    );
  }

  private navigateToGenerateSample(sample: SampleInfo): void {
    this.processingService.procReportingMailMergeInfo.isSample = true;
    const inputDocumentShortPath = sample.input.data[0].replace('file:', '');
    this.processingService.procReportingMailMergeInfo.inputFileName =
      Utilities.basename(inputDocumentShortPath);
    this.router.navigate(
      [
        '/processingSampleGenerate',
        'burstMenuSelected',
        Utilities.slash(sample.configurationFilePath),
        Utilities.slash(inputDocumentShortPath),
      ],
      { skipLocationChange: true },
    );
  }

  // ==========================================================================
  //  Report selection & validation
  // ==========================================================================

  async onReportSelectionChange($event: any) {
    // Reset View Data state when report selection changes
    this.isViewDataLoading = false;
    this.showViewDataTabulator = false;
    this.viewDataResult = null;

    // Lazy load DSL details for the selected report (including JasperReports .jrxml parameters)
    if ($event && (
      $event.type === 'config-reports' ||
      $event.type === 'config-samples' ||
      $event.type === 'config-jasper-reports'
    )) {
      await this.settingsService.loadReportDetails($event);
    }
  }

  allowedInputFileTypes(): string {
    return this.reportsService.allowedInputFileTypes(
      this.processingService.procReportingMailMergeInfo?.selectedMailMergeClassicReport,
    );
  }

  // ==========================================================================
  //  Button-disabled guards
  // ==========================================================================

  requiresInputFile(): boolean {
    return this.reportsService.requiresInputFile(
      this.processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport,
    );
  }

  requiresParameters(): boolean {
    return this.reportsService.requiresParameters(
      this.processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport,
    );
  }

  shouldBeDisabledGenerateReportsButton(): boolean {
    const selectedReport =
      this.processingService.procReportingMailMergeInfo
        .selectedMailMergeClassicReport;

    if (!selectedReport) return true;

    const requiresInput = this.requiresInputFile();

    let shouldBeDisabled = true;

    if (requiresInput) {
      shouldBeDisabled =
        !this.processingService.procReportingMailMergeInfo.inputFileName &&
        !this.processingService.procReportingMailMergeInfo.prefilledInputFilePath;
    } else {
      // no input file required
      if (
        selectedReport.reportParameters &&
        selectedReport.reportParameters.length > 0
      ) {
        // requires parameters -> disable if params invalid
        shouldBeDisabled = !this.reportParamsValid;
      } else {
        // no input required and no parameters -> enable button
        shouldBeDisabled = false;
      }
    }

    shouldBeDisabled =
      shouldBeDisabled ||
      this.executionStatsService.jobStats.numberOfActiveJobs > 0;

    return shouldBeDisabled;
  }

  shouldBeDisabledViewDataButton(): boolean {
    const selectedReport =
      this.processingService.procReportingMailMergeInfo
        .selectedMailMergeClassicReport;
    // disable until a report is selected
    if (!selectedReport) return true;

    // if the selected report requires parameters, disable when params are invalid
    if (this.requiresParameters()) {
      return !this.reportParamsValid;
    }

    // selected report has no parameters -> enable View Data
    return false;
  }

  // ==========================================================================
  //  View Data preview
  // ==========================================================================

  private convertParamValue(type: string, value: any): any {
    return this.reportsService.convertParamValue(type, value);
  }

  async doViewData() {
    if (this.blockedByDirtyLogs()) return;

    const dialogQuestion = `Execute the SQL query associated with this report?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        // Build params from report parameters form (as string key-value pairs for Mode 2)
        const paramsObject =
          this.processingService.procReportingMailMergeInfo.selectedMailMergeClassicReport.reportParameters.reduce(
            (acc, param) => {
              const value = this.convertParamValue(
                param.type,
                this.reportParamsValues[param.id],
              );
              if (value !== null && value !== undefined) {
                acc[param.id] = String(value);
              }
              return acc;
            },
            {} as { [key: string]: string },
          );

        // Mode 2: unmount and remount rb-tabulator to trigger a fresh self-fetch
        this.isViewDataLoading = true;
        this.viewDataResult = null;
        this.viewDataTabulatorTable = null;
        this.viewDataHasActiveFilters = false;
        this.viewDataParams = paramsObject;
        this.showViewDataTabulator = false;
        this.changeDetectorRef.detectChanges();
        // Re-mount after a tick so the component is freshly created
        setTimeout(() => {
          this.showViewDataTabulator = true;
          this.changeDetectorRef.detectChanges();
        }, 0);
      },
    });
  }

  onViewDataFetched(event: any) {
    this.isViewDataLoading = false;
    const detail = event.detail || event;
    this.viewDataResult = {
      executionTimeMillis: detail.executionTimeMillis || 0,
      totalRows: detail.totalRows || detail.data?.length || 0,
    };
    this.messagesService.showSuccess('SQL query executed successfully');
    this.changeDetectorRef.detectChanges();
  }

  onViewDataError(event: any) {
    this.isViewDataLoading = false;
    const detail = event.detail || event;
    this.messagesService.showError(`Error executing query: ${detail.message || 'Unknown error'}`);
  }

  // ==========================================================================
  //  State reset
  // ==========================================================================

  @ViewChild(AiManagerComponent) private aiManagerInstance!: AiManagerComponent;

  async askAiForHelp(outputTypeCode: string) {

    if (outputTypeCode === 'cms.webportal') {
      const launchConfig: AiManagerLaunchConfig = {
        initialActiveTabKey: 'PROMPTS',
        initialSelectedCategory: 'Web Portal / CMS',
      };

      if (this.aiManagerInstance) {
        this.aiManagerInstance.launchWithConfiguration(launchConfig);
      }
    }
  }
}
