import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { APP_CONFIG } from '../../environments/environment';

export interface TmplFileInfo {
  fileName: string;
  filePath: string;
  type: string;
  content?: string;
  folderName: string;
  relativeFilePath: string;
}

export interface ReportParameter {
  id: string;
  type: string;
  value?: any;
  label?: string;
  description?: string;
  defaultValue?: any;
  constraints?: {
    [key: string]: any;
    required?: boolean;
    min?: number | string;
    max?: number | string;
    pattern?: string;
  };
  uiHints?: {
    [key: string]: any;
    control?: string;
    list?: any[];
    sql?: string;
  };
}

export interface CfgTmplFileInfo {
  fileName: string;
  filePath: string;
  templateName: string;
  capReportGenerationMailMerge: boolean;
  capReportDistribution: boolean;
  dsInputType: string;
  notes: string;
  type: string;
  folderName: string;
  relativeFilePath: string;
  isFallback: boolean;
  scriptOptionsSelectFileExplorer: string;
  activeClicked?: boolean;
  useEmlConn?: boolean;
  emlConnCode?: string;

  // For JasperReports: DB connection code (from datasource.properties or default)
  dbConnectionCode?: string;

  reportParameters: ReportParameter[];

  // Parsed Tabulator DSL options -- flat map matching tabulator.info constructor options
  tabulatorOptions?: {
    columns?: Array<{ title?: string; field?: string; [k: string]: any }>;
    data?: Array<Record<string, any>>;
    [k: string]: any; // all other tabulator.info options (layout, height, pagination, etc.)
  };

  // Parsed Chart DSL options (type, labelField, options, labels, datasets, data)
  chartOptions?: {
    type?: string;
    labelField?: string;
    options?: any;
    labels?: string[];
    datasets?: Array<{ field?: string; label?: string; color?: string; type?: string; [k: string]: any }>;
    data?: Array<Record<string, any>>;
  };

  // Parsed Pivot Table DSL options
  pivotTableOptions?: {
    rows?: string[];
    cols?: string[];
    vals?: string[];
    aggregatorName?: string;
    rendererName?: string;
    rowOrder?: string;
    colOrder?: string;
    valueFilter?: Record<string, any>;
    options?: any;
    data?: Array<Record<string, any>>;
    hiddenAttributes?: string[];
    hiddenFromAggregators?: string[];
    hiddenFromDragDrop?: string[];
    unusedOrientationCutoff?: number;
    menuLimit?: number;
    sorters?: Record<string, any>;
    derivedAttributes?: Record<string, string>;
  };
}

@Injectable({
  providedIn: 'root',
})
export class ReportsService {

  configurationFiles: Array<CfgTmplFileInfo> = [];
  templateFiles: Array<TmplFileInfo> = [];

  CONFIGURATION_FOLDER_PATH: string;
  CONFIGURATION_REPORTS_FOLDER_PATH: string;
  CONFIGURATION_DEFAULTS_FOLDER_PATH: string;
  CONFIGURATION_SAMPLES_FOLDER_PATH: string;
  CONFIGURATION_BURST_FOLDER_PATH: string;
  CONFIGURATION_TEMPLATES_FOLDER_PATH: string;
  INTERNAL_SETTINGS_FILE_PATH: string;

  currentConfigurationTemplatePath: string;
  currentConfigurationTemplateName: string;
  currentConfigurationTemplate: CfgTmplFileInfo;

  product: string = 'DocumentBurster';
  version: any;
  isWindows: boolean = false;
  isServerVersion: boolean = false;
  numberOfUserVariables: number;

  // Cache for loaded DSL details to avoid re-parsing
  private configDetailsCache: Map<string, {
    reportParameters?: ReportParameter[];
    tabulatorOptions?: any;
    chartOptions?: any;
    pivotTableOptions?: any;
  }> = new Map();

  constructor(public apiService: ApiService) {
    this.CONFIGURATION_FOLDER_PATH = `${APP_CONFIG.folders.config}`;
    this.INTERNAL_SETTINGS_FILE_PATH = `${this.CONFIGURATION_FOLDER_PATH}/_internal/settings.xml`;
    this.CONFIGURATION_DEFAULTS_FOLDER_PATH = `${this.CONFIGURATION_FOLDER_PATH}/_defaults`;
    this.CONFIGURATION_BURST_FOLDER_PATH = `${APP_CONFIG.folders.config}/burst`;
    this.CONFIGURATION_REPORTS_FOLDER_PATH = `${APP_CONFIG.folders.config}/reports`;
    this.CONFIGURATION_SAMPLES_FOLDER_PATH = `${APP_CONFIG.folders.config}/samples`;
    this.CONFIGURATION_TEMPLATES_FOLDER_PATH = `templates`;
  }

  getDefaultsConfigurationValuesFilePath(): string {
    return `${this.CONFIGURATION_DEFAULTS_FOLDER_PATH}/settings.xml`;
  }

  getMyReportsConfigurationValuesFilePath(): string {
    return `${this.CONFIGURATION_BURST_FOLDER_PATH}/settings.xml`;
  }

  async loadImageAsDataUrl(imagePath: string): Promise<string> {
    // Important: Explicitly set Accept header to image/*
    const response = await fetch(
      `/api/reports/serve-asset?path=${encodeURIComponent(imagePath)}`,
      {
        headers: {
          Accept: 'image/*', // This is critical
        },
      },
    );

    if (!response.ok) {
      console.error(
        `Failed to load image: ${imagePath}, status: ${response.status}`,
      );
      return null;
    }

    const blob = await response.blob();

    // Convert blob to data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  // ===== NEW ID-based methods =====

  async loadDefaults(): Promise<any> {
    const systemInfo = await this.apiService.get('/system/info');

    if (!systemInfo) {
      return;
    }

    this.isWindows = systemInfo.osName.startsWith('Windows');

    this.product = systemInfo.product;

    if (this.product.toLowerCase().includes('server')) {
      this.isServerVersion = true;
    }

    let xmlSettings = {
      documentburster: {
        settings: null,
      },
    };

    xmlSettings.documentburster = await this.apiService.get('/reports/_defaults/settings');

    this.version = xmlSettings.documentburster.settings.version;

    return xmlSettings;
  }

  async loadReportSettings(reportId: string): Promise<{
    documentburster: {
      settings: any;
    };
  }> {
    let xmlSettings = {
      documentburster: { settings: {} },
    };

    xmlSettings.documentburster = await this.apiService.get(
      `/reports/${encodeURIComponent(reportId)}/settings`,
    );

    return xmlSettings;
  }

  async loadSettingsByPath(configFilePath: string): Promise<{
    documentburster: {
      settings: any;
    };
  }> {
    // Extract reportId from paths like "config/reports/my-report/settings.xml"
    const parts = configFilePath.replace(/\\/g, '/').split('/');
    const reportId = parts.length >= 2 ? parts[parts.length - 2] : '_defaults';
    return this.loadReportSettings(reportId);
  }

  async saveReportSettings(
    reportId: string,
    xmlSettings: {
      documentburster: any;
    },
  ) {
    xmlSettings.documentburster.settings?.attachments?.items?.attachmentItems?.forEach(
      (item: { selected?: boolean }) => {
        delete item.selected;
      },
    );

    return this.apiService.put(
      `/reports/${encodeURIComponent(reportId)}/settings`,
      xmlSettings.documentburster,
    );
  }

  async loadReportDataSource(reportId: string): Promise<any> {
    return this.apiService.get(
      `/reports/${encodeURIComponent(reportId)}/datasource`,
    );
  }

  async saveReportDataSource(
    reportId: string,
    xmlReporting: { documentburster: {} },
  ) {
    return this.apiService.put(
      `/reports/${encodeURIComponent(reportId)}/datasource`,
      xmlReporting.documentburster,
    );
  }

  /**
   * Load template content for a specific output type.
   * Backend computes the path: templates/reports/{reportId}/{reportId}-{type}.{ext}
   * Each output type has its own template file.
   */
  async loadReportTemplateByType(reportId: string, outputType: string): Promise<string> {
    const textHeaders = new Headers({ Accept: 'text/plain' });
    return this.apiService.get(
      `/reports/${encodeURIComponent(reportId)}/template/${encodeURIComponent(outputType)}`,
      undefined,
      textHeaders,
      'text',
    );
  }

  /**
   * Save template content for a specific output type.
   */
  async saveReportTemplateByType(reportId: string, outputType: string, content: string, assetSourceDir?: string): Promise<{ documentpath?: string }> {
    const textHeaders = new Headers({ 'Content-Type': 'text/plain' });
    const assetParam = assetSourceDir ? `?assetSourceDir=${encodeURIComponent(assetSourceDir)}` : '';
    return this.apiService.put(
      `/reports/${encodeURIComponent(reportId)}/template/${encodeURIComponent(outputType)}${assetParam}`,
      content,
      textHeaders,
    );
  }

  /**
   * Load template content for a report.
   * Backend resolves the template path from the report's config — no type needed.
   */
  async loadReportTemplate(reportId: string): Promise<string> {
    const result = await this.apiService.get(
      `/reports/${encodeURIComponent(reportId)}/template`,
      undefined,
      new Headers({
        Accept: 'text/plain',
        'Content-Type': 'application/json',
      }),
      'text',
    );

    return result || '';
  }

  /**
   * Save template content for a report.
   * Backend resolves the template path from the report's config.
   */
  /**
   * Load a Groovy DSL script (tabulator, chart, pivot, datasource, etc.) by reportId and type.
   */
  async loadReportScript(reportId: string, scriptType: string): Promise<string> {
    const textHeaders = new Headers({ Accept: 'text/plain' });
    return this.apiService.get(
      `/reports/${encodeURIComponent(reportId)}/script/${encodeURIComponent(scriptType)}`,
      undefined,
      textHeaders,
      'text',
    );
  }

  /**
   * Save a Groovy DSL script by reportId and type.
   */
  async saveReportScript(reportId: string, scriptType: string, content: string) {
    const textHeaders = new Headers({ 'Content-Type': 'text/plain' });
    return this.apiService.put(
      `/reports/${encodeURIComponent(reportId)}/script/${encodeURIComponent(scriptType)}`,
      content,
      textHeaders,
    );
  }

  async saveReportTemplate(reportId: string, content: string) {
    const textHeaders = new Headers({ 'Content-Type': 'text/plain' });
    return this.apiService.put(
      `/reports/${encodeURIComponent(reportId)}/template`,
      content,
      textHeaders,
    );
  }

  /**
   * MINIMAL LOADING - Fast startup.
   * Returns only basic metadata needed for UI menus (no DSL parsing).
   * DSL options are loaded on-demand via loadReportDetails().
   */
  async loadAllReports({
    forceReload = false,
    fullLoad = false,  // Set to true for backward-compat scenarios needing all details upfront
  }: { forceReload?: boolean; fullLoad?: boolean } = {}): Promise<Array<CfgTmplFileInfo>> {
    if (
      !forceReload &&
      this.configurationFiles &&
      this.configurationFiles.length > 0
    )
      return this.configurationFiles;

    // Clear cache on force reload
    if (forceReload) {
      this.configDetailsCache.clear();
    }

    // Use minimal endpoint for fast startup, full endpoint only when explicitly needed
    const endpoint = fullLoad ? '/reports?withDetails=true' : '/reports';
    this.configurationFiles = await this.apiService.get(endpoint);

    return this.configurationFiles;
  }

  /**
   * FULL DETAILS LOADING - On-demand for a specific configuration.
   * Loads and caches DSL options (reportParameters, tabulatorOptions, etc.)
   * Merges the loaded details into the existing configurationFiles entry.
   *
   * @param configFile The configuration to load details for
   * @returns The updated configuration with DSL options populated
   */
  async loadReportDetails(configFile: CfgTmplFileInfo): Promise<CfgTmplFileInfo> {
    // Only reports, samples, and jasper reports have details to load
    if (configFile.type !== 'config-reports' && configFile.type !== 'config-samples' && configFile.type !== 'config-jasper-reports') {
      return configFile;
    }

    const cacheKey = configFile.filePath;

    // Check cache first
    if (this.configDetailsCache.has(cacheKey)) {
      const cached = this.configDetailsCache.get(cacheKey);
      configFile.reportParameters = cached.reportParameters || [];
      configFile.tabulatorOptions = cached.tabulatorOptions;
      configFile.chartOptions = cached.chartOptions;
      configFile.pivotTableOptions = cached.pivotTableOptions;
      return configFile;
    }

    try {
      const details = await this.apiService.get(`/reports/${encodeURIComponent(configFile.folderName)}`);

      if (details) {
        // Merge loaded details into the config
        configFile.reportParameters = details.reportParameters || [];
        configFile.tabulatorOptions = details.tabulatorOptions;
        configFile.chartOptions = details.chartOptions;
        configFile.pivotTableOptions = details.pivotTableOptions;

        // Cache the results
        this.configDetailsCache.set(cacheKey, {
          reportParameters: configFile.reportParameters,
          tabulatorOptions: configFile.tabulatorOptions,
          chartOptions: configFile.chartOptions,
          pivotTableOptions: configFile.pivotTableOptions,
        });
      }
    } catch (error) {
      console.error(`Failed to load config details for ${configFile.folderName}:`, error);
    }

    return configFile;
  }

  /**
   * Invalidate cached details for a specific configuration.
   * Call this when DSL files are saved/modified to ensure fresh data on next load.
   */
  invalidateConfigDetailsCache(filePath?: string): void {
    if (filePath) {
      this.configDetailsCache.delete(filePath);
    } else {
      // Clear entire cache
      this.configDetailsCache.clear();
    }
  }

  // ===== Gallery template methods (ID-based, no paths) =====

  /**
   * Load gallery template HTML content + asset base directory.
   */
  async loadGalleryTemplateContent(
    templateId: string,
    variant: number = 0,
  ): Promise<{ content: string; assetBaseDir: string }> {
    return this.apiService.get(`/system/gallery/templates/${encodeURIComponent(templateId)}/content`, { variant });
  }

  /**
   * Load gallery template README.
   */
  async loadGalleryTemplateReadme(templateId: string, variant: number = 0): Promise<string> {
    const textHeaders = new Headers({ Accept: 'text/plain' });
    return this.apiService.get(
      `/system/gallery/templates/${encodeURIComponent(templateId)}/readme`,
      { variant },
      textHeaders,
      'text',
    );
  }

  /**
   * Load gallery template AI prompt (type: 'modify' or 'scratch').
   */
  async loadGalleryTemplateAiPrompt(
    templateId: string,
    type: 'modify' | 'scratch',
    variant: number = 0,
  ): Promise<string> {
    const textHeaders = new Headers({ Accept: 'text/plain' });
    return this.apiService.get(
      `/system/gallery/templates/${encodeURIComponent(templateId)}/ai-prompt`,
      { type, variant },
      textHeaders,
      'text',
    );
  }

  /**
   * Get the URL to view a gallery template in the browser.
   */
  getGalleryTemplateViewUrl(templateId: string, variant: number = 0): string {
    return `/api/system/gallery/templates/${encodeURIComponent(templateId)}/view?variant=${variant}`;
  }

  async loadAllReportTemplates() {
    this.templateFiles = await this.apiService.get('/reports?type=templates');
    return this.templateFiles;
  }

  getConfigurations() {
    if (this.configurationFiles && this.configurationFiles.length > 0) {
      return this.configurationFiles.filter(
        (configuration) => configuration.type != 'config-samples',
      );
    }
  }

  getMailMergeConfigurations(filter?: { samples?: boolean }) {
    if (this.configurationFiles && this.configurationFiles.length > 0) {
      return this.configurationFiles.filter((configuration) => {
        let filterCondition = configuration.capReportGenerationMailMerge;

        if (filterCondition)
          filterCondition =
            filterCondition && configuration.dsInputType !== 'ds.dashboard';

        if (filter && !filter.samples)
          filterCondition =
            filterCondition && !configuration.filePath.includes('samples');

        return filterCondition;
      });
    }
  }

  getSampleConfigurations() {
    if (this.configurationFiles && this.configurationFiles.length > 0) {
      return this.configurationFiles.filter(
        (configuration) => configuration.type == 'config-samples',
      );
    }
  }

  getJasperReportConfigurations() {
    if (this.configurationFiles && this.configurationFiles.length > 0) {
      return this.configurationFiles.filter(
        (configuration) => configuration.type === 'config-jasper-reports',
      );
    }
    return [];
  }

  getReportTemplates(outputType: string, options: any = {}) {
    // Filter templates by output type
    const templatesOfType = this.templateFiles.filter((tplFile) => {
      if (outputType === 'output.docx' && tplFile.fileName.endsWith('.docx'))
        return true;
      if (
        (outputType === 'output.html' ||
          outputType === 'output.dashboard' ||
          outputType === 'output.pdf' ||
          outputType === 'output.xlsx') &&
        tplFile.fileName.endsWith('.html')
      )
        return true;

      if (
        outputType === 'output.fop2pdf' &&
        (tplFile.fileName.endsWith('.fo') || tplFile.fileName.endsWith('.xsl') || tplFile.fileName.endsWith('.xslt'))
      )
        return true;

      return false;
    });

    // Further filter by configuration folder for DOCX templates only
    let filteredTemplates = templatesOfType;
    if (
      outputType === 'output.docx' &&
      this.currentConfigurationTemplate?.folderName
    ) {
      const folderToMatch = `/reports/${this.currentConfigurationTemplate.folderName}/`;
      filteredTemplates = templatesOfType.filter((tplFile) => {
        // Only include templates that are in the specific subfolder matching the current configuration
        return tplFile.filePath.includes(folderToMatch);
      });
    }

    // Apply sample filter if needed
    if (options && options.hasOwnProperty('samples')) {
      return filteredTemplates.filter((tplFile) => {
        if (options.samples) return tplFile.type.includes('-sample');
        return !tplFile.type.includes('-sample');
      });
    }

    return filteredTemplates;
  }

  // --- NEW atomic methods for report CRUD operations ---

  async createReport(
    reportId: string,
    templateName: string,
    capReportDistribution: boolean,
    capReportGenerationMailMerge: boolean,
    copyFromReportId?: string,
  ): Promise<CfgTmplFileInfo> {
    return this.apiService.post('/reports/configurations', {
      reportId,
      templateName,
      capReportDistribution,
      capReportGenerationMailMerge,
      copyFromReportId,
    });
  }

  async duplicateReport(
    sourceReportId: string,
    targetReportId: string,
    templateName: string,
    capReportDistribution: boolean,
    capReportGenerationMailMerge: boolean,
  ): Promise<CfgTmplFileInfo> {
    return this.apiService.post(
      `/reports/configurations/${sourceReportId}/duplicate`,
      {
        targetReportId,
        templateName,
        capReportDistribution,
        capReportGenerationMailMerge,
      },
    );
  }

  async deleteReport(reportId: string): Promise<void> {
    return this.apiService.delete(`/reports/configurations/${reportId}`);
  }

  async restoreDefaults(reportId: string): Promise<void> {
    return this.apiService.post(
      `/reports/configurations/${reportId}/restore-defaults`,
    );
  }

  requiresInputFile(report: CfgTmplFileInfo): boolean {
    if (!report) return true;
    if (report.dsInputType === 'ds.jasper') return false;
    if (report.dsInputType === 'ds.sqlquery') return false;
    if (report.dsInputType === 'ds.scriptfile') {
      const sel = (report.scriptOptionsSelectFileExplorer ?? 'notused');
      return sel !== 'notused';
    }
    return true;
  }

  requiresParameters(report: CfgTmplFileInfo): boolean {
    if (!report) return true;
    return !!(report.reportParameters && report.reportParameters.length > 0);
  }

  allowedInputFileTypes(report: CfgTmplFileInfo): string {
    if (!report) return 'notused';
    const dsInputType = report.dsInputType;
    const scriptOptionsSelectFileExplorer = report.scriptOptionsSelectFileExplorer;
    if (!dsInputType) return 'notused';
    if (['ds.csvfile', 'ds.tsvfile', 'ds.fixedwidthfile'].includes(dsInputType))
      return '.csv, .tsv, .tab, .txt, .prn, .dat';
    if (dsInputType === 'ds.xmlfile') return '.xml';
    if (dsInputType === 'ds.excelfile') return '.xlsx, .xls';
    if (dsInputType === 'ds.script') return scriptOptionsSelectFileExplorer;
    return 'notused';
  }

  convertParamValue(type: string, value: any): any {
    switch (type) {
      case 'LocalDate':
      case 'LocalDateTime':
        return value;
      case 'Integer':
        return parseInt(value, 10);
      case 'Boolean':
        return Boolean(value);
      default:
        return value;
    }
  }

}
