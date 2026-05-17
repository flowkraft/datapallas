import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ChangeDetectorRef,
  TemplateRef,
  ViewChildren,
  QueryList,
  ElementRef,
} from '@angular/core';

import { ActivatedRoute } from '@angular/router';

import { Subject, from, firstValueFrom } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

import * as _ from 'lodash';

//import * as path from 'path';

import { leftMenuTemplate } from './templates/_left-menu';
import { tabsTemplate } from './templates/_tabs';

import {
  ExtConnection,
  ReportParameter,
} from '../../providers/configuration-repository.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';

import { tabGeneralSettingsTemplate } from './templates/tab-general-settings';
import { tabReportingDataSourceDataTablesTemplate } from './templates/tab-reporting-datasource-datatables';
import { tabReportingTemplateOutputTemplate } from './templates/tab-reporting-template-output';
import { tabReportingTabulatorTemplate } from './templates/tab-reporting-tabulator';
import { tabReportingChartTemplate } from './templates/tab-reporting-chart';
import { tabReportingPivotTableTemplate } from './templates/tab-reporting-pivot-table';
import { tabReportingUsageTemplate } from './templates/tab-reporting-usage';
import { tabEnableDisableDeliveryTemplate } from './templates/tab-enable-disable-delivery';
import { tabEmailConnectionSettingsTemplate } from './templates/tab-email-connection-settings';
import { tabEmailMessageTemplate } from './templates/tab-email-message';
import { tabAttachmentsTemplate } from './templates/tab-attachments';
import { tabEmailCloudProvidersTemplate } from './templates/tab-email-cloud-providers';
import { tabUploadFTPTemplate } from './templates/tab-upload-ftp';
import { tabUploadFileShareTemplate } from './templates/tab-upload-file-share';
import { tabUploadFTPSTemplate } from './templates/tab-upload-ftps';
import { tabUploadSFTPTemplate } from './templates/tab-upload-sftp';
import { tabUploadHTTPTemplate } from './templates/tab-upload-http';
import { tabUploadCloudTemplate } from './templates/tab-upload-cloud';
import { tabWebUploadDocumentBursterWebTemplate } from './templates/tab-web-upload-documentburster-web';
import { tabWebUploadSharePointTemplate } from './templates/tab-web-upload-sharepoint';
import { tabWebUploadWordPressTemplate } from './templates/tab-web-upload-wordpress';
import { tabWebUploadDrupalTemplate } from './templates/tab-web-upload-drupal';
import { tabWebUploadJoomlaTemplate } from './templates/tab-web-upload-joomla';
import { tabWebUploadOtherWebPlatformsTemplate } from './templates/tab-web-upload-other-web-platforms';
import { tabSMSTwilioTemplate } from './templates/tab-sms-twilio';
import { tabSMSMessageTemplate } from './templates/tab-sms-message';
import { tabQATemplate } from './templates/tab-qa';
import { tabAdvancedTemplate } from './templates/tab-advanced';
import { tabAdvancedErrorHandlingTemplate } from './templates/tab-advanced-error-handling';
import { tabEmailAddressValidationTemplate } from './templates/tab-email-address-validation';
import { tabEmailTuningTemplate } from './templates/tab-email-tuning';
import { tabLogsTemplate } from './templates/tab-logs';

import { tabLicenseTemplate } from './templates/tab-license';
import { tabReportsListTemplate } from './templates/tab-reports-list';

import { modalAttachmentTemplate } from './templates/modal-attachment';

import { ExecutionStatsService } from '../../providers/execution-stats.service';
import Utilities from '../../helpers/utilities';
import { ConfirmService } from '../../components/dialog-confirm/confirm.service';
import { EmailProviderSettings } from '../../components/button-well-known/button-well-known.component';
import { Quill, RangeStatic } from 'quill';
import { InfoService } from '../../components/dialog-info/info.service';
import { AskForFeatureService } from '../../components/ask-for-feature/ask-for-feature.service';
import { ConnectionsService } from '../../providers/connections.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { AppPathsService } from '../../providers/app-paths.service';
import { FsService } from '../../providers/fs.service';
import { StateStoreService } from '../../providers/state-store.service';
import { CodeJarContainer } from 'ngx-codejar';
import Prism from 'prismjs';
import 'prismjs/plugins/keep-markup/prism-keep-markup';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-groovy';

// DO NOT UNCOMMENT uncommenting 'prism-ftl' would break other highlighting;
// import 'prismjs/components/prism-ftl';

import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  HtmlDocTemplateDisplay,
} from '../../providers/samples.service';
import { TranslateService } from '@ngx-translate/core';
import { ConnectionDetailsComponent } from '../../components/connection-details/connection-details.component';
import {
  AiManagerComponent,
  AiManagerLaunchConfig,
} from '../../components/ai-manager/ai-manager.component';
import {
  ReportingService,
  ReportDataResult,
} from '../../providers/reporting.service';
import { ApiService } from '../../providers/api.service';
import { ReportsService } from '../../providers/reports.service';
import { CubesService, CubeDefinition } from '../../providers/cubes.service';
import { modalTemplatesGalleryTemplate } from './templates/modal-gallery';

@Component({
  selector: 'dburst-configuration',
  template: `
    <aside class="app-sidebar fixed overflow-y-auto z-[810]"
           style="top:calc(50px + var(--cet-offset)); left:0; bottom:30px; width:230px; background-color:var(--app-sidebar-bg); border-right:1px solid var(--app-sidebar-border);">
      ${leftMenuTemplate}
    </aside>
    <div class="relative" style="margin-left:230px; padding-top:calc(50px + var(--cet-offset)); min-height:calc(100vh - 80px - var(--cet-offset));">
      <section class="content">
        <div>${tabsTemplate}</div>
      </section>
    </div>
    ${tabGeneralSettingsTemplate} ${tabReportingDataSourceDataTablesTemplate}
    ${tabReportingTemplateOutputTemplate} ${tabReportingTabulatorTemplate} 
    ${tabReportingChartTemplate} ${tabReportingPivotTableTemplate} ${tabReportingUsageTemplate} ${tabEnableDisableDeliveryTemplate} 
    ${tabEmailCloudProvidersTemplate} ${tabEmailConnectionSettingsTemplate} 
    ${tabEmailMessageTemplate} ${tabAttachmentsTemplate} ${tabUploadFTPTemplate}
    ${tabUploadFileShareTemplate} ${tabUploadFTPSTemplate}
    ${tabUploadSFTPTemplate} ${tabUploadHTTPTemplate} ${tabUploadCloudTemplate}
    ${tabWebUploadDocumentBursterWebTemplate} ${tabWebUploadSharePointTemplate}
    ${tabWebUploadWordPressTemplate} ${tabWebUploadDrupalTemplate}
    ${tabWebUploadJoomlaTemplate} ${tabWebUploadOtherWebPlatformsTemplate}
    ${tabSMSTwilioTemplate} ${tabSMSMessageTemplate} ${tabQATemplate}
    ${tabAdvancedTemplate} ${tabAdvancedErrorHandlingTemplate}
    ${tabEmailAddressValidationTemplate} ${tabEmailTuningTemplate}
    ${tabLogsTemplate} ${tabLicenseTemplate} ${tabReportsListTemplate} ${modalAttachmentTemplate} ${modalTemplatesGalleryTemplate}
  `,
})
export class ConfigurationComponent implements OnInit, OnDestroy {

  // ========== VIEW CHILDREN & TAB CONFIGURATION ==========

  @ViewChild('tabGeneralSettingsTemplate', { static: true })
  tabGeneralSettingsTemplate: TemplateRef<any>;

  @ViewChild('tabReportingDataSourceDataTablesTemplate', { static: true })
  tabReportingDataSourceDataTablesTemplate: TemplateRef<any>;

  @ViewChild('tabReportingTemplateOutputTemplate', { static: true })
  tabReportingTemplateOutputTemplate: TemplateRef<any>;
  
  @ViewChild('tabReportingTabulatorTemplate', { static: true })
  tabReportingTabulatorTemplate: TemplateRef<any>;

  @ViewChild('tabReportingChartTemplate', { static: true })
  tabReportingChartTemplate: TemplateRef<any>;

  @ViewChild('tabReportingPivotTableTemplate', { static: true })
  tabReportingPivotTableTemplate: TemplateRef<any>;

  @ViewChild('tabReportingUsageTemplate', { static: true })
  tabReportingUsageTemplate: TemplateRef<any>;

  @ViewChild('tabEnableDisableDeliveryTemplate', { static: true })
  tabEnableDisableDeliveryTemplate: TemplateRef<any>;

  @ViewChild('tabEmailCloudProvidersTemplate', { static: true })
  tabEmailCloudProvidersTemplate: TemplateRef<any>;

  @ViewChild('tabEmailConnectionSettingsTemplate', { static: true })
  tabEmailConnectionSettingsTemplate: TemplateRef<any>;
  @ViewChild('tabEmailMessageTemplate', { static: true })
  tabEmailMessageTemplate: TemplateRef<any>;

  @ViewChild('tabAttachmentsTemplate', { static: true })
  tabAttachmentsTemplate: TemplateRef<any>;
  @ViewChild('tabUploadFTPTemplate', { static: true })
  tabUploadFTPTemplate: TemplateRef<any>;
  @ViewChild('tabUploadFileShareTemplate', { static: true })
  tabUploadFileShareTemplate: TemplateRef<any>;

  @ViewChild('tabUploadFTPSTemplate', { static: true })
  tabUploadFTPSTemplate: TemplateRef<any>;
  @ViewChild('tabUploadSFTPTemplate', { static: true })
  tabUploadSFTPTemplate: TemplateRef<any>;
  @ViewChild('tabUploadHTTPTemplate', { static: true })
  tabUploadHTTPTemplate: TemplateRef<any>;
  @ViewChild('tabUploadCloudTemplate', { static: true })
  tabUploadCloudTemplate: TemplateRef<any>;
  @ViewChild('tabWebUploadDocumentBursterWebTemplate', { static: true })
  tabWebUploadDocumentBursterWebTemplate: TemplateRef<any>;

  @ViewChild('tabWebUploadSharePointTemplate', { static: true })
  tabWebUploadSharePointTemplate: TemplateRef<any>;
  @ViewChild('tabWebUploadWordPressTemplate', { static: true })
  tabWebUploadWordPressTemplate: TemplateRef<any>;
  @ViewChild('tabWebUploadDrupalTemplate', { static: true })
  tabWebUploadDrupalTemplate: TemplateRef<any>;
  @ViewChild('tabWebUploadJoomlaTemplate', { static: true })
  tabWebUploadJoomlaTemplate: TemplateRef<any>;

  @ViewChild('tabWebUploadOtherWebPlatformsTemplate', { static: true })
  tabWebUploadOtherWebPlatformsTemplate: TemplateRef<any>;
  @ViewChild('tabSMSTwilioTemplate', { static: true })
  tabSMSTwilioTemplate: TemplateRef<any>;
  @ViewChild('tabSMSMessageTemplate', { static: true })
  tabSMSMessageTemplate: TemplateRef<any>;
  @ViewChild('tabQATemplate', { static: true })
  tabQATemplate: TemplateRef<any>;
  @ViewChild('tabAdvancedTemplate', { static: true })
  tabAdvancedTemplate: TemplateRef<any>;

  @ViewChild('tabAdvancedErrorHandlingTemplate', { static: true })
  tabAdvancedErrorHandlingTemplate: TemplateRef<any>;

  @ViewChild('tabEmailAddressValidationTemplate', { static: true })
  tabEmailAddressValidationTemplate: TemplateRef<any>;

  @ViewChild('tabEmailTuningTemplate', { static: true })
  tabEmailTuningTemplate: TemplateRef<any>;

  @ViewChild('tabLogsTemplate', { static: true })
  tabLogsTemplate: TemplateRef<any>;

  @ViewChild('tabLicenseTemplate', { static: true })
  tabLicenseTemplate: TemplateRef<any>;

  @ViewChild('tabReportsListTemplate', { static: true })
  tabReportsListTemplate!: TemplateRef<any>;

  @ViewChildren('templateIframe') templateIframes: QueryList<ElementRef>;

  selectedAttachment;

  isTestingEmailConnection: boolean = false;

  visibleTabs: {
    id: string;
    heading: string;
    ngTemplateOutlet: string;
  }[];

  ALL_TABS = [
    {
      id: 'generalSettingsTab',
      heading: 'AREAS.CONFIGURATION.TABS.GENERAL',
      ngTemplateOutlet: 'tabGeneralSettingsTemplate',
    },
    {
      id: 'reportingDataSourceDataTablesTab',
      heading: 'AREAS.CONFIGURATION.TABS.REPORTING-DATASOURCE-DATATABLES',
      ngTemplateOutlet: 'tabReportingDataSourceDataTablesTemplate',
    },
    {
      id: 'reportingTemplateOutputTab',
      heading: 'AREAS.CONFIGURATION.TABS.REPORTING-TEMPLATE-OUTPUT',
      ngTemplateOutlet: 'tabReportingTemplateOutputTemplate',
    },
    {
      id: 'reportingTabulatorTab',
      heading: 'AREAS.CONFIGURATION.TABS.REPORTING-TABULATOR',
      ngTemplateOutlet: 'tabReportingTabulatorTemplate',
    },
    {
      id: 'reportingChartTab',
      heading: 'AREAS.CONFIGURATION.TABS.REPORTING-CHART',
      ngTemplateOutlet: 'tabReportingChartTemplate',
    },
    {
      id: 'reportingPivotTableTab',
      heading: 'AREAS.CONFIGURATION.TABS.REPORTING-PIVOT-TABLE',
      ngTemplateOutlet: 'tabReportingPivotTableTemplate',
    },
    {
      id: 'enableDisableDistributionTab',
      heading: 'AREAS.CONFIGURATION.TABS.ENABLE-DISABLE-DELIVERY',
      ngTemplateOutlet: 'tabEnableDisableDeliveryTemplate',
    },
    {
      id: 'cloudEmailProvidersTab',
      heading: 'AREAS.CONFIGURATION.TABS.EMAIL.CLOUD-PROVIDERS',
      ngTemplateOutlet: 'tabEmailCloudProvidersTemplate',
    },
    {
      id: 'connectionSettingsTab',
      heading: 'AREAS.CONFIGURATION.TABS.EMAIL.CONNECTION',
      ngTemplateOutlet: 'tabEmailConnectionSettingsTemplate',
    },
    {
      id: 'emailMessageTab',
      heading: 'AREAS.CONFIGURATION.TABS.EMAIL.MESSAGE',
      ngTemplateOutlet: 'tabEmailMessageTemplate',
    },
    {
      id: 'attachmentsTab',
      heading: 'AREAS.CONFIGURATION.TABS.ATTACHMENTS',
      ngTemplateOutlet: 'tabAttachmentsTemplate',
    },
    {
      id: 'ftpTab',
      heading: 'AREAS.CONFIGURATION.TABS.UPLOAD.FTP',
      ngTemplateOutlet: 'tabUploadFTPTemplate',
      //iconClass: 'fa fa-upload',
    },
    {
      id: 'fileShareTab',
      heading: 'AREAS.CONFIGURATION.TABS.UPLOAD.FILE-SHARE',
      ngTemplateOutlet: 'tabUploadFileShareTemplate',
      //iconClass: 'fa fa-share-alt',
    },
    {
      id: 'ftpsTab',
      heading: 'AREAS.CONFIGURATION.TABS.UPLOAD.FTPS',
      ngTemplateOutlet: 'tabUploadFTPSTemplate',
      //iconClass: 'fa fa-lock',
    },
    {
      id: 'sftpTab',
      heading: 'AREAS.CONFIGURATION.TABS.UPLOAD.SFTP',
      ngTemplateOutlet: 'tabUploadSFTPTemplate',
      //iconClass: 'fa fa-terminal',
    },
    {
      id: 'httpTab',
      heading: 'AREAS.CONFIGURATION.TABS.UPLOAD.HTTP',
      ngTemplateOutlet: 'tabUploadHTTPTemplate',
      //iconClass: 'fa fa-code',
    },
    {
      id: 'cloudUploadTab',
      heading: 'AREAS.CONFIGURATION.TABS.UPLOAD.CLOUD',
      ngTemplateOutlet: 'tabUploadCloudTemplate',
      //iconClass: 'fa fa-cloud-upload',
    },
    {
      id: 'documentBursterWebTab',
      heading: 'AREAS.CONFIGURATION.TABS.WEB-UPLOAD.DOCUMENTBURSTER-WEB',
      ngTemplateOutlet: 'tabWebUploadDocumentBursterWebTemplate',
      //iconClass: 'fa fa-credit-card',
    },
    {
      id: 'sharePointTab',
      heading: 'AREAS.CONFIGURATION.TABS.WEB-UPLOAD.SHAREPOINT',
      ngTemplateOutlet: 'tabWebUploadSharePointTemplate',
      //iconClass: 'fa fa-windows',
    },
    {
      id: 'wordPressTab',
      heading: 'AREAS.CONFIGURATION.TABS.WEB-UPLOAD.WORDPRESS',
      ngTemplateOutlet: 'tabWebUploadWordPressTemplate',
      //iconClass: 'fa fa-wordpress',
    },
    {
      id: 'drupalTab',
      heading: 'AREAS.CONFIGURATION.TABS.WEB-UPLOAD.DRUPAL',
      ngTemplateOutlet: 'tabWebUploadDrupalTemplate',
      //iconClass: 'fa fa-drupal',
    },
    {
      id: 'joomlaTab',
      heading: 'AREAS.CONFIGURATION.TABS.WEB-UPLOAD.JOOMLA',
      ngTemplateOutlet: 'tabWebUploadJoomlaTemplate',
      //iconClass: 'fa fa-joomla',
    },
    {
      id: 'otherWebPlatformsTab',
      heading: 'AREAS.CONFIGURATION.TABS.WEB-UPLOAD.OTHER-WEB-PLATFORMS',
      ngTemplateOutlet: 'tabWebUploadOtherWebPlatformsTemplate',
      //iconClass: 'fa fa-skyatlas',
    },
    {
      id: 'twilioTab',
      heading: 'AREAS.CONFIGURATION.TABS.SMS.TWILIO',
      ngTemplateOutlet: 'tabSMSTwilioTemplate',
    },
    {
      id: 'smsMessageTab',
      heading: 'AREAS.CONFIGURATION.TABS.SMS.MESSAGE',
      ngTemplateOutlet: 'tabSMSMessageTemplate',
    },
    {
      id: 'confQualityTab',
      heading: 'AREAS.CONFIGURATION.TABS.QA',
      ngTemplateOutlet: 'tabQATemplate',
    },
    {
      id: 'advancedTab',
      heading: 'AREAS.CONFIGURATION.TABS.ADVANCED',
      ngTemplateOutlet: 'tabAdvancedTemplate',
    },
    {
      id: 'errorHandlingTab',
      heading: 'AREAS.CONFIGURATION.TABS.ERROR-HANDLING',
      ngTemplateOutlet: 'tabAdvancedErrorHandlingTemplate',
      visibleWhenCapability: 'reportdistribution',
    },
    {
      id: 'emailAddressValidationTab',
      heading: 'AREAS.CONFIGURATION.TABS.EMAIL-ADDRESS-VALIDATION',
      ngTemplateOutlet: 'tabEmailAddressValidationTemplate',
      visibleWhenCapability: 'reportdistribution',
    },
    {
      id: 'emailTuningTab',
      heading: 'AREAS.CONFIGURATION.TABS.EMAIL-TUNING',
      ngTemplateOutlet: 'tabEmailTuningTemplate',
      visibleWhenCapability: 'reportdistribution',
    },
    {
      id: 'logsTab',
      heading: 'SHARED-TABS.LOGGING-TRACING',
      ngTemplateOutlet: 'tabLogsTemplate',
    },
    {
      id: 'reportingUsageTab',
      heading: 'AREAS.CONFIGURATION.TABS.REPORTING.USAGE',
      ngTemplateOutlet: 'tabReportingUsageTemplate',
    },
    {
      id: 'reportsListTab',
      heading: 'AREAS.CONFIGURATION.LEFT-MENU.REPORTS',
      ngTemplateOutlet: 'tabReportsListTemplate',
    },
    {
      id: 'licenseTab',
      heading: 'SHARED-TABS.LICENSE',
      ngTemplateOutlet: 'tabLicenseTemplate',
    },
  ];

  MENU_SELECTED_X_VISIBLE_TABS = [
    {
      selectedMenu: 'generalSettingsMenuSelected',
      visibleTabs: ['generalSettingsTab', 'licenseTab'],
    },
    {
      selectedMenu: 'reportingSettingsMenuSelected',
      visibleTabs: [
        'reportingDataSourceDataTablesTab',
        'reportingTemplateOutputTab',
        'reportingTabulatorTab',
        'reportingChartTab',
        'reportingPivotTableTab',
        'reportingUsageTab',
        'licenseTab',
      ],
    },
    {
      selectedMenu: 'enableDisableDistributionMenuSelected',
      visibleTabs: ['enableDisableDistributionTab', 'licenseTab'],
    },
    {
      selectedMenu: 'emailSettingsMenuSelected',
      visibleTabs: [
        'connectionSettingsTab',
        'emailMessageTab',
        'attachmentsTab',
        'logsTab',
        'licenseTab',
      ],
    },
    {
      selectedMenu: 'cloudEmailProvidersMenuSelected',
      visibleTabs: ['cloudEmailProvidersTab', 'licenseTab'],
    },
    {
      selectedMenu: 'uploadSettingsMenuSelected',
      visibleTabs: [
        'ftpTab',
        'sftpTab',
        'fileShareTab',
        'ftpsTab',
        'httpTab',
        'cloudUploadTab',
        'licenseTab',
      ],
    },
    {
      selectedMenu: 'documentBursterWebSettingsMenuSelected',
      visibleTabs: [
        'documentBursterWebTab',
        'sharePointTab',
        'wordPressTab',
        'drupalTab',
        'joomlaTab',
        'otherWebPlatformsTab',
        'licenseTab',
      ],
    },
    {
      selectedMenu: 'smsSettingsMenuSelected',
      visibleTabs: ['twilioTab', 'smsMessageTab', 'licenseTab'],
    },
    {
      selectedMenu: 'qualitySettingsMenuSelected',
      visibleTabs: ['confQualityTab', 'licenseTab'],
    },
    {
      selectedMenu: 'advancedSettingsMenuSelected',
      visibleTabs: [
        'advancedTab',
        'errorHandlingTab',
        'emailAddressValidationTab',
        'emailTuningTab',
        'licenseTab',
      ],
    },
    {
      selectedMenu: 'errorHandlingSettingsMenuSelected',
      visibleTabs: ['errorHandlingTab', 'licenseTab'],
    },
    {
      selectedMenu: 'reportsListMenuSelected',
      visibleTabs: ['reportsListTab', 'licenseTab'],
    },
  ];

  // ========== COMPONENT STATE ==========

  emailPreviewVisible = false;
  sanitizedEmailPreview: SafeHtml;

  isModalAttachmentVisible = false;

  modalAttachmentInfo = {
    mode: 'new',
    attachmentFilePath: '',
  };

  isModalSMSVisible = false;

  modalSMSInfo = {
    fromNumber: '',
    toNumber: '',
  };

  xmlSettings = {
    documentburster: {
      settings: null,
    },
  };

  xmlReporting = {
    documentburster: null,
  };

  autosaveEnabled = false;

  settingsChanged: Subject<any> = new Subject<any>();
  private destroy$ = new Subject<void>();

  selectedEmailConnectionFile: ExtConnection;
  selectedReportTemplateFile = {
    fileName: '',
    filePath: '',
    type: '',
    folderName: '',
    relativeFilePath: '',
  };

  selectedJasperReport: any = null;
  inlineJrxmlOption = { templateName: 'Write .jrxml code inline', filePath: '__inline__' };

  // ==========================================================================
  //  Lifecycle
  // ==========================================================================

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ========== CUBES REUSE MODAL ==========
  // Lets the user pick a cube already configured for the current DB connection,
  // click dimensions/measures/segments and copy the generated SQL into their
  // SQL Query / Script body. Reuses CubesService + the <rb-cube-renderer> web
  // component (same primitives the cube admin area uses).
  allCubes: CubeDefinition[] = [];
  cubesForCurrentConnection: CubeDefinition[] = [];
  hasCubesForCurrentConnection = false;
  isCubesReuseModalVisible = false;
  selectedCubeForReuse: CubeDefinition | null = null;
  parsedCubeForReuse: any = null;
  parseCubeForReuseError = '';
  cubesReuseSelectedDimensions: string[] = [];
  cubesReuseSelectedMeasures: string[] = [];
  cubesReuseSelectedSegments: string[] = [];
  hasCubesReuseFieldSelections = false;
  isCubesReuseSqlModalVisible = false;
  cubesReuseGeneratedSql = '';
  cubesReuseSqlLoading = false;

  get cubesReuseApiBaseUrl(): string {
    return this.apiService.BACKEND_URL || '/api';
  }

  // ==========================================================================
  //  Top-level navigation
  // ==========================================================================

  constructor(
    protected settingsService: ConfigurationRepository,
    protected appPathsService: AppPathsService,
    protected fsService: FsService,
    protected connectionsService: ConnectionsService,
    protected executionStatsService: ExecutionStatsService,
    protected reportingService: ReportingService,
    protected stateStore: StateStoreService,
    protected apiService: ApiService,
    protected reportsService: ReportsService,
    protected confirmService: ConfirmService,
    protected infoService: InfoService,
    protected messagesService: ToastrMessagesService,
    protected translateService: TranslateService,
    protected askForFeatureService: AskForFeatureService,
    protected route: ActivatedRoute,
    protected changeDetectorRef: ChangeDetectorRef,
    protected sanitizer: DomSanitizer,
    public cubesService: CubesService,
  ) { }

  private get currentReportId(): string {
    return this.settingsService.currentConfigurationTemplate?.folderName || 'burst';
  }

  currentLeftMenu: string;

  get openSidebarSection(): string {
    if (this.currentLeftMenu === 'emailSettingsMenuSelected' || this.currentLeftMenu === 'cloudEmailProvidersMenuSelected') return 'email';
    if (this.currentLeftMenu === 'smsSettingsMenuSelected') return 'sms';
    if (this.currentLeftMenu === 'qualitySettingsMenuSelected') return 'quality';
    if (this.currentLeftMenu === 'advancedSettingsMenuSelected' || this.currentLeftMenu === 'errorHandlingSettingsMenuSelected') return 'advanced';
    return '';
  }

  // ==========================================================================
  //  Form state tracking
  // ==========================================================================

  markSettingsDirty(newValue: any) {
    this.settingsChanged.next(newValue);
  }

  markSettingsDirtyFromQuill(newValue: any) {
    //console.log(`markSettingsDirtyFromQuill: newValue: ${newValue}`);
    this.xmlSettings.documentburster.settings.emailsettings.html = newValue;
    this.settingsChanged.next(this.xmlSettings.documentburster.settings);
  }

  editor: Quill;
  editorCaretPosition: number = 0;

  onEditorCreated(qlEvent: { editor: Quill }) {
    this.editor = qlEvent.editor;
    this.editor.focus();
  }

  onEditorSelectionChanged(qlEvent: {
    range: RangeStatic;
    oldRange: RangeStatic;
    source: string;
  }) {
    if (qlEvent.range) this.editorCaretPosition = qlEvent.range.index;
  }

  xmlIdColumnSelection: string = 'notused';
  csvIdColumnSelection: string = 'notused';
  excelIdColumnSelection: string = 'notused';
  fixedWidthIdColumnSelection: string = 'notused';
  sqlIdColumnSelection: string = 'notused';
  scriptIdColumnSelection: string = 'notused';
  scriptFileExplorerSelection: string = 'notused';

  initIdColumnSelections() {
    const ds = this.xmlReporting?.documentburster.report.datasource;
    this.xmlIdColumnSelection = this.classifyIdColumn(ds.xmloptions?.idcolumn, false);
    this.csvIdColumnSelection = this.classifyIdColumn(ds.csvoptions?.idcolumn);
    this.excelIdColumnSelection = this.classifyIdColumn(ds.exceloptions?.idcolumn);
    this.fixedWidthIdColumnSelection = this.classifyIdColumn(ds.fixedwidthoptions?.idcolumn);
    this.sqlIdColumnSelection = this.classifyIdColumn(ds.sqloptions?.idcolumn);
    this.scriptIdColumnSelection = this.classifyIdColumn(ds.scriptoptions?.idcolumn);

    const feVal = ds.scriptoptions?.selectfileexplorer;
    this.scriptFileExplorerSelection = (!feVal || feVal === 'notused') ? 'notused' : 'globpattern';
  }

  /**
   * Classify an idcolumn value: 'notused' | 'firstcolumn' | 'lastcolumn' | 'custom'.
   * XML datasource only supports 'notused' or 'custom' (no first/last).
   */
  private classifyIdColumn(value: string, supportsFirstLast: boolean = true): string {
    if (!value || value === 'notused') return 'notused';
    if (supportsFirstLast && value === 'firstcolumn') return 'firstcolumn';
    if (supportsFirstLast && value === 'lastcolumn') return 'lastcolumn';
    return 'custom';
  }

  /**
   * Generic ID column change handler. Updates the UI selection and the XML model.
   * For 'custom', sets the model to '0' if it wasn't already a numeric string.
   */
  private handleIdColumnChange(
    newValue: string,
    optionsObj: any,
    fieldName: string = 'idcolumn',
    supportsCustomNumeric: boolean = true,
  ) {
    if (newValue !== 'custom') {
      optionsObj[fieldName] = newValue;
    } else if (supportsCustomNumeric) {
      const current = optionsObj[fieldName];
      if (!current || !/^\d+$/.test(current) || ['notused', 'firstcolumn', 'lastcolumn'].includes(current)) {
        optionsObj[fieldName] = '0';
      }
    } else {
      optionsObj[fieldName] = '';
    }
    this.markSettingsDirty(newValue);
  }

  // Template-bound handlers — thin wrappers around the generic handler
  onXmlIdColumnSelectionChange(newValue: any) {
    this.xmlIdColumnSelection = newValue;
    this.handleIdColumnChange(newValue,
      this.xmlReporting.documentburster.report.datasource.xmloptions,
      'idcolumn', false);
  }

  onCsvIdColumnSelectionChange(newValue: any) {
    this.csvIdColumnSelection = newValue;
    this.handleIdColumnChange(newValue,
      this.xmlReporting.documentburster.report.datasource.csvoptions);
  }

  onExcelIdColumnSelectionChange(newValue: any) {
    this.excelIdColumnSelection = newValue;
    this.handleIdColumnChange(newValue,
      this.xmlReporting.documentburster.report.datasource.exceloptions);
  }

  onFixedWidthIdColumnSelectionChange(newValue: any) {
    this.fixedWidthIdColumnSelection = newValue;
    this.handleIdColumnChange(newValue,
      this.xmlReporting.documentburster.report.datasource.fixedwidthoptions);
  }

  public onSqlIdColumnSelectionChange(newValue: any) {
    this.sqlIdColumnSelection = newValue;
    this.handleIdColumnChange(newValue,
      this.xmlReporting.documentburster.report.datasource.sqloptions);
  }

  public onScriptIdColumnSelectionChange(newValue: any) {
    this.scriptIdColumnSelection = newValue;
    this.handleIdColumnChange(newValue,
      this.xmlReporting.documentburster.report.datasource.scriptoptions);
  }

  public onScriptFileExplorerSelectionChange(newValue: any) {
    this.scriptFileExplorerSelection = newValue;
    const opts = this.xmlReporting.documentburster.report.datasource.scriptoptions;
    if (newValue === 'notused') {
      opts.selectfileexplorer = 'notused';
    } else if (newValue === 'globpattern') {
      if (opts.selectfileexplorer === 'notused' || !opts.selectfileexplorer) {
        opts.selectfileexplorer = '*.xml';
      }
    }
    this.markSettingsDirty(newValue);
  }

  // ==========================================================================
  //  Template & output type
  // ==========================================================================

  groupByJasperHelper() {
    return 'Available JasperReports';
  }

  async onJasperReportSelected(report: any) {
    if (!report) return;

    if (report.filePath === '__inline__') {
      // Inline .jrxml mode: load or create the template file
      const configName =
        this.settingsService.currentConfigurationTemplate?.folderName ||
        'template';
      const newPath = `${this.appPathsService.CONFIGURATION_TEMPLATES_FOLDER_PATH}/reports/${configName}/${configName}-jasper.jrxml`;

      try {
        const content =
            await this.reportsService.loadReportTemplateByType(this.currentReportId, 'jasper');
        if (content) {
          this.activeReportTemplateContent = content;
        } else {
          const defaultContent = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xsi:schemaLocation="http://jasperreports.sourceforge.net/jasperreports
              http://jasperreports.sourceforge.net/xsd/jasperreport.xsd"
              name="inline-report" pageWidth="595" pageHeight="842">
    <detail>
        <band height="20">
            <staticText>
                <reportElement x="0" y="0" width="200" height="20"/>
                <text><![CDATA[Hello from JasperReports]]></text>
            </staticText>
        </band>
    </detail>
</jasperReport>`;
          await this.reportsService.saveReportTemplate(
            this.currentReportId,
            defaultContent,
          );
          this.activeReportTemplateContent = defaultContent;
        }
        this.changeDetectorRef.detectChanges();
      } catch (error) {
        console.error('Error loading inline .jrxml template:', error);
      }

      this.xmlReporting.documentburster.report.template.documentpath = newPath;
      await this.reportsService.saveReportDataSource(
        this.currentReportId,
        this.xmlReporting,
      );
      this.autosaveEnabled = true;
    } else {
      // Existing report from reports-jasper/ — show read-only preview
      const jrxmlPath = report.jrxmlFilePath || report.filePath;
      this.xmlReporting.documentburster.report.template.documentpath = jrxmlPath;
      try {
        const content = await this.reportsService.loadReportTemplate(this.currentReportId);
        this.activeReportTemplateContent = content || '';
        this.changeDetectorRef.detectChanges();
      } catch (error) {
        this.activeReportTemplateContent = '';
      }
      this.markSettingsDirty(jrxmlPath);
    }
  }

  async onReportOutputTypeChanged() {
    this.autosaveEnabled = false;
    try {
      const currentPath = this.xmlReporting.documentburster.report.template.documentpath;
      const outputType = this.xmlReporting.documentburster.report.template.outputtype;
      const newOutputType = outputType.replace('output.', '');

      // Adjust burst filename extension for special output types
      this.adjustBurstFilenameExtension(newOutputType);

      if (outputType === 'output.none') {
        this.xmlReporting.documentburster.report.template.documentpath = '';
      } else if (outputType === 'output.jasper') {
        await this.handleJasperOutputType(currentPath);
      } else if (outputType === 'output.docx') {
        await this.handleDocxOutputType(currentPath);
      } else if (['output.pdf', 'output.xlsx', 'output.html', 'output.dashboard'].includes(outputType)) {
        this.reportPreviewVisible = true;
        await this.loadOrCreateTemplate(newOutputType);
      } else if (outputType === 'output.fop2pdf') {
        this.reportPreviewVisible = false;
        await this.loadOrCreateTemplate('fop2pdf',
          `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\n<!-- XSL-FO template for FOP2PDF -->\n</xsl:stylesheet>`);
      } else if (outputType === 'output.any') {
        this.reportPreviewVisible = false;
        await this.loadOrCreateTemplate('any',
          `<#-- FreeMarker template for arbitrary text output -->\n<#-- Use FreeMarker syntax to generate your output -->`);
      }

      await this.loadAbsoluteTemplatePath();
      if (this.reportPreviewVisible) {
        this.refreshHtmlPreview();
      }
      this.changeDetectorRef.detectChanges();
      this.triggerFeatureRequestDialog(outputType);
    } finally {
      this.autosaveEnabled = true;
    }
  }

  /**
   * Load template for an output type via the backend. If no template exists,
   * create one with default content. Backend handles path resolution and
   * updates reporting.xml's documentpath as a side effect.
   */
  private async loadOrCreateTemplate(outputType: string, defaultContent?: string) {
    const configName = this.settingsService.currentConfigurationTemplate?.folderName || 'template';
    try {
      // Try auto endpoint first — reads documentpath from reporting.xml.
      // This handles samples with custom template names/locations
      // (e.g., samples/reports/northwind/customer-statement-template.html).
      let content = await this.reportsService.loadReportTemplate(this.currentReportId);

      // Fall back to per-type endpoint (convention: templates/reports/{id}/{id}-{type}.{ext})
      if (!content) {
        content = await this.reportsService.loadReportTemplateByType(
          this.currentReportId, outputType,
        );
      }

      if (content) {
        this.activeReportTemplateContent = content;
      } else {
        const skeleton = defaultContent ||
          `<html>\n<head>\n<title>${configName} ${outputType} Template</title>\n</head>\n<body>\n<h1>${configName} ${outputType} Report</h1>\n</body>\n</html>`;
        await this.reportsService.saveReportTemplateByType(
          this.currentReportId, outputType, skeleton,
        );
        this.activeReportTemplateContent = skeleton;
      }
      this.changeDetectorRef.detectChanges();
    } catch (error) {
      console.error(`Error loading template for ${outputType}:`, error);
    }
  }

  private adjustBurstFilenameExtension(outputType: string) {
    if (outputType === 'fop2pdf' || outputType === 'any') {
      const prevValue = this.xmlSettings?.documentburster?.settings?.burstfilename || '';
      const baseName = prevValue.replace(/\.[^\.]+$/, '');
      if (outputType === 'fop2pdf') this.xmlSettings.documentburster.settings.burstfilename = baseName + '.pdf';
      if (outputType === 'any') this.xmlSettings.documentburster.settings.burstfilename = baseName + '.xml';
    }
  }

  private async handleJasperOutputType(currentPath: string) {
    this.reportPreviewVisible = false;
    const savedPath = currentPath;

    if (savedPath && savedPath.endsWith('.jrxml') && !savedPath.includes('reports-jasper')) {
      // Inline .jrxml mode — restore editor content
      this.selectedJasperReport = this.inlineJrxmlOption;
      try {
        const content = await this.reportsService.loadReportTemplateByType(this.currentReportId, 'jasper');
        if (content) {
          this.activeReportTemplateContent = content;
        }
      } catch (error) {
        console.error('Error loading inline .jrxml template:', error);
      }
      this.autosaveEnabled = true;
    } else if (savedPath && savedPath.includes('reports-jasper')) {
      const jasperConfigs = this.settingsService.getJasperReportConfigurations();
      this.selectedJasperReport = jasperConfigs.find(
        (r: any) => r.filePath === savedPath,
      ) || null;
    } else {
      this.selectedJasperReport = null;
    }
  }

  /**
   * Handle docx output type — binary format, uses dropdown selection instead of code editor.
   * Docx uses a different naming convention: {configName}-template.docx
   */
  private async handleDocxOutputType(currentPath: string) {
    this.reportPreviewVisible = true;
    const configName = this.settingsService.currentConfigurationTemplate?.folderName || 'template';
    const isSamplePath = currentPath && (currentPath.includes('/samples/') || currentPath.startsWith('samples/'));

    let newPath = '';
    if (isSamplePath) {
      newPath = currentPath;
    } else if (!currentPath || !currentPath.toLowerCase().endsWith('.docx')) {
      newPath = `templates/reports/${configName}/${configName}-template.docx`;
    } else {
      newPath = currentPath;
    }

    // Update documentpath if changed
    if (!isSamplePath && this.xmlReporting.documentburster.report.template.documentpath !== newPath) {
      this.xmlReporting.documentburster.report.template.documentpath = newPath;
      await this.reportsService.saveReportDataSource(this.currentReportId, this.xmlReporting);
    }

    this.syncSelectedDocxTemplate();
  }

  private syncSelectedDocxTemplate() {
    const docxPath = this.xmlReporting.documentburster.report.template.documentpath;
    const stripLeadSlash = (p: string) => p?.replace(/^\//, '') || '';
    this.selectedReportTemplateFile = this.settingsService.templateFiles?.find(
      (tplFile) => stripLeadSlash(tplFile.filePath) === stripLeadSlash(docxPath),
    );
  }

  // ngOnInit wires the route-param subscription; all per-navigation work lives in _initFromRouteParams.
  async ngOnInit() {
    this.route.params.subscribe(async (params) => this._initFromRouteParams(params));
  }

  private async _initFromRouteParams(params: any): Promise<void> {
    this.currentLeftMenu = params.leftMenu || 'generalSettingsMenuSelected';

    //make sure that the XML file is loaded only once
    if (
      this.currentLeftMenu === 'generalSettingsMenuSelected' ||
      params.reloadConfiguration
    ) {
      this.settingsService.currentConfigurationTemplatePath = Utilities.slash(
        params.configurationFilePath,
      );

      this.settingsService.currentConfigurationTemplateName =
        params.configurationFileName;

      this.xmlSettings = await this.reportsService.loadSettingsByPath(
        params.configurationFilePath,
      );

      this.stateStore.configSys.currentConfigFile.configuration.settings = {
        ...this.xmlSettings.documentburster.settings,
      };

      // Search all configs (configurationFiles includes both user configs and samples).
      // Normalize leading slash: backend returns "/config/..." while frontend uses "config/..."
      const stripLeadingSlash = (p: string) => p?.replace(/^\//, '') || '';
      const targetPath = stripLeadingSlash(this.settingsService.currentConfigurationTemplatePath);
      this.settingsService.currentConfigurationTemplate = this.settingsService
        .configurationFiles?.find(
          (confTemplate) =>
            stripLeadingSlash(confTemplate.filePath) === targetPath,
        );

      // Lazy load DSL details for this specific configuration
      if (this.settingsService.currentConfigurationTemplate) {
        await this.settingsService.loadReportDetails(
          this.settingsService.currentConfigurationTemplate
        );
      }
    }

    if (this.currentLeftMenu === 'emailSettingsMenuSelected') {
      await this.initEmailSettings();
    } else if (this.currentLeftMenu === 'reportingSettingsMenuSelected') {
      await this.initReportingSettings();
    }

    this.settingsService.numberOfUserVariables =
      this.xmlSettings.documentburster.settings.numberofuservariables;

    this.refreshTabs();

    this.messagesService.showInfo(
      'Showing configuration ' +
      this.settingsService.currentConfigurationTemplateName,
    );

    // wire auto-save debounce — re-subscribed on each navigation to pick up fresh xmlSettings
    this.settingsChanged
      .pipe(debounceTime(30))
      .subscribe(async (_newValue) => {
        await this.reportsService.saveReportSettings(
          this.currentReportId,
          this.xmlSettings,
        );

        if (
          this.xmlSettings.documentburster.settings.capabilities
            .reportgenerationmailmerge &&
          this.xmlReporting.documentburster
        )
          await this.reportsService.saveReportDataSource(
            this.currentReportId,
            this.xmlReporting,
          );

        this.messagesService.showInfo('Saved');
      });
  }

  private async initEmailSettings() {
    await this.settingsService.loadAllConnections();

    if (!this.xmlSettings.documentburster.settings.emailserver.conncode)
      this.xmlSettings.documentburster.settings.emailserver.conncode =
        this.settingsService.defaultEmailConnectionFile.connectionCode;

    if (this.xmlSettings.documentburster.settings.emailserver.conncode) {
      this.selectedEmailConnectionFile =
        this.settingsService.connectionFiles.find(
          (connection) =>
            connection.connectionType == 'email-connection' &&
            connection.connectionCode ==
              this.xmlSettings.documentburster.settings.emailserver.conncode,
        );

      if (this.xmlSettings.documentburster.settings.emailserver.useconn)
        this.fillExistingEmailConnectionDetails(
          this.selectedEmailConnectionFile.connectionCode,
        );
    }
  }

  private async initReportingSettings() {
    await this.settingsService.loadAllReportTemplates();

    this.xmlReporting.documentburster =
      await this.reportsService.loadReportDataSource(this.currentReportId);

    if (this.xmlReporting?.documentburster?.report?.datasource) {
      this.ensureDefaultDbConnections();
      await this.loadDslScriptsForDatasource();
      this.applyPreloadedDslOptions();
    }

    // Populate the Cubes-reuse button visibility for the loaded report.
    await this.refreshCubesForCurrentConnection();

    this.initIdColumnSelections();

    if (this.xmlReporting?.documentburster?.report?.template?.outputtype) {
      await this.onReportOutputTypeChanged();
    }
  }

  private async loadDslScriptsForDatasource() {
    const dsType = this.xmlReporting.documentburster.report.datasource.type;

    if (dsType === 'ds.scriptfile' || dsType === 'ds.dashboard') {
      await this.loadExternalReportingScript('datasourceScript');
    }
    if (dsType === 'ds.scriptfile' || dsType === 'ds.dashboard' || dsType === 'ds.sqlquery') {
      await this.loadExternalReportingScript('paramsSpecScript');
    }
    // Tabulator, chart, pivot, and transform are relevant for ALL datasource types
    await this.loadExternalReportingScript('tabulatorConfigScript');
    await this.loadExternalReportingScript('chartConfigScript');
    await this.loadExternalReportingScript('pivotTableConfigScript');
    await this.loadExternalReportingScript('transformScript');
  }

  private applyPreloadedDslOptions() {
    const configTemplate = this.settingsService.currentConfigurationTemplate;
    if (configTemplate?.tabulatorOptions) {
      this.activeTabulatorConfigOptions = configTemplate.tabulatorOptions;
    }
    if (configTemplate?.chartOptions) {
      this.activeChartConfigOptions = configTemplate.chartOptions;
    }
    if (configTemplate?.pivotTableOptions) {
      this.activePivotTableConfigOptions = configTemplate.pivotTableOptions;
    }
  }

  refreshTabs() {
    this.visibleTabs = [];

    this.changeDetectorRef.detectChanges();

    const visibleTabsIds = this.MENU_SELECTED_X_VISIBLE_TABS.find((item) => {
      return item.selectedMenu === this.currentLeftMenu;
    }).visibleTabs;

    //const enableincubatingfeatures = this.xmlSettings.documentburster.settings.enableincubatingfeatures;

    this.visibleTabs = this.ALL_TABS.filter((item) => {
      let shouldShow = true;
      if (
        !this.xmlSettings.documentburster.settings?.capabilities
          ?.reportdistribution
      ) {
        if (item.visibleWhenCapability == 'reportdistribution')
          shouldShow = false;
      }

      return visibleTabsIds.includes(item.id) && shouldShow;
    });
  }

  async onSelectOutputFolderPath(filePath: string) {
    this.xmlSettings.documentburster.settings.outputfolder =
      Utilities.slash(filePath);
    await this.reportsService.saveReportSettings(
      this.currentReportId,
      this.xmlSettings,
    );
    this.messagesService.showInfo('Saved');
  }

  async onSelectQuarantineFolderPath(filePath: string) {
    this.xmlSettings.documentburster.settings.quarantinefolder = filePath;
    await this.reportsService.saveReportSettings(
      this.currentReportId,
      this.xmlSettings,
    );
    this.messagesService.showInfo('Saved');
  }

  async onSelectAttachmentFilePath(filePath: string) {
    this.modalAttachmentInfo.attachmentFilePath = Utilities.slash(filePath);
  }

  // ==========================================================================
  //  Email configuration
  // ==========================================================================

  onUseExistingEmailConnectionClick(event: Event) {
    if (event instanceof Event) {
      if ((event.target as HTMLInputElement).checked)
        this.fillExistingEmailConnectionDetails(
          this.selectedEmailConnectionFile.connectionCode,
        );
      this.settingsService.refreshConnectionsUsedByInformation(
        this.settingsService.currentConfigurationTemplatePath,
        this.xmlSettings,
      );
    }
  }

  async onUsedExistingEmailConnectionChanged(code: string, name: string) {
    let dialogQuestion = `Use ${name} email connection?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        this.fillExistingEmailConnectionDetails(code);

        await this.reportsService.saveReportSettings(
          this.currentReportId,
          this.xmlSettings,
        );

        this.settingsService.refreshConnectionsUsedByInformation(
          this.settingsService.currentConfigurationTemplatePath,
          this.xmlSettings,
        );

        this.messagesService.showInfo('Saved');
      },
    });
  }

  fillExistingEmailConnectionDetails(code: string) {
    //this.xmlSettings.documentburster.settings.emailserver.useconn = true;
    this.xmlSettings.documentburster.settings.emailserver.conncode = code;

    const emailConnection = this.settingsService.connectionFiles.filter(
      (connection) => connection.connectionCode === code,
    )[0];

    this.selectedEmailConnectionFile = emailConnection;

    let connFiled = false;
    const asDefined = `As defined by ${name}`;

    if (emailConnection.emailserver.name) connFiled = true;

    this.xmlSettings.documentburster.settings.emailserver.name = connFiled
      ? emailConnection.emailserver.name
      : asDefined;
    this.xmlSettings.documentburster.settings.emailserver.fromaddress =
      connFiled ? emailConnection.emailserver.fromaddress : asDefined;
    this.xmlSettings.documentburster.settings.emailserver.host = connFiled
      ? emailConnection.emailserver.host
      : asDefined;
    this.xmlSettings.documentburster.settings.emailserver.userid = connFiled
      ? emailConnection.emailserver.userid
      : asDefined;
    this.xmlSettings.documentburster.settings.emailserver.userpassword =
      connFiled ? emailConnection.emailserver.userpassword : asDefined;
    this.xmlSettings.documentburster.settings.emailserver.port = connFiled
      ? emailConnection.emailserver.port
      : asDefined;

    this.xmlSettings.documentburster.settings.emailserver.usessl =
      emailConnection.emailserver.usessl;
    this.xmlSettings.documentburster.settings.emailserver.usetls =
      emailConnection.emailserver.usetls;
  }

  // Toggle preview visibility
  toggleEmailPreview() {
    this.emailPreviewVisible = !this.emailPreviewVisible;
    if (this.emailPreviewVisible) {
      this.updateEmailPreview();
    }
  }

  // Update the preview when code changes
  onEmailHtmlContentChanged(newContent: string) {
    if (this.xmlSettings) {
      this.xmlSettings.documentburster.settings.emailsettings.html = newContent;
      this.markSettingsDirty(newContent);
      this.updateEmailPreview();
    }
  }

  // Update the sanitized HTML for the preview
  updateEmailPreview() {
    if (
      this.emailPreviewVisible &&
      this.xmlSettings?.documentburster.settings.emailsettings.html
    ) {
      this.sanitizedEmailPreview = this.sanitizer.bypassSecurityTrustHtml(
        this.xmlSettings.documentburster.settings.emailsettings.html,
      );
    }
  }

  async onSaveHTMLTemplateClick(filePath: string) {
    await this.reportsService.saveReportTemplate(
      this.currentReportId,
      this.xmlSettings.documentburster.settings.emailsettings.html,
    );
    this.messagesService.showInfo('HTML template was saved.');
  }

  async onLoadHTMLTemplateClick(filePath: string) {
    const data = await this.reportsService.loadReportTemplate(this.currentReportId);

    (
      document.getElementById('htmlCodeEmailMessage') as HTMLInputElement
    ).value = data;

    document
      .getElementById('htmlCodeEmailMessage')
      .dispatchEvent(new Event('input', { bubbles: true }));
  }
  // ==========================================================================
  //  Attachment management
  // ==========================================================================

  onAttachmentSelected(attachment: { selected: boolean }) {
    //console.log('=== DEBUG attachment selection ===');

    if (
      this.xmlSettings.documentburster.settings.attachments.items
        .attachmentItems
    ) {
      this.xmlSettings.documentburster.settings.attachments.items.attachmentItems.forEach(
        (item: { selected: boolean }) => {
          item.selected = false;
        },
      );
    }

    attachment.selected = true;
    this.selectedAttachment = attachment;
  }

  onDeleteSelectedAttachment() {
    let dialogQuestion = 'Send emails without any attachment?';
    if (
      this.xmlSettings.documentburster.settings.attachments.items
        .attachmentItems.length > 1
    ) {
      dialogQuestion = 'Delete selected item?';
    }

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        //console.log(
        //  `this.selectedAttachment = ${JSON.stringify(this.selectedAttachment)}`,
        //);
        _.remove(
          this.xmlSettings.documentburster.settings.attachments.items
            .attachmentItems,
          (attachment: any) => attachment.path === this.selectedAttachment.path,
        );

        delete this.selectedAttachment;
        await this.reportsService.saveReportSettings(
          this.currentReportId,
          this.xmlSettings,
        );
        this.messagesService.showInfo('Saved');
      },
    });
  }

  onClearAttachments() {
    const dialogQuestion = 'Send emails without any attachment?';

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        delete this.selectedAttachment;

        this.xmlSettings.documentburster.settings.attachments.items.attachmentItems =
          [];

        await this.reportsService.saveReportSettings(
          this.currentReportId,
          this.xmlSettings,
        );
        this.messagesService.showInfo('Saved');
      },
    });
  }

  async onSelectedAttachmentUp() {
    const index = _.indexOf(
      this.xmlSettings.documentburster.settings.attachments.items
        .attachmentItems,
      this.selectedAttachment,
    );

    if (index > 0) {
      // Decrement the 'order' of the selected attachment and increment the 'order' of the one above it
      this.xmlSettings.documentburster.settings.attachments.items
        .attachmentItems[index].order--;
      this.xmlSettings.documentburster.settings.attachments.items
        .attachmentItems[index - 1].order++;

      this.onAttachmentSelected(this.selectedAttachment);
      await this.reportsService.saveReportSettings(
        this.currentReportId,
        this.xmlSettings,
      );
      this.messagesService.showInfo('Saved');
    }
  }

  async onSelectedAttachmentDown() {
    const index = _.indexOf(
      this.xmlSettings.documentburster.settings.attachments.items
        .attachmentItems,
      this.selectedAttachment,
    );

    if (
      index <
      this.xmlSettings.documentburster.settings.attachments.items
        .attachmentItems.length -
      1
    ) {
      // Increment the 'order' of the selected attachment and decrement the 'order' of the one below it
      this.xmlSettings.documentburster.settings.attachments.items
        .attachmentItems[index].order++;
      this.xmlSettings.documentburster.settings.attachments.items
        .attachmentItems[index + 1].order--;

      this.onAttachmentSelected(this.selectedAttachment);
      await this.reportsService.saveReportSettings(
        this.currentReportId,
        this.xmlSettings,
      );
      this.messagesService.showInfo('Saved');
    }
  }

  moveItemInArray(array: [], from: number, to: number): void {
    array.splice(to, 0, array.splice(from, 1)[0]);
  }

  getSortedAttachments() {
    if (this.xmlSettings.documentburster.settings) {
      return this.xmlSettings.documentburster.settings.attachments.items.attachmentItems.sort(
        (attach1: any, attach2: any): number => {
          return attach1.order - attach2.order;
        },
      );
    } else {
      return [];
    }
  }

  onNewEditAttachment(newOrEditMode) {
    this.modalAttachmentInfo.mode = newOrEditMode;
    if (newOrEditMode === 'edit') {
      this.modalAttachmentInfo.attachmentFilePath =
        this.selectedAttachment.path;
    }

    this.isModalAttachmentVisible = true;
  }

  async onOKAttachmentModal() {
    if (this.modalAttachmentInfo.mode === 'edit') {
      const index = _.indexOf(
        this.xmlSettings.documentburster.settings.attachments.items
          .attachmentItems,
        this.selectedAttachment,
      );
      this.xmlSettings.documentburster.settings.attachments.items.attachmentItems[
        index
      ].path = this.modalAttachmentInfo.attachmentFilePath;
      this.selectedAttachment.path =
        this.modalAttachmentInfo.attachmentFilePath;
    } else if (this.modalAttachmentInfo.mode === 'new') {
      this.xmlSettings.documentburster.settings.attachments.items.attachmentItems.push(
        {
          path: this.modalAttachmentInfo.attachmentFilePath,
          order:
            this.xmlSettings.documentburster.settings.attachments.items
              .attachmentItems.length,
        },
      );
      this.modalAttachmentInfo.attachmentFilePath = '';
    }

    //console.log(
    //  `this.settingsService.currentConfigurationTemplatePath = ${this.settingsService.currentConfigurationTemplatePath}`,
    //);
    //console.log(`this.xmlSettings = ${JSON.stringify(this.xmlSettings)}`);

    await this.reportsService.saveReportSettings(
      this.currentReportId,
      this.xmlSettings,
    );
    this.isModalAttachmentVisible = false;

    this.messagesService.showInfo('Saved');
  }

  onCancelAttachmentModal() {
    this.isModalAttachmentVisible = false;
    this.modalAttachmentInfo.attachmentFilePath = '';
  }

  updateFormControlWithSelectedVariable(
    id: string,
    selectedVariableValue: string,
  ) {
    const formControl = document.getElementById(id) as HTMLInputElement;
    const caretPos = formControl.selectionStart;
    const oldValue = formControl.value;
    formControl.value =
      oldValue.substring(0, caretPos) +
      selectedVariableValue +
      oldValue.substring(caretPos);

    formControl.dispatchEvent(new Event('input'));
  }

  async updateQuillFormControlWithSelectedVariable(
    selectedVariableValue: string,
  ) {
    this.editor.insertText(
      this.editorCaretPosition,
      selectedVariableValue,
      'user',
    );
  }

  async updateSMTPFormControlsWithSelectedProviderSettings(
    selectedProviderSettings: EmailProviderSettings,
  ) {
    this.xmlSettings.documentburster.settings.emailserver.usessl = false;
    this.xmlSettings.documentburster.settings.emailserver.usetls = false;

    this.xmlSettings.documentburster.settings.emailserver.host =
      selectedProviderSettings.host;
    this.xmlSettings.documentburster.settings.emailserver.port =
      selectedProviderSettings.port;

    if (selectedProviderSettings.secure === true) {
      this.xmlSettings.documentburster.settings.emailserver.usessl = true;
    }

    if (selectedProviderSettings.tls) {
      this.xmlSettings.documentburster.settings.emailserver.usetls = true;
    }

    await this.reportsService.saveReportSettings(
      this.currentReportId,
      this.xmlSettings,
    );
    this.messagesService.showInfo('Saved');
  }

  // ==========================================================================
  //  Test workflows
  // ==========================================================================

  async doRunTestScript() {
    if (this.executionStatsService.logStats.foundDirtyLogFiles) {
      const dialogMessage =
        'Log files are not empty. You need to press the Clear Logs button first.';
      this.infoService.showInformation({ message: dialogMessage });
      return;
    }

    const dialogQuestion = `Test this script?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        // console.log('[DEBUG] doRunTestScript: confirmAction started');
        let parameters = [];

        // Parse Groovy DSL to get parameters
        if (this.activeParamsSpecScriptGroovy &&
          this.activeParamsSpecScriptGroovy.trim() !== '') {
          // console.log('[DEBUG] doRunTestScript: parsing parameters DSL');
          parameters =
            await this.reportingService.processGroovyParametersDsl(
              this.activeParamsSpecScriptGroovy,
              this.selectedDbConnCode,
            );
          // console.log('[DEBUG] doRunTestScript: parsed parameters:', parameters);

          // Access user-provided values
          const paramValues = this.reportParamsValues;

          // Convert values to correct types based on parameter definitions
          const typedParams = parameters.map((param) => {
            return {
              ...param,
              value: this.convertParamValue(param.type, paramValues[param.id]),
            };
          });

          //console.log(`typedParams = ${JSON.stringify(typedParams)}`);

          //console.log('Parameters before execution:', {
          //  parameters,
          //  values: this.reportParamsValues,
          //});
          // Only update if different
          if (!_.isEqual(this.reportParameters, parameters)) {
            this.reportParameters = parameters;
          }
        }
        // console.log('[DEBUG] doRunTestScript: checking parameters count:', parameters?.length);
        if (parameters && parameters.length > 0) {
          // console.log('[DEBUG] doRunTestScript: showing parameters modal');
          this.isModalParametersVisible = true;
        }
        else {
          // console.log('[DEBUG] doRunTestScript: no parameters, calling executeTestQuery');
          return this.executeTestQuery([]);
        }
      },
    });
  }

  doTestSMTPConnection() {
    if (this.executionStatsService.logStats.foundDirtyLogFiles) {
      const dialogMessage = 'Log files are not empty. You need to press the Clear Logs button first.';
      this.infoService.showInformation({ message: dialogMessage });
      return;
    }

    const dialogQuestion = 'Send test email?';
    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        this.isTestingEmailConnection = true;

        // 1) Determine which file to test:
        let fileToTest: string;
        if (this.xmlSettings.documentburster.settings.emailserver.useconn) {
          // reuse existing email connection
          fileToTest = this.selectedEmailConnectionFile.filePath;
        } else {
          // inline SMTP details in the config template
          fileToTest = this.settingsService.currentConfigurationTemplatePath;
        }

        try {
          if (this.xmlSettings.documentburster.settings.emailserver.useconn) {
            // Test using the linked email connection
            const connectionCode = this.selectedEmailConnectionFile.connectionCode;
            await this.connectionsService.testConnection(connectionCode, 'email');
          } else {
            // Test using inline SMTP settings from the report config
            await this.connectionsService.testConnection(this.currentReportId, 'email-inline');
          }
          this.messagesService.showSuccess('Test email sent successfully');
        } catch (e) {
          this.messagesService.showError('Test email failed');
          console.error(e);
        } finally {
          this.isTestingEmailConnection = false;
        }
      },
    });
  }

  onShowSendTestSMSModal() {
    if (this.executionStatsService.logStats.foundDirtyLogFiles) {
      const dialogMessage =
        'Log files are not empty. You need to press the Clear Logs button first.';

      this.infoService.showInformation({
        message: dialogMessage,
      });
    } else {
      this.isModalSMSVisible = true;
    }
  }

  onCloseSMSModal() {
    //console.log(`this.modalSMSInfo = ${JSON.stringify(this.modalSMSInfo)}`);
    this.isModalSMSVisible = false;
  }

  async onSendTestSMS() {
    try {
      await this.apiService.post('/connections/settings/test-sms', {
        fromNumber: this.modalSMSInfo.fromNumber,
        toNumber: this.modalSMSInfo.toNumber,
        configPath: this.settingsService.currentConfigurationTemplatePath,
      });
      this.messagesService.showSuccess('Test SMS sent successfully');
    } catch (e) {
      this.messagesService.showError('Test SMS failed');
      console.error(e);
    }
  }

  // ==========================================================================
  //  Tabulator / Chart / Pivot config
  // ==========================================================================

  activeReportTemplateContent: string = '';
  reportPreviewVisible = true;
  sanitizedReportPreview: SafeHtml = '';
  templateSanitizedHtmlCache = new Map<string, SafeHtml>();

  activeDatasourceScriptGroovy: string = '';
  activeParamsSpecScriptGroovy: string = '';
  activeTransformScriptGroovy: string = '';
  // Tabulator configuration script (Groovy DSL)
  activeTabulatorConfigScriptGroovy: string = '';
  activeTabulatorConfigOptions: any = null; // flat map matching tabulator.info options
  private tabulatorTableInstance: any = null;
  tabulatorHasActiveFilters = false;

  onTabulatorFiltered(event: any) {
    const detail = event?.detail || event;
    const filters = detail?.filters || [];
    this.tabulatorHasActiveFilters = filters.length > 0;
    this.changeDetectorRef.detectChanges();
  }

  clearAllTabulatorFilters() {
    this.confirmService.askConfirmation({
      message: 'Clear All Filters?',
      confirmAction: () => {
        if (this.tabulatorTableInstance) {
          this.tabulatorTableInstance.clearHeaderFilter();
        }
      },
    });
  }

  // Chart configuration script (Groovy DSL)
  activeChartConfigScriptGroovy: string = '';
  activeChartConfigOptions: any = null; // { type, labelField, options, labels, datasets }
  private chartInstance: any = null;

  // Pivot Table configuration script (Groovy DSL)
  activePivotTableConfigScriptGroovy: string = '';
  activePivotTableConfigOptions: any = null; // { rows, cols, vals, aggregatorName, rendererName, etc. }

  // Helper methods for aggregator report previews (named component IDs)
  getNamedTabulatorIds(): string[] {
    const named = this.activeTabulatorConfigOptions?.namedOptions;
    return named ? Object.keys(named) : [];
  }

  getNamedChartIds(): string[] {
    const named = this.activeChartConfigOptions?.namedOptions;
    return named ? Object.keys(named) : [];
  }

  getNamedPivotIds(): string[] {
    const named = this.activePivotTableConfigOptions?.namedOptions;
    return named ? Object.keys(named) : [];
  }

  // Minimal runtime handler registry - keys referenced from the DSL
  private tabulatorHandlerRegistry: { [name: string]: (payload: any, params?: any, table?: any) => void } = {
    HIGHLIGHT_URGENT: (payload, params, table) => {
      try {
        const row = payload?.row;
        if (row && typeof row.getElement === 'function') {
          const el = row.getElement();
          el.style.backgroundColor = params?.color || '#ffdddd';
        }
      } catch (e) {
        console.warn('HIGHLIGHT_URGENT handler error', e);
      }
    },
    LOG_DATA: (payload, params, table) => {
      const level = params?.level || 'info';
      console[level](payload?.data || payload?.rowData || payload);
    }
  };


  triggerFeatureRequestDialog(event: Event | string) {
    let requestedFeature: string;

    if (event instanceof Event)
      requestedFeature = (event.target as HTMLSelectElement).value;
    else requestedFeature = event;

    //console.log(`requestedFeature = ${requestedFeature}`);

    if (
      requestedFeature &&
      !this.askForFeatureService.alreadyImplementedFeatures.includes(
        requestedFeature,
      )
    ) {
      this.askForFeatureService.showAskForFeature({
        requestedFeature: requestedFeature,
      });
    }
  }

  // ==========================================================================
  //  Datasource editor
  // ==========================================================================

  async onDataSourceTypeChange(newValue: any) {
    this.applySeparatorForDsType(newValue);
    this.xmlReporting.documentburster.report.datasource.showmoreoptions = false;

    const previousDsType = this.xmlReporting.documentburster.report.datasource.type;

    // Save pending scripts from the PREVIOUS datasource before switching
    await this.savePendingScriptsForDsType(previousDsType);
    this.ensureDefaultDbConnections();

    // Update the datasource type
    this.xmlReporting.documentburster.report.datasource.type = newValue;

    // Dashboard forces output type + burst filename
    if (newValue === 'ds.dashboard') {
      this.xmlReporting.documentburster.report.template.outputtype = 'output.dashboard';
      this.xmlSettings.documentburster.settings.burstfilename = 'dashboard.html';
      await this.onReportOutputTypeChanged();
    }

    // Load scripts for the NEW datasource type
    await this.loadScriptsForDsType(newValue);

    this.markSettingsDirty(this.xmlReporting.documentburster.report);
    this.triggerFeatureRequestDialog(newValue);
    this.changeDetectorRef.detectChanges();
  }

  private applySeparatorForDsType(dsType: string) {
    if (dsType === 'ds.tsvfile') {
      this.xmlReporting.documentburster.report.datasource.csvoptions.separatorchar = '→ [tab character]';
    } else if (dsType === 'ds.csvfile') {
      this.xmlReporting.documentburster.report.datasource.csvoptions.separatorchar = ',';
    }
  }

  private async savePendingScriptsForDsType(dsType: string) {
    // Save datasource script if it has non-default content
    if ((dsType === 'ds.scriptfile' || dsType === 'ds.dashboard') &&
        this.hasNonDefaultContent(this.activeDatasourceScriptGroovy, '// Groovy Datasource Script')) {
      await this.saveExternalReportingScript('datasourceScript');
    }
    // Save params spec if relevant
    if (['ds.scriptfile', 'ds.dashboard', 'ds.sqlquery'].includes(dsType) &&
        this.hasNonDefaultContent(this.activeParamsSpecScriptGroovy, this.exampleParamsSpecScript)) {
      await this.saveExternalReportingScript('paramsSpecScript');
    }
    // Transformation script is always potentially relevant
    if (this.hasNonDefaultContent(this.activeTransformScriptGroovy,
        '// Groovy Additional Transformation Script\n// Ensure this file is saved in the report configuration folder.')) {
      await this.saveExternalReportingScript('transformScript');
    }
  }

  private hasNonDefaultContent(content: string, defaultContent: string): boolean {
    return !!content && content.trim() !== '' && content.trim() !== defaultContent.trim();
  }

  private ensureDefaultDbConnections() {
    const ds = this.xmlReporting.documentburster.report.datasource;
    const defaultDbConn = this.settingsService.defaultDatabaseConnectionFile;
    if (defaultDbConn?.connectionCode) {
      if (!ds.sqloptions.conncode) {
        ds.sqloptions.conncode = defaultDbConn.connectionCode;
      }
      if (!ds.scriptoptions.conncode) {
        ds.scriptoptions.conncode = defaultDbConn.connectionCode;
      }
    }
  }

  private async loadScriptsForDsType(dsType: string) {
    if (dsType === 'ds.scriptfile' || dsType === 'ds.dashboard') {
      await this.loadExternalReportingScript('datasourceScript');
      await this.loadExternalReportingScript('paramsSpecScript');
    } else if (dsType === 'ds.sqlquery') {
      this.activeDatasourceScriptGroovy = '';
      await this.loadExternalReportingScript('paramsSpecScript');
    } else {
      this.activeDatasourceScriptGroovy = '';
      this.activeParamsSpecScriptGroovy = '';
    }
    await this.loadExternalReportingScript('transformScript');
  }

  onSqlQueryChanged(event: string) {
    this.xmlReporting.documentburster.report.datasource.sqloptions.query =
      event;
    this.markSettingsDirty(event);
  }

  async onScriptContentChanged(event: string) {
    this.activeDatasourceScriptGroovy = event;
    await this.saveExternalReportingScript('datasourceScript');
    this.markSettingsDirty(event);
  }

  async onTransformationCodeChanged(event: string) {
    this.activeTransformScriptGroovy = event;
    await this.saveExternalReportingScript('transformScript');
    this.markSettingsDirty(event);
  }

  highlightGroovyCode = (editor: CodeJarContainer) => {
    if (!editor) return;
    const code = this.getRawCode(editor);
    if (!code) return;

    try {
      if (Prism.languages.groovy) {
        const html = Prism.highlight(code, Prism.languages.groovy, 'groovy');
        editor.style.whiteSpace = 'pre-wrap';
        editor.innerHTML = html;
      } else {
        console.error(
          'Groovy language not available in Prism for highlighting. Please ensure prism-groovy component is loaded.',
        );
        editor.style.whiteSpace = 'pre-wrap';
        editor.innerHTML = code; // Fallback to unhighlighted code
      }
    } catch (error) {
      console.error('Error during Groovy script highlighting:', error);
      editor.style.whiteSpace = 'pre-wrap';
      editor.innerHTML = code; // Fallback to unhighlighted code
    }
  };

  private getRawCode(editor: CodeJarContainer): string {
    // Prefer textContent (raw text including newlines) to preserve multiple blank lines
    // Fallback to innerText if textContent not available.
    try {
      if ((editor as any).textContent !== undefined && (editor as any).textContent !== null) {
        return (editor as any).textContent as string;
      }
    } catch (err) {
      // ignore and use innerText
    }
    return editor.innerText || '';
  }

  highlightSqlCode = (editor: CodeJarContainer) => {
    if (!editor) return;
    const code = this.getRawCode(editor);
    try {
      const html = Prism.highlight(code, Prism.languages.sql, 'sql');
      editor.style.whiteSpace = 'pre-wrap';
      editor.innerHTML = html;
    } catch (e) {
      console.error('Error during SQL highlighting:', e);
      editor.style.whiteSpace = 'pre-wrap';
      editor.innerHTML = code;
    }
  };

  // Add ViewChild for the SQL editor
  @ViewChild('sqlEditor') sqlEditorRef: ElementRef;
  @ViewChild('tabulatorConfigEditor') tabulatorConfigEditorRef: ElementRef;
  @ViewChild('chartConfigEditor') chartConfigEditorRef: ElementRef;
  @ViewChild('pivotTableConfigEditor') pivotTableConfigEditorRef: ElementRef;

  // Method to focus the editor when placeholder is clicked
  focusSqlEditor() {
    if (this.sqlEditorRef && this.sqlEditorRef['codejarInstance']) {
      this.sqlEditorRef['codejarInstance'].focus();
    } else if (document.getElementById('sqlQueryEditor')) {
      // Fallback if direct reference isn't available
      document.getElementById('sqlQueryEditor').click();
    }
  }

  onDatabaseConnectionChanged(connectionCode: string) {
    // Logic when SQL database connection changes
    this.markSettingsDirty(connectionCode);
    // Refresh cubes available for the newly selected connection so the
    // "Cubes" reuse button shows/hides correctly.
    this.refreshCubesForCurrentConnection();
  }

  get selectedDbConnCode(): string {
    // Both sqloptions.conncode and scriptoptions.conncode are always kept
    // in sync by the setter, so reading from either one is sufficient.
    return this.xmlReporting?.documentburster?.report?.datasource?.sqloptions?.conncode || '';
  }

  set selectedDbConnCode(value: string) {
    // Always mirror the connection code to both options so that switching
    // between SQL and Script input types does not silently change the
    // active database connection.
    const ds = this.xmlReporting?.documentburster?.report?.datasource;
    if (ds) {
      ds.sqloptions.conncode = value;
      ds.scriptoptions.conncode = value;
    }
  }

  // ==========================================================================
  //  Cubes Reuse Modal
  // ==========================================================================

  async refreshCubesForCurrentConnection() {
    const dsType = this.xmlReporting?.documentburster?.report?.datasource?.type;
    // Only the three input types that get the Cubes button.
    const eligible =
      dsType === 'ds.sqlquery' ||
      dsType === 'ds.scriptfile' ||
      dsType === 'ds.dashboard';
    if (!eligible || !this.selectedDbConnCode) {
      this.cubesForCurrentConnection = [];
      this.hasCubesForCurrentConnection = false;
      return;
    }
    try {
      // loadAll() is cheap (a single GET /cubes); always re-fetch so the user
      // sees newly created cubes without restarting the configuration screen.
      // takeUntil(destroy$) ensures the await resolves early (EmptyError) if the
      // component is destroyed before the HTTP response arrives, preventing NG0901.
      this.allCubes = await firstValueFrom(
        from(this.cubesService.loadAll()).pipe(takeUntil(this.destroy$))
      );
    } catch {
      this.allCubes = [];
      return;
    }
    this.cubesForCurrentConnection = this.allCubes.filter(
      (c) => c.connectionId === this.selectedDbConnCode,
    );
    this.hasCubesForCurrentConnection = this.cubesForCurrentConnection.length > 0;
  }

  async showCubesReuseModal() {
    if (!this.hasCubesForCurrentConnection) return;
    // Always preselect the first cube — also covers the single-cube case
    // where the dropdown is hidden.
    await this.selectCubeForReuse(this.cubesForCurrentConnection[0]);
    this.isCubesReuseModalVisible = true;
  }

  async onCubeForReuseChanged(cubeId: string) {
    const next = this.cubesForCurrentConnection.find((c) => c.id === cubeId);
    if (next) {
      await this.selectCubeForReuse(next);
    }
  }

  private async selectCubeForReuse(cube: CubeDefinition) {
    this.selectedCubeForReuse = cube;
    this.parsedCubeForReuse = null;
    this.parseCubeForReuseError = '';
    this.cubesReuseSelectedDimensions = [];
    this.cubesReuseSelectedMeasures = [];
    this.cubesReuseSelectedSegments = [];
    this.hasCubesReuseFieldSelections = false;
    // Cube list returns the lightweight metadata only — fetch the full record
    // (which contains dslCode) before parsing.
    try {
      const full = await this.cubesService.load(cube.id);
      if (full) {
        this.selectedCubeForReuse = full;
        const parsed = await this.cubesService.parseDsl(full.dslCode);
        this.parsedCubeForReuse = parsed;
      }
    } catch (e: any) {
      this.parseCubeForReuseError = e?.message || 'Failed to parse cube DSL';
    }
  }

  onCubeForReuseSelectionChanged(event: any) {
    const detail = event?.detail || event;
    this.cubesReuseSelectedDimensions = detail?.selectedDimensions || [];
    this.cubesReuseSelectedMeasures = detail?.selectedMeasures || [];
    this.cubesReuseSelectedSegments = detail?.selectedSegments || [];
    this.hasCubesReuseFieldSelections =
      this.cubesReuseSelectedDimensions.length > 0 ||
      this.cubesReuseSelectedMeasures.length > 0;
  }

  async showCubesReuseSql() {
    if (!this.hasCubesReuseFieldSelections || !this.selectedCubeForReuse) return;
    this.cubesReuseSqlLoading = true;
    this.cubesReuseGeneratedSql = '';
    this.isCubesReuseSqlModalVisible = true;
    try {
      const result = await this.cubesService.generateSqlFromDsl(
        this.selectedCubeForReuse.dslCode,
        this.selectedCubeForReuse.connectionId,
        this.cubesReuseSelectedDimensions,
        this.cubesReuseSelectedMeasures,
        this.cubesReuseSelectedSegments,
      );
      this.cubesReuseGeneratedSql = result?.sql || '-- No SQL generated';
    } catch (e: any) {
      this.cubesReuseGeneratedSql = '-- Error: ' + (e?.message || 'Failed to generate SQL');
    } finally {
      this.cubesReuseSqlLoading = false;
    }
  }

  copyCubesReuseSqlToClipboard() {
    this._copyToClipboard(this.cubesReuseGeneratedSql, 'SQL');
  }

  closeCubesReuseSqlModal() {
    this.isCubesReuseSqlModalVisible = false;
  }

  closeCubesReuseModal() {
    this.isCubesReuseSqlModalVisible = false;
    this.isCubesReuseModalVisible = false;
  }

  /** Compute skiplines from header value and write back to the options object. */
  private handleHeaderSkipLines(opts: any): void {
    opts.skiplines = opts.header === 'multiline' ? 2 : opts.header === 'firstline' ? 1 : 0;
  }

  onSelectCsvHeader() {
    this.handleHeaderSkipLines((this.xmlReporting as any).documentburster.report.datasource.csvoptions);
  }

  onSelectFixedWidthHeader() {
    this.handleHeaderSkipLines((this.xmlReporting as any).documentburster.report.datasource.fixedwidthoptions);
  }

  onSelectExcelHeader() {
    this.handleHeaderSkipLines((this.xmlReporting as any).documentburster.report.datasource.exceloptions);
  }

  toggleShowMoreCsvOptions() {
    this.xmlReporting.documentburster.report.datasource.showmorecsvoptions =
      !this.xmlReporting.documentburster.report.datasource.showmorecsvoptions;
    //this.changeDetectorRef.detectChanges();
  }

  onSelectTemplateFileChanged(event: any) {
    if (event)
      this.xmlReporting.documentburster.report.template.documentpath =
        event.filePath;
    else this.xmlReporting.documentburster.report.template.documentpath = '';

    this.markSettingsDirty(event);
  }

  // Add these methods
  toggleHtmlPreview() {
    const outputType =
      this.xmlReporting?.documentburster?.report?.template?.outputtype;

    if (['output.html', 'output.dashboard', 'output.pdf', 'output.xlsx'].includes(outputType)) {
      this.reportPreviewVisible = !this.reportPreviewVisible;
      if (this.reportPreviewVisible) this.refreshHtmlPreview();
    }
  }

  refreshHtmlPreview() {

    let htmlContent = this.activeReportTemplateContent;

    // For dashboard templates, inject the web components bundle so
    // <rb-tabulator>, <rb-chart>, <rb-pivot-table>, <rb-parameters> self-initialize
    if (this.xmlReporting?.documentburster?.report?.template?.outputtype === 'output.dashboard'
        && htmlContent
        && (htmlContent.includes('<rb-tabulator') || htmlContent.includes('<rb-chart')
            || htmlContent.includes('<rb-pivot-table') || htmlContent.includes('<rb-parameters'))) {
      const wcBaseUrl = this.getWebComponentsBaseUrl();
      const scriptTag = `<script src="${wcBaseUrl}/rb-webcomponents.umd.js"><\/script>`;
      if (htmlContent.includes('</body>')) {
        htmlContent = htmlContent.replace('</body>', scriptTag + '</body>');
      } else {
        htmlContent = htmlContent + scriptTag;
      }
    }

    this.sanitizedReportPreview = this.sanitizer.bypassSecurityTrustHtml(
      htmlContent,
    );

  }


  async saveTemplateAndRefreshPreview(event: any) {

    if (!this.autosaveEnabled) return;

    // Skip if no meaningful content — editor fires (update) on initialization during navigation
    if (!event || (typeof event === 'string' && event.trim().length === 0)) return;

    // Get content from event or active property, ensuring we have something to work with
    this.activeReportTemplateContent = typeof event === 'string' ? event : this.activeReportTemplateContent;

    // Get current output type and template information
    const outputType =
      this.xmlReporting.documentburster.report.template.outputtype.replace(
        'output.',
        '',
      );

    // Update preview if visible
    if (
      this.reportPreviewVisible &&
      ['html', 'dashboard', 'pdf', 'xlsx'].includes(outputType)
    ) {
      this.refreshHtmlPreview();
      this.changeDetectorRef.detectChanges();
    }


    const currentPath = this.xmlReporting.documentburster.report.template.documentpath;
    const isSamplePath =
      currentPath &&
      (currentPath.includes('/samples/') ||
        currentPath.startsWith('samples/') ||
        currentPath.includes('\\samples\\') ||
        currentPath.startsWith('samples\\'));

    if (isSamplePath) return;

    // Wrapped JasperReports (from reports-jasper/) — editor is read-only, nothing to save
    if (outputType === 'jasper' && currentPath && currentPath.includes('reports-jasper')) return;

    try {
      // Save template content — backend resolves the per-output-type path
      // and updates reporting.xml's documentpath as a side effect.
      // Backend returns the new documentpath so we can sync our in-memory copy.
      const result = await this.reportsService.saveReportTemplateByType(
        this.currentReportId,
        outputType,
        this.activeReportTemplateContent,
      );

      // Sync in-memory documentpath so the debounced settingsChanged autosave
      // (which writes reporting.xml) doesn't overwrite the backend's update with stale data.
      if (result?.documentpath) {
        this.xmlReporting.documentburster.report.template.documentpath = result.documentpath;
      }

      // Update absolute path for display
      await this.loadAbsoluteTemplatePath();

      // Notification only for significant changes to avoid too many toasts
      if (event && typeof event === 'string' && event.length > 10) {
        this.messagesService.showInfo('Template saved successfully');
      }
    } catch (error) {
      this.messagesService.showError('Error saving template');
    }
  }

  openTemplateInBrowser(template?, templatePath?: string) {

    //alert(templatePath);

    // Case 1: Direct path provided (from editor "View in Browser" button)
    if (templatePath) {
      const url = `${this.apiService.BACKEND_URL}/reports/preview-template?path=${encodeURIComponent(templatePath)}`;
      window.open(url, '_blank');
      return;
    }

    // Case 2: Template object provided (from template gallery)
    if (!template) return;

    // Get the template path from the template object
    const currentVariantIndex = template.currentVariantIndex || 0;
    const templateObjectPath =
      template.templateFilePaths?.[currentVariantIndex];

    if (!templateObjectPath) {
      this.messagesService.showError(
        'Cannot view template: Missing template path',
      );
      return;
    }

    const url = `${this.apiService.BACKEND_URL}/reports/preview-template?path=${encodeURIComponent(templateObjectPath)}`;
    window.open(url, '_blank');
  }

  @ViewChild(AiManagerComponent) private aiManagerInstance!: AiManagerComponent;

  async askAiForHelp(outputTypeCode: string) {
    const launchConfig = this.buildAiLaunchConfig(outputTypeCode);
    if (launchConfig && this.aiManagerInstance) {
      this.aiManagerInstance.launchWithConfiguration(launchConfig);
    }
  }

  /**
   * Build AI launch configuration for a given output type code.
   * Maps each code to its category, prompt ID, and data enrichment strategy.
   */
  private buildAiLaunchConfig(code: string): AiManagerLaunchConfig | null {
    // Catalog: outputTypeCode → { category, promptId, enrichment }
    const AI_PROMPT_CATALOG: Record<string, {
      category: string;
      promptId?: string;
      enrich?: 'columnData' | 'dsl' | 'dashboard' | 'script' | 'scriptDashboard' | 'reportParams' | 'none';
    }> = {
      'output.pdf':       { category: 'PDF Generation (from HTML)',     promptId: 'PDF_HTML_TEMPLATE_GENERATOR',               enrich: 'columnData' },
      'output.xlsx':      { category: 'Excel Report Generation',       promptId: 'EXCEL_TEMPLATE_GENERATOR',                  enrich: 'columnData' },
      'output.jasper':    { category: 'JasperReports (.jrxml) Generation', promptId: 'JASPER_JRXML_TEMPLATE_GENERATOR',        enrich: 'columnData' },
      'output.fop2pdf':   { category: 'PDF Generation (from XSL-FO)',  promptId: 'PDF_SAMPLE_A4_PAYSLIP_XSLFO',              enrich: 'columnData' },
      'output.html':      { category: 'Template Creation/Modification', promptId: 'BUILD_TEMPLATE_FROM_SCRATCH',              enrich: 'none' },
      'output.dashboard': { category: 'Dashboard Creation',            promptId: 'DASHBOARD_BUILD_LAYOUT',                    enrich: 'dashboard' },
      'output.any':       { category: 'Template Creation/Modification',                                                       enrich: 'none' },
      'output.docx':      { category: 'Template Creation/Modification',                                                       enrich: 'none' },
      'email.message':    { category: 'Email Templates (Responsive)',                                                         enrich: 'none' },
      'script.additionaltransformation': { category: 'Script Writing Assistance', promptId: 'GROOVY_SCRIPT_ADDITIONAL_TRANSFORMATION', enrich: 'none' },
      'script.ds':        { category: 'Script Writing Assistance',     promptId: 'GROOVY_SCRIPT_INPUT_SOURCE',                enrich: 'script' },
      'script.ds.dashboard': { category: 'Dashboard Creation',        promptId: 'DASHBOARD_BUILD_STEP_BY_STEP_INSTRUCTIONS', enrich: 'scriptDashboard' },
      'cms.webportal':    { category: 'Web Portal / CMS',                                                                    enrich: 'none' },
      'dsl.reportparams': { category: 'DSL Configuration',            promptId: 'REPORT_PARAMS_DSL_CONFIGURE',               enrich: 'reportParams' },
      'dsl.tabulator':    { category: 'DSL Configuration',            promptId: 'TABULATOR_DSL_CONFIGURE',                   enrich: 'dsl' },
      'dsl.chart':        { category: 'DSL Configuration',            promptId: 'CHART_DSL_CONFIGURE',                       enrich: 'dsl' },
      'dsl.pivottable':   { category: 'DSL Configuration',            promptId: 'PIVOT_TABLE_DSL_CONFIGURE',                 enrich: 'dsl' },
    };

    const entry = AI_PROMPT_CATALOG[code];
    if (!entry) return null;

    const config: AiManagerLaunchConfig = {
      initialActiveTabKey: 'PROMPTS',
      initialSelectedCategory: entry.category,
      initialExpandedPromptId: entry.promptId,
    };

    // Enrich with context data based on the enrichment strategy
    switch (entry.enrich) {
      case 'columnData':
        this.enrichWithColumnData(config);
        this._populateScriptVariable(config);
        break;
      case 'dashboard':
        this.enrichWithDashboardContext(config);
        this._populateScriptVariable(config);
        break;
      case 'script':
        this.enrichWithDbVendor(config);
        break;
      case 'scriptDashboard':
        this.enrichWithDbVendor(config);
        config.promptVariables = {
          ...config.promptVariables,
          '[REPORT_CODE]': this.getCurrentReportCode(),
          '[API_BASE_URL]': this.getApiBaseUrl() + '/reporting',
        };
        break;
      case 'reportParams':
        if (this.xmlReporting?.documentburster?.report?.datasource?.type !== 'ds.dashboard') {
          this.enrichWithColumnData(config);
        }
        this._populateScriptVariable(config);
        break;
      case 'dsl':
        this._populateDslPromptVariables(config);
        break;
    }

    return config;
  }

  private enrichWithColumnData(config: AiManagerLaunchConfig) {
    if (this.reportDataResult?.reportColumnNames?.length) {
      config.promptVariables = {
        ...config.promptVariables,
        '[INSERT COLUMN NAMES HERE]': this.reportDataResult.reportColumnNames.join(', '),
      };
      if (this.reportDataResult.data?.length) {
        config.promptVariables['[INSERT SAMPLE DATA HERE]'] =
          JSON.stringify(this.reportDataResult.data.slice(0, 5), null, 2);
      }
    }
  }

  private enrichWithDashboardContext(config: AiManagerLaunchConfig) {
    const componentsInfo = this._generateDashboardComponentsMarkup();
    if (componentsInfo) {
      config.promptVariables = {
        '[AVAILABLE_COMPONENTS]': componentsInfo,
        '[REPORT_CODE]': this.getCurrentReportCode(),
        '[API_BASE_URL]': this.getApiBaseUrl() + '/reporting',
      };
    }
  }

  private enrichWithDbVendor(config: AiManagerLaunchConfig) {
    const selectedConn = this.getSelectedDbConnection();
    const dbVendor = selectedConn?.dbserver?.type || '';
    config.promptVariables = {
      ...config.promptVariables,
      '[DATABASE_VENDOR]': dbVendor,
      '[INSERT THE RELEVANT DATABASE SCHEMA HERE]': '',
    };
  }

  private _populateScriptVariable(launchConfig: AiManagerLaunchConfig): void {
    const dsType = this.xmlReporting?.documentburster?.report?.datasource?.type;
    let scriptContent: string | undefined;

    if ((dsType === 'ds.scriptfile' || dsType === 'ds.dashboard') && this.activeDatasourceScriptGroovy?.trim()) {
      scriptContent = this.activeDatasourceScriptGroovy;
    } else if (dsType === 'ds.sqlquery') {
      const sqlQuery = this.xmlReporting?.documentburster?.report?.datasource?.sqloptions?.query;
      if (sqlQuery?.trim()) {
        scriptContent = sqlQuery;
      }
    }

    if (scriptContent) {
      if (!launchConfig.promptVariables) {
        launchConfig.promptVariables = {};
      }
      launchConfig.promptVariables['[INSERT SCRIPT HERE]'] = scriptContent;
    }
  }

  private _populateDslPromptVariables(launchConfig: AiManagerLaunchConfig): void {
    const isDashboard = this.xmlReporting?.documentburster?.report?.datasource?.type === 'ds.dashboard';

    launchConfig.promptVariables = {
      '[INSERT COLUMN NAMES HERE]': 'INFORMATION_NOT_AVAILABLE',
      '[INSERT SAMPLE DATA HERE]': 'INFORMATION_NOT_AVAILABLE',
    };

    if (!isDashboard && this.reportDataResult?.reportColumnNames?.length) {
      launchConfig.promptVariables['[INSERT COLUMN NAMES HERE]'] = this.reportDataResult.reportColumnNames.join(', ');
      if (this.reportDataResult.data?.length) {
        const sampleRows = this.reportDataResult.data.slice(0, 5);
        launchConfig.promptVariables['[INSERT SAMPLE DATA HERE]'] = JSON.stringify(sampleRows, null, 2);
      }
    }

    this._populateScriptVariable(launchConfig);
  }

  private _generateDashboardComponentsMarkup(): string {
    const reportId = this.getCurrentReportCode();
    const apiBaseUrl = this.getApiBaseUrl();
    const apiKey = this.getApiKeyForUsage();
    const parts: string[] = [];

    // Data Tables
    const namedTabIds = this.getNamedTabulatorIds();
    if (namedTabIds.length > 0) {
      parts.push(`## Data Tables (${namedTabIds.length} named components)\n`);
      for (const cid of namedTabIds) {
        parts.push(`\`\`\`html\n<rb-tabulator\n  report-id="${reportId}"\n  component-id="${cid}"\n  api-base-url="${apiBaseUrl}"\n  api-key="${apiKey}">\n</rb-tabulator>\n\`\`\`\n`);
      }
    } else if (this.activeTabulatorConfigScriptGroovy?.trim()) {
      parts.push(`## Data Table\n\n\`\`\`html\n<rb-tabulator\n  report-id="${reportId}"\n  api-base-url="${apiBaseUrl}"\n  api-key="${apiKey}">\n</rb-tabulator>\n\`\`\`\n`);
    }

    // Charts
    const namedChartIds = this.getNamedChartIds();
    if (namedChartIds.length > 0) {
      parts.push(`## Charts (${namedChartIds.length} named components)\n`);
      for (const cid of namedChartIds) {
        parts.push(`\`\`\`html\n<rb-chart\n  report-id="${reportId}"\n  component-id="${cid}"\n  api-base-url="${apiBaseUrl}"\n  api-key="${apiKey}">\n</rb-chart>\n\`\`\`\n`);
      }
    } else if (this.activeChartConfigScriptGroovy?.trim()) {
      parts.push(`## Chart\n\n\`\`\`html\n<rb-chart\n  report-id="${reportId}"\n  api-base-url="${apiBaseUrl}"\n  api-key="${apiKey}">\n</rb-chart>\n\`\`\`\n`);
    }

    // Pivot Tables
    const namedPivotIds = this.getNamedPivotIds();
    if (namedPivotIds.length > 0) {
      parts.push(`## Pivot Tables (${namedPivotIds.length} named components)\n`);
      for (const cid of namedPivotIds) {
        parts.push(`\`\`\`html\n<rb-pivot-table\n  report-id="${reportId}"\n  component-id="${cid}"\n  api-base-url="${apiBaseUrl}"\n  api-key="${apiKey}">\n</rb-pivot-table>\n\`\`\`\n`);
      }
    } else if (this.activePivotTableConfigScriptGroovy?.trim()) {
      parts.push(`## Pivot Table\n\n\`\`\`html\n<rb-pivot-table\n  report-id="${reportId}"\n  api-base-url="${apiBaseUrl}"\n  api-key="${apiKey}">\n</rb-pivot-table>\n\`\`\`\n`);
    }

    // Parameters
    if (this.activeParamsSpecScriptGroovy?.trim()) {
      parts.push(`## Parameters Form\n\nPlace this once in the dashboard. When the user submits, all visualization components automatically refresh with the new parameter values.\n\n\`\`\`html\n<rb-parameters\n  report-id="${reportId}"\n  api-base-url="${apiBaseUrl}"\n  api-key="${apiKey}">\n</rb-parameters>\n\`\`\`\n`);
    }

    // Atomic Values (always available for dashboards)
    parts.push(`## Atomic Values\n\nFor single values (totals, counts, averages), use \`<rb-value>\` instead of a full data table. Multiple elements with the same \`component-id\` share one cached HTTP request — each picks its column via \`field\`.\n\n\`\`\`html\n<rb-value\n  report-id="${reportId}"\n  component-id="atomicValues"\n  field="revenue"\n  format="currency"\n  api-base-url="${apiBaseUrl}"\n  api-key="${apiKey}">\n</rb-value>\n\`\`\`\n\nSupported \`format\` values: \`currency\`, \`number\`, \`percent\`, \`date\`, or omit for raw value.\n`);

    if (parts.length === 0) {
      return `No visualization components are configured yet. Configure at least one data table, chart, or pivot table in the DSL tabs first, then come back here.`;
    }

    return parts.join('\n');
  }

  absoluteTemplateFolderPath: string = '';

  getTemplateRelativeFolderPath(): string {
    const relativePath =
      this.xmlReporting?.documentburster.report.template.documentpath;
    if (!relativePath) return '';

    // Extract the directory part only by removing the file name
    const lastSlashIndex = relativePath.lastIndexOf('/');
    if (lastSlashIndex === -1) return relativePath; // No slashes found

    // Return just the folder path
    return relativePath.substring(0, lastSlashIndex);
  }

  async loadAbsoluteTemplatePath(): Promise<void> {
    const relativePath = this.getTemplateRelativeFolderPath();
    if (!relativePath) {
      this.absoluteTemplateFolderPath = '';
      return;
    }

    this.absoluteTemplateFolderPath =
      await this.fsService.resolveAbsolutePath(relativePath);

    this.absoluteTemplateFolderPath = Utilities.slash(
      this.absoluteTemplateFolderPath,
    );

    //console.log(
    //  `relativePath = ${relativePath}, absolutePath = ${this.absoluteTemplateFolderPath}`,
    //);
  }

  async copyTemplatePathToClipboard(): Promise<void> {
    await this._copyToClipboard(this.absoluteTemplateFolderPath, 'Folder path');
  }



  // After the other methods in your component
  highlightHtmlCode = (editor: CodeJarContainer) => {
    if (!editor) return;
    const code = this.getRawCode(editor);
    if (!code) return;

    editor.style.whiteSpace = 'pre-wrap';
    try {
      // note: use `markup` not `html`
      const highlighted = Prism.highlight(
        code,
        Prism.languages.markup,
        'markup',
      );
      editor.innerHTML = highlighted;
    } catch (e) {
      console.error('Error during HTML highlighting:', e);
      editor.innerHTML = code;
    }
  };

  highlightFreeMarkerCode = (editor: CodeJarContainer) => {
    if (!editor) return;
    const code = this.getRawCode(editor);
    if (!code) return;

    editor.style.whiteSpace = 'pre-wrap';
    try {
      // Use markup (HTML/XML) highlighting for FreeMarker templates
      const highlighted = Prism.highlight(
        code,
        Prism.languages.markup,
        'markup'
      );
      editor.innerHTML = highlighted;
    } catch (e) {
      editor.innerHTML = code;
      console.error('Error during FreeMarker (markup) highlighting:', e);
    }
  };

  highlightXmlCode = (editor: CodeJarContainer) => {
    if (!editor) return;
    const code = this.getRawCode(editor);
    editor.style.whiteSpace = 'pre-wrap';
    try {
      const highlighted = Prism.highlight(code, Prism.languages.xml, 'xml');
      editor.innerHTML = highlighted;
    } catch (e) {
      editor.innerHTML = code;
    }
  };

  //DBCONNECTIONS START
  @ViewChild('connectionDetailsModal')
  connectionDetailsModalInstance!: ConnectionDetailsComponent;

  getSelectedDbConnection(): ExtConnection | undefined {
    const selectedDbConnectionCode = this.selectedDbConnCode;
    if (!selectedDbConnectionCode) {
      // No connection code is selected in the model
      return undefined;
    }
    // getDatabaseConnectionFiles() should return an array of ExtConnection objects
    const databaseConnections =
      this.settingsService.getDatabaseConnectionFiles();
    return databaseConnections.find(
      (conn) => conn.connectionCode === selectedDbConnectionCode,
    );
  }

  async showDbConnectionModal(context: 'sqlQuery' | 'scriptQuery' | 'dashboardScript' = 'sqlQuery') {
    //console.log('ConfigurationConnectionsComponet: showCrudModal()');
    this.connectionDetailsModalInstance.context = context;
    if (context === 'dashboardScript') {
      this.connectionDetailsModalInstance.reportId = this.getCurrentReportCode();
      this.connectionDetailsModalInstance.apiBaseUrl = this.getApiBaseUrl() + '/reporting';
    }
    this.connectionDetailsModalInstance.showCrudModal(
      'update',
      'database-connection',
      false,
      this.getSelectedDbConnection(),
    );
  }
  //DBCONNECTIONS END

  get isOutputTypeLocked(): boolean {
    return this.xmlReporting?.documentburster?.report?.datasource?.type === 'ds.dashboard';
  }

  getAiHelpButtonLabel(outputType: string): string {
    if (outputType === 'output.jasper') {
      return 'Hey AI, Help Me Build This Jasper Template!';
    }
    return `Hey AI, Help Me Build This ${outputType.replace('output.', '').toUpperCase()} Template!`;
  }

  exampleParamsSpecScript = `
import java.time.LocalDate
import java.time.LocalDateTime

reportParameters {
  // Core date range parameters with constraints
  parameter(
    id:           'startDate',
    type:         LocalDate,
    label:        'Start Date',
    description:  'Report start date',
    defaultValue: LocalDate.now().minusDays(30)
  ) {
    constraints(
      required: true,
      min:      LocalDate.now().minusDays(365),
      max:      endDate
    )
    ui(
      control: 'date',
      format:  'yyyy-MM-dd'
    )
  }

  parameter(
    id:           'endDate',
    type:         LocalDate,
    label:        'End Date',
    defaultValue: LocalDate.now()
  ) {
    constraints(
      required: true,
      min:      startDate,
      max:      LocalDate.now()
    )
    ui(
      control: 'date',
      format:  'yyyy-MM-dd'
    )
  }

  parameter(
    id:    'customerId',
    type:  String,
    label: 'Customer ID'
  ) {
    constraints(
      required:  true,
      maxLength: 10,
      pattern:   '[A-Z0-9]+'
    )
  }

  parameter(
    id:    'customer',
    type:  String,
    label: 'Customer'
  ) {
    constraints(required: true)
    ui(
      control: 'select',
      options: "SELECT id, name FROM customers WHERE status = 'active'"
    )
  }

  parameter(
    id:           'maxRecords',
    type:         Integer,
    label:        'Max Records',
    defaultValue: 100
  ) {
    constraints(min: 1, max: 1000)
  }

  parameter(
    id:           'includeInactive',
    type:         Boolean,
    label:        'Include Inactive',
    defaultValue: false
  )

  parameter(
    id:           'processingTime',
    type:         LocalDateTime,
    label:        'Processing Time',
    defaultValue: LocalDateTime.now()
  ) {
    ui(
      control: 'datetime',
      format:  "yyyy-MM-dd'T'HH:mm:ss"
    )
  }
}

if (reportParametersProvided) {
  log.info("--- Report Parameter Values ---")
  log.info("startDate          : \${startDate ?: 'NOT_SET'}")
  log.info("endDate            : \${endDate   ?: 'NOT_SET'}")
  log.info("customer           : \${customer ?: 'NOT_SET'}")
  log.info("maxRecords         : \${maxRecords ?: 'NOT_SET'}")
  log.info("includeInactive    : \${includeInactive ?: 'false'}")
  log.info("processingTime     : \${processingTime ?: 'NOT_SET'}")
}
`;

  exampleTabulatorConfigScript = `/*
 Tabulator Groovy DSL — minimal wrapper over tabulator.info API
 All options map 1:1 to tabulator.info — no invented concepts.
 Docs: https://tabulator.info/docs/6.3
 Data comes from ctx.reportData by default — no need to specify it.
*/

tabulator {
  // ─────────────────────────────────────────────────────────────────────────────
  // TABLE-LEVEL OPTIONS — flat, exactly as in tabulator.info
  // Any tabulator.info option works here: layout, height, pagination, etc.
  // ─────────────────────────────────────────────────────────────────────────────
  layout "fitColumns"       // fitData|fitDataFill|fitDataStretch|fitDataTable|fitColumns
  height "400px"            // table height (px, %, or number)
  width "100%"              // table width
  autoColumns false         // true = auto-generate columns from data
  renderVertical "virtual"  // virtual|basic - virtual DOM rendering
  renderHorizontal "basic"  // virtual|basic - horizontal rendering
  layoutColumnsOnNewData true  // recalc column widths on new data

  // Pagination (all tabulator.info pagination options supported)
  // pagination true
  // paginationSize 20
  // paginationMode "local"  // "local" (default) or "remote" for server-side

  // Server-side options (when working with large datasets)
  // filterMode "local"      // "local" (default) or "remote" for server-side filtering
  // sortMode "local"        // "local" (default) or "remote" for server-side sorting

  // ─────────────────────────────────────────────────────────────────────────────
  // COLUMN DEFINITIONS — mirrors tabulator.info column definition API
  // Any tabulator.info column property works here.
  // ─────────────────────────────────────────────────────────────────────────────
  columns {
    // Full-featured column example
    column {
      // Required
      title "Name"
      field "name"

      // Alignment: hozAlign (left|center|right), vertAlign (top|middle|bottom)
      hozAlign "left"
      vertAlign "middle"
      headerHozAlign "center"  // header text alignment

      // Width: width, minWidth, maxWidth (px or number)
      width 200
      minWidth 100
      maxWidth 400
      widthGrow 1              // flex grow factor
      widthShrink 1            // flex shrink factor

      // Visibility & Layout
      visible true             // false to hide column
      frozen false             // true to freeze column (left/right)
      responsive 0             // responsive priority (lower = hidden first)
      resizable true           // user can resize column

      // Sorting: sorter (string|number|alphanum|boolean|exists|date|time|datetime|array)
      sorter "string"
      sorterParams([])         // sorter-specific params
      headerSort true          // enable header click sorting

      // Filtering
      headerFilter "input"     // input|number|list|textarea|tick|star|select|autocomplete
      headerFilterParams([values: ["A", "B", "C"]])  // filter-specific params
      headerFilterPlaceholder "Search..."

      // Formatting: formatter (plaintext|textarea|html|money|image|link|datetime|tickCross|star|progress|etc)
      formatter "plaintext"
      formatterParams([:])     // formatter-specific params
      cssClass "my-class"      // custom CSS class
      tooltip true             // show cell tooltip

      // Editing: editor (input|textarea|number|range|tick|star|select|autocomplete|date|time|datetime)
      editor "input"
      editorParams([:])        // editor-specific params
      editable true            // cell is editable
      validator "required"     // required|unique|integer|float|numeric|string|min|max|etc

      // Header customization
      headerTooltip "Column description"
      headerVertical false     // rotate header text
    }

    // Compact shorthand examples
    column { title "Age"; field "age"; hozAlign "right"; sorter "number"; formatter "number" }
    column { title "Status"; field "status"; headerFilter "list"; headerFilterParams([values: ["Active", "Pending"]]) }
    column { title "Amount"; field "amount"; formatter "money"; width 120 }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OPTIONAL: Data override (90% of the time you don't need this)
  // By default, data comes from ctx.reportData. Uncomment to use custom data:
  // ─────────────────────────────────────────────────────────────────────────────
  // data ctx.reportData                                    // explicit default
  // data ctx.reportData.findAll { it.status == 'Active' }  // filtered
  // data ctx.reportData.take(100)                          // first 100 rows
  // data ctx.reportData.collect { it + [computed: it.a + it.b] }  // with computed column
}
`;
  // Example Chart configuration Groovy DSL
  exampleChartConfigScript = `/*
 Chart Groovy DSL - aligned 1:1 with Chart.js
 Docs: https://www.chartjs.org/docs/latest/configuration/
 Data comes from ctx.reportData by default - no need to specify it

 Only TWO properties are DSL-specific: labelField and field.
 Everything else is verbatim Chart.js vocabulary.
*/

chart {
  // ─────────────────────────────────────────────────────────────────────────────
  // CHART TYPE
  // ─────────────────────────────────────────────────────────────────────────────
  // Types: line, bar, pie, doughnut, radar, polarArea, scatter, bubble
  type 'bar'

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA - mirrors Chart.js data { labels, datasets } structure
  // ─────────────────────────────────────────────────────────────────────────────
  data {
    labelField 'region'               // DSL-only: which reportData column → X-axis labels

    datasets {
      // Full-featured dataset example
      dataset {
        // Core DSL property
        field 'revenue'               // DSL-only: which reportData column → dataset values

        // All other properties are native Chart.js dataset properties (passthrough via catch-all)
        label 'Revenue'               // legend label
        backgroundColor 'rgba(78, 121, 167, 0.5)'  // fill color (can use rgba)
        borderColor '#4e79a7'         // line/border color
        type 'bar'                    // override chart type for this dataset (mixed charts)

        // Axis assignment (for multiple axes)
        yAxisID 'y'                   // which Y axis to use
        xAxisID 'x'                   // which X axis to use

        // Line/Area chart options
        borderWidth 2                 // line thickness
        fill false                    // fill area under line (true|false|'origin'|'start'|'end')
        tension 0.4                   // line curve tension (0 = straight, 1 = very curved)
        pointRadius 4                 // data point size
        pointStyle 'circle'           // circle|cross|crossRot|dash|line|rect|rectRounded|rectRot|star|triangle

        // Display options
        hidden false                  // hide dataset initially
        order 0                       // drawing order (lower = drawn first)
      }

      // Compact shorthand examples (all properties are native Chart.js)
      dataset field: 'sales', label: 'Sales', backgroundColor: '#4e79a7', borderColor: '#4e79a7'
      dataset field: 'profit', label: 'Profit', backgroundColor: '#e15759', borderColor: '#e15759', type: 'line'
      dataset field: 'cost', label: 'Cost', backgroundColor: '#59a14f', borderColor: '#59a14f', fill: true, tension: 0.3
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CHART.JS OPTIONS - full passthrough to Chart.js configuration
  // ─────────────────────────────────────────────────────────────────────────────
  options {
    responsive true
    maintainAspectRatio true

    plugins {
      title { display true; text 'Sales by Region' }
      legend { position 'bottom' }    // top|bottom|left|right
      tooltip { enabled true }
      datalabels { display false }    // requires chartjs-plugin-datalabels
    }

    scales {
      y {
        beginAtZero true
        title { display true; text 'Value' }
        // For secondary axis: y2 { position 'right'; beginAtZero true }
      }
      x {
        title { display true; text 'Region' }
      }
    }

    // Animation
    animation { duration 1000 }
  }
}
`;

  // Example Pivot Table configuration Groovy DSL
  examplePivotTableConfigScript = `/*
 Pivot Table Groovy DSL
 Docs: https://datapallas.com/docs/bi-analytics/web-components/pivottables
 Data comes from ctx.reportData by default - no need to specify it
*/

pivotTable {
  // ─────────────────────────────────────────────────────────────────────────────
  // ROW FIELDS - which columns to use as row headers (group by)
  // ─────────────────────────────────────────────────────────────────────────────
  rows 'region', 'country'
  
  // ─────────────────────────────────────────────────────────────────────────────
  // COLUMN FIELDS - which columns to pivot across horizontally
  // ─────────────────────────────────────────────────────────────────────────────
  cols 'year', 'quarter'
  
  // ─────────────────────────────────────────────────────────────────────────────
  // VALUE FIELDS - which columns to aggregate
  // ─────────────────────────────────────────────────────────────────────────────
  vals 'revenue'
  
  // ─────────────────────────────────────────────────────────────────────────────
  // AGGREGATOR - how to combine values
  // ─────────────────────────────────────────────────────────────────────────────
  // Available aggregators:
  // Count, Count Unique Values, List Unique Values, Sum, Integer Sum, Average, Median,
  // Sample Variance, Sample Standard Deviation, Minimum, Maximum, First, Last,
  // Sum over Sum, Sum as Fraction of Total, Sum as Fraction of Rows, Sum as Fraction of Columns,
  // Count as Fraction of Total, Count as Fraction of Rows, Count as Fraction of Columns
  aggregatorName 'Sum'
  
  // ─────────────────────────────────────────────────────────────────────────────
  // RENDERER - how to display the pivot table
  // ─────────────────────────────────────────────────────────────────────────────
  // Available renderers:
  // Table, Table Heatmap, Table Col Heatmap, Table Row Heatmap, Exportable TSV
  // (Plotly renderers if available: Grouped Column Chart, Stacked Column Chart, etc.)
  rendererName 'Table'
  
  // ─────────────────────────────────────────────────────────────────────────────
  // SORTING - row and column sort order
  // ─────────────────────────────────────────────────────────────────────────────
  // Options: key_a_to_z (alphabetical), value_a_to_z (by value ascending), value_z_to_a (by value descending)
  rowOrder 'key_a_to_z'
  colOrder 'key_a_to_z'
  
  // ─────────────────────────────────────────────────────────────────────────────
  // VALUE FILTER - exclude specific values from the pivot
  // ─────────────────────────────────────────────────────────────────────────────
  valueFilter {
    // Exclude specific values from a column
    // filter 'status', exclude: ['Inactive', 'Pending']
    // filter 'region', exclude: ['Unknown']
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // DERIVED ATTRIBUTES - compute new fields from existing data
  // ─────────────────────────────────────────────────────────────────────────────
  // derivedAttributes {
  //   'Fiscal Quarter' 'dateFormat(orderDate, "%Y-Q%q")'   // 2024-Q3
  //   'Year'           'dateFormat(orderDate, "%Y")'        // 2024
  //   'Month'          'dateFormat(orderDate, "%Y-%m")'     // 2024-07
  // }

  // ─────────────────────────────────────────────────────────────────────────────
  // CUSTOM SORTERS - control the display order of dimension values
  // ─────────────────────────────────────────────────────────────────────────────
  // sorters {
  //   sorter 'priority', order: ['Critical', 'High', 'Medium', 'Low']
  //   sorter 'region',   order: ['West', 'Central', 'East']
  // }

  // ─────────────────────────────────────────────────────────────────────────────
  // FIELD VISIBILITY - control which fields appear in the UI
  // ─────────────────────────────────────────────────────────────────────────────
  // hiddenAttributes 'id', 'internal_code'          // hide from everywhere
  // hiddenFromAggregators 'name', 'description'     // hide from value dropdown
  // hiddenFromDragDrop 'total'                      // hide from drag areas

  // ─────────────────────────────────────────────────────────────────────────────
  // OPTIONS - additional pivot table options
  // ─────────────────────────────────────────────────────────────────────────────
  options {
    menuLimit 500                // max values to show in filter dropdowns
    // unusedOrientationCutoff 85  // layout threshold: horizontal if fewer chars
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OPTIONAL: Data override (90% of the time you don't need this)
  // By default, data comes from ctx.reportData. Uncomment to use custom data:
  // ─────────────────────────────────────────────────────────────────────────────
  // data ctx.reportData                                    // explicit default
  // data ctx.reportData.findAll { it.status == 'Active' }  // filtered
  // data ctx.reportData.take(100)                          // first 100 rows
}
`;

  /** Build the file path for any DSL script file given its filename suffix. */
  private getDslScriptPath(suffix: string): string {
    const basePath = this.getCurrentConfigReportsPath();
    const configName = this.getCurrentConfigName();
    return basePath ? `${basePath}/${configName}-${suffix}.groovy` : '';
  }

  private async _copyToClipboard(snippet: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(snippet);
      this.messagesService.showInfo(`${label} copied to clipboard!`, 'Success');
    } catch (err) {
      console.error(`Failed to copy ${label}:`, err);
      this.messagesService.showInfo(`Failed to copy ${label}.`, 'Error');
    }
  }

  copyToClipboardParametersSpecExample() {
    if (this.exampleParamsSpecScript) this._copyToClipboard(this.exampleParamsSpecScript, 'Example parameters script');
  }

  copyToClipboardTabulatorConfigExample() {
    if (this.exampleTabulatorConfigScript) this._copyToClipboard(this.exampleTabulatorConfigScript, 'Example Tabulator config script');
  }

  copyToClipboardChartConfigExample() {
    if (this.exampleChartConfigScript) this._copyToClipboard(this.exampleChartConfigScript, 'Example Chart config script');
  }

  copyToClipboardPivotTableConfigExample() {
    if (this.examplePivotTableConfigScript) this._copyToClipboard(this.examplePivotTableConfigScript, 'Example Pivot Table config script');
  }

  // ==========================================================================
  //  Usage examples
  // ==========================================================================

  isDashboardOutputType(): boolean {
    return this.xmlReporting?.documentburster?.report?.template?.outputtype === 'output.dashboard';
  }

  getCurrentReportCode(): string {
    return this.settingsService.currentConfigurationTemplate?.folderName || 'unknown_config';
  }

  getApiBaseUrl(): string {
    return this.stateStore.configSys.sysInfo.setup.BACKEND_URL || '/api';
  }

  getWebComponentsBaseUrl(): string {
    // Web components are served as static resources (not via /api)
    // URL is: http://server:port/rb-webcomponents/
    const backendUrl = this.stateStore.configSys.sysInfo.setup.BACKEND_URL || '/api';
    // Remove /api suffix if present to get the server base URL
    const serverBaseUrl = backendUrl.replace(/\/api$/, '');
    return serverBaseUrl + '/rb-webcomponents';
  }

  getApiKeyForUsage(): string {
    return this.apiService.getApiKey() || '';
  }

  /**
   * Convert index to letter suffix for sub-numbering: 0→'a', 1→'b', 2→'c', etc.
   * Used in the Usage tab for multi-component reports (e.g., "1a. Data Table — salesGrid").
   */
  getLetterSuffix(idx: number): string {
    return String.fromCharCode(97 + idx); // 97 = 'a'
  }

  getUsageParamsNumber(): number {
    return 2;
  }

  getUsageChartNumber(): number {
    let num = 2;
    if (this.activeParamsSpecScriptGroovy?.trim()) num++;
    return num;
  }

  getUsagePivotTableNumber(): number {
    let num = 2;
    if (this.activeParamsSpecScriptGroovy?.trim()) num++;
    if (this.activeChartConfigScriptGroovy?.trim()) num++;
    return num;
  }

  getUsageRbReportNumber(): number {
    let num = 2;
    if (this.activeParamsSpecScriptGroovy?.trim()) num++;
    if (this.activeChartConfigScriptGroovy?.trim()) num++;
    if (this.activePivotTableConfigScriptGroovy?.trim()) num++;
    return num;
  }

  getUsageScriptNumber(): number {
    return this.getUsageRbReportNumber() + 1;
  }

  /**
   * Check if the current report's SQL query or Groovy script uses entityCode parameter.
   * This indicates the report is designed for single-entity HTML document rendering.
   */
  hasEntityCodeParameter(): boolean {
    const dsType = this.xmlReporting?.documentburster?.report?.datasource?.type;
    
    if (dsType === 'ds.sqlquery') {
      const sqlQuery = this.xmlReporting?.documentburster?.report?.datasource?.sqloptions?.query || '';
      return sqlQuery.includes('entityCode') || sqlQuery.includes(':entityCode');
    }
    
    if (dsType === 'ds.scriptfile' || dsType === 'ds.dashboard') {
      const scriptContent = this.activeDatasourceScriptGroovy || '';
      return scriptContent.includes('entityCode');
    }

    return false;
  }

  /**
   * Get the entity-code attribute string for usage examples.
   * Returns empty string if entityCode is not used, otherwise returns the attribute with a placeholder.
   */
  getEntityCodeAttribute(): string {
    if (this.hasEntityCodeParameter()) {
      return ' entity-code="YOUR_ENTITY_CODE"';
    }
    return '';
  }

  getCompleteUsageExample(): string {
    const reportId = this.getCurrentReportCode();
    const apiBaseUrl = this.getApiBaseUrl();
    const apiKey = this.getApiKeyForUsage();
    const webComponentsBaseUrl = this.getWebComponentsBaseUrl();
    const entityCodeAttr = this.getEntityCodeAttribute();

    // Dashboard mode: simplified example with rb-dashboard only
    if (this.isDashboardOutputType()) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard: ${reportId}</title>
  <script src="${webComponentsBaseUrl}/rb-webcomponents.umd.js"><\/script>
</head>
<body>
  <h1>Dashboard: ${reportId}</h1>

  <!-- Dashboard -->
  <rb-dashboard
    report-id="${reportId}"
    api-base-url="${apiBaseUrl}"
    api-key="${apiKey}">
  </rb-dashboard>

</body>
</html>`;
    }

    const namedTabIds = this.getNamedTabulatorIds();
    const namedChartIds = this.getNamedChartIds();
    const namedPivotIds = this.getNamedPivotIds();

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Report: ${reportId}</title>
  <script src="${webComponentsBaseUrl}/rb-webcomponents.umd.js"><\/script>
</head>
<body>
  <h1>Report: ${reportId}</h1>

  <!-- Full Report -->
  <rb-report
    report-id="${reportId}"${entityCodeAttr}
    api-base-url="${apiBaseUrl}"
    api-key="${apiKey}">
  </rb-report>`;

    // Data Table(s)
    if (namedTabIds.length > 0) {
      for (const cid of namedTabIds) {
        html += `

  <!-- Data Table: ${cid} -->
  <rb-tabulator
    report-id="${reportId}"
    component-id="${cid}"
    api-base-url="${apiBaseUrl}"
    api-key="${apiKey}">
  </rb-tabulator>`;
      }
    } else {
      html += `

  <!-- Data Table -->
  <rb-tabulator
    report-id="${reportId}"
    api-base-url="${apiBaseUrl}"
    api-key="${apiKey}">
  </rb-tabulator>`;
    }

    if (this.activeParamsSpecScriptGroovy?.trim()) {
      html += `

  <!-- Report Parameters -->
  <rb-parameters
    report-id="${reportId}"
    api-base-url="${apiBaseUrl}"
    api-key="${apiKey}">
  </rb-parameters>`;
    }

    // Chart(s)
    if (namedChartIds.length > 0) {
      for (const cid of namedChartIds) {
        html += `

  <!-- Chart: ${cid} -->
  <rb-chart
    report-id="${reportId}"
    component-id="${cid}"
    api-base-url="${apiBaseUrl}"
    api-key="${apiKey}">
  </rb-chart>`;
      }
    } else if (this.activeChartConfigScriptGroovy?.trim()) {
      html += `

  <!-- Chart -->
  <rb-chart
    report-id="${reportId}"
    api-base-url="${apiBaseUrl}"
    api-key="${apiKey}">
  </rb-chart>`;
    }

    // Pivot Table(s)
    if (namedPivotIds.length > 0) {
      for (const cid of namedPivotIds) {
        html += `

  <!-- Pivot Table: ${cid} -->
  <rb-pivottable
    report-id="${reportId}"
    component-id="${cid}"
    api-base-url="${apiBaseUrl}"
    api-key="${apiKey}">
  </rb-pivottable>`;
      }
    } else if (this.activePivotTableConfigScriptGroovy?.trim()) {
      html += `

  <!-- Pivot Table -->
  <rb-pivottable
    report-id="${reportId}"
    api-base-url="${apiBaseUrl}"
    api-key="${apiKey}">
  </rb-pivottable>`;
    }

    html += `

</body>
</html>`;

    return html;
  }

  copyUsageScriptTag() {
    const scriptTag = `<script src="${this.getWebComponentsBaseUrl()}/rb-webcomponents.umd.js"><\/script>`;
    this._copyToClipboard(scriptTag, 'Script tag');
  }

  copyUsageRbReport() {
    const entityCodeAttr = this.getEntityCodeAttribute();
    const html = `<rb-report\n  report-id="${this.getCurrentReportCode()}"${entityCodeAttr}\n  api-base-url="${this.getApiBaseUrl()}"\n  api-key="${this.getApiKeyForUsage()}">\n</rb-report>`;
    this._copyToClipboard(html, 'rb-report snippet');
  }

  copyUsageRbDashboard() {
    const html = `<rb-dashboard\n  report-id="${this.getCurrentReportCode()}"\n  api-base-url="${this.getApiBaseUrl()}"\n  api-key="${this.getApiKeyForUsage()}">\n</rb-dashboard>`;
    this._copyToClipboard(html, 'rb-dashboard snippet');
  }

  getDashboardUrl(): string {
    const baseUrl = this.getApiBaseUrl();
    // Strip /api suffix to get server root, then append dashboard path
    const serverRoot = baseUrl.endsWith('/api') ? baseUrl.slice(0, -4) :
      baseUrl.includes('/api/') ? baseUrl.slice(0, baseUrl.indexOf('/api/')) : '';
    return `${serverRoot}/dashboard/${this.getCurrentReportCode()}`;
  }

  copyToClipboard(text: string) {
    this._copyToClipboard(text, 'Copied');
  }

  copyUsageRbTabulator() {
    const html = `<rb-tabulator\n  report-id="${this.getCurrentReportCode()}"\n  api-base-url="${this.getApiBaseUrl()}"\n  api-key="${this.getApiKeyForUsage()}">\n</rb-tabulator>`;
    this._copyToClipboard(html, 'rb-tabulator snippet');
  }

  copyUsageRbParameters() {
    const html = `<rb-parameters\n  report-id="${this.getCurrentReportCode()}"\n  api-base-url="${this.getApiBaseUrl()}"\n  api-key="${this.getApiKeyForUsage()}">\n</rb-parameters>`;
    this._copyToClipboard(html, 'rb-parameters snippet');
  }

  copyUsageRbChart() {
    const html = `<rb-chart\n  report-id="${this.getCurrentReportCode()}"\n  api-base-url="${this.getApiBaseUrl()}"\n  api-key="${this.getApiKeyForUsage()}">\n</rb-chart>`;
    this._copyToClipboard(html, 'rb-chart snippet');
  }

  copyUsageRbPivotTable() {
    const html = `<rb-pivottable\n  report-id="${this.getCurrentReportCode()}"\n  api-base-url="${this.getApiBaseUrl()}"\n  api-key="${this.getApiKeyForUsage()}">\n</rb-pivottable>`;
    this._copyToClipboard(html, 'rb-pivottable snippet');
  }

  copyUsageRbTabulatorNamed(componentId: string) {
    const html = `<rb-tabulator\n  report-id="${this.getCurrentReportCode()}"\n  component-id="${componentId}"\n  api-base-url="${this.getApiBaseUrl()}"\n  api-key="${this.getApiKeyForUsage()}">\n</rb-tabulator>`;
    this._copyToClipboard(html, `rb-tabulator (${componentId})`);
  }

  copyUsageRbChartNamed(componentId: string) {
    const html = `<rb-chart\n  report-id="${this.getCurrentReportCode()}"\n  component-id="${componentId}"\n  api-base-url="${this.getApiBaseUrl()}"\n  api-key="${this.getApiKeyForUsage()}">\n</rb-chart>`;
    this._copyToClipboard(html, `rb-chart (${componentId})`);
  }

  copyUsageRbPivotTableNamed(componentId: string) {
    const html = `<rb-pivottable\n  report-id="${this.getCurrentReportCode()}"\n  component-id="${componentId}"\n  api-base-url="${this.getApiBaseUrl()}"\n  api-key="${this.getApiKeyForUsage()}">\n</rb-pivottable>`;
    this._copyToClipboard(html, `rb-pivottable (${componentId})`);
  }

  copyUsageCompleteExample() {
    this._copyToClipboard(this.getCompleteUsageExample(), 'Complete example');
  }

  // ==========================================================================
  //  DSL script handlers
  // ==========================================================================

  async onParametersSpecChanged(event: string) {
    this.activeParamsSpecScriptGroovy = event;
    await this.saveExternalReportingScript('paramsSpecScript');
    this.markSettingsDirty(event);
  }
  async onTabulatorConfigChanged(event: string) {
    // Try to read the raw textContent from the underlying CodeJar contenteditable element
    let content = event;
    try {
      if (this.tabulatorConfigEditorRef && this.tabulatorConfigEditorRef.nativeElement) {
        const root = this.tabulatorConfigEditorRef.nativeElement as HTMLElement;
        const contentEditable = root.querySelector('[contenteditable]');
        const text = contentEditable?.textContent;
        if (typeof text === 'string' && text.length > 0) {
          content = text;
        }
      }
    } catch (err) {
      // ignore and fallback to provided event string
    }
    this.activeTabulatorConfigScriptGroovy = content;
    // console.debug('Tabulator content saved length:', content.length, 'lines:', (content || '').split(/\r?\n/).length);
    await this.saveExternalReportingScript('tabulatorConfigScript');
    this.markSettingsDirty(event);
    // Only parse if content is non-empty (skip parsing empty/whitespace-only scripts)
    if (content && content.trim().length > 0) {
      try {
        const parsed = await this.reportingService.processGroovyTabulatorDsl(content);
        // /parse-tabulator returns { options: {...}, namedOptions: {} }
        // Extract the flat options map; attach namedOptions for getNamedTabulatorIds()
        const opts = parsed?.options || parsed;
        if (parsed?.namedOptions && Object.keys(parsed.namedOptions).length > 0) {
            opts.namedOptions = parsed.namedOptions;
        }
        this.activeTabulatorConfigOptions = opts;
        this.changeDetectorRef.detectChanges();
      } catch (err) {
        console.warn('Tabulator DSL parse error', err);
        this.activeTabulatorConfigOptions = null;
      }
    } else {
      // Clear parsed options when content is empty
      this.activeTabulatorConfigOptions = null;
    }
  }

  async onChartConfigChanged(event: string) {
    let content = event;
    try {
      if (this.chartConfigEditorRef && this.chartConfigEditorRef.nativeElement) {
        const root = this.chartConfigEditorRef.nativeElement as HTMLElement;
        const contentEditable = root.querySelector('[contenteditable]');
        const text = contentEditable?.textContent;
        if (typeof text === 'string' && text.length > 0) {
          content = text;
        }
      }
    } catch (err) {
      // ignore and fallback to provided event string
    }
    this.activeChartConfigScriptGroovy = content;
    // console.debug('Chart content saved length:', content.length, 'lines:', (content || '').split(/\r?\n/).length);
    await this.saveExternalReportingScript('chartConfigScript');
    this.markSettingsDirty(event);
    // Only parse if content is non-empty (skip parsing empty/whitespace-only scripts)
    if (content && content.trim().length > 0) {
      try {
        // Try to parse chart DSL using backend service
        const parsed = await this.reportingService.processGroovyChartDsl(content);
        this.activeChartConfigOptions = parsed;
        this.changeDetectorRef.detectChanges();
      } catch (err) {
        console.warn('Chart DSL parse error', err);
        this.activeChartConfigOptions = null;
      }
    } else {
      // Clear parsed options when content is empty
      this.activeChartConfigOptions = null;
    }
  }

  onChartReady(ev: any) {
    try {
      this.chartInstance = ev?.detail?.chart || ev?.detail || ev;
    } catch (e) {
      console.warn('chart ready handler: cannot determine chart instance', e);
    }
  }

  onChartError(err: any) {
    console.warn('Chart component reported an error', err);
  }

  async onPivotTableConfigChanged(event: string) {
    let content = event;
    try {
      if (this.pivotTableConfigEditorRef && this.pivotTableConfigEditorRef.nativeElement) {
        const root = this.pivotTableConfigEditorRef.nativeElement as HTMLElement;
        const contentEditable = root.querySelector('[contenteditable]');
        const text = contentEditable?.textContent;
        if (typeof text === 'string' && text.length > 0) {
          content = text;
        }
      }
    } catch (err) {
      // ignore and fallback to provided event string
    }
    this.activePivotTableConfigScriptGroovy = content;
    // console.debug('Pivot Table content saved length:', content.length, 'lines:', (content || '').split(/\r?\n/).length);
    await this.saveExternalReportingScript('pivotTableConfigScript');
    this.markSettingsDirty(event);
    // Only parse if content is non-empty (skip parsing empty/whitespace-only scripts)
    if (content && content.trim().length > 0) {
      try {
        const parsed = await this.reportingService.processGroovyPivotTableDsl(content);
        this.activePivotTableConfigOptions = parsed;
        this.changeDetectorRef.detectChanges();
      } catch (err) {
        console.warn('Pivot Table DSL parse error', err);
        this.activePivotTableConfigOptions = null;
      }
    } else {
      // Clear parsed options when content is empty
      this.activePivotTableConfigOptions = null;
    }
  }

  // Tabulator ready handler - optional event argument

  onRbRowClick(ev: any) {
    try {
      const cb = this.activeTabulatorConfigOptions?.callbacks?.rowClick;
      const handlerName = typeof cb === 'string' ? cb : (cb?.handler || cb);
      const params = typeof cb === 'object' ? cb?.params : undefined;
      if (handlerName && this.tabulatorHandlerRegistry[handlerName]) {
        this.tabulatorHandlerRegistry[handlerName](ev.detail, params, this.tabulatorTableInstance);
      }
    } catch (e) {
      console.warn('Error executing row click handler', e);
    }
  }

  onRbDataLoaded(ev: any) {
    try {
      const cb = this.activeTabulatorConfigOptions?.callbacks?.dataLoaded;
      const handlerName = typeof cb === 'string' ? cb : (cb?.handler || cb);
      const params = typeof cb === 'object' ? cb?.params : undefined;
      if (handlerName && this.tabulatorHandlerRegistry[handlerName]) {
        this.tabulatorHandlerRegistry[handlerName](ev.detail, params, this.tabulatorTableInstance);
      }
    } catch (e) {
      console.warn('Error executing dataLoaded handler', e);
    }
  }
  // ==========================================================================
  //  Report parameters
  // ==========================================================================

  private getCurrentConfigName(): string {
    // Prefer explicit metadata, otherwise try to derive from the configured path
    const explicit = this.settingsService.currentConfigurationTemplate?.folderName;
    if (explicit && explicit.trim() !== '') return explicit;
    const derived = this.deriveConfigFolderFromPath();
    return derived || 'unknown_config';
  }

  private getCurrentConfigReportsPath(): string {
    // determine folder name (explicit metadata or derived from path)
    const folderName = this.getCurrentConfigName();
    const folderFromPath = this.deriveConfigFolderFromPath();

    // Decide whether this is a samples path (prefer explicit path checks)
    const samplePathIndicator =
      (this.settingsService.currentConfigurationTemplatePath || '')
        .toString()
        .toLowerCase()
        .includes('/samples/') ||
      (this.xmlReporting?.documentburster?.report?.template?.documentpath || '')
        .toString()
        .toLowerCase()
        .includes('/samples/');

    const basePath = samplePathIndicator
      ? this.appPathsService.CONFIGURATION_SAMPLES_FOLDER_PATH
      : this.appPathsService.CONFIGURATION_REPORTS_FOLDER_PATH;

    // pick folder name preferring explicit metadata then derived folder
    const finalFolder = folderName && folderName !== 'unknown_config' ? folderName : folderFromPath;
    if (!finalFolder) {
      console.error('Configuration folder name is not available to determine base path.');
      return '';
    }
    return `${basePath}/${finalFolder}`;
  }

  // Derive the config folder name from the configured path (works for normal + samples)
  private deriveConfigFolderFromPath(): string {
    const p =
      this.settingsService.currentConfigurationTemplatePath ||
      this.xmlReporting?.documentburster?.report?.template?.documentpath ||
      '';
    if (!p) return '';
    const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
    const parts = normalized.split('/');
    if (parts.length < 2) return '';
    // Usually the parent folder of the file is the config folder
    return parts[parts.length - 2] || '';
  }

  private static readonly DSL_SCRIPT_CONFIG: Record<string, {
    getPath: (c: ConfigurationComponent) => string;
    property: string;
    defaultContent: string;
  }> = {
    datasourceScript:      { getPath: (c) => c.getDslScriptPath('script'),                    property: 'activeDatasourceScriptGroovy',        defaultContent: '// Groovy Datasource Script' },
    paramsSpecScript:      { getPath: (c) => c.getDslScriptPath('report-parameters-spec'),    property: 'activeParamsSpecScriptGroovy',         defaultContent: '' },
    transformScript:       { getPath: (c) => c.getDslScriptPath('additional-transformation'), property: 'activeTransformScriptGroovy',          defaultContent: '' },
    tabulatorConfigScript: { getPath: (c) => c.getDslScriptPath('tabulator-config'),          property: 'activeTabulatorConfigScriptGroovy',    defaultContent: '' },
    chartConfigScript:     { getPath: (c) => c.getDslScriptPath('chart-config'),              property: 'activeChartConfigScriptGroovy',        defaultContent: '' },
    pivotTableConfigScript:{ getPath: (c) => c.getDslScriptPath('pivot-config'),              property: 'activePivotTableConfigScriptGroovy',   defaultContent: '' },
  };

  private async loadExternalReportingScript(
    scriptType: 'datasourceScript' | 'paramsSpecScript' | 'transformScript' | 'tabulatorConfigScript' | 'chartConfigScript' | 'pivotTableConfigScript'
  ): Promise<void> {
    const cfg = ConfigurationComponent.DSL_SCRIPT_CONFIG[scriptType];
    if (!cfg) { console.error('Unknown script type for loading:', scriptType); return; }

    let content = await this.reportsService.loadReportScript(this.currentReportId, scriptType);
    if (!content || content.trim().length === 0) content = cfg.defaultContent;
    (this as any)[cfg.property] = content;
    this.changeDetectorRef.detectChanges();
  }

  private async saveExternalReportingScript(
    scriptType: 'datasourceScript' | 'paramsSpecScript' | 'transformScript' | 'tabulatorConfigScript' | 'chartConfigScript' | 'pivotTableConfigScript',
  ): Promise<void> {
    const cfg = ConfigurationComponent.DSL_SCRIPT_CONFIG[scriptType];
    if (!cfg) { console.error('Unknown script type for saving:', scriptType); return; }

    const contentToSave = (this as any)[cfg.property] as string;

    let isEmptyContent = !contentToSave || contentToSave.trim() === '';

    // For safety we normally skip saving empty content (avoid accidental deletions).
    // However, for Tabulator config we want to persist emptiness (clear file) when the
    // editor was intentionally cleared by the user; therefore allow saving empty
    // content only for tabulatorConfigScript.
    // if (isEmptyContent && scriptType !== 'tabulatorConfigScript') return;

    // Skip saving if content is essentially empty (e.g., just comments or whitespace)
    // You might want to refine this check based on what you consider "empty" for a script.
    // Forcing a save of an empty string might be desired to clear a file.
    // if (!contentToSave || contentToSave.trim().length === 0 || contentToSave.trim() === '// Groovy Datasource Script' || contentToSave.trim() === '// Groovy Additional Transformation Script') {
    //     console.log(`Skipping save for empty or default placeholder ${scriptType} to ${path}.`);
    //     return;
    // }
    await this.reportsService.saveReportScript(this.currentReportId, scriptType, contentToSave);

    // Invalidate DSL cache for this config when DSL scripts are modified
    // This ensures fresh parsing when the config is loaded again (e.g., in processing)
    if (['paramsSpecScript', 'tabulatorConfigScript', 'chartConfigScript', 'pivotTableConfigScript'].includes(scriptType)) {
      const currentConfig = this.settingsService.currentConfigurationTemplate;
      if (currentConfig) {
        this.settingsService.invalidateConfigDetailsCache(currentConfig.filePath);
      }
    }
  }

  reportParameters: ReportParameter[];
  isModalParametersVisible = false; // Changed from showParamsModal
  reportParamsValid = false;
  reportParamsValues: { [key: string]: any } = {};

  reportDataResult: ReportDataResult | null = null;
  isReportDataLoading = false;
  reportDataResultIsError = false;

  // ==========================================================================
  //  Password reveal
  // ==========================================================================

  showSmtpPassword = false;
  showQaPassword = false;
  showTwilioAuthToken = false;
  private smtpPasswordRevealTimer: any;
  private qaPasswordRevealTimer: any;
  private twilioTokenRevealTimer: any;

  // Each toggle: hide → mask + clear timer; show → fetch real value, auto-hide after 10 s.

  async toggleRevealSmtpPassword() {
    if (this.showSmtpPassword) {
      this.showSmtpPassword = false;
      this.xmlSettings.documentburster.settings.emailserver.userpassword = '******';
      clearTimeout(this.smtpPasswordRevealTimer);
    } else {
      try {
        const reportId = this.settingsService.currentConfigurationTemplate?.folderName || 'burst';
        const realPassword = await this.connectionsService.revealPassword('settings', 'userpassword', reportId);
        this.xmlSettings.documentburster.settings.emailserver.userpassword = realPassword;
        this.showSmtpPassword = true;
        this.smtpPasswordRevealTimer = setTimeout(() => {
          this.showSmtpPassword = false;
          this.xmlSettings.documentburster.settings.emailserver.userpassword = '******';
        }, 10000);
      } catch (e) { console.error('Failed to reveal SMTP password', e); }
    }
  }

  async toggleRevealQaPassword() {
    if (this.showQaPassword) {
      this.showQaPassword = false;
      this.xmlSettings.documentburster.settings.qualityassurance.emailserver.userpassword = '******';
      clearTimeout(this.qaPasswordRevealTimer);
    } else {
      try {
        const reportId = this.settingsService.currentConfigurationTemplate?.folderName || 'burst';
        const realPassword = await this.connectionsService.revealPassword('settings', 'userpassword', reportId);
        this.xmlSettings.documentburster.settings.qualityassurance.emailserver.userpassword = realPassword;
        this.showQaPassword = true;
        this.qaPasswordRevealTimer = setTimeout(() => {
          this.showQaPassword = false;
          this.xmlSettings.documentburster.settings.qualityassurance.emailserver.userpassword = '******';
        }, 10000);
      } catch (e) { console.error('Failed to reveal QA password', e); }
    }
  }

  // accountSid is not a secret — no toggle needed

  async toggleRevealTwilioToken() {
    if (this.showTwilioAuthToken) {
      this.showTwilioAuthToken = false;
      this.xmlSettings.documentburster.settings.smssettings.twilio.authtoken = '******';
      clearTimeout(this.twilioTokenRevealTimer);
    } else {
      try {
        const reportId = this.settingsService.currentConfigurationTemplate?.folderName || 'burst';
        const realValue = await this.connectionsService.revealPassword('settings', 'authtoken', reportId);
        this.xmlSettings.documentburster.settings.smssettings.twilio.authtoken = realValue;
        this.showTwilioAuthToken = true;
        this.twilioTokenRevealTimer = setTimeout(() => {
          this.showTwilioAuthToken = false;
          this.xmlSettings.documentburster.settings.smssettings.twilio.authtoken = '******';
        }, 10000);
      } catch (e) { console.error('Failed to reveal Twilio auth token', e); }
    }
  }

  showTabulatorPreview = false;
  showChartPreview = false;
  showPivotPreview = false;

  /*
  reportColumns: any[] = [];
  
  @ViewChild('tabulator') tabulatorRef: ElementRef;
  
  async refreshTabulatorTable() {
    const tabulator = this.tabulatorRef.nativeElement;
    if (tabulator && typeof tabulator.updateTable === 'function') {
      return tabulator.updateTable();
    }
  }

  */

  onReportParamsValidChange(event: Event) {
    // Web component emits CustomEvent with data in .detail
    const isValid = (event as CustomEvent<boolean>).detail;
    // console.log('[Angular] onReportParamsValidChange received! isValid:', isValid, 'event:', event);
    this.reportParamsValid = isValid;
    //this.changeDetectorRef.detectChanges();
  }

  // Add handler for the form's value
  onReportParamsValuesChange(event: Event) {
    // Web component emits CustomEvent with data in .detail
    const values = (event as CustomEvent<{ [key: string]: any }>).detail;
    // console.log('[Angular] onReportParamsValuesChange received! values:', values);
    this.reportParamsValues = values;
  }

  async onRunQueryWithParams() {
    // console.log('[DEBUG] onRunQueryWithParams: modal confirm clicked');
    this.isModalParametersVisible = false;
    // console.log('[DEBUG] onRunQueryWithParams: calling executeTestQuery with params:', this.reportParameters);
    await this.executeTestQuery(this.reportParameters);
  }

  previewParams: { [key: string]: any } = {};

  async runQueryWithParams(parameters: ReportParameter[]) {
    // console.log('[DEBUG] runQueryWithParams: entering with parameters:', parameters);
    // Convert parameters to key-value pairs with proper types
    const paramsObject = parameters.reduce(
      (acc, param) => {
        acc[param.id] = this.convertParamValue(
          param.type,
          this.reportParamsValues[param.id],
        );
        return acc;
      },
      {} as { [key: string]: any },
    );
    this.previewParams = paramsObject;
    const result = await this.reportingService.fetchData(paramsObject, true);
    // console.log('[DEBUG] runQueryWithParams: fetchData returned:', result);
    return result;
  }

  async executeTestQuery(parameters: ReportParameter[]) {
    try {
      this.isReportDataLoading = true;
      this.reportDataResult = await this.runQueryWithParams(parameters);

      // detect error payload (single column named ERROR_MESSAGE)
      const isErrorPayload =
        this.reportDataResult &&
        Array.isArray(this.reportDataResult.reportColumnNames) &&
        this.reportDataResult.reportColumnNames.length === 1 &&
        (this.reportDataResult.reportColumnNames[0] === 'ERROR_MESSAGE' ||
          this.reportDataResult.reportColumnNames[0].toUpperCase() ===
            'ERROR_MESSAGE');

      // Extract the error message if present and perform special-case checks
      let errorMsg = '';
      if (isErrorPayload && Array.isArray(this.reportDataResult.data) && this.reportDataResult.data.length > 0) {
        errorMsg = (this.reportDataResult.data[0]['ERROR_MESSAGE'] || '').toString();
      }
      const lowerMsg = (errorMsg || '').toLowerCase();

      // Treat "no burst tokens were provided or fetched for the document" as NOT an error (no rows)
      const isNoBurstTokensMsg = lowerMsg.includes('no burst tokens were provided or fetched for the document');

      // Final flag - it's an error payload only if it is the ERROR_MESSAGE column and not the "no burst tokens" informational message
      const finalIsError = isErrorPayload && !isNoBurstTokensMsg;
      this.reportDataResultIsError = !!finalIsError;

      if (isNoBurstTokensMsg) {
        // Show a milder warning - it's not an SQL syntax error, it just returned no rows
        this.messagesService.showWarning('Query executed successfully but returned no rows.');
        // Optional: replace ERROR_MESSAGE payload with empty data so Tabulator shows "no rows"
        this.reportDataResult.data = [];
        this.reportDataResult.reportColumnNames = [];
        this.reportDataResult.totalRows = 0;
      } else if (finalIsError) {
        // Show red toast for real errors
        this.messagesService.showError(
          'Error executing SQL query. View details in the Errors Log / Tabulator preview.',
        );
      } else {
        // Show green toast on success
        this.messagesService.showSuccess(
          'SQL query executed successfully, go to the Tabulator tab to see results.',
        );
      }
    } catch (error) {
      // Show red toast on error
      this.reportDataResultIsError = true;
      this.messagesService.showError(
        `Error executing SQL query: ${error.message}, check the Errors Log/Tabulator to view the exact error.`,
      );
    } finally {
      this.isReportDataLoading = false;
    }
  }

  async doTestSqlQuery() {
    // console.log('[DEBUG] doTestSqlQuery: BUTTON CLICKED - method entered');
    if (this.executionStatsService.logStats.foundDirtyLogFiles) {
      // console.log('[DEBUG] doTestSqlQuery: dirty log files found, showing info');
      const dialogMessage =
        'Log files are not empty. You need to press the Clear Logs button first.';
      this.infoService.showInformation({ message: dialogMessage });
      return;
    }

    const dbConnectionCode =
      this.xmlReporting.documentburster.report.datasource.sqloptions.conncode;
    // console.log('[DEBUG] doTestSqlQuery: dbConnectionCode=', dbConnectionCode);

    const dialogQuestion = `Test SQL query with connection ${dbConnectionCode}?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        // console.log('[DEBUG] doTestSqlQuery: confirmAction callback started');

        let parameters = [];

        // Parse Groovy DSL to get parameters
        if (this.activeParamsSpecScriptGroovy &&
          this.activeParamsSpecScriptGroovy.trim() !== '') {
          parameters =
            await this.reportingService.processGroovyParametersDsl(
              this.activeParamsSpecScriptGroovy,
              this.selectedDbConnCode,
            );

          // Access user-provided values
          const paramValues = this.reportParamsValues;

          // Convert values to correct types based on parameter definitions
          const typedParams = parameters.map((param) => {
            return {
              ...param,
              value: this.convertParamValue(param.type, paramValues[param.id]),
            };
          });

          //console.log(`typedParams = ${JSON.stringify(typedParams)}`);

          //console.log('Parameters before execution:', {
          //  parameters,
          //  values: this.reportParamsValues,
          //});
          // Only update if different
          if (!_.isEqual(this.reportParameters, parameters)) {
            this.reportParameters = parameters;
          }
        }
        if (parameters && parameters.length > 0) {
          // console.log('[DEBUG] doTestSqlQuery: parameters.length > 0, showing modal');
          this.isModalParametersVisible = true;
        }
        else {
          // console.log('[DEBUG] doTestSqlQuery: no parameters, calling executeTestQuery directly');
          return this.executeTestQuery([]);
        }
      },
    });
  }

  private convertParamValue(type: string, value: any): any {
    switch (type) {
      case 'LocalDate':
      case 'LocalDateTime':
        return value; // Return the raw ISO string
      case 'Integer':
        return parseInt(value, 10);
      case 'Boolean':
        return Boolean(value);
      default:
        return value;
    }
  }

  onTabReady(event?: any) {
    // optional argument with table instance
    if (event && event?.detail?.table) this.tabulatorTableInstance = event.detail.table;
    //console.log('📊 Tabulator ready', !!this.tabulatorTableInstance);
  }

  onTabError(msg: string) {
    //console.error('❌ Tabulator error:', msg);
  }

  // Event handlers for self-contained component previews
  onTabulatorDataFetched(event: any) {
    const detail = event.detail;
    this.reportDataResult = {
      data: detail.data,
      reportColumnNames: detail.reportColumnNames,
      executionTimeMillis: detail.executionTimeMillis,
      totalRows: detail.totalRows,
      truncated: detail.truncated,
    };
  }

  onTabulatorFetchError(event: any) {
    this.messagesService.showError(`Error: ${event.detail?.message || 'Query failed'}`);
  }

  onChartDataFetched(event: any) {
    // Chart handles its own rendering; metadata captured if needed
  }

  onChartFetchError(event: any) {
    this.messagesService.showError(`Chart error: ${event.detail?.message || 'Query failed'}`);
  }

  onPivotDataFetched(event: any) {
    // Pivot table handles its own rendering; metadata captured if needed
  }

  onPivotFetchError(event: any) {
    this.messagesService.showError(`Pivot table error: ${event.detail?.message || 'Query failed'}`);
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

  @ViewChild('templatesGalleryModal') templatesGalleryModal: any;

  templatesGalleryTags: string[] | null = null;
  istemplatesGalleryModalVisible = false;

  getGalleryTagsForOutputType(outputType: string): string[] | null {
    switch (outputType) {
      case 'output.xlsx':
        return ['excel'];
      case 'output.pdf':
      case 'output.html':
      case 'output.dashboard':
      case 'output.docx':
        return null; // Show all except 'excel'
      case 'email.message':
        return ['mailchimp-email-blueprints', 'email'];
      default:
        return null;
    }
  }

  showGalleryModalForCurrentOutputType(outputType?: string) {
    // Use the provided outputType or fall back to the report's outputType
    const type = outputType || this.xmlReporting?.documentburster?.report?.template?.outputtype;
    const tags = this.getGalleryTagsForOutputType(type);
    if (tags !== undefined) {
      this.showGalleryModal(tags);
    } else {
      this.messagesService.showInfo('No gallery available for this output type.');
    }
  }

  // Update showGalleryModal to accept tags instead of context
  showGalleryModal(tags: string[] | null) {
    this.templatesGalleryTags = tags;
    this.istemplatesGalleryModalVisible = true;
    setTimeout(() => {
      this.templatesGalleryModal.openTemplateGallery();
    });
  }

  onGalleryTemplateUsed(template: HtmlDocTemplateDisplay) {

    let outputType = this.xmlReporting?.documentburster?.report?.template?.outputtype;
    if (!outputType && this.currentLeftMenu === 'emailSettingsMenuSelected') {
      outputType = 'email.message';
    }

    if (outputType === 'output.xlsx' || outputType === 'output.pdf' || outputType === 'output.html' || outputType === 'output.dashboard') {
      this.activeReportTemplateContent = template.htmlContent[template.currentVariantIndex || 0];
      this.markSettingsDirty(this.activeReportTemplateContent);
      // Explicitly save the gallery template to disk using per-output-type path
      const galleryOutputType = outputType.replace('output.', '');
      this.reportsService.saveReportTemplateByType(
        this.currentReportId,
        galleryOutputType,
        this.activeReportTemplateContent,
        template.assetBaseDir,
      ).catch((err) => console.error('Failed to save gallery template:', err));
    } else if (outputType === 'output.docx') {
      // Show warning toast for DOCX mode
      this.messagesService.showWarning(
        this.translateService.instant(
          'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.DOCX-HTML-WARNING',
        ),
        this.translateService.instant(
          'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.CANNOT-USE-TEMPLATE',
        ),
      );
    } else if (outputType === 'email.message') {
      this.xmlSettings.documentburster.settings.emailsettings.html = template.htmlContent[template.currentVariantIndex || 0];
      this.markSettingsDirty(this.xmlSettings.documentburster.settings.emailsettings.html);
    }
    this.istemplatesGalleryModalVisible = false;
  }

  public get isSampleReport(): boolean {
    const dsType = this.xmlReporting?.documentburster?.report?.datasource?.type;
    const sqlConn = this.xmlReporting?.documentburster?.report?.datasource?.sqloptions?.conncode || '';
    const scriptConn = this.xmlReporting?.documentburster?.report?.datasource?.scriptoptions?.conncode || '';
    const codeLower = (sqlConn || scriptConn).toString().toLowerCase();
    return (
      (dsType === 'ds.sqlquery' || dsType === 'ds.scriptfile' || dsType === 'ds.dashboard') &&
      (codeLower.includes('rbt-sample-northwind-sqlite-4f2') || codeLower.includes('rbt-sample-northwind-duckdb-4f2') || codeLower.includes('rbt-sample-northwind-clickhouse-4f2'))
    );
  }

  public getDatabaseConnectionFilesForUI(): ExtConnection[] {

    const dsType = this.xmlReporting?.documentburster?.report?.datasource?.type;

    // get conncode from sqloptions OR scriptoptions
    const sqlConn = this.xmlReporting?.documentburster?.report?.datasource?.sqloptions?.conncode;
    const scriptConn = this.xmlReporting?.documentburster?.report?.datasource?.scriptoptions?.conncode;
    const connCode = (sqlConn || scriptConn || '').toString();

    const isSample = this.isSampleReport

    if (isSample) {
      const codeLower = connCode.toLowerCase();
      const isDuckDb = codeLower.includes('duckdb');
      const isClickHouse = codeLower.includes('clickhouse');

      // Look up the actual defaultConnection status from persisted connection files.
      // Sample connections are synthetic (in-memory only) until the user tests/fetches schema,
      // at which point they get persisted to disk with their own default flag.
      const actualConn = this.settingsService.getDatabaseConnectionFiles()
        .find(c => c.connectionCode === connCode);

      let connectionName: string;
      let fileName: string;
      let filePath: string;

      if (isClickHouse) {
        connectionName = 'Sample Northwind (ClickHouse)';
        fileName = 'northwind';
        filePath = 'clickhouse://localhost:8123/northwind';
      } else if (isDuckDb) {
        connectionName = 'Sample Northwind (DuckDB)';
        fileName = 'northwind.duckdb';
        filePath = 'db/sample-northwind-duckdb/northwind.duckdb';
      } else {
        connectionName = 'Sample Northwind (SQLite)';
        fileName = 'northwind.db';
        filePath = 'db/sample-northwind-sqlite/northwind.db';
      }

      return [{
        connectionCode: connCode,
        connectionName: connectionName,
        connectionType: 'database-connection',
        fileName: fileName,
        filePath: filePath,
        activeClicked: false,
        defaultConnection: actualConn?.defaultConnection ?? false,
        usedBy: '',
        useForJasperReports: false,
      }];
    }

    return this.settingsService.getDatabaseConnectionFiles();
  }
}
