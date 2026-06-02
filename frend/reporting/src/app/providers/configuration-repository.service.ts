// ConfigurationRepository — no "Service" suffix: Repository is a DDD role-noun.
// Decision Log: this class is NOT split into A (Reports) + B (Connections) sub-services
// because the usedBy join (configurationFiles × connectionFiles) is load-bearing.
// Splitting would break the join or force worse cross-service coupling.

import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { PreferencesService } from './preferences.service';
import { AppPathsService } from './app-paths.service';

export { PreferencesService } from './preferences.service';
export { AppPathsService } from './app-paths.service';

export interface ExtConnection {
  fileName: string;
  filePath: string;
  connectionCode: string;
  connectionName: string;
  connectionType: 'email-connection' | 'database-connection';
  activeClicked: boolean;
  defaultConnection: boolean;
  useForJasperReports: boolean;
  usedBy: string;
  // True for synthesized sample DB connections (Northwind SQLite/DuckDB/ClickHouse)
  isSample?: boolean;
  emailserver?: {
    host: string;
    port: string;
    userid: string;
    userpassword: string;
    usessl: boolean;
    usetls: boolean;
    fromaddress: string;
    name: string;
    oauth2provider?: string;
    oauth2clientid?: string;
    oauth2tenantid?: string;
    oauth2authorizeurl?: string;
    oauth2tokenurl?: string;
    oauth2scope?: string;
    oauth2refreshtoken?: string;
    oauth2useremail?: string;
  };
  dbserver?: {
    type: string; // mysql, postgresql, sqlserver, oracle
    host: string;
    port: string;
    database: string;
    userid: string;
    userpassword: string;
    usessl: boolean;
    defaultquery: string;
  };
}

export const newEmailServer: {
  host: string;
  port: string;
  userid: string;
  userpassword: string;
  usessl: boolean;
  usetls: boolean;
  fromaddress: string;
  name: string;
  oauth2provider?: string;
  oauth2clientid?: string;
  oauth2tenantid?: string;
  oauth2authorizeurl?: string;
  oauth2tokenurl?: string;
  oauth2scope?: string;
  oauth2refreshtoken?: string;
  oauth2useremail?: string;
} = {
  host: 'Email Server Host',
  port: '25',
  userid: 'From Email User ID',
  userpassword: 'From Email Password',
  usessl: false,
  usetls: false,
  fromaddress: 'from@emailaddress.com',
  name: 'From Name',
  oauth2provider: 'NONE',
  oauth2clientid: '',
  oauth2tenantid: '',
  oauth2authorizeurl: '',
  oauth2tokenurl: '',
  oauth2scope: '',
  oauth2refreshtoken: '',
  oauth2useremail: '',
};

export const newDatabaseServer = {
  type: 'oracle',
  host: 'Database Server Host',
  port: '1521', // SQL Server 1433, MySQL 3306, PostgreSQL 5432, Oracle 1521
  database: 'Database Name',
  userid: 'Database Username',
  userpassword: 'Database Password',
  usessl: false,
  defaultquery: 'SELECT 1 AS connection_test',
};

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

  // For SQL/Script reports (dsInputType ds.db / ds.script)
  useDbConn?: boolean;
  dbConnCode?: string;

  // For JasperReports: DB connection code (from datasource.properties or default)
  dbConnectionCode?: string;

  reportParameters: ReportParameter[];

  // Parsed Tabulator DSL options — flat map matching tabulator.info constructor options
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
export class ConfigurationRepository {

  // ====================================================================
  //  In-memory state
  // ====================================================================

  currentConfigurationTemplatePath: string;
  currentConfigurationTemplateName: string;
  currentConfigurationTemplate: CfgTmplFileInfo;

  configurationFiles: Array<CfgTmplFileInfo> = [];
  templateFiles: Array<TmplFileInfo> = [];

  defaultEmailConnectionFile: ExtConnection;
  defaultDatabaseConnectionFile: ExtConnection;

  connectionFiles: Array<ExtConnection> = [];

  numberOfUserVariables: number;

  isLoadingConnections: boolean = false;

  // Cache for loaded DSL details to avoid re-parsing
  private configDetailsCache: Map<string, {
    reportParameters?: ReportParameter[];
    tabulatorOptions?: any;
    chartOptions?: any;
    pivotTableOptions?: any;
  }> = new Map();

  // Magic strings that indicate an unconfigured default email connection
  private static readonly UNCONFIGURED_EMAIL_PLACEHOLDERS = {
    host: 'Email Server Host',
    name: 'From Name',
    fromaddress: 'from@emailaddress.com',
    userid: 'From Email User ID',
    userpassword: 'From Email Password',
  };

  private static readonly TEMPLATE_EXTENSIONS_BY_OUTPUT: Record<string, string[]> = {
    'output.docx':      ['.docx'],
    'output.html':      ['.html'],
    'output.dashboard': ['.html'],
    'output.pdf':       ['.html'],
    'output.xlsx':      ['.html'],
    'output.fop2pdf':   ['.fo', '.xsl', '.xslt'],
  };

  constructor(
    public apiService: ApiService,
    public preferencesService: PreferencesService,
    public appPathsService: AppPathsService,
  ) {}

  // ====================================================================
  //  Pass-through delegates — callers migrated incrementally
  // ====================================================================

  get xmlInternalSettings() { return this.preferencesService.xmlInternalSettings; }
  get showSamples$() { return this.preferencesService.showSamples$; }
  get showSamples() { return this.preferencesService.showSamples; }
  loadPreferences() { return this.preferencesService.loadPreferences(); }
  savePreferences(s: any) { return this.preferencesService.savePreferences(s); }
  getCopilotUrl() { return this.preferencesService.getCopilotUrl(); }

  get LOGS_FOLDER_PATH() { return this.appPathsService.LOGS_FOLDER_PATH; }
  get QUARANTINE_FOLDER_PATH() { return this.appPathsService.QUARANTINE_FOLDER_PATH; }
  get SAMPLES_FOLDER_PATH() { return this.appPathsService.SAMPLES_FOLDER_PATH; }
  get JOBS_FOLDER_PATH() { return this.appPathsService.JOBS_FOLDER_PATH; }
  get CONFIGURATION_FOLDER_PATH() { return this.appPathsService.CONFIGURATION_FOLDER_PATH; }
  get CONFIGURATION_BURST_FOLDER_PATH() { return this.appPathsService.CONFIGURATION_BURST_FOLDER_PATH; }
  get CONFIGURATION_REPORTS_FOLDER_PATH() { return this.appPathsService.CONFIGURATION_REPORTS_FOLDER_PATH; }
  get CONFIGURATION_CONNECTIONS_FOLDER_PATH() { return this.appPathsService.CONFIGURATION_CONNECTIONS_FOLDER_PATH; }
  get CONFIGURATION_DEFAULTS_FOLDER_PATH() { return this.appPathsService.CONFIGURATION_DEFAULTS_FOLDER_PATH; }
  get CONFIGURATION_SAMPLES_FOLDER_PATH() { return this.appPathsService.CONFIGURATION_SAMPLES_FOLDER_PATH; }
  get CONFIGURATION_TEMPLATES_FOLDER_PATH() { return this.appPathsService.CONFIGURATION_TEMPLATES_FOLDER_PATH; }
  get INTERNAL_SETTINGS_FILE_PATH() { return this.appPathsService.INTERNAL_SETTINGS_FILE_PATH; }
  get UPDATE_JAR_FILE_PATH() { return this.appPathsService.UPDATE_JAR_FILE_PATH; }
  get RUNNING_IN_E2E() { return this.appPathsService.RUNNING_IN_E2E; }
  get SHOULD_SEND_STATS() { return this.appPathsService.SHOULD_SEND_STATS; }
  get isWindows() { return this.appPathsService.isWindows; }
  set isWindows(v) { this.appPathsService.isWindows = v; }
  get isServerVersion() { return this.appPathsService.isServerVersion; }
  set isServerVersion(v) { this.appPathsService.isServerVersion = v; }
  get isJServerStarted() { return this.appPathsService.isJServerStarted; }
  set isJServerStarted(v) { this.appPathsService.isJServerStarted = v; }
  get product() { return this.appPathsService.product; }
  set product(v) { this.appPathsService.product = v; }
  get version() { return this.appPathsService.version; }
  set version(v) { this.appPathsService.version = v; }
  getDefaultsConfigurationValuesFilePath() { return this.appPathsService.getDefaultsConfigurationValuesFilePath(); }
  getMyReportsConfigurationValuesFilePath() { return this.appPathsService.getMyReportsConfigurationValuesFilePath(); }

  // ====================================================================
  //  Reports — load & cache
  //  These methods populate this.configurationFiles (the shared in-memory cache).
  //  Decision Log: load methods and filtered-view methods (next region) are intentionally
  //  in the same class — load populates the cache, the views read it. Splitting them into
  //  separate services would expose a mutable cache across a service boundary, which is
  //  a worse design than the current mild size.
  // ====================================================================

  /**
   * MINIMAL LOADING - Fast startup.
   * Returns only basic metadata needed for UI menus (no DSL parsing).
   * DSL options are loaded on-demand via loadReportDetails().
   */
  async loadAllReports({
    forceReload = false,
    withDetails = false,
  }: { forceReload?: boolean; withDetails?: boolean } = {}): Promise<Array<CfgTmplFileInfo>> {
    if (
      !forceReload &&
      this.configurationFiles &&
      this.configurationFiles.length > 0
    )
      return this.configurationFiles;

    if (forceReload) {
      this.configDetailsCache.clear();
    }

    // Use minimal endpoint for fast startup, full endpoint only when explicitly needed
    const endpoint = withDetails ? '/reports?withDetails=true' : '/reports';
    this.configurationFiles = await this.apiService.get(endpoint);

    return this.configurationFiles;
  }

  /**
   * FULL DETAILS LOADING - On-demand for a specific configuration.
   * Loads and caches DSL options (reportParameters, tabulatorOptions, etc.)
   * Merges the loaded details into the existing configurationFiles entry.
   */
  async loadReportDetails(configFile: CfgTmplFileInfo): Promise<CfgTmplFileInfo> {
    if (configFile.type !== 'config-reports' && configFile.type !== 'config-samples' && configFile.type !== 'config-jasper-reports') {
      return configFile;
    }

    const cacheKey = configFile.filePath;

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
        configFile.reportParameters = details.reportParameters || [];
        configFile.tabulatorOptions = details.tabulatorOptions;
        configFile.chartOptions = details.chartOptions;
        configFile.pivotTableOptions = details.pivotTableOptions;

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
      this.configDetailsCache.clear();
    }
  }


  async loadAllReportTemplates() {
    this.templateFiles = await this.apiService.get('/reports?type=templates');
    return this.templateFiles;
  }

  // ====================================================================
  //  Reports — filtered views
  //  These methods read from this.configurationFiles (populated by loadAllReports above).
  //  Decision Log: NOT split by report type (Jasper vs. MailMerge/generation vs. Samples)
  //  into separate services. All filters share one cache; splitting would either duplicate
  //  cache management or require cross-service access to the mutable configurationFiles
  //  array — both worse than keeping the filters here as thin one-liners.
  // ====================================================================

  private filterConfigurations(predicate: (c: CfgTmplFileInfo) => boolean): CfgTmplFileInfo[] {
    return this.configurationFiles?.length > 0
      ? this.configurationFiles.filter(predicate)
      : [];
  }

  getNonSampleConfigurations(): CfgTmplFileInfo[] {
    return this.filterConfigurations(c => c.type !== 'config-samples');
  }

  /** @deprecated Use getNonSampleConfigurations() */
  getConfigurations() {
    return this.getNonSampleConfigurations();
  }

  getJasperReportConfigurations(): CfgTmplFileInfo[] {
    return this.filterConfigurations(c => c.type === 'config-jasper-reports');
  }

  getSampleConfigurations(): CfgTmplFileInfo[] {
    return this.filterConfigurations(c => c.type === 'config-samples');
  }

  getReportGenerationConfigurations(filter?: { samples?: boolean }): CfgTmplFileInfo[] {
    return this.filterConfigurations(c => {
      let match = c.capReportGenerationMailMerge && c.dsInputType !== 'ds.dashboard';
      if (filter && !filter.samples) match = match && !c.filePath.includes('samples');
      return match;
    });
  }

  /** @deprecated Use getReportGenerationConfigurations() */
  getMailMergeConfigurations(filter?: { samples?: boolean }) {
    return this.getReportGenerationConfigurations(filter);
  }

  getReportTemplates(outputType: string, options: { samples?: boolean } = {}) {
    const allowedExtensions = ConfigurationRepository.TEMPLATE_EXTENSIONS_BY_OUTPUT[outputType] || [];

    const templatesOfType = this.templateFiles.filter(tplFile =>
      allowedExtensions.some(ext => tplFile.fileName.endsWith(ext))
    );

    // Further filter by configuration folder for DOCX templates only
    let filteredTemplates = templatesOfType;
    if (outputType === 'output.docx' && this.currentConfigurationTemplate?.folderName) {
      const folderToMatch = `/reports/${this.currentConfigurationTemplate.folderName}/`;
      filteredTemplates = templatesOfType.filter(tplFile =>
        tplFile.filePath.includes(folderToMatch)
      );
    }

    if (options && options.hasOwnProperty('samples')) {
      return filteredTemplates.filter(tplFile => {
        if (options.samples) return tplFile.type.includes('-sample');
        return !tplFile.type.includes('-sample');
      });
    }

    return filteredTemplates;
  }

  // ====================================================================
  //  Connections — load, cache, derived state
  // ====================================================================

  get emailConnections(): ExtConnection[] {
    return this.connectionFiles.filter(c => c.connectionType === 'email-connection');
  }

  get databaseConnections(): ExtConnection[] {
    return this.connectionFiles.filter(c => c.connectionType === 'database-connection');
  }

  /** @deprecated Use emailConnections getter */
  getEmailConnectionFiles(): ExtConnection[] {
    return this.emailConnections;
  }

  /** @deprecated Use databaseConnections getter */
  getDatabaseConnectionFiles(): ExtConnection[] {
    return this.databaseConnections;
  }

  // Potential race: concurrent callers get undefined instead of waiting. Assumed safe
  // (call sites are route-separated); fix with Promise singleton if symptoms appear.
  async loadAllConnections() {
    if (this.isLoadingConnections) return;
    this.isLoadingConnections = true;
    try {
      const fresh = await this.fetchConnectionsFromBackend();
      this.connectionFiles = fresh.map(conn => ({ ...conn, usedBy: this.computeUsedByForConnection(conn) }));
      this.memoizeDefaultConnections();
    } finally {
      this.isLoadingConnections = false;
    }
    return this.connectionFiles;
  }

  private async fetchConnectionsFromBackend(): Promise<ExtConnection[]> {
    const [email, db] = await Promise.all([
      this.apiService.get('/connections?type=email'),
      this.apiService.get('/connections?type=database'),
    ]);
    return [...(email || []), ...(db || [])];
  }

  private memoizeDefaultConnections() {
    this.defaultEmailConnectionFile = this.getConnectionDetails({
      connectionType: 'email-connection',
      defaultConnection: true,
      connectionCode: '',
    });
    this.defaultDatabaseConnectionFile = this.getConnectionDetails({
      connectionType: 'database-connection',
      defaultConnection: true,
      connectionCode: '',
    });
  }

  // Load-bearing cross-cluster join: reads configurationFiles (Reports cluster) to annotate
  // each connection with the report templates that reference it. This join is why both
  // clusters live in one class — splitting them would force this cross-cluster read across
  // a service boundary with no design benefit.
  private computeUsedByForConnection(conn: ExtConnection): string {
    const matchingTemplates = this.configurationFiles
      .filter(c => {
        if (c.type === 'config-samples') return false;
        if (conn.connectionType === 'email-connection') {
          return c.useEmlConn && c.emlConnCode == conn.connectionCode;
        }
        // database-connection: SQL/Script reports + JasperReports
        return (c.useDbConn && c.dbConnCode == conn.connectionCode)
          || c.dbConnectionCode == conn.connectionCode;
      })
      .map(c => c.templateName);
    return matchingTemplates.join(', ') || '--not used--';
  }

  recomputeConnectionUsage(
    filePath: string,
    xmlSettings: {
      documentburster: any;
    },
  ) {
    // Update the specific configuration file's connection metadata
    const configToUpdate = this.configurationFiles.find(
      (config) => config.filePath === filePath,
    );

    if (configToUpdate) {
      configToUpdate.useEmlConn =
        xmlSettings?.documentburster.settings.emailserver.useconn;
      configToUpdate.emlConnCode =
        xmlSettings?.documentburster.settings.emailserver.conncode;
    }

    // Recalculate "Used By" for all connections using the updated configuration
    this.connectionFiles = this.connectionFiles.map((connFile) => ({
      ...connFile,
      usedBy: this.computeUsedByForConnection(connFile),
    }));
  }

  /** @deprecated Use recomputeConnectionUsage() */
  refreshConnectionsUsedByInformation(
    filePath: string,
    xmlSettings: {
      documentburster: any;
    },
  ) {
    return this.recomputeConnectionUsage(filePath, xmlSettings);
  }

  isDefaultEmailConnectionConfigured(): boolean {
    const ph = ConfigurationRepository.UNCONFIGURED_EMAIL_PLACEHOLDERS;
    return (
      this.defaultEmailConnectionFile &&
      this.defaultEmailConnectionFile.emailserver &&
      this.defaultEmailConnectionFile.emailserver.host !== ph.host &&
      this.defaultEmailConnectionFile.emailserver.name !== ph.name &&
      this.defaultEmailConnectionFile.emailserver.fromaddress !== ph.fromaddress &&
      this.defaultEmailConnectionFile.emailserver.userid !== ph.userid &&
      this.defaultEmailConnectionFile.emailserver.userpassword !== ph.userpassword
    );
  }

  getConnectionDetails({
    connectionType,
    defaultConnection,
    connectionCode,
  }: {
    connectionType: string;
    defaultConnection: boolean;
    connectionCode: string;
  }) {
    let connFiles = [];

    if (this.connectionFiles.length > 0) {
      connFiles = this.connectionFiles.filter((connection: ExtConnection) => {
        return connection.connectionType == connectionType;
      });

      if (defaultConnection) {
        connFiles = connFiles.filter((connection: ExtConnection) => {
          return connection.defaultConnection;
        });
      }

      if (connectionCode && connectionCode.length > 0) {
        connFiles = connFiles.filter((connection: ExtConnection) => {
          return connection.connectionCode == connectionCode;
        });
      }

      if (connFiles && connFiles.length == 1) {
        return connFiles[0];
      }
    }
    return undefined;
  }
}
