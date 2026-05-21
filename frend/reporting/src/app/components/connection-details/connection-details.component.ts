import {
  ChangeDetectorRef,
  Component,
  input,
  model,
  OnInit,
  viewChild,
} from '@angular/core';
import { SHARED_IMPORTS } from '../../shared/shared-imports';
import { TreeComponent } from '../prime/tree.component';
import { FileExplorerComponent } from '../file-explorer/file-explorer.component';
import { FileExplorerDialogComponent } from '../file-explorer/file-explorer-dialog.component';
import { MarkdownModule } from 'ngx-markdown';

import Prism from 'prismjs';
import 'prismjs/components/prism-json'; // Import JSON language support
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-groovy';

import * as pako from 'pako';

import {
  ExtConnection,
  newDatabaseServer,
  newEmailServer,
  ConfigurationRepository,
} from '../../providers/configuration-repository.service';
import { AppPathsService } from '../../providers/app-paths.service';
import { ConnectionsService } from '../../providers/connections.service';
import { ConfirmService } from '../dialog-confirm/confirm.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { InfoService } from '../dialog-info/info.service';
import { ExecutionStatsService } from '../../providers/execution-stats.service';
import { WebSocketService } from '../../providers/websocket.service';
import { ActivatedRoute, Router } from '@angular/router';
import _ from 'lodash';
import Utilities from '../../helpers/utilities';
import { EmailProviderSettings } from '../button-well-known/button-well-known.component';
import {
  AiManagerComponent,
  AiManagerLaunchConfig,
} from '../ai-manager/ai-manager.component';
import { AppsManagerService, ManagedApp } from '../apps-manager/apps-manager.service';
import { PicklistComponent } from '../prime/picklist.component';
import { CubesService, CubeDefinition } from '../../providers/cubes.service';
import { iconSvg } from '../../shared/icon-svgs';

const PACK_DEFAULTS: Record<string, { host: string; port: string; database: string; userid: string; userpassword: string; usessl?: boolean }> = {
  postgresql: { host: 'localhost', port: '5432', database: 'Northwind', userid: 'postgres', userpassword: 'postgres', usessl: false },
  postgres:   { host: 'localhost', port: '5432', database: 'Northwind', userid: 'postgres', userpassword: 'postgres', usessl: false },
  mysql: { host: 'localhost', port: '3306', database: 'Northwind', userid: 'root', userpassword: 'password', usessl: false },
  mariadb: { host: 'localhost', port: '3307', database: 'Northwind', userid: 'root', userpassword: 'password', usessl: false }, // pack uses 3307
  sqlite: { host: '', port: '', database: '/db/sample-northwind-sqlite/northwind.db', userid: '', userpassword: '' },
  duckdb: { host: '', port: '', database: '/db/sample-northwind-duckdb/northwind.duckdb', userid: '', userpassword: '' },
  clickhouse: { host: 'localhost', port: '8123', database: 'northwind', userid: 'default', userpassword: 'clickhouse', usessl: false }, // HTTP interface
  sqlserver: { host: 'localhost', port: '1433', database: 'Northwind', userid: 'sa', userpassword: 'Password123!', usessl: false },
  oracle: { host: 'localhost', port: '1521', database: 'XEPDB1', userid: 'oracle', userpassword: 'oracle', usessl: false },
  ibmdb2: { host: 'localhost', port: '50000', database: 'NORTHWND', userid: 'db2inst1', userpassword: 'password', usessl: false },
  supabase: { host: 'localhost', port: '5435', database: 'Northwind', userid: 'supabase_admin', userpassword: 'postgres', usessl: false },
  timescaledb: { host: 'localhost', port: '5433', database: 'timeseries', userid: 'timescale', userpassword: 'timescale', usessl: false },
};

@Component({
    selector: 'dburst-connection-details',
    templateUrl: './connection-details.template.html',
    standalone: true,
    imports: [...SHARED_IMPORTS, TreeComponent, PicklistComponent, FileExplorerComponent, FileExplorerDialogComponent, MarkdownModule],
})
export class ConnectionDetailsComponent implements OnInit {
  readonly iconSvg = iconSvg;

  mode = input<'crud' | 'viewMode'>('crud');
  context = model<'crud' | 'sqlQuery' | 'scriptQuery' | 'dashboardScript' | 'cubeDsl'>('crud');
  reportId = model<string>('');
  apiBaseUrl = model<string>('');


  // Test connection result state
  testConnectionSuccess = false;
  testConnectionError = false;

  // True when the modal is opened to view a sample (read-only) connection
  isEditingSample = false;

  // Password visibility toggles
  showEmailPassword = false;
  showDbPassword = false;
  private emailPasswordRevealTimer: any;
  private dbPasswordRevealTimer: any;

  async toggleRevealEmailPassword() {
    if (this.showEmailPassword) {
      this.showEmailPassword = false;
      this.modalConnectionInfo.email.documentburster.connection.emailserver.userpassword = '******';
      clearTimeout(this.emailPasswordRevealTimer);
    } else {
      try {
        const connectionCode = this.getConnectionCode();
        const realPassword = await this.connectionsService.revealPassword(connectionCode, 'userpassword');
        this.modalConnectionInfo.email.documentburster.connection.emailserver.userpassword = realPassword;
        this.showEmailPassword = true;
        this.emailPasswordRevealTimer = setTimeout(() => {
          this.showEmailPassword = false;
          this.modalConnectionInfo.email.documentburster.connection.emailserver.userpassword = '******';
        }, 10000);
      } catch (e) { console.error('Failed to reveal email password', e); }
    }
  }

  async toggleRevealDbPassword() {
    if (this.showDbPassword) {
      this.showDbPassword = false;
      this.modalConnectionInfo.database.documentburster.connection.databaseserver.userpassword = '******';
      clearTimeout(this.dbPasswordRevealTimer);
    } else {
      try {
        const connectionCode = this.resolveConnectionCode();
        const realPassword = await this.connectionsService.revealPassword(connectionCode, 'userpassword');
        this.modalConnectionInfo.database.documentburster.connection.databaseserver.userpassword = realPassword;
        this.showDbPassword = true;
        this.dbPasswordRevealTimer = setTimeout(() => {
          this.showDbPassword = false;
          this.modalConnectionInfo.database.documentburster.connection.databaseserver.userpassword = '******';
        }, 10000);
      } catch (e) { console.error('Failed to reveal db password', e); }
    }
  }

  // Tab active states
  isConnectionDetailsTabActive = true;
  isDatabaseSchemaTabActive = false;
  isDomainGroupedSchemaTabActive = false;
  isErDiagramTabActive = false;
  isUbiquitousLanguageTabActive = false;
  isToolsTabActive = false;
  isSeedDataTabActive = false;

  // Seed Data tab state
  customSeedScript = '';
  // Override for the Example tab editor — null means "use vendor-specific default from getExampleCustomSeedScript()"
  exampleEditorOverride: string | null = null;
  // ID of the template currently shown in the Example tab — also serves as initial dropdown value
  loadedSeedTemplateId = '__EXAMPLE_DEFAULT__';
  // Two-way bound to the dropdown; may diverge from loadedSeedTemplateId while confirmation is pending
  selectedSeedTemplateId = '__EXAMPLE_DEFAULT__';
  seedTemplates: Array<{ id: string; displayName: string; description: string; source: string }> = [];

  /**
   * Content shown in the Example tab editor: the loaded template's source,
   * or the vendor-specific default when no override is set.
   */
  get exampleEditorScript(): string {
    return this.exampleEditorOverride !== null
      ? this.exampleEditorOverride
      : this.getExampleCustomSeedScript();
  }
  isSeedDataExampleActive = false;
  // True between Run Script click and the on.process.complete WebSocket event.
  // Covers the gap when scripts complete faster than the 250ms .job-file poll cycle.
  isCustomSeedRunning = false;

  // dp-tabs active-index bindings (drive [activeIndex] inputs)
  emailActiveTabIndex = 0;
  dbActiveTabIndex = 0;

  onEmailTabChange(e: { index: number; id: string }) {
    this.emailActiveTabIndex = e.index;
    this.isSMTPTabActive = e.id === 'smtpTab';
    this.isOAuth2TabActive = e.id === 'oauth2Tab';
  }

  onDbTabChange(e: { index: number; id: string }) {
    this.dbActiveTabIndex = e.index;
    this.isConnectionDetailsTabActive = e.id === 'connectionDetailsTab';
    this.isDatabaseSchemaTabActive = e.id === 'databaseSchemaTab';
    this.isDomainGroupedSchemaTabActive = e.id === 'domainGroupedDatabaseSchemaTab';
    this.isErDiagramTabActive = e.id === 'databaseDiagramTab';
    this.isUbiquitousLanguageTabActive = e.id === 'databaseUbiquitousLanguageTab';
    this.isToolsTabActive = e.id === 'toolsTab';
    this.isSeedDataTabActive = e.id === 'seedDataTab';
    if (e.id === 'seedDataTab') { this.onSeedDataTabSelected(); }
  }

  // Email connection tab states
  isSMTPTabActive = true;
  isOAuth2TabActive = false;
  isSigningInOAuth = false;
  private activeOAuthFlowId: string | null = null;
  private activeOAuthEventSource: EventSource | null = null;

  constructor(
    protected confirmService: ConfirmService,
    protected messagesService: ToastrMessagesService,
    protected connectionsService: ConnectionsService,
    protected settingsService: ConfigurationRepository,
    protected appPathsService: AppPathsService,
    protected infoService: InfoService,
    protected executionStatsService: ExecutionStatsService,
    protected appsManagerService: AppsManagerService,
    protected route: ActivatedRoute,
    protected router: Router,
    private cdRef: ChangeDetectorRef,
    private cubesService: CubesService,
    private webSocketService: WebSocketService,
  ) { }

  /**
   * Returns the active connection code regardless of whether the connection
   * has an on-disk XML (normal connections) or is a virtual sample (no filePath).
   * Use this instead of getConnectionCode() when no explicit path is available.
   */
  private resolveConnectionCode(): string {
    const fromPath = this.getConnectionCode();
    if (fromPath) return fromPath;
    if (this.isEditingSample) {
      return this.modalConnectionInfo?.database?.documentburster?.connection?.code || '';
    }
    return '';
  }

  /**
   * Extract connectionCode from a file path like "config/connections/db-test-7/db-test-7.xml" -> "db-test-7"
   */
  private getConnectionCode(filePath?: string): string {
    const fp = filePath || this.modalConnectionInfo.filePath;
    if (!fp) return '';
    const pathParts = fp.split('/');
    const connectionFileName = pathParts[pathParts.length - 1];
    return connectionFileName.replace(/\.xml$/i, '');
  }

  ngOnInit(): void {
    //console.log(
    //  `ConfigurationConnectionsComponet: ngOnInit() mode: ${this.mode}`,
    //);

    this.initializePlantUmlDiagram();
  }

  private aiManagerInstance = viewChild<AiManagerComponent>(AiManagerComponent);
  databaseSchemaPicklistRef = viewChild<PicklistComponent>('databaseSchemaPicklistRef');
  domainGroupedSchemaPicklistRef = viewChild<PicklistComponent>('domainGroupedSchemaPicklistRef');
  cubesPicklistRef = viewChild<PicklistComponent>('cubesPicklistRef');

  // Cube-based SQL generation (sqlQuery context only). Auto-hidden when
  // the current connection has zero cubes. The toggle replaces the
  // Database Schema tab's table picklist with a flat cube picklist.
  cubesForCurrentConnection: CubeDefinition[] = [];
  useCubesInsteadOfTables = false;
  cubeSourceItems: any[] = [];   // flat list of cube nodes for picklist source
  cubeTargetItems: any[] = [];   // selected cubes (picklist target)

  modalConnectionInfo = {
    connectionType: 'email-connection',
    crudMode: 'create',
    duplicate: false,
    modalTitle: 'Create Email Connection',
    //connectionCode: '',
    //connectionName: '',
    filePath: '',
    connectionSameFilePathAlreadyExists: '' as boolean | string,
    email: {
      documentburster: {
        connection: {
          code: '',
          name: '',
          defaultConnection: false,
          emailserver: { ...newEmailServer },
        },
      },
    },
    database: {
      // Add database structure
      documentburster: {
        connection: {
          code: '',
          name: '',
          defaultConnection: false,
          databaseserver: { ...newDatabaseServer },
        },
      },
    },
  };

  initialAiCopilotActiveTabKey?: 'PROMPTS' | 'CHAT2DB' | 'HEY_AI';
  initialAiCopilotSelectedCategory?: string;
  initialAiCopilotExpandedPromptId?: string;
  initialAiCopilotVariables?: { [key: string]: string };

  isModalEmailConnectionVisible = false;
  isModalDbConnectionVisible = false;

  showSchemaTreeSelect = false; // Flag to control visibility of the PickList section

  // --- PickList properties for Database Schema tab ---
  sourceSchemaObjects = []; // Available objects for PickList source
  targetSchemaObjects = []; // Selected objects for PickList target
  isSchemaLoading = false; // Flag to indicate schema loading in progress
  isTestingConnection = false; // Flag to indicate schema loading in progress

  private rawSchemaData: any = null; // Cached raw schema data

  // rawDomainGroupedSchema is an in-memory JS object, derived by parsing domainGroupedSchemaJsonTextContent.
  // It's used to populate the picklist's source view.
  // Its structure is expected to be { domainGroups: any[] } by processDomainGroupedSchema.
  private rawDomainGroupedSchema: { domainGroups: any[] } = {
    domainGroups: [],
  };

  showDomainSchemaTreeSelect = true; // Flag to control visibility of the Domain-Grouped Schema PickList section

  domainSourceSchemaObjects = []; // Available objects for Domain-Grouped Schema PickList source
  // domainTargetSchemaObjects holds the user's picklist selections. This state is ephemeral for persistence
  // and is NOT saved back to the domain-grouped-schema.json file.
  domainTargetSchemaObjects = []; // Selected objects for Domain-Grouped Schema PickList target

  isDomainGroupedCodeViewActive: boolean = false;
  // domainGroupedSchemaJsonTextContent is the authoritative raw string from file or ngx-codejar editor.
  // This is the ONLY content that gets saved for the domain-grouped schema.
  domainGroupedSchemaJsonTextContent: string = '';

  // Re-entrancy guard for onDomainGroupedSchemaJsonTextContentChanged —
  // true only while the handler is rewriting the editor after auto-hydration,
  // so the re-fired change event short-circuits cleanly.
  private isRehydratingDomainSchema: boolean = false;

  // Domain-grouped schema properties
  domainGroupedSchemaExists = false;
  domainGroupedSchemaPath = '';

  isDiagramEditMode: boolean = false;

  erDiagramFilePath: string = '';

  plantUmlCode: string = '';

  encodedPlantUmlDiagram: string = '';

  // ── ER Diagram domain filter (client-side only, never persisted) ──
  // Populated from rawDomainGroupedSchema whenever DGS is available. The
  // dropdown above the diagram lets the user filter the rendered ER diagram
  // to a single business domain. The plantUmlCode SSOT and the .puml file on
  // disk are NEVER touched by the filter — only the rendered displayedPlantUmlCode
  // changes. Selecting "All" restores the original code.
  availableBusinessDomains: { label: string; tableNames: string[] }[] = [];
  selectedBusinessDomain: string = 'All';
  // The PUML actually fed into encodePlantUmlDiagram(). Mirrors plantUmlCode
  // when filter is "All", filtered subset otherwise.
  displayedPlantUmlCode: string = '';
  // Counts for the "Showing X of Y tables" indicator.
  totalEntitiesInPuml: number = 0;
  filteredEntitiesInPuml: number = 0;

  ubiquitousLanguageFilePath: string = '';

  isUbiquitousLanguageEditMode: boolean = false;

  ubiquitousLanguageMarkdown: string = '';

  sqliteFileBrowserVisible: boolean = false;

  get erDiagramExists(): boolean {
    return !!this.plantUmlCode;
  }

  async updateModelAndForm() {
    if (this.modalConnectionInfo.crudMode != 'update') {
      // Determine connection type and use appropriate values
      const isDbConnection = this.isModalDbConnectionVisible;
      const connectionPrefix = isDbConnection ? 'db' : 'eml';
      const connectionName = isDbConnection
        ? this.modalConnectionInfo.database.documentburster.connection.name
        : this.modalConnectionInfo.email.documentburster.connection.name;

      let connectionCode = `${connectionPrefix}-${_.kebabCase(connectionName)}`;
      if (isDbConnection) {
        const dbType = this.modalConnectionInfo.database.documentburster.connection.databaseserver.type;
        connectionCode = `${connectionCode}-${dbType}`;
      }
      const connectionFileName = `${connectionCode}.xml`;

      // Create different path structures based on connection type
      if (isDbConnection) {
        // For database connections: create a folder structure
        // Path format: /config/connections/db-my-connection-postgresql/db-my-connection-postgresql.xml
        const folderPath = `${this.appPathsService.CONFIGURATION_CONNECTIONS_FOLDER_PATH}/${connectionCode}`;
        this.modalConnectionInfo.filePath = `${folderPath}/${connectionFileName}`;

        // Check if a connection with this code already exists in the loaded list
        const existingConnection = this.settingsService.connectionFiles.find(
          (conn) => conn.connectionCode === connectionCode,
        );
        this.modalConnectionInfo.connectionSameFilePathAlreadyExists = existingConnection ? 'file' : false;
      } else {
        // For email connections: maintain current approach with a single file
        // Path format: /config/connections/eml-my-connection.xml
        this.modalConnectionInfo.filePath = `${this.appPathsService.CONFIGURATION_CONNECTIONS_FOLDER_PATH}/${connectionFileName}`;

        // Check if a connection with this code already exists in the loaded list
        const existingConnection = this.settingsService.connectionFiles.find(
          (conn) => conn.connectionCode === connectionCode,
        );
        this.modalConnectionInfo.connectionSameFilePathAlreadyExists = existingConnection ? 'file' : false;
      }
    }
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

  async doTestSMTPConnection() {
    // the actual “Send test email?” flow — matches old shellService.runBatFile pattern:
    // confirmAction is synchronous, sets isTestingConnection=true immediately,
    // then fires the API call in the background (fire-and-forget, like runBatFile did)
    const runTest = async () => {
      if (this.executionStatsService.logStats.foundDirtyLogFiles) {
        this.infoService.showInformation({
          message: 'Log files are not empty. You need to press the Clear Logs button first.',
        });
        return;
      }
      this.confirmService.askConfirmation({
        message: 'Send test email?',
        confirmAction: () => {
          // Synchronous: disable button immediately (same as old shellService.runBatFile)
          this.isTestingConnection = true;
          this.cdRef.detectChanges();

          // Fire-and-forget: API call runs in background (same as old runBatFile callback)
          const connectionCode = this.getConnectionCode();
          this.connectionsService.testConnection(connectionCode, 'email')
            .then(() => {
              this.isTestingConnection = false;
              this.messagesService.showSuccess('Test email sent successfully');
              this.cdRef.detectChanges();
            })
            .catch((err) => {
              this.isTestingConnection = false;
              this.messagesService.showError('Test email failed');
              console.error(err);
              this.cdRef.detectChanges();
            });
        },
      });
    };

    if (this.modalConnectionInfo.crudMode === 'create') {
      // first-save prompt for brand-new connections
      this.confirmService.askConfirmation({
        message: 'The connection must be saved before being able to test it. Save now?',
        confirmAction: async () => {
          await this.saveCurrentConnection(this.isModalDbConnectionVisible);
          this.modalConnectionInfo.crudMode = 'update';
          await runTest();
        },
        cancelAction: () => { },
      });
    } else {
      // existing connection: always save latest field values, then test
      await this.saveCurrentConnection(this.isModalDbConnectionVisible);
      await runTest();
    }
  }

  async updateSMTPFormControlsWithSelectedProviderSettings(
    selectedProviderSettings: EmailProviderSettings,
  ) {
    this.modalConnectionInfo.email.documentburster.connection.emailserver.usessl =
      false;
    this.modalConnectionInfo.email.documentburster.connection.emailserver.usetls =
      false;

    this.modalConnectionInfo.email.documentburster.connection.emailserver.host =
      selectedProviderSettings.host;
    this.modalConnectionInfo.email.documentburster.connection.emailserver.port =
      selectedProviderSettings.port;

    if (selectedProviderSettings.secure === true) {
      this.modalConnectionInfo.email.documentburster.connection.emailserver.usessl =
        true;
    }

    if (selectedProviderSettings.tls) {
      this.modalConnectionInfo.email.documentburster.connection.emailserver.usetls =
        true;
    }
  }

  async onModalOK() {
    const isDb = this.isModalDbConnectionVisible;
    
    // Check if this is a DuckDB connection without a file (in-memory)
    if (isDb) {
      const dbServer = this.modalConnectionInfo.database.documentburster.connection.databaseserver;
      if (dbServer.type === 'duckdb' && !dbServer.database) {
        // Show confirmation for in-memory DuckDB
        this.confirmService.askConfirmation({
          message: 'You did not select any DuckDB database file. This means you want to create an "in-memory" DuckDB connection (useful for querying CSV/Parquet files directly). Continue?',
          confirmAction: async () => {
            await this.proceedWithSave(isDb);
          },
          cancelAction: () => {
            // User cancelled, don't save
          },
        });
        return;
      }
    }
    
    await this.proceedWithSave(isDb);
  }

  private async proceedWithSave(isDb: boolean) {
    const mainConnectionSaved = await this.saveCurrentConnection(isDb); // Saves the .xml connection file

    if (mainConnectionSaved) {
      if (isDb) {
        // For database connections, save associated schema files
        await this.saveConnectionDomainGroupedSchema();
        await this.saveConnectionErDiagram();
        await this.saveConnectionUbiquitousLanguage();
        this.isModalDbConnectionVisible = false;
      } else {
        this.isModalEmailConnectionVisible = false;
      }
      // General "Saved" message was shown by saveCurrentConnection or can be consolidated here if needed.
      // Specific messages for sub-saves are handled within those methods.
    }
  }


  onModalClose() {
    this.isModalEmailConnectionVisible = false;
    this.isModalDbConnectionVisible = false;
  }

  async onDbTypeChange(newType: string): Promise<void> {
    const dbServer =
      this.modalConnectionInfo.database.documentburster.connection.databaseserver;

    // CRITICAL: Explicitly set the type property FIRST so updateModelAndForm() reads correct value
    dbServer.type = newType;

    if (newType === 'sqlite' || newType === 'duckdb') {
      dbServer.database = '';
      dbServer.host = '';
      dbServer.port = '';
      dbServer.userid = '';
      dbServer.userpassword = '';
      dbServer.usessl = false;

      // Rebuild folder path with correct vendor suffix (async - will complete in background)
      await this.updateModelAndForm();
      return;
    }

    const key = (newType || '').toLowerCase();
    const d = PACK_DEFAULTS[key];
    if (d) {
      dbServer.host = d.host;
      dbServer.port = d.port;
      dbServer.database = d.database;
      dbServer.userid = d.userid;
      dbServer.userpassword = d.userpassword;
      dbServer.usessl = !!d.usessl;
    }

    // Rebuild folder path with correct vendor suffix (async - will complete in background)
    await this.updateModelAndForm();
  }

  onOAuth2ProviderChange(_provider: string): void {
    // ngModel already writes to the model — nothing extra needed
  }

  async onSignInOAuth(): Promise<void> {
    const emailserver = this.modalConnectionInfo.email.documentburster.connection.emailserver as any;
    const payload = {
      provider: emailserver.oauth2provider,
      tenantId: emailserver.oauth2tenantid || '',
      clientId: emailserver.oauth2clientid,
      authorizeUrl: emailserver.oauth2authorizeurl || '',
      tokenUrl: emailserver.oauth2tokenurl || '',
      scope: emailserver.oauth2scope || '',
    };

    this.isSigningInOAuth = true;
    this.cdRef.detectChanges();

    try {
      const connectionId = this.resolveConnectionCode() || 'new';
      const { flowId } = await this.connectionsService.startEmailOAuth(connectionId, payload);
      this.activeOAuthFlowId = flowId;

      const sseUrl = `${this.connectionsService.apiService.BACKEND_URL}/api/connections/${encodeURIComponent(connectionId)}/oauth-flow/${flowId}/events`;
      this.activeOAuthEventSource = new EventSource(sseUrl);

      this.activeOAuthEventSource.addEventListener('success', async (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        emailserver.oauth2useremail = data.userEmail || '';
        emailserver.oauth2refreshtoken = data.refreshToken || '';
        this.isSigningInOAuth = false;
        this.activeOAuthEventSource?.close();
        this.activeOAuthEventSource = null;
        this.activeOAuthFlowId = null;
        this.cdRef.detectChanges();

        // Auto-save right away so the freshly-issued refresh token can never be lost
        // by the user closing the modal without clicking Save. The save path encrypts
        // the token at rest and is idempotent — the user's later explicit Save click
        // will re-post the same plaintext form value, which the backend either re-encrypts
        // (overwriting with a new ENC(...) ciphertext of the same plaintext, AES-GCM
        // randomized nonce makes the bytes differ but the secret is identical) or
        // preserves untouched if the form is reloaded with PASSWORD_MASK before the
        // second save. Either way the on-disk file always holds a valid encrypted token.
        const autoSaved = await this.saveCurrentConnection(false);
        if (autoSaved) {
          // Tell the user we did the heavy lifting AND ask them to confirm with Save.
          // Putting them in the loop makes the responsibility explicit and avoids the
          // "wait, did it actually persist?" feeling that silent auto-saves create.
          this.infoService.showInformation({
            message:
              `<strong>Sign-in successful</strong> — connected as <code>${data.userEmail}</code>.<br /><br />` +
              `The OAuth2 credentials have been auto-saved so they cannot be lost. ` +
              `Please click <strong>Save</strong> to confirm and finalize the email connection.`,
          });
        }
      });

      this.activeOAuthEventSource.addEventListener('error', (event: MessageEvent) => {
        const data = (event as any).data ? JSON.parse((event as any).data) : {};
        this.messagesService.showError(data.error || 'OAuth2 sign-in failed');
        this.isSigningInOAuth = false;
        this.activeOAuthEventSource?.close();
        this.activeOAuthEventSource = null;
        this.activeOAuthFlowId = null;
        this.cdRef.detectChanges();
      });

      this.activeOAuthEventSource.onerror = () => {
        if (this.isSigningInOAuth) {
          this.messagesService.showError('OAuth2 sign-in connection lost');
          this.isSigningInOAuth = false;
          this.activeOAuthEventSource?.close();
          this.activeOAuthEventSource = null;
          this.activeOAuthFlowId = null;
          this.cdRef.detectChanges();
        }
      };
    } catch (err) {
      this.messagesService.showError('Failed to start OAuth2 sign-in');
      this.isSigningInOAuth = false;
      this.cdRef.detectChanges();
    }
  }

  onDisconnectOAuth(): void {
    const emailserver = this.modalConnectionInfo.email.documentburster.connection.emailserver as any;
    emailserver.oauth2useremail = '';
    emailserver.oauth2refreshtoken = '';
    if (this.activeOAuthFlowId) {
      const cId = this.resolveConnectionCode() || 'new';
      this.connectionsService.cancelEmailOAuth(cId, this.activeOAuthFlowId).catch(() => {});
      this.activeOAuthFlowId = null;
    }
    this.activeOAuthEventSource?.close();
    this.activeOAuthEventSource = null;
    this.isSigningInOAuth = false;
    this.cdRef.detectChanges();
  }

  openSqliteFileBrowser() {
    this.sqliteFileBrowserVisible = true;
  }

  async doTestDatabaseConnection() {

    if (this.executionStatsService.logStats.foundDirtyLogFiles) {
      this.infoService.showInformation({
        message:
          'Log files are not empty. You need to press the Clear Logs button first.',
      });
      return;
    }

    const performTestLogic = async (filePathToTest: string) => {
      this.isTestingConnection = true;
      this.testConnectionSuccess = false;
      this.testConnectionError = false;
      this.isSchemaLoading = true;
      this.showSchemaTreeSelect = false;
      this.sourceSchemaObjects = [];
      this.targetSchemaObjects = [];
      this.cdRef.detectChanges();

      try {
        const connectionCode = this.getConnectionCode(filePathToTest);
        await this.connectionsService.testConnection(connectionCode, 'database');
        this.isTestingConnection = false;
        this.testConnectionSuccess = true;
        this.testConnectionError = false;
        this.messagesService.showSuccess(
          'Successfully connected to the database and fetched schema.',
        );
        this.loadSchemaFromBackend(filePathToTest);
      } catch (err) {
        this.isTestingConnection = false;
        this.testConnectionSuccess = false;
        this.testConnectionError = true;
        this.messagesService.showError(
          err?.message ||
          'Failed to connect to the database or fetch schema. Please check logs.',
        );
        this.isSchemaLoading = false;
        this.showSchemaTreeSelect = false;
      }
      this.cdRef.detectChanges();
    };

    const proceedWithTest = async () => {
      if (this.executionStatsService.logStats.foundDirtyLogFiles) {
        this.infoService.showInformation({
          message:
            'Log files are not empty. You need to press the Clear Logs button first.',
        });
        return;
      }
      this.confirmService.askConfirmation({
        message: 'Test database connection?',
        confirmAction: async () => {
          const rawFilePath = this.modalConnectionInfo.filePath;
          if (!rawFilePath) {
            if (this.isEditingSample) {
              // Sample connections have no on-disk XML until the first test.
              // The backend's materializeSampleIfNeeded() creates it automatically.
              // Pass the connection code directly — getConnectionCode() returns it unchanged.
              const sampleCode = this.modalConnectionInfo.database?.documentburster?.connection?.code;
              if (sampleCode) {
                await performTestLogic(sampleCode);
                return;
              }
            }
            this.messagesService.showError(
              'Connection file path is not defined.',
            );
            return;
          }
          await performTestLogic(rawFilePath);
        },
        cancelAction: () => {
          // User cancelled testing
        },
      });
    };

    if (this.modalConnectionInfo.crudMode === 'create') {
      this.confirmService.askConfirmation({
        message:
          'The connection must be saved before being able to test it. Save now?',
        confirmAction: async () => {
          const saved = await this.saveCurrentConnection(true); // true for isDbConnection
          if (saved) {
            const savedFilePath = this.modalConnectionInfo.filePath;
            if (savedFilePath) {
              await performTestLogic(savedFilePath);
            } else {
              this.messagesService.showError(
                'Failed to get file path after saving. Cannot test connection.',
              );
              this.isTestingConnection = false;
              this.isSchemaLoading = false;
              this.cdRef.detectChanges();
            }
          }
        },
        cancelAction: () => {
          // User clicked No to saving
        },
      });
    } else {
      // Existing connection
      await proceedWithTest();
    }
  }

  isTestDbConnectionDisabled(): boolean {
    if (this.isTestingConnection) {
      return true;
    }

    // disable if no connection name provided
    if (!this.modalConnectionInfo.database.documentburster.connection.name) {
      return true;
    }
    const dbServer =
      this.modalConnectionInfo.database.documentburster.connection
        .databaseserver;

    // Rule 1: Database Type must be selected (this check remains the same)
    if (!dbServer.type) {
      return true; // Disabled if no type selected
    }

    // Rule 2: Check based on type
    if (dbServer.type === 'sqlite') {
      // For SQLite: Database File must be provided
      if (!dbServer.database) {
        return true; // Disabled if database file path is missing
      }
    } else if (dbServer.type === 'duckdb') {
      // For DuckDB: File is OPTIONAL (empty = in-memory connection)
      // Always allow testing for DuckDB as in-memory is valid
      return false;
    } else {
      // For non-SQLite/DuckDB types: Check if fields are empty OR still contain the placeholder text
      if (
        !dbServer.host ||
        dbServer.host === newDatabaseServer.host ||
        !dbServer.port || // Port check might be just for non-empty as it's auto-populated
        !dbServer.database ||
        dbServer.database === newDatabaseServer.database ||
        !dbServer.userid ||
        dbServer.userid === newDatabaseServer.userid ||
        !dbServer.userpassword ||
        dbServer.userpassword === newDatabaseServer.userpassword
      ) {
        return true; // Disabled if any required field is missing or is still the placeholder
      }
    }

    // If all checks pass, the button should be enabled
    return false;
  }

  refreshDatabaseSchema(): void {
    // Don't proceed if already loading
    if (this.isSchemaLoading) {
      return;
    }

    // Show confirmation dialog
    this.confirmService.askConfirmation({
      message: 'This will refresh the Database Schema. Continue?',
      confirmAction: async () => {
        const filePath = this.modalConnectionInfo.filePath;
        const connectionCode = filePath
          ? this.getConnectionCode(filePath)
          : this.resolveConnectionCode();
        if (!connectionCode) {
          this.messagesService.showError(
            'Connection file path is missing. Cannot refresh schema.',
          );
          return;
        }

        // Set loading state
        this.isSchemaLoading = true;
        this.cdRef.detectChanges();

        try {
          await this.connectionsService.testConnection(connectionCode, 'database');
          // Reload the schema data
          this.loadSchemaFromBackend(filePath || connectionCode);
        } catch (err) {
          this.isSchemaLoading = false;
          this.messagesService.showError(
            'Failed to refresh database schema.',
          );
          this.cdRef.detectChanges();
        }
      },
    });
  }

  async toggleDomainGroupedCodeView(): Promise<void> {
    this.isDomainGroupedCodeViewActive = !this.isDomainGroupedCodeViewActive;
    if (this.isDomainGroupedCodeViewActive) {
      // Switched TO Code View (ngx-codejar):
      // ngx-codejar will display domainGroupedSchemaJsonTextContent.
      // No explicit update needed here for domainGroupedSchemaJsonTextContent itself.
      // rawDomainGroupedSchema should already be in sync if changes were made via editor.
    } else {
      // Switched TO Picklist View:
      // Ensure rawDomainGroupedSchema (for picklist's source) is up-to-date with
      // the current domainGroupedSchemaJsonTextContent from the editor.
      try {
        // Use a temporary variable for parsing to avoid altering rawDomainGroupedSchema on parse error
        const parsed = JSON.parse(
          this.domainGroupedSchemaJsonTextContent.trim() === ''
            ? '{}'
            : this.domainGroupedSchemaJsonTextContent,
        );
        // Normalize the parsed content into the expected { domainGroups: [] } structure
        this.rawDomainGroupedSchema = this.normalizeSchemaFormat(parsed);
      } catch (e) {
        console.warn(
          'Error parsing editor content when switching to picklist view. Picklist source might be stale.',
          e,
        );
        // Fallback to an empty structure for rawDomainGroupedSchema to prevent errors in processDomainGroupedSchema
        this.rawDomainGroupedSchema = { domainGroups: [] };
      }
      this.processDomainGroupedSchema(this.rawDomainGroupedSchema);
      // domainTargetSchemaObjects are ephemeral and typically would be reset or re-evaluated
      // For now, we leave them as they were, or they could be cleared:
      // this.domainTargetSchemaObjects = [];
    }
    this.cdRef.detectChanges();
  }

  launchAiCopilotForDomainSchemaGeneration(): void {
    if (!this.rawSchemaData || !this.rawSchemaData.tables) {
      this.messagesService.showError(
        'Raw database schema is not loaded. Please load or refresh the database schema first to generate a domain-grouped schema.',
      );
      return;
    }

    // Build a LIGHTWEIGHT table summary — just names + types + FK target table
    // names. The LLM only needs this to decide "which domain does each table
    // belong to?". Columns/types/sizes would be pure echo-back waste because
    // the client already has them cached in rawSchemaData and will hydrate
    // the AI response on paste via hydrateDomainGroupedSchemaPaste().
    // Compare: Northwind full dump ~300 KB → slim summary ~2 KB.
    const slimSummary = this.rawSchemaData.tables.map((t: any) => ({
      tableName: t.tableName,
      tableType: t.tableType,
      primaryKeyColumns: t.primaryKeyColumns || [],
      refs: (t.foreignKeys || [])
        .map((fk: any) => fk.pkTableName || fk.referencedTableName)
        .filter((n: string) => !!n),
    }));
    const schemaTablesJsonString = JSON.stringify(slimSummary, null, 2);

    const launchConfig: AiManagerLaunchConfig = {
      initialActiveTabKey: 'PROMPTS',
      initialSelectedCategory: 'Database Schema',
      initialExpandedPromptId: 'DB-SCHEMA-DOMAIN-GROUPED',
      promptVariables: {
        '[INSERT YOUR DATABASE SCHEMA HERE]': schemaTablesJsonString,
      },
    };

    if (this.aiManagerInstance()) {
      this.aiManagerInstance().launchWithConfiguration(launchConfig);
    } else {
      this.messagesService.showError('AI Copilot component is not available.');
      console.error(
        'AI Copilot instance is not found. Ensure @ViewChild(AiManagerComponent) is correctly configured.',
      );
    }
  }

  launchAiCopilotForSchemaQuery(): void {
    // Cube-based generation branch (sqlQuery / scriptQuery contexts,
    // toggle on). Routes the request to a separate launcher that sends
    // cube DSL semantic models to the LLM instead of raw table metadata.
    // The launcher itself picks the right prompt id (SQL vs Groovy script)
    // based on the current context, mirroring the existing dispatch below.
    const isCubeAiHelperContext =
      this.context() === 'sqlQuery' || this.context() === 'scriptQuery' || this.context() === 'dashboardScript';
    if (isCubeAiHelperContext && this.useCubesInsteadOfTables) {
      this.launchAiCopilotForCubeBasedQuery();
      return;
    }

    let selectedTableObjects: any[] = [];
    let sourceSchemaName = '';

    if (this.isDatabaseSchemaTabActive) {
      selectedTableObjects = this.targetSchemaObjects; // Use targetSchemaObjects for Database Schema tab
      sourceSchemaName = 'Database Schema';
    } else if (this.isDomainGroupedSchemaTabActive) {
      selectedTableObjects = this.domainTargetSchemaObjects; // Use domainTargetSchemaObjects for Domain-Grouped Schema tab
      sourceSchemaName = 'Domain-Grouped Schema';
    } else {
      this.messagesService.showError(
        'Cannot determine the active schema tab to get selected tables.',
      );
      return;
    }

    // The this.context check might still be relevant depending on your overall design
    // For example, this feature might only be available when context is 'sqlQuery'
    if ((this.context() === 'sqlQuery' || this.context() === 'scriptQuery' || this.context() === 'dashboardScript' || this.context() === 'cubeDsl') && selectedTableObjects.length === 0) {
      this.messagesService.showInfo(
        `Please select at least one table from the ${sourceSchemaName}.`, // Dynamic message
      );
      return;
    }

    // If not in 'sqlQuery' context but still no tables selected (e.g. if button was enabled some other way)
    if (selectedTableObjects.length === 0) {
      this.messagesService.showInfo(
        `No tables selected from the ${sourceSchemaName}.`, // Dynamic message
      );
      return;
    }

    let selectedTableNames: string[] = [];

    if (this.isDatabaseSchemaTabActive) {
      selectedTableNames = selectedTableObjects
        .map((item) => item.label) // item.label is the table name
        .filter((label) => !!label);
    } else if (this.isDomainGroupedSchemaTabActive) {
      selectedTableNames = selectedTableObjects
        .map((node: any) => node.label)
        .filter((name: string) => !!name);
    }

    //console.log(`selectedTableNames: ${selectedTableNames}`);

    if (selectedTableNames.length === 0) {
      this.messagesService.showInfo(
        `No table names could be determined from the selection in ${sourceSchemaName}.`,
      );
      return;
    }

    //console.log('selectedTableNames:', selectedTableNames);

    // Filter the rawSchemaData.tables to get the full objects for selected tables
    let relevantTableData: any[] = [];

    relevantTableData = this.rawSchemaData.tables.filter(
      (table) => selectedTableNames.includes(table.tableName)
    );

    if (relevantTableData.length === 0) {
      this.messagesService.showError(
        `Could not find the schema details for the selected tables in ${sourceSchemaName}. Ensure the base schema is loaded.`,
      );
      return;
    }

    // Determine which picklist is active and whether field selection is enabled
    const activePicklist = this.isDatabaseSchemaTabActive
      ? this.databaseSchemaPicklistRef()
      : this.domainGroupedSchemaPicklistRef();

    let schemaString: string;

    if (activePicklist?.enableFieldSelection) {
      const fieldState = activePicklist.getFieldSelectionState();

      // Helper: check if a node (or any of its children) matches a table name.
      // Handles both database schema (node IS the table) and domain-grouped (node is a domain group, children are tables).
      const nodeMatchesTable = (node: any, tableName: string): boolean =>
        node.key === tableName || node.label === tableName ||
        (node.children || []).some((c: any) => c.key === tableName || c.label === tableName);

      // Helper: collect table names from a node (direct or via children for domain-grouped)
      const getTableNames = (node: any): string[] => {
        if (!node.children?.length || node.children[0]?.children !== undefined) {
          // Domain-grouped: children are table nodes
          return (node.children || []).map((c: any) => c.label || c.key);
        }
        // Database schema: node IS the table
        return [node.label || node.key];
      };

      // Build full-detail tables (all columns included)
      const fullDetailData = relevantTableData.filter(
        (table: any) => fieldState.fullDetailTables.some((n) => nodeMatchesTable(n, table.tableName)),
      );

      // Build partial-detail tables (only checked columns/tables)
      const partialDetailData: any[] = [];
      for (const entry of fieldState.partialDetailTables) {
        const selectedChildNames = entry.selectedChildren.map((c: any) => c.label || c.key);

        // Check if children are tables (domain-grouped) or columns (database schema)
        const firstChild = entry.selectedChildren[0];
        const childrenAreTables = firstChild && (firstChild.children !== undefined);

        if (childrenAreTables) {
          // Domain-grouped: selected children are table nodes — include them with full details
          const matchedTables = relevantTableData.filter(
            (t: any) => selectedChildNames.includes(t.tableName),
          );
          partialDetailData.push(...matchedTables);
        } else {
          // Database schema: selected children are column nodes — filter columns
          const rawTable = relevantTableData.find(
            (t: any) => t.tableName === entry.node.key || t.tableName === entry.node.label,
          );
          if (!rawTable) continue;

          const selectedColumnNames = entry.selectedChildren.map(
            (child: any) => child.data?.columnName || child.label,
          );

          partialDetailData.push({
            ...rawTable,
            columns: (rawTable.columns || []).filter(
              (col: any) => selectedColumnNames.includes(col.columnName),
            ),
            primaryKeyColumns: (rawTable.primaryKeyColumns || []).filter(
              (pk: string) => selectedColumnNames.includes(pk),
            ),
            foreignKeys: (rawTable.foreignKeys || []).filter(
              (fk: any) => selectedColumnNames.includes(fk.fkColumnName),
            ),
          });
        }
      }

      const tablesWithSchema = [...fullDetailData, ...partialDetailData];

      // Name-only: collect table names (flatten domain groups if needed)
      const nameOnlyTableNames: string[] = [];
      for (const n of fieldState.nameOnlyTables) {
        nameOnlyTableNames.push(...getTableNames(n));
      }

      // Build sectioned string
      let sections = '';

      if (tablesWithSchema.length > 0) {
        sections += 'Tables with Full/Partial Schema:\n\n```json\n';
        sections += JSON.stringify(tablesWithSchema, null, 2);
        sections += '\n```\n\n';
      }

      if (nameOnlyTableNames.length > 0) {
        sections += 'Tables Included by Name Only (no column details provided):\n';
        sections += nameOnlyTableNames.map((n) => `- ${n}`).join('\n');
        sections += '\n';
      }

      schemaString = sections;
    } else {
      // Original behavior — all table details as JSON
      schemaString = '```json\n' + JSON.stringify(relevantTableData, null, 2) + '\n```';
    }

    const isDashboard = this.context() === 'dashboardScript';
    const isScript = this.context() === 'scriptQuery';
    const isCube = this.context() === 'cubeDsl';
    const targetPromptId =
      isDashboard ? 'DASHBOARD_BUILD_STEP_BY_STEP_INSTRUCTIONS'
      : isScript ? 'GROOVY_SCRIPT_INPUT_SOURCE'
      : isCube ? 'CUBE_DSL_CONFIGURE'
      : 'SQL_FROM_NATURAL_LANGUAGE';
    const targetCategory =
      isDashboard ? 'Dashboard Creation'
      : isScript ? 'Script Writing Assistance'
      : isCube ? 'DSL Configuration'
      : 'SQL Writing Assistance';
    const promptPlaceholder =
      '[INSERT THE RELEVANT DATABASE SCHEMA HERE]';

    const dbVendor = this.modalConnectionInfo?.database?.documentburster?.connection?.databaseserver?.type || '';

    const promptVars: Record<string, string> = {
      [promptPlaceholder]: schemaString,
      '[DATABASE_VENDOR]': dbVendor,
    };

    if (isDashboard && this.reportId()) {
      promptVars['[REPORT_CODE]'] = this.reportId();
      promptVars['[API_BASE_URL]'] = this.apiBaseUrl();
    }

    const launchConfig: AiManagerLaunchConfig = {
      initialActiveTabKey: 'PROMPTS',
      initialSelectedCategory: targetCategory,
      initialExpandedPromptId: targetPromptId,
      promptVariables: promptVars,
    };

    if (this.aiManagerInstance()) {
      // Cube context: the connection-details modal is nested inside the cube
      // definition modal and uses an ultra-high z-index to stack above it.
      // The AI Copilot (ngx-bootstrap modal) sits at the lower Bootstrap
      // z-index, so it would render BEHIND this connection-details modal.
      // Close the connection-details modal first — the user is done with
      // table-picking; they want to interact with the AI Copilot now.
      if (isCube) {
        this.isModalDbConnectionVisible = false;
      }
      this.aiManagerInstance().launchWithConfiguration(launchConfig);
    } else {
      this.messagesService.showError('AI Copilot component is not available.');
      console.error(
        'AI Copilot instance is not found. Ensure @ViewChild(AiManagerComponent) is correctly configured.',
      );
    }
  }

  /**
   * Cube-based AI generation launcher. Sends the full Groovy DSL of the
   * selected cubes to the AI Copilot via either the SQL_FROM_CUBE_DSL
   * prompt (when context === 'sqlQuery') or the
   * GROOVY_SCRIPT_FROM_CUBE_DSL prompt (when context === 'scriptQuery').
   * In both cases, the LLM is instructed to use the cubes as canonical
   * semantic models (join paths, dimension expressions, measure formulas).
   *
   * Note: the picklist source list comes from `cubesService.loadAll()` which
   * returns ONLY metadata (id/name/description/connectionId/isSample) — no
   * `dslCode`. So we must fetch each selected cube's full definition via
   * `cubesService.load(cubeId)` here to get the actual Groovy DSL.
   */
  private async launchAiCopilotForCubeBasedQuery(): Promise<void> {
    if (!this.cubeTargetItems || this.cubeTargetItems.length === 0) {
      this.messagesService.showInfo(
        'Please select at least one cube from the list above.',
      );
      return;
    }

    // Resolve selected nodes back to the cube metadata via the `data`
    // field stored when building cubeSourceItems. At this stage `dslCode`
    // is NOT yet populated — `loadAll()` returned only metadata.
    const selectedCubeMeta: CubeDefinition[] = this.cubeTargetItems
      .map((node: any) => node?.data as CubeDefinition)
      .filter((c) => !!c && !!c.id);

    if (selectedCubeMeta.length === 0) {
      this.messagesService.showError(
        'Could not resolve the selected cubes. Please reload and try again.',
      );
      return;
    }

    // Fetch the full cube definitions (including dslCode) on demand. The
    // single-cube endpoint returns the Groovy DSL plus metadata.
    let fullCubes: CubeDefinition[] = [];
    try {
      fullCubes = await Promise.all(
        selectedCubeMeta.map(async (meta) => {
          const full: any = await this.cubesService.load(meta.id);
          return {
            id: meta.id,
            name: full?.name || meta.name,
            description: full?.description || meta.description || '',
            connectionId: full?.connectionId || meta.connectionId,
            dslCode: full?.dslCode || '',
          } as CubeDefinition;
        }),
      );
    } catch (err) {
      console.error('Failed to load cube definitions for AI prompt:', err);
      this.messagesService.showError(
        'Failed to load cube definitions. Please try again.',
      );
      return;
    }

    // Drop any cubes that came back without a DSL body (shouldn't happen
    // normally — would indicate a corrupted cube on disk).
    const cubesWithDsl = fullCubes.filter((c) => !!c.dslCode && c.dslCode.trim().length !== 0);
    if (cubesWithDsl.length === 0) {
      this.messagesService.showError(
        'Selected cubes have no DSL definitions to send.',
      );
      return;
    }

    // Build the cube context string. Each cube is fenced as ```groovy```
    // with its name and (if any) description as a header so the LLM can
    // clearly distinguish cube boundaries.
    const cubeContext = cubesWithDsl
      .map((c) => {
        const header =
          `### Cube: ${c.name}\n` +
          (c.description ? `${c.description}\n\n` : '\n');
        return `${header}\`\`\`groovy\n${c.dslCode}\n\`\`\``;
      })
      .join('\n\n---\n\n');

    const dbVendor =
      this.modalConnectionInfo?.database?.documentburster?.connection
        ?.databaseserver?.type || '';

    // Dispatch on context — same pattern as launchAiCopilotForSchemaQuery
    // uses for table-based prompts.
    const isDashboard = this.context() === 'dashboardScript';
    const isScript = this.context() === 'scriptQuery';
    const targetPromptId = isDashboard
      ? 'DASHBOARD_FROM_CUBE_DSL'
      : isScript
        ? 'GROOVY_SCRIPT_FROM_CUBE_DSL'
        : 'SQL_FROM_CUBE_DSL';
    const targetCategory = isDashboard
      ? 'Dashboard Creation'
      : isScript
        ? 'Script Writing Assistance'
        : 'SQL Writing Assistance';

    const launchConfig: AiManagerLaunchConfig = {
      initialActiveTabKey: 'PROMPTS',
      initialSelectedCategory: targetCategory,
      initialExpandedPromptId: targetPromptId,
      promptVariables: {
        '[INSERT THE RELEVANT CUBE DSL HERE]': cubeContext,
        '[DATABASE_VENDOR]': dbVendor,
      },
    };

    if (this.aiManagerInstance()) {
      this.aiManagerInstance().launchWithConfiguration(launchConfig);
    } else {
      this.messagesService.showError('AI Copilot component is not available.');
      console.error(
        'AI Copilot instance is not found. Ensure @ViewChild(AiManagerComponent) is correctly configured.',
      );
    }
  }

  // Method to handle changes in the JSON editor (ngx-codejar)
  onDomainGroupedSchemaJsonTextContentChanged(newCode: string): void {
    // Re-entrancy guard — when we rewrite the editor below (assigning a new
    // string to domainGroupedSchemaJsonTextContent), ngx-codejar may fire
    // this handler again synchronously. On the second pass the content is
    // already hydrated, so hydration returns by identity and we short-circuit.
    // But this extra guard ensures we never recurse even in pathological cases.
    if (this.isRehydratingDomainSchema) {
      this.domainGroupedSchemaJsonTextContent = newCode;
      return;
    }

    this.domainGroupedSchemaJsonTextContent = newCode;

    // Empty editor → clear DGS state and bail out. Hydration would otherwise
    // synthesize originalSchema from rawSchemaData and rewrite the editor,
    // which is confusing for users who haven't generated a DGS yet.
    if (!newCode || newCode.trim() === '') {
      this.rawDomainGroupedSchema = { domainGroups: [] };
      this.processDomainGroupedSchema(this.rawDomainGroupedSchema);
      this.domainGroupedSchemaExists = false;
      return;
    }

    try {
      // Parse the new text content from the editor
      const parsed = JSON.parse(newCode);

      // Auto-hydrate: if the user pasted a slim LLM output (table leaves
      // with only tableName) or any partial form, fill missing fields from
      // the cached rawSchemaData.tables. Already-full pastes are passed
      // through by identity (no editor rewrite).
      const hydrated = this.hydrateDomainGroupedSchemaPaste(
        parsed,
        this.rawSchemaData?.tables || [],
      );

      if (hydrated !== parsed) {
        // Something was filled in. Rewrite the editor so what the user sees
        // matches exactly what will be written to disk on Save. Guarded
        // against re-entrancy via isRehydratingDomainSchema above.
        this.isRehydratingDomainSchema = true;
        try {
          this.domainGroupedSchemaJsonTextContent = JSON.stringify(hydrated, null, 2);
        } finally {
          this.isRehydratingDomainSchema = false;
        }
      }

      // Normalize the hydrated (or original) content into the expected
      // { domainGroups: [] } structure used by the picklist.
      this.rawDomainGroupedSchema = this.normalizeSchemaFormat(hydrated);

      // Repopulate the picklist's source based on the updated rawDomainGroupedSchema
      this.processDomainGroupedSchema(this.rawDomainGroupedSchema);

      this.domainGroupedSchemaExists =
        this.rawDomainGroupedSchema.domainGroups.length > 0;

      //console.log(
      //  '[onDomainGroupedSchemaJsonTextContentChanged] updated domainSource count:',
      //  this.domainSourceSchemaObjects.length,
      //);
    } catch (err) {
      console.warn(
        'Invalid JSON in editor, cannot update domain picklist source:',
        err,
      );
      // If JSON is invalid, rawDomainGroupedSchema might hold the last valid parsed state or an empty state.
      // processDomainGroupedSchema might be called with a fallback if desired, e.g.:
      // this.rawDomainGroupedSchema = { domainGroups: [] };
      // this.processDomainGroupedSchema(this.rawDomainGroupedSchema);
    }
    //console.log(
    //  '[onDomainGroupedSchemaJsonTextContentChanged] rawDomainGroupedSchema:',
    //  this.rawDomainGroupedSchema,
    //);
  }

  // Method for JSON syntax highlighting
  highlightJsonMethod(editor: HTMLElement) {
    const code = editor.textContent || '';
    return Prism.highlight(code, Prism.languages.json, 'json');
  }

  toggleDatabaseDiagramCodeView(): void {
    this.isDiagramEditMode = !this.isDiagramEditMode;
    if (!this.isDiagramEditMode && this.plantUmlCode) {
      //console.log(
      //  'toggleDatabaseDiagramCodeView: Switched to view mode, re-encoding...',
      //); // Log toggle
      setTimeout(() => {
        this.encodePlantUmlDiagram();
      }, 100);
    }
  }

  // Method to launch AI Copilot for ER Diagram
  launchAiCopilotForErDiagram(): void {
    if (!this.rawSchemaData || !this.rawSchemaData.tables) {
      this.messagesService.showError(
        'Raw database schema is not loaded. Please load or refresh the database schema first.',
      );
      return;
    }

    // Build a MINIMAL schema — table names + PKs + FKs ONLY. No column array.
    // The LLM will then produce a PlantUML diagram whose entity blocks
    // naturally list only PK and FK attributes, because those are the only
    // columns it ever saw. Payload reduction is ~100-500x vs today, and the
    // resulting "schema map" ERD is the PK/FK-only view that database
    // architects actually use — full "every column" diagrams are visual
    // clutter for anything bigger than a toy schema.
    const slimTables = this.rawSchemaData.tables.map((t: any) => ({
      tableName: t.tableName,
      tableType: t.tableType,
      primaryKeyColumns: t.primaryKeyColumns || [],
      foreignKeys: t.foreignKeys || [],
    }));
    const flatSchemaJson = JSON.stringify(slimTables, null, 2);

    const launchConfig: AiManagerLaunchConfig = {
      initialActiveTabKey: 'PROMPTS',
      initialSelectedCategory: 'Database Schema', // Or a more specific category if available
      initialExpandedPromptId: 'DB-SCHEMA-ER-DIAGRAM-PLANTUML', // Assuming this ID exists in prompts.json
      promptVariables: {
        '[INSERT YOUR DATABASE SCHEMA HERE]': flatSchemaJson,
      },
    };

    if (this.aiManagerInstance()) {
      this.aiManagerInstance().launchWithConfiguration(launchConfig);
    } else {
      this.messagesService.showError('AI Copilot component is not available.');
      console.error('AI Copilot instance is not found.');
    }
  }

  onPlantUmlCodeChanged(newCode: string): void {
    this.plantUmlCode = newCode;
  }

  // Method for PlantUML syntax highlighting
  highlightPlantUmlMethod(editor: HTMLElement) {
    const code = editor.textContent || '';
    //return Prism.highlight(code, Prism.languages.clike, 'clike');
    //return Prism.highlight(code, Prism.languages['plant-uml'], 'plant-uml');
    return Prism.highlight(code, Prism.languages.plaintext, 'plaintext');
  }

  toggleUbiquitousLanguageEditMode(): void {
    this.isUbiquitousLanguageEditMode = !this.isUbiquitousLanguageEditMode;
  }

  onUbiquitousLanguageChanged(newContent: string): void {
    this.ubiquitousLanguageMarkdown = newContent;
  }

  // Method for Markdown syntax highlighting
  highlightMarkdownMethod(editor: HTMLElement) {
    const code = editor.textContent || '';
    return Prism.highlight(code, Prism.languages.markdown, 'markdown');
  }

  onSqliteFileSelected(filePath: string) {
    const dbServer =
      this.modalConnectionInfo.database.documentburster.connection
        .databaseserver;
    if (dbServer.type === 'sqlite' || dbServer.type === 'duckdb') {
      dbServer.database = filePath;
    }
  }

  // Helper to save email or database connection before testing
  private async saveCurrentConnection(
    isDbConnection: boolean,
  ): Promise<boolean> {
    //console.log(
    //  `[saveCurrentConnection] isDbConnection=${isDbConnection}, filePath=${this.modalConnectionInfo.filePath}`,
    //);
    try {
      const connectionName = isDbConnection
        ? this.modalConnectionInfo.database.documentburster.connection.name
        : this.modalConnectionInfo.email.documentburster.connection.name;
      const connectionData = isDbConnection
        ? this.modalConnectionInfo.database
        : this.modalConnectionInfo.email;

      // derive a truly relative path for backend
      const rawPath = this.modalConnectionInfo.filePath;
      const idx = rawPath.indexOf('config/connections/');
      const savePath = idx >= 0 ? rawPath.substring(idx) : rawPath;
      //console.log(
      //  '[saveCurrentConnection] sending to backend, relative savePath=',
      //  savePath,
      //);

      if (!connectionName) {
        this.messagesService.showError('Connection Name cannot be empty.');
        return false;
      }

      // Create or duplicate mode
      if (
        this.modalConnectionInfo.crudMode === 'create' ||
        this.modalConnectionInfo.duplicate
      ) {
        const prefix = isDbConnection ? 'db' : 'eml';
        let code = `${prefix}-${_.kebabCase(connectionName)}`;
        if (isDbConnection) {
          const dbType = this.modalConnectionInfo.database.documentburster.connection.databaseserver.type;
          code = `${code}-${dbType}`;
          this.modalConnectionInfo.database.documentburster.connection.code =
            code;

          this.modalConnectionInfo.database.documentburster.connection.defaultConnection =
            false;

          // Auto-default if no existing non-sample DB connection is already the default.
          // Sample connections (Northwind SQLite/DuckDB/ClickHouse) are synthesized and
          // must never influence this check.
          const nonSampleDbConns = this.settingsService
            .getDatabaseConnectionFiles()
            .filter((f) => !f.isSample);
          const alreadyHasDefault = nonSampleDbConns.some(
            (f) => f.defaultConnection,
          );
          if (!alreadyHasDefault)
            this.modalConnectionInfo.database.documentburster.connection.defaultConnection =
              true;
        } else {
          this.modalConnectionInfo.email.documentburster.connection.code = code;
          this.modalConnectionInfo.email.documentburster.connection.defaultConnection =
            false;
        }
        await this.updateModelAndForm();
        if (
          this.modalConnectionInfo.connectionSameFilePathAlreadyExists ===
          true ||
          this.modalConnectionInfo.connectionSameFilePathAlreadyExists ===
          'file'
        ) {
          this.messagesService.showError(
            `Connection file '${this.modalConnectionInfo.filePath}' already exists. Choose a different name.`,
          );
          return false;
        }
      } else {
        // Update mode
        const sel = this.settingsService.connectionFiles.find(
          (f) => f.filePath === this.modalConnectionInfo.filePath,
        );
        if (!sel) {
          this.messagesService.showError(
            'Could not find the connection to update. Please reopen the modal.',
          );
          return false;
        }
        sel.connectionName = connectionName;
        if (isDbConnection)
          sel.dbserver = {
            ...this.modalConnectionInfo.database.documentburster.connection
              .databaseserver,
          };
        else
          sel.emailserver = {
            ...this.modalConnectionInfo.email.documentburster.connection
              .emailserver,
          };
      }

      await this.connectionsService.saveConnection(
        this.getConnectionCode(savePath),
        connectionData,
      );

      // After successful save, update application state

      // 1. Clear all selections first - ensure only one connection is selected
      for (const conn of this.settingsService.connectionFiles) {
        conn.activeClicked = false;
      }

      if (
        this.modalConnectionInfo.crudMode === 'create' ||
        this.modalConnectionInfo.duplicate
      ) {
        // Create a new connection object for the settingsService.connectionFiles array
        const connectionType = isDbConnection
          ? 'database-connection'
          : 'email-connection';
        const connectionCode = isDbConnection
          ? this.modalConnectionInfo.database.documentburster.connection.code
          : this.modalConnectionInfo.email.documentburster.connection.code;

        const newConnection: ExtConnection = {
          fileName: savePath.split('/').pop() || '',
          filePath: savePath,
          connectionCode: connectionCode,
          connectionName: connectionName,
          connectionType: connectionType,
          activeClicked: true, // Mark this new connection as selected
          defaultConnection: isDbConnection
            ? this.modalConnectionInfo.database.documentburster.connection
              .defaultConnection
            : this.modalConnectionInfo.email.documentburster.connection
              .defaultConnection,
          usedBy: '--not used--',
          useForJasperReports: false,
        };

        // Add connection-specific properties
        if (isDbConnection) {
          newConnection.dbserver = {
            ...this.modalConnectionInfo.database.documentburster.connection
              .databaseserver,
          };
        } else {
          newConnection.emailserver = {
            ...this.modalConnectionInfo.email.documentburster.connection
              .emailserver,
          };
        }

        // Add the new connection to the list
        this.settingsService.connectionFiles.push(newConnection);


        // Update modal state to reflect we're now in "update" mode
        this.modalConnectionInfo.crudMode = 'update';
        this.modalConnectionInfo.duplicate = false;
        this.modalConnectionInfo.connectionSameFilePathAlreadyExists = '';
      } else {
        // In update mode, find and mark as selected the connection that was updated
        const updatedConnection = this.settingsService.connectionFiles.find(
          (conn) => conn.filePath === savePath,
        );

        if (updatedConnection) {
          updatedConnection.activeClicked = true;
        }
      }

      this.messagesService.showInfo(
        `Connection '${connectionName}' saved successfully.`,
      );
      return true;
    } catch (err) {
      console.error('[saveCurrentConnection] Error saving connection:', err);
      this.messagesService.showError(
        err.message || 'Failed to save connection file.',
      );
      return false;
    }
  }

  /**
   * Save the domain-grouped schema based SOLELY on `domainGroupedSchemaJsonTextContent`.
   * It does NOT consider UI state like `isDomainGroupedCodeViewActive` or `domainTargetSchemaObjects`.
   */
  private async saveConnectionDomainGroupedSchema(): Promise<boolean> {
    if (!this.modalConnectionInfo.filePath) {
      this.messagesService.showError(
        'Connection file path is not defined. Cannot save domain-grouped schema.',
      );
      return false;
    }

    const connectionCode = this.getConnectionCode();
    const targetPath = `config/connections/${connectionCode}/${connectionCode}-domain-grouped-schema.json`;
    // Update this.domainGroupedSchemaPath if it's meant to always reflect the target path for the current connection
    this.domainGroupedSchemaPath = targetPath;

    let hasMeaningfulContent = false;
    const textToSave = this.domainGroupedSchemaJsonTextContent;

    if (textToSave && textToSave.trim() !== '') {
      try {
        const parsedForCheck = JSON.parse(textToSave);
        // Use normalizeSchemaFormat to check against the consistent structure
        const normalizedForCheck = this.normalizeSchemaFormat(parsedForCheck);
        if (
          normalizedForCheck.domainGroups &&
          normalizedForCheck.domainGroups.length > 0
        ) {
          hasMeaningfulContent = true;
        }
      } catch (e) {
        // Invalid JSON is not meaningful content to save.
        console.warn(
          'Content for domain-grouped schema (domainGroupedSchemaJsonTextContent) is invalid JSON. Will not save.',
          e,
        );
        this.messagesService.showError(
          'Domain-grouped schema content in editor is invalid JSON. It was not saved.',
        );
      }
    }

    try {
      if (hasMeaningfulContent) {
        // Save the exact text content from domainGroupedSchemaJsonTextContent
        await this.connectionsService.saveMetadata(connectionCode, 'domain-grouped-schema', textToSave);
        this.messagesService.showInfo(
          'Domain-grouped schema saved successfully.',
        );
        this.domainGroupedSchemaExists = true;
      } else {
        // Send empty content to backend - it will handle removal if file exists
        await this.connectionsService.saveMetadata(connectionCode, 'domain-grouped-schema', '');
        this.domainGroupedSchemaExists = false;
      }
      this.cdRef.detectChanges();
      return true;
    } catch (err) {
      console.error(
        'Error during file operation for domain-grouped schema:',
        err,
      );
      this.messagesService.showError(
        `Failed to save/remove domain-grouped schema file: ${err.message || err}`,
      );
      return false;
    }
  }

  private async saveConnectionErDiagram(): Promise<boolean> {
    if (!this.modalConnectionInfo.filePath) {
      this.messagesService.showError(
        'Connection file path is not defined. Cannot save ER Diagram.',
      );
      return false;
    }

    const connectionCode = this.getConnectionCode();
    this.erDiagramFilePath = `config/connections/${connectionCode}/${connectionCode}-er-diagram.puml`;

    try {
      const content = this.plantUmlCode?.trim() ?? '';
      await this.connectionsService.saveMetadata(connectionCode, 'er-diagram', content);
      if (content !== '') {
        this.messagesService.showInfo('ER Diagram saved successfully.');
      } else {
        this.erDiagramFilePath = '';
      }
      this.cdRef.detectChanges();
      return true;
    } catch (err) {
      console.error('Error saving ER Diagram:', err);
      this.messagesService.showError(
        `Failed to save ER Diagram: ${err.message || err}`,
      );
      return false;
    }
  }

  private async saveConnectionUbiquitousLanguage(): Promise<boolean> {
    if (!this.modalConnectionInfo.filePath) {
      this.messagesService.showError(
        'Connection file path is not defined. Cannot save Ubiquitous Language.',
      );
      return false;
    }

    const connectionCode = this.getConnectionCode();
    this.ubiquitousLanguageFilePath = `config/connections/${connectionCode}/${connectionCode}-ubiquitous-language.md`;

    try {
      const content = this.ubiquitousLanguageMarkdown?.trim() ?? '';
      await this.connectionsService.saveMetadata(connectionCode, 'ubiquitous-language', content);
      if (content !== '') {
        this.messagesService.showInfo(
          'Ubiquitous Language saved successfully.',
        );
      } else {
        this.ubiquitousLanguageFilePath = '';
      }
      this.cdRef.detectChanges();
      return true;
    } catch (err) {
      console.error('Error saving Ubiquitous Language:', err);
      this.messagesService.showError(
        `Failed to save Ubiquitous Language: ${err.message || err}`,
      );
      return false;
    }
  }

  /**
   * Load the domain-grouped schema:
   * - Reads file to `domainGroupedSchemaJsonTextContent`.
   * - Parses `domainGroupedSchemaJsonTextContent` into `rawDomainGroupedSchema`.
   * - Updates picklist source via `processDomainGroupedSchema`.
   */
  async loadDomainGroupedSchema(): Promise<void> {
    // Initialize/reset states
    this.domainGroupedSchemaJsonTextContent = '';
    this.rawDomainGroupedSchema = { domainGroups: [] };
    this.domainGroupedSchemaExists = false;

    const connectionCode = this.resolveConnectionCode();
    if (!connectionCode) {
      console.warn(
        'Connection code could not be determined. Using empty schema.',
      );
      // Process with empty schema to clear UI
      this.processDomainGroupedSchema(this.rawDomainGroupedSchema);
      this.cdRef.detectChanges();
      return;
    }

    try {
      const result = await this.connectionsService.getMetadata(connectionCode, 'domain-grouped-schema');

      if (result.exists === 'true') {
        const fileContent = result.content;

        if (typeof fileContent === 'string' && fileContent.trim() !== '') {
          this.domainGroupedSchemaJsonTextContent = fileContent; // Store raw text
          try {
            const parsedJson = JSON.parse(fileContent);
            this.rawDomainGroupedSchema =
              this.normalizeSchemaFormat(parsedJson); // Parse and normalize
            // Check if the loaded and normalized schema has meaningful content
            this.domainGroupedSchemaExists =
              this.rawDomainGroupedSchema.domainGroups.length > 0;
          } catch (parseError) {
            console.error(
              'Invalid JSON in domain-grouped schema file:',
              parseError,
            );
            this.messagesService.showError(
              'Domain-grouped schema file contains invalid JSON. Displaying empty schema.',
            );
            // Fallback to empty state for rawDomainGroupedSchema and text content
            this.domainGroupedSchemaJsonTextContent = '';
            this.rawDomainGroupedSchema = { domainGroups: [] };
            this.domainGroupedSchemaExists = false;
          }
        } else {
          // File exists but is empty or not a string
          this.domainGroupedSchemaJsonTextContent = '';
          this.rawDomainGroupedSchema = { domainGroups: [] };
          this.domainGroupedSchemaExists = false;
        }
      } else {
        // File does not exist
        this.domainGroupedSchemaJsonTextContent = '';
        this.rawDomainGroupedSchema = { domainGroups: [] };
        this.domainGroupedSchemaExists = false;
      }
    } catch (err) {
      console.error('Error loading domain-grouped schema:', err);
      this.messagesService.showError(
        `Failed to load domain-grouped schema: ${err.message || err}`,
      );
      this.domainGroupedSchemaJsonTextContent = '';
      this.rawDomainGroupedSchema = { domainGroups: [] };
      this.domainGroupedSchemaExists = false;
    }

    // Always update the picklist UI based on the final state of rawDomainGroupedSchema
    this.processDomainGroupedSchema(this.rawDomainGroupedSchema);
    this.cdRef.detectChanges();
  }

  /**
   * Load and display the generated schema JSON for a connection.
   */
  private async loadSchemaFromBackend(rawFilePath: string) {
    if (!rawFilePath) {
      // Caller (showCrudModal) is responsible for clearing all derived
      // schema state at the top of every modal open. We just bail here
      // — no state writes — so this method is safe to call from any
      // code path without leaving partial state behind.
      console.warn('loadSchemaFromBackend called with no rawFilePath.');
      this.isSchemaLoading = false;
      return;
    }

    const connectionCode = this.getConnectionCode(rawFilePath);

    try {
      const result = await this.connectionsService.getMetadata(connectionCode, 'information-schema');

      if (result.exists !== 'true' || !result.content || result.content.trim() === '') {
        this.rawSchemaData = null;
        this.sourceSchemaObjects = [];
        this.showSchemaTreeSelect = false;
      } else {
        const parsed: any = JSON.parse(result.content);
        this.rawSchemaData = parsed; // Cache the raw parsed data

        // build hierarchical nodes for UI (PickList)
        const nodes = (parsed.tables || []).map((tbl: any) => ({
          key: tbl.tableName,
          label: tbl.tableName,
          icon: 'table',
          title: 'Type: ' + (tbl.tableType || 'TABLE'),
          data: tbl, // Store original table data in the UI node if needed by PickList or other UI features
          children: (tbl.columns || []).map((col: any) => ({
            key: tbl.tableName + '_' + col.columnName,
            label: col.columnName,
            icon:
              tbl.primaryKeyColumns &&
                tbl.primaryKeyColumns.includes(col.columnName)
                ? 'key'
                : (tbl.foreignKeys || []).some(
                  (fk: any) => fk.fkColumnName === col.columnName,
                )
                  ? 'link'
                  : 'columns',
            title: `${col.typeName || ''}${col.columnSize ? '[' + col.columnSize + ']' : ''} ${col.isNullable === false ? 'NOT NULL' : 'NULL'}`,
            data: col, // Store original column data
          })),
        }));

        // assign hierarchical table nodes for picklist
        this.sourceSchemaObjects = nodes; // top-level tables with children columns
        this.targetSchemaObjects = [];
        this.showSchemaTreeSelect = true;

        this.messagesService.showInfo('Database schema loaded.');
      }
    } catch (err) {
      console.error('Error loading schema JSON:', err);
      this.rawSchemaData = null;
      this.sourceSchemaObjects = [];
      this.showSchemaTreeSelect = false;
    } finally {
      this.isSchemaLoading = false;

      // Check for domain-grouped schema independently to ensure tabs work separately
      try {
        if (this.modalConnectionInfo.filePath) {
          await this.checkDomainGroupedSchemaExists();
        }
      } catch (domainErr) {
        console.error(
          'Error checking domain-grouped schema (independent):',
          domainErr,
        );
        // Don't let domain schema errors affect database schema functionality
      }

      // Load cubes for the current connection (sqlQuery context only).
      // Cube errors must not affect schema loading.
      try {
        await this.loadCubesForCurrentConnection();
      } catch (cubeErr) {
        console.error('Error loading cubes for current connection:', cubeErr);
      }

      this.cdRef.detectChanges();
    }
  }

  /**
   * Load cubes defined for the currently-open connection. Only relevant
   * when the modal is acting as an AI helper for generating SQL or Groovy
   * scripts (sqlQuery / scriptQuery contexts). Drives the "Show cubes
   * instead" toggle in the Database Schema tab. The toggle is auto-hidden
   * when this list is empty. NEVER loads in CRUD mode or in cubeDsl mode
   * (the latter would be circular — generating cubes from cubes).
   */
  private async loadCubesForCurrentConnection(): Promise<void> {
    const isCubeAiHelperContext =
      this.context() === 'sqlQuery' || this.context() === 'scriptQuery' || this.context() === 'dashboardScript';
    if (!isCubeAiHelperContext) {
      this.cubesForCurrentConnection = [];
      this.cubeSourceItems = [];
      this.cubeTargetItems = [];
      return;
    }
    try {
      const all = await this.cubesService.loadAll();
      const connectionCode = this.resolveConnectionCode();
      this.cubesForCurrentConnection = (all || []).filter(
        (c) => c.connectionId === connectionCode,
      );
      // Build flat picklist source: one leaf per cube. No children, no
      // expansion, no field selection. Each node carries the full cube
      // definition on `data` so the launcher can read `dslCode` later.
      this.cubeSourceItems = this.cubesForCurrentConnection.map((c) => ({
        key: `cube_${c.id}`,
        label: c.name,
        icon: 'cube',
        title: c.description || '',
        data: c,
        leaf: true,
      }));
      this.cubeTargetItems = [];
    } catch (err) {
      console.warn('Failed to load cubes for connection', err);
      this.cubesForCurrentConnection = [];
      this.cubeSourceItems = [];
      this.cubeTargetItems = [];
    }
  }

  onUseCubesInsteadOfTablesChanged(value: boolean): void {
    this.useCubesInsteadOfTables = value;
    // No-op beyond storing the flag — the template binds directly to the
    // pre-built cubeSourceItems / cubeTargetItems arrays. Toggling OFF
    // does NOT clear cubeTargetItems so the user can flip back without
    // losing their selection.
  }

  /**
   * Normalizes different possible JSON structures into a consistent { domainGroups: any[] } format.
   * Handles cases where the root might be an array of domain groups,
   * or an object with a 'domainGroupedSchema' key, or 'domainGroups' key.
   */
  /**
   * Hydrates a domain-grouped schema paste by FILLING IN any fields missing
   * from each table leaf from the client's cached rawSchemaData.tables.
   *
   * Operating principle: fill-in missing, never replace present.
   *   - If a field is missing on a leaf OR is an empty array, fill from cache.
   *   - If a field is present and non-empty on the leaf, LEAVE IT ALONE.
   *   - If `originalSchema` is missing at root, synthesize it from cache.
   *   - If `originalSchema` is present, leave it alone.
   *
   * Safety rules:
   *   - Never throws. Any unrecognized shape returns the input unchanged so
   *     the caller's existing try/catch around JSON.parse continues to work.
   *   - A leaf whose tableName is unknown to the cache is passed through.
   *   - Identity-preserved when no change is needed — the caller can detect
   *     "no rewrite needed" via `hydrated === parsed`.
   *
   * Called from onDomainGroupedSchemaJsonTextContentChanged() so that whatever
   * the user pastes (pure slim AI output, partial, legacy full dump, bare
   * array, etc.) is auto-merged with the cached full schema so that Save
   * writes complete data to disk and the picklist renders correctly.
   */
  private hydrateDomainGroupedSchemaPaste(parsed: any, rawTables: any[]): any {
    if (!parsed || typeof parsed !== 'object') return parsed;
    if (!Array.isArray(rawTables) || rawTables.length === 0) return parsed;

    // Build an index by tableName for O(1) lookups.
    const tableByName = new Map<string, any>();
    for (const t of rawTables) {
      if (t && typeof t.tableName === 'string') tableByName.set(t.tableName, t);
    }
    if (tableByName.size === 0) return parsed;

    let changed = false;

    // Merge a leaf with its cache counterpart. Present fields on the leaf win;
    // missing-or-empty-array fields are filled from cache. Returns a new
    // object only if at least one field was filled; otherwise returns the
    // leaf by identity so the caller can detect "no change".
    const fillMissing = (leaf: any): any => {
      if (!leaf || typeof leaf !== 'object') return leaf;
      const name = leaf.tableName ?? leaf.name;
      if (typeof name !== 'string') return leaf;
      const cache = tableByName.get(name);
      if (!cache) return leaf; // Unknown table — pass through.

      let out: any = leaf;
      let leafChanged = false;
      for (const key of Object.keys(cache)) {
        const leafVal = leaf[key];
        const missing =
          leafVal === undefined ||
          leafVal === null ||
          (Array.isArray(leafVal) && leafVal.length === 0);
        if (missing) {
          if (out === leaf) out = { ...leaf };
          out[key] = cache[key];
          leafChanged = true;
        }
      }
      if (leafChanged) changed = true;
      // Guarantee tableName is set on the merged leaf (slim form may only
      // have tableName or name; ensure we always expose tableName).
      if (out !== leaf && !out.tableName && cache.tableName) {
        out.tableName = cache.tableName;
      }
      return out;
    };

    // Recursively walk a tree node. Domain nodes have a `children` (or legacy
    // `tables` / `domains`) array; table nodes have a `tableName` / `name`.
    // Returns a new node only if something inside changed.
    const walk = (node: any): any => {
      if (!node || typeof node !== 'object') return node;

      // Is this a table leaf? Heuristic: has tableName/name AND no
      // children-ish array.
      const isTableLeaf =
        (typeof node.tableName === 'string' || typeof node.name === 'string') &&
        !Array.isArray(node.children) &&
        !Array.isArray((node as any).tables) &&
        !Array.isArray((node as any).domains);
      if (isTableLeaf) return fillMissing(node);

      // Domain node — walk each of its child arrays.
      let out: any = node;
      const walkArray = (arr: any[]): any[] => {
        let arrChanged = false;
        const mapped = arr.map((c) => {
          const next = walk(c);
          if (next !== c) arrChanged = true;
          return next;
        });
        return arrChanged ? mapped : arr;
      };

      for (const arrKey of ['children', 'tables', 'domains']) {
        const arr = (node as any)[arrKey];
        if (Array.isArray(arr)) {
          const nextArr = walkArray(arr);
          if (nextArr !== arr) {
            if (out === node) out = { ...node };
            out[arrKey] = nextArr;
          }
        }
      }
      return out;
    };

    // Find the grouping tree at root. Accept all three historical shapes.
    let tree: any[] | null = null;
    let treeKey: 'domainGroupedSchema' | 'domainGroups' | null = null;
    if (Array.isArray(parsed.domainGroupedSchema)) {
      tree = parsed.domainGroupedSchema;
      treeKey = 'domainGroupedSchema';
    } else if (Array.isArray(parsed.domainGroups)) {
      tree = parsed.domainGroups;
      treeKey = 'domainGroups';
    } else if (Array.isArray(parsed)) {
      tree = parsed; // bare array of domain nodes
    }

    // If the user's input has NO DGS tree at all (empty {} or unrecognized
    // shape), the helper has nothing to hydrate. Return the input as-is
    // without synthesizing originalSchema. Synthesizing on an empty input
    // would silently rewrite the editor with rawSchemaData, which is
    // confusing for users who haven't generated a DGS yet.
    if (!tree || tree.length === 0) {
      return parsed;
    }

    let result: any = parsed;

    {
      const treeRef = tree;
      const nextTreeArr = treeRef.map((n) => walk(n));
      const treeChanged = nextTreeArr.some((n, i) => n !== treeRef[i]);
      if (treeChanged) changed = true;

      if (Array.isArray(parsed)) {
        result = treeChanged ? nextTreeArr : parsed;
      } else if (treeKey) {
        result = treeChanged ? { ...parsed, [treeKey]: nextTreeArr } : parsed;
      }
    }

    // Ensure `originalSchema` is always present at the top (skip for bare-
    // array root — it has nowhere to attach). Only do this when we already
    // have a non-empty DGS tree, which the early-return above guarantees.
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      if (!Array.isArray((result as any).originalSchema)) {
        result = { ...result, originalSchema: rawTables };
        changed = true;
      }
    }

    return changed ? result : parsed;
  }

  private normalizeSchemaFormat(parsedJson: any): { domainGroups: any[] } {
    if (!parsedJson) {
      return { domainGroups: [] };
    }
    if (Array.isArray(parsedJson)) {
      // If the root is directly an array, assume it's the array of domain groups.
      return { domainGroups: parsedJson };
    }
    if (parsedJson && typeof parsedJson === 'object') {
      if (Array.isArray(parsedJson.domainGroups)) {
        return { domainGroups: parsedJson.domainGroups };
      }
      if (Array.isArray(parsedJson.domainGroupedSchema)) {
        // Handle older format or LLM output that might use 'domainGroupedSchema'
        return { domainGroups: parsedJson.domainGroupedSchema };
      }
    }
    // Fallback for unrecognized structures or if parsedJson is not an object/array.
    return { domainGroups: [] };
  }

  /**
   * Populates the picklist's source view (`domainSourceSchemaObjects`)
   * based on the `rawDomainGroupedSchema`.
   * Resets the picklist's target view (`domainTargetSchemaObjects`).
   */
  processDomainGroupedSchema(schemaDataToProcess: {
    domainGroups: any[];
  }): void {
    //console.log(
    //  '[processDomainGroupedSchema] Processing schema data:',
    //  schemaDataToProcess,
    //);

    // Ensure schemaDataToProcess and its domainGroups property are valid
    let domainGroupsArray: any[] = [];
    if (
      schemaDataToProcess &&
      Array.isArray(schemaDataToProcess.domainGroups)
    ) {
      domainGroupsArray = schemaDataToProcess.domainGroups;
    } else {
      console.warn(
        '[processDomainGroupedSchema] schemaDataToProcess.domainGroups is not an array or schemaDataToProcess is null/invalid. Picklist source will be empty.',
      );
    }

    // Populate the source for the picklist
    this.domainSourceSchemaObjects =
      this.mapDomainGroupsToTreeNodes(domainGroupsArray);

    // Reset the target of the picklist as the source has changed.
    // User selections in domainTargetSchemaObjects are ephemeral and not persisted with the schema file.
    this.domainTargetSchemaObjects = [];

    this.showDomainSchemaTreeSelect = this.domainSourceSchemaObjects.length > 0;

    // DGS just changed → rebuild the dropdown options + reapply the current
    // filter. Both must run because availableBusinessDomains depends on DGS.
    this.rebuildBusinessDomainList();
    this.applyBusinessDomainFilter();

    this.cdRef.detectChanges();
  }

  encodePlantUmlDiagram(): void {
    // The underlying plantUmlCode just changed (loaded, edited, or refreshed
    // from disk). Rebuild the dropdown list (it's derived from PUML entity
    // names ∩ DGS) AND recompute the displayed PUML for the current filter.
    this.rebuildBusinessDomainList();
    this.applyBusinessDomainFilter();

    try {
      if (!this.displayedPlantUmlCode || this.displayedPlantUmlCode.trim() === '') {
        this.encodedPlantUmlDiagram = '';
        return;
      }

      // Step 1: Convert the PlantUML string to UTF-8 bytes
      const textEncoder = new TextEncoder();
      const bytes = textEncoder.encode(this.displayedPlantUmlCode);

      // Step 2: Deflate the bytes using pako
      const deflated = pako.deflate(bytes); // Remove the options object that had 'to: string'

      // Step 3: Convert deflated bytes to binary string
      const binaryString = Array.from(deflated)
        .map((byte) => String.fromCharCode(byte))
        .join('');

      // Step 4: Base64 encode
      const base64 = btoa(binaryString);

      // Step 5: Make URL safe
      this.encodedPlantUmlDiagram = base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    } catch (error) {
      console.error('Encoding error:', error);
      this.encodedPlantUmlDiagram = '';
    }
  }

  // ── ER Diagram domain filter helpers ──────────────────────────────────
  //
  // Two-step design (do NOT collapse into one):
  //
  //   rebuildBusinessDomainList() — rebuilds availableBusinessDomains and
  //     totalEntitiesInPuml. Called ONLY when plantUmlCode or DGS actually
  //     changes (not on every filter selection). Rebuilding the array on
  //     every dropdown change destroys/recreates the <option> elements and
  //     causes the <select> to briefly fall back to its first option, which
  //     fires ngModelChange again and resets selectedBusinessDomain to 'All'.
  //
  //   applyBusinessDomainFilter() — recomputes displayedPlantUmlCode and
  //     filteredEntitiesInPuml based on the current selectedBusinessDomain.
  //     Called from the dropdown change handler. Never touches the options
  //     array, so the <select>'s [value] binding stays stable.
  //
  // Both functions are pure: they never touch plantUmlCode, the disk file,
  // or anything that gets persisted.

  // trackBy for @for on the business-domain dropdown — Angular reuses
  // the same <option> DOM node when the label is unchanged across array
  // rebuilds, so the <select>'s value binding never loses sync.
  trackBusinessDomainByLabel(_index: number, item: { label: string }): string {
    return item?.label || '';
  }

  /**
   * Recompute the dropdown options list. Call this only when plantUmlCode or
   * rawDomainGroupedSchema actually changed.
   */
  private rebuildBusinessDomainList(): void {
    const allEntityNames = this.parsePumlEntityNames(this.plantUmlCode || '');
    this.totalEntitiesInPuml = allEntityNames.length;

    this.availableBusinessDomains =
      this.extractTopLevelBusinessDomains(allEntityNames);

    // If the previously-selected domain is no longer available (e.g. DGS
    // just changed), reset to "All".
    if (
      this.selectedBusinessDomain !== 'All' &&
      !this.availableBusinessDomains.some(
        (d) => d.label === this.selectedBusinessDomain,
      )
    ) {
      this.selectedBusinessDomain = 'All';
    }
  }

  /**
   * Recompute displayedPlantUmlCode + filteredEntitiesInPuml based on the
   * current selectedBusinessDomain. Does NOT rebuild the dropdown options.
   */
  private applyBusinessDomainFilter(): void {
    if (this.selectedBusinessDomain === 'All') {
      this.displayedPlantUmlCode = this.plantUmlCode || '';
      this.filteredEntitiesInPuml = this.totalEntitiesInPuml;
      return;
    }

    const domain = this.availableBusinessDomains.find(
      (d) => d.label === this.selectedBusinessDomain,
    );
    if (!domain || domain.tableNames.length === 0) {
      // Defensive: nothing to filter on. Show full diagram.
      this.displayedPlantUmlCode = this.plantUmlCode || '';
      this.filteredEntitiesInPuml = this.totalEntitiesInPuml;
      return;
    }

    const filtered = this.filterPlantUmlByEntityNames(
      this.plantUmlCode || '',
      domain.tableNames,
    );
    this.displayedPlantUmlCode = filtered.puml;
    this.filteredEntitiesInPuml = filtered.keptCount;
  }

  /**
   * Walk rawDomainGroupedSchema's TOP-LEVEL domain entries and collect each
   * one's table names (recursively descending into sub-domains so a top-level
   * domain owns every table beneath it). Only domains whose collected table
   * set has at least one PUML-entity match are returned — empty domains are
   * useless for the dropdown.
   */
  private extractTopLevelBusinessDomains(
    pumlEntityNames: string[],
  ): { label: string; tableNames: string[] }[] {
    const groups = this.rawDomainGroupedSchema?.domainGroups;
    if (!Array.isArray(groups) || groups.length === 0) return [];

    const pumlSet = new Set(pumlEntityNames.map((n) => n.toLowerCase()));

    // Recursively collect table names from a single domain node and its
    // descendants. A node is a "table leaf" when it has tableName/name and no
    // children-style array.
    const collectTables = (node: any): string[] => {
      if (!node || typeof node !== 'object') return [];
      const out: string[] = [];
      const isLeaf =
        (typeof node.tableName === 'string' || typeof node.name === 'string') &&
        !Array.isArray(node.children) &&
        !Array.isArray(node.tables) &&
        !Array.isArray(node.domains);
      if (isLeaf) {
        const name = (node.tableName ?? node.name) as string;
        if (typeof name === 'string') out.push(name);
        return out;
      }
      const childArrays = ['children', 'tables', 'domains'];
      for (const key of childArrays) {
        const arr = node[key];
        if (Array.isArray(arr)) {
          for (const c of arr) out.push(...collectTables(c));
        }
      }
      return out;
    };

    const result: { label: string; tableNames: string[] }[] = [];
    for (const top of groups) {
      if (!top || typeof top !== 'object') continue;
      const label =
        (typeof top.label === 'string' && top.label) ||
        (typeof top.name === 'string' && top.name) ||
        '';
      if (!label) continue;

      // Skip top-level "table leaves" — they aren't domains.
      const isLeaf =
        (typeof top.tableName === 'string' || typeof top.name === 'string') &&
        typeof top.label !== 'string';
      if (isLeaf) continue;

      const tableNames = collectTables(top);
      // Intersect with PUML entities — if none of the domain's tables exist in
      // the diagram (because PUML was hand-edited or out of sync), skip.
      const present = tableNames.filter((n) => pumlSet.has(n.toLowerCase()));
      if (present.length > 0) {
        result.push({ label, tableNames: present });
      }
    }
    return result;
  }

  /**
   * Extract the entity names declared in a PlantUML script. Recognizes:
   *   entity NAME {
   *   entity "Name With Spaces" {
   *   entity NAME as ALIAS {  ← keeps NAME (the source name); aliases are ignored
   * Quoted names are unquoted.
   */
  private parsePumlEntityNames(puml: string): string[] {
    if (!puml) return [];
    const names: string[] = [];
    // Match: entity, optional whitespace, then either "quoted name" or bare token
    const re = /^\s*entity\s+(?:"([^"]+)"|(\S+))/gim;
    let m: RegExpExecArray | null;
    while ((m = re.exec(puml)) !== null) {
      const name = m[1] ?? m[2];
      if (name) names.push(name);
    }
    return names;
  }

  /**
   * Filter a PlantUML ER diagram down to the entities whose names appear in
   * `keepNames` (case-insensitive). This is a "sed-like" REMOVAL pass — it
   * never regenerates or rewrites any surviving content. Surviving entity
   * blocks and relationship lines come out byte-identical to the input
   * (same indentation, comments, spacing). The function only:
   *   1. Finds the line ranges of entity blocks whose names are NOT in
   *      `keepNames`, and marks them for removal.
   *   2. Finds relationship lines where at least one endpoint is NOT in
   *      `keepNames`, and marks them for removal (cross-domain edges hidden,
   *      per design decision).
   *   3. Returns the input lines minus the dropped ones, re-joined.
   *
   * Defensive: if parsing fails or the result is empty, returns the original
   * PUML so the user always sees SOMETHING in the iframe rather than a broken
   * diagram. The original plantUmlCode is never modified — this returns a new
   * string that the caller assigns to displayedPlantUmlCode.
   */
  private filterPlantUmlByEntityNames(
    puml: string,
    keepNames: string[],
  ): { puml: string; keptCount: number } {
    if (!puml || !keepNames || keepNames.length === 0) {
      return { puml: puml || '', keptCount: 0 };
    }

    const keepSet = new Set(keepNames.map((n) => n.toLowerCase()));
    const lines = puml.split(/\r?\n/);

    // Pass 1: identify entity-block boundaries and their names so we can keep
    // or drop the entire block. PlantUML "entity NAME {" opens a block that
    // ends at the matching "}" (we count braces to handle nested braces, but
    // ER entity blocks normally have none).
    type Block = { startLine: number; endLine: number; name: string; keep: boolean };
    const blocks: Block[] = [];
    const entityRe = /^\s*entity\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+\S+)?\s*\{/i;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const m = entityRe.exec(line);
      if (m) {
        const name = (m[1] ?? m[2]) || '';
        let depth = 1;
        let j = i + 1;
        while (j < lines.length && depth > 0) {
          // Crude but adequate brace tracking — count { and } in the line.
          for (const ch of lines[j]) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            if (depth === 0) break;
          }
          if (depth === 0) break;
          j++;
        }
        const endLine = Math.min(j, lines.length - 1);
        blocks.push({
          startLine: i,
          endLine,
          name,
          keep: keepSet.has(name.toLowerCase()),
        });
        i = endLine + 1;
        continue;
      }
      i++;
    }

    if (blocks.length === 0) {
      // Couldn't parse any entity blocks — fall back to unfiltered.
      return { puml, keptCount: 0 };
    }

    // Pass 2: build a "is this line inside a dropped block?" mask + a "is this
    // line a relationship that should be dropped?" mask. PlantUML relationship
    // syntax is roughly:  TOKEN <connector> TOKEN [: "label"]
    // where connector contains -- or .. with crow's-foot adornments.
    const droppedLines = new Set<number>();
    for (const b of blocks) {
      if (!b.keep) {
        for (let k = b.startLine; k <= b.endLine; k++) droppedLines.add(k);
      }
    }

    const relationshipRe =
      /^\s*(?:"([^"]+)"|(\S+))\s+[\.\-=*o<>|}{]+\s+(?:"([^"]+)"|(\S+))/;
    for (let k = 0; k < lines.length; k++) {
      if (droppedLines.has(k)) continue;
      // Skip lines inside KEPT entity blocks too — they're attribute lines,
      // not relationships.
      const insideBlock = blocks.some(
        (b) => b.keep && k > b.startLine && k <= b.endLine,
      );
      if (insideBlock) continue;

      const m = relationshipRe.exec(lines[k]);
      if (!m) continue;
      const left = (m[1] ?? m[2] ?? '').toLowerCase();
      const right = (m[3] ?? m[4] ?? '').toLowerCase();
      // Cross-domain relationships → drop. Both endpoints must be in keepSet
      // for the line to survive.
      if (!keepSet.has(left) || !keepSet.has(right)) {
        droppedLines.add(k);
      }
    }

    const kept: string[] = [];
    for (let k = 0; k < lines.length; k++) {
      if (!droppedLines.has(k)) kept.push(lines[k]);
    }
    const filteredPuml = kept.join('\n');
    const keptCount = blocks.filter((b) => b.keep).length;

    if (keptCount === 0) {
      // Defensive fallback — never render an empty diagram.
      return { puml, keptCount: 0 };
    }

    return { puml: filteredPuml, keptCount };
  }

  /**
   * Dropdown change handler — called from the template's (ngModelChange).
   * Updates ONLY displayedPlantUmlCode + the indicator counts. Does NOT
   * rebuild availableBusinessDomains, because rebuilding would destroy and
   * recreate the <option> elements and cause the <select> to fall back to
   * its first option for one tick — which would fire ngModelChange again
   * with 'All' and undo the user's selection.
   *
   * The disk file and plantUmlCode SSOT are NEVER touched.
   */
  onBusinessDomainFilterChanged(newValue: string): void {
    this.selectedBusinessDomain = newValue || 'All';
    this.applyBusinessDomainFilter();
    // Re-encode the displayed PUML so the iframe URL refreshes. We do NOT
    // call encodePlantUmlDiagram() because that rebuilds the dropdown
    // options list, which would cause the <select>-resets-to-All bug.
    // Inline the encode-only path here.
    try {
      if (!this.displayedPlantUmlCode || this.displayedPlantUmlCode.trim() === '') {
        this.encodedPlantUmlDiagram = '';
        return;
      }
      const bytes = new TextEncoder().encode(this.displayedPlantUmlCode);
      const deflated = pako.deflate(bytes);
      const binaryString = Array.from(deflated)
        .map((byte) => String.fromCharCode(byte))
        .join('');
      const base64 = btoa(binaryString);
      this.encodedPlantUmlDiagram = base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    } catch (error) {
      console.error('Encoding error in domain-filter handler:', error);
      this.encodedPlantUmlDiagram = '';
    }
    this.cdRef.detectChanges();
  }

  /**
   * Check if domain-grouped schema file exists and load it if it does
   */
  async checkDomainGroupedSchemaExists(): Promise<void> {
    if (!this.modalConnectionInfo.filePath) {
      this.domainGroupedSchemaExists = false;
      this.domainGroupedSchemaJsonTextContent = '';
      this.rawDomainGroupedSchema = { domainGroups: [] };
      this.processDomainGroupedSchema({ domainGroups: [] });
      this.showDomainSchemaTreeSelect = false;
      return;
    }

    try {
      const connectionCode = this.getConnectionCode();
      const domainGroupedSchemaPath = `config/connections/${connectionCode}/${connectionCode}-domain-grouped-schema.json`;

      // Store the path but don't assume the file exists yet
      this.domainGroupedSchemaPath = domainGroupedSchemaPath;

      // Check if the file exists via the metadata API
      const result = await this.connectionsService.getMetadata(connectionCode, 'domain-grouped-schema');
      this.domainGroupedSchemaExists = result.exists === 'true';

      if (this.domainGroupedSchemaExists) {
        // File exists, attempt to load it
        await this.loadDomainGroupedSchema();
      } else {
        // Set default empty schema since the file doesn't exist
        this.domainGroupedSchemaJsonTextContent = '';
        this.rawDomainGroupedSchema = { domainGroups: [] };
        this.processDomainGroupedSchema({ domainGroups: [] });
      }

      this.cdRef.detectChanges();
    } catch (err) {
      console.error('Error checking domain-grouped schema:', err);
      this.domainGroupedSchemaExists = false;
      this.domainGroupedSchemaJsonTextContent = '';
      this.rawDomainGroupedSchema = { domainGroups: [] };
      this.processDomainGroupedSchema({ domainGroups: [] });
      this.showDomainSchemaTreeSelect = false;
      this.cdRef.detectChanges();
    }
  }

  private mapDomainGroupsToTreeNodes(domainGroups: any[]): any[] {
    if (!domainGroups || !Array.isArray(domainGroups)) return [];

    return domainGroups
      .map((domain) => {
        // Create domain node with proper tree node properties
        const domainNode = {
          key: `domain_${(domain.label || domain.name || 'unknown').replace(/\s+/g, '_')}`,
          label: domain.label || domain.name || 'Unknown Domain',
          icon: 'layer-group',
          children: [],
        };

        // Process tables in this domain
        const tables = domain.tables || domain.children || [];
        if (Array.isArray(tables)) {
          domainNode.children = tables
            .filter((table) => table.name || table.tableName) // Only process valid tables
            .map((table) => {
              // Table node — tag with origin parent so the picklist's
              // flattenGroupNodes mode can re-group it back into the right
              // domain when the user moves it from target back to source.
              const tableNode: any = {
                key: table.tableName,
                label: table.tableName,
                icon: 'table',
                children: [],
                originalParentKey: domainNode.key,
                originalParentLabel: domainNode.label,
              };

              // Process columns if present
              const columns = table.columns || table.children || [];
              if (Array.isArray(columns)) {
                tableNode.children = columns.map((column) => ({
                  key: `${tableNode.label}_${column.name || column.columnName}`,
                  label: column.name || column.columnName,
                  icon: column.isPrimaryKey
                    ? 'key'
                    : column.isForeignKey
                      ? 'link'
                      : 'columns',
                }));
              }

              return tableNode;
            });
        }

        // Process nested domains recursively
        const nestedDomains = Array.isArray(domain.domains)
          ? domain.domains
          : [];
        if (nestedDomains.length > 0) {
          domainNode.children = [
            ...domainNode.children,
            ...this.mapDomainGroupsToTreeNodes(nestedDomains),
          ];
        }

        return domainNode;
      })
      .filter((domain) => domain.children.length > 0); // Only include non-empty domains
  }

  async showCrudModal(
    crudMode: string,
    connectionType: string = 'email-connection',
    duplicate?: boolean,
    connectionDetails?: ExtConnection,
  ) {
    this.modalConnectionInfo.connectionType = connectionType;
    this.modalConnectionInfo.crudMode = crudMode;

    // Sample connections are read-only — Save button will be disabled.
    // Only relevant in CRUD mode; in AI helper contexts (sqlQuery/scriptQuery/
    // dashboardScript) the modal is used for SQL/script generation, not editing.
    // Duplicate produces a user-owned editable copy, so clear the flag in that case.
    this.isEditingSample = this.context() === 'crud' && !!(connectionDetails?.isSample) && !duplicate;

    // Reset all tab active states for the database modal
    this.isDatabaseSchemaTabActive = false;
    this.isDomainGroupedSchemaTabActive = false;
    this.isErDiagramTabActive = false;
    this.isUbiquitousLanguageTabActive = false;

    if (connectionType === 'email-connection') {
      this.modalConnectionInfo.modalTitle = 'Create Email Connection';

      // Reset email tab state and any in-flight OAuth flow
      this.isSMTPTabActive = true;
      this.isOAuth2TabActive = false;
      this.emailActiveTabIndex = 0;
      this.isSigningInOAuth = false;
      if (this.activeOAuthEventSource) {
        this.activeOAuthEventSource.close();
        this.activeOAuthEventSource = null;
      }
      if (this.activeOAuthFlowId) {
        const cId = this.resolveConnectionCode() || 'new';
        this.connectionsService.cancelEmailOAuth(cId, this.activeOAuthFlowId).catch(() => {});
        this.activeOAuthFlowId = null;
      }

      this.modalConnectionInfo.connectionSameFilePathAlreadyExists = false;
      this.modalConnectionInfo.email.documentburster.connection.code = '';
      this.modalConnectionInfo.email.documentburster.connection.name = '';

      this.modalConnectionInfo.email.documentburster.connection.defaultConnection =
        false;

      if (crudMode == 'update' || duplicate) {
        const selectedConnection = connectionDetails;

        if (crudMode == 'update') {
          this.modalConnectionInfo.filePath = selectedConnection.filePath;

          this.modalConnectionInfo.modalTitle = 'Update Email Connection';

          this.modalConnectionInfo.email.documentburster.connection.code =
            selectedConnection.connectionCode;

          this.modalConnectionInfo.email.documentburster.connection.name =
            selectedConnection.connectionName;

          this.modalConnectionInfo.email.documentburster.connection.defaultConnection =
            selectedConnection.defaultConnection;
        }

        this.modalConnectionInfo.email.documentburster.connection.emailserver =
        {
          ...selectedConnection.emailserver,
        };
        // Clear password for duplicates — force user to enter a new one
        if (duplicate) {
          this.modalConnectionInfo.email.documentburster.connection.emailserver.userpassword = '';
        }
      } else {
        this.modalConnectionInfo.email.documentburster.connection.defaultConnection =
          false;

        this.modalConnectionInfo.email.documentburster.connection.emailserver =
        {
          ...newEmailServer,
        };
      }
      this.isModalEmailConnectionVisible = true;
    } else if (connectionType === 'database-connection') {

      // === FRESH-OPEN STATE RESET — runs unconditionally on every open ===
      // The component is a shared @ViewChild reused across multiple opens
      // (SQL Query input, Script input, Dashboard input, Cube DSL input).
      // Without this reset, derived state (DGS / ERD / cubes / picklist
      // selections) from the previous open bleeds into the current one,
      // producing the illusion that "the same connection has different
      // tabs in different contexts". Reset everything here once and trust
      // the subsequent loaders to repopulate from the new connection.

      this.modalConnectionInfo.modalTitle = 'Create Database Connection';
      this.modalConnectionInfo.filePath = '';
      this.modalConnectionInfo.connectionSameFilePathAlreadyExists = false;
      this.modalConnectionInfo.database.documentburster.connection.code = '';
      this.modalConnectionInfo.database.documentburster.connection.name = '';
      this.modalConnectionInfo.database.documentburster.connection.defaultConnection = false;

      // Database schema picklist state
      this.rawSchemaData = null;
      this.sourceSchemaObjects = [];
      this.targetSchemaObjects = [];
      this.showSchemaTreeSelect = false;
      this.isSchemaLoading = false;
      this.isTestingConnection = false;

      // ER Diagram state — clear immediately so a stale diagram from a
      // previous open does not flash before loadErDiagram() repopulates.
      this.plantUmlCode = '';
      this.encodePlantUmlDiagram();
      this.erDiagramFilePath = '';

      // Ubiquitous Language state
      this.ubiquitousLanguageMarkdown = '';
      this.ubiquitousLanguageFilePath = '';

      // Domain-Grouped Schema state — must be reset so the DGS tab does
      // not appear pre-populated when switching between connections.
      this.domainGroupedSchemaJsonTextContent = '';
      this.rawDomainGroupedSchema = { domainGroups: [] };
      this.domainGroupedSchemaPath = '';
      this.domainGroupedSchemaExists = false;
      this.processDomainGroupedSchema(this.rawDomainGroupedSchema);

      // Cube picklist state (sqlQuery / scriptQuery contexts) — must be
      // reset so the cube toggle's visibility and the cube source list
      // reflect the current connection, not a previous one. Also reset
      // the toggle position to OFF so each open starts on the table view.
      this.cubesForCurrentConnection = [];
      this.cubeSourceItems = [];
      this.cubeTargetItems = [];
      this.useCubesInsteadOfTables = false;

      this.isModalDbConnectionVisible = true;

      if (crudMode == 'update' || duplicate) {
        const selectedConnection = connectionDetails;

        if (crudMode == 'update') {
          this.modalConnectionInfo.filePath = selectedConnection.filePath;

          this.modalConnectionInfo.modalTitle = 'Update Database Connection';
          if (this.context() === 'sqlQuery')
            this.modalConnectionInfo.modalTitle =
              'Choose Table(s) & Generate SQL';
          if (this.context() === 'scriptQuery')
            this.modalConnectionInfo.modalTitle =
              'Choose Table(s) & Generate Script';
          if (this.context() === 'dashboardScript')
            this.modalConnectionInfo.modalTitle =
              'Choose Table(s) & Build Dashboard';

          this.modalConnectionInfo.database.documentburster.connection.code =
            selectedConnection.connectionCode;
          this.modalConnectionInfo.database.documentburster.connection.name =
            selectedConnection.connectionName;
          this.modalConnectionInfo.database.documentburster.connection.defaultConnection =
            selectedConnection.defaultConnection;
        }

        this.modalConnectionInfo.database.documentburster.connection.databaseserver =
        {
          ...selectedConnection.dbserver, // use correct property
        };
        // Clear password for duplicates — force user to enter a new one
        if (duplicate) {
          this.modalConnectionInfo.database.documentburster.connection.databaseserver.userpassword = '';
        }

        // Trigger schema load for update.
        // Sample connections have no on-disk XML so filePath is null;
        // pass the connection code directly — getConnectionCode() returns it unchanged.
        if (crudMode == 'update') {
          const effectivePath = selectedConnection?.filePath ||
            (this.isEditingSample ? (selectedConnection?.connectionCode || '') : '');
          await this.loadSchemaFromBackend(effectivePath);
          // Load ER Diagram and Ubiquitous Language
          await this.loadErDiagram(effectivePath);
          await this.loadUbiquitousLanguage(effectivePath);

          if (this.context() === 'sqlQuery' || this.context() === 'scriptQuery' || this.context() === 'dashboardScript' || this.context() === 'cubeDsl') {
            if (this.domainGroupedSchemaExists) {
              this.isConnectionDetailsTabActive = false;
              this.isDomainGroupedSchemaTabActive = true;
              this.dbActiveTabIndex = 2;
            } else {
              this.isConnectionDetailsTabActive = false;
              this.isDatabaseSchemaTabActive = true;
              this.dbActiveTabIndex = 1;
            }
          } else {
            this.isConnectionDetailsTabActive = true; // Default for non-sqlQuery context
            this.dbActiveTabIndex = 0;
          }
        } else {
          // duplicate mode
          this.isConnectionDetailsTabActive = true; // Default for duplicate mode
          this.dbActiveTabIndex = 0;
        }
      } else {
        // Create mode — affirmative initialization only. All derived
        // state was already cleared by the unconditional reset above.
        this.modalConnectionInfo.database.documentburster.connection.defaultConnection = false;
        this.modalConnectionInfo.database.documentburster.connection.databaseserver = {
          ...newDatabaseServer,
        };
        this.isConnectionDetailsTabActive = true;
        this.dbActiveTabIndex = 0;
      }


    }
  }

  // Method to load ER Diagram content
  private async loadErDiagram(connectionFilePath: string): Promise<void> {
    if (!connectionFilePath) {
      this.plantUmlCode = '';
      this.encodePlantUmlDiagram();
      this.erDiagramFilePath = '';
      return;
    }
    try {
      const connectionCode = this.getConnectionCode(connectionFilePath);
      const erDiagramPath = `config/connections/${connectionCode}/${connectionCode}-er-diagram.puml`;
      this.erDiagramFilePath = erDiagramPath;

      const result = await this.connectionsService.getMetadata(connectionCode, 'er-diagram');
      if (result.exists === 'true') {
        this.plantUmlCode = result.content || '';
      } else {
        this.plantUmlCode = '';
      }
    } catch (err) {
      console.error('Error loading ER Diagram:', err);
      this.plantUmlCode = '';
    } finally {
      this.encodePlantUmlDiagram();
      this.cdRef.detectChanges();
    }
  }

  // Method to load Ubiquitous Language content
  private async loadUbiquitousLanguage(
    connectionFilePath: string,
  ): Promise<void> {
    if (!connectionFilePath) {
      this.ubiquitousLanguageMarkdown = '';
      this.ubiquitousLanguageFilePath = '';
      return;
    }
    try {
      const connectionCode = this.getConnectionCode(connectionFilePath);
      const ulPath = `config/connections/${connectionCode}/${connectionCode}-ubiquitous-language.md`;
      this.ubiquitousLanguageFilePath = ulPath;

      const result = await this.connectionsService.getMetadata(connectionCode, 'ubiquitous-language');
      if (result.exists === 'true') {
        this.ubiquitousLanguageMarkdown = result.content || '';
      } else {
        this.ubiquitousLanguageMarkdown = '';
      }
    } catch (err) {
      console.error('Error loading Ubiquitous Language:', err);
      this.ubiquitousLanguageMarkdown = '';
    } finally {
      this.cdRef.detectChanges();
    }
  }

  public isStringAndNotEmpty(value: any): boolean {
    return typeof value === 'string' && value.length > 0;
  }

  initializePlantUmlDiagram(): void {
    //console.log(
    //  `initializePlantUmlDiagram: plantUmlCode length: ${this.plantUmlCode?.length}`,
    //); // Log code length before encoding
    if (this.plantUmlCode) {
      this.encodePlantUmlDiagram();
    } else {
      //console.warn('initializePlantUmlDiagram: No plantUmlCode to initialize.');
    }
  }

  public launchWithAiCopilotConfiguration(
    config?: AiManagerLaunchConfig,
  ): void {
    if (config?.initialActiveTabKey)
      this.initialAiCopilotActiveTabKey = config?.initialActiveTabKey;
    if (config?.initialSelectedCategory)
      this.initialAiCopilotSelectedCategory = config.initialSelectedCategory;
    if (config?.initialExpandedPromptId)
      this.initialAiCopilotExpandedPromptId = config.initialExpandedPromptId;
    if (config?.promptVariables)
      this.initialAiCopilotVariables = config.promptVariables;
  }

  public getUbiquitousLanguageExampleMarkdown(): string {
    let example = '#### Core Concepts\n\n';

    if (
      this.rawSchemaData &&
      this.rawSchemaData.tables &&
      this.rawSchemaData.tables.length > 0
    ) {
      const table1 = this.rawSchemaData.tables[0];
      const table1Name = Utilities.toTitleCase(
        table1.tableName || 'YourEntity',
      );
      example += `**${table1Name}**\n`;
      example += `*   **Definition**: Represents [describe the purpose of the ${table1Name} table/entity here, e.g., a customer transaction, user profile, product inventory].\n`;
      if (table1.columns && table1.columns.length > 0) {
        const column1 = table1.columns[0];
        const column1Name = column1.columnName || 'ImportantAttribute';
        example += `*   **Key Attribute (${column1Name})**: [Describe the significance of ${column1Name}, e.g., primary identifier, critical status field].\n`;
      }
      example += `*   **Business Rule**: e.g., "A ${table1Name} must always be linked to a valid [OtherEntityName] via the foreign key."\n\n`;

      if (this.rawSchemaData.tables.length > 1) {
        const table2 = this.rawSchemaData.tables[1];
        const table2Name = Utilities.toTitleCase(
          table2.tableName || 'AnotherRelatedEntity',
        );
        example += `**${table2Name}**\n`;
        example += `*   **Relationship with ${table1Name}**: [Describe how ${table2Name} relates to ${table1Name}, e.g., "Each ${table1Name} can have multiple ${table2Name} records, representing order items."]\n`;
      }
    } else {
      example += '**Customer**\n';
      example +=
        '*   **Definition**: An individual or organization that has engaged with our services or purchased products.\n';
      example +=
        '*   **Business Rule**: Must have a unique `customer_id`. An email address is preferred for communication.\n\n';
      example += '**Order**\n';
      example +=
        '*   **Definition**: A formal request by a `Customer` to purchase one or more `Products` or `Services`.\n';
      example +=
        '*   **States**: Can be `DRAFT`, `PENDING_PAYMENT`, `CONFIRMED`, `SHIPPED`, `DELIVERED`, `CANCELLED`.\n';
    }
    example += '\n#### Key Terms (Glossary)\n\n';
    example +=
      '*   **MVP (Minimum Viable Product)**: The version of a new product which allows a team to collect the maximum amount of validated learning about customers with the least effort.\n';
    example +=
      '*   **SLA (Service Level Agreement)**: A commitment between a service provider and a client detailing aspects like quality, availability, responsibilities.\n';
    return example;
  }

  // ── Seed Data tab ─────────────────────────────────────────────────────────

  resetSchemaStateOnConnectionChange(): void {
    this.showSchemaTreeSelect = false;
    this.testConnectionSuccess = false;
    this.testConnectionError = false;
    this.sourceSchemaObjects = [];
    this.targetSchemaObjects = [];
    this.rawSchemaData = null;
  }

  onSeedDataTabSelected(): void {
    if (this.seedTemplates.length === 0) {
      this.loadSeedTemplates();
    }
  }

  async loadSeedTemplates(): Promise<void> {
    try {
      this.seedTemplates = await this.connectionsService.getSeedTemplates();
      this.cdRef.detectChanges();
    } catch (err) {
      console.error('Failed to load seed templates', err);
    }
  }

  async onSeedTemplateSelected(newId: string): Promise<void> {
    if (!newId || newId === this.loadedSeedTemplateId) return;

    const isExampleDefault = newId === '__EXAMPLE_DEFAULT__';
    const template = isExampleDefault
      ? { id: '__EXAMPLE_DEFAULT__', displayName: 'Example (default)' }
      : this.seedTemplates.find(t => t.id === newId);

    if (!template) {
      this.selectedSeedTemplateId = this.loadedSeedTemplateId;
      this.cdRef.detectChanges();
      return;
    }

    const confirmed = await this.confirmService.askConfirmation({
      message: `Load '${template.displayName}' into the Example tab? You can review it there and copy it into your script.`,
      confirmAction: () => {},
    });

    if (confirmed) {
      this.exampleEditorOverride = isExampleDefault ? null : (template as any).source;
      this.loadedSeedTemplateId = newId;
      this.isSeedDataExampleActive = true;
    } else {
      this.selectedSeedTemplateId = this.loadedSeedTemplateId;
    }
    this.cdRef.detectChanges();
  }

  async doRunCustomSeed(): Promise<void> {
    const connectionCode = this.resolveConnectionCode();
    if (!connectionCode || !this.customSeedScript?.trim()) return;
    const confirmed = await this.confirmService.askConfirmation({
      message: 'Run the custom seed script on this database. Proceed?',
      confirmAction: () => {},
    });
    if (!confirmed) return;

    this.messagesService.showInfo('Running seed script. Please wait.', '', { messageClass: 'java-started' });
    this.isCustomSeedRunning = true;
    this.cdRef.detectChanges();

    this.webSocketService.callBacksProcessing.onProcessingComplete = () => {
      this.isCustomSeedRunning = false;
      this.cdRef.detectChanges();
    };

    this.connectionsService.runCustomSeed(connectionCode, this.customSeedScript, {})
      .catch(err => {
        this.isCustomSeedRunning = false;
        this.cdRef.detectChanges();
        this.messagesService.showError(`Failed to submit script: ${err?.message || err}`);
      });
  }

  copyExampleSeedScriptToClipboard(): void {
    navigator.clipboard
      .writeText(this.exampleEditorScript)
      .then(() => {
        this.messagesService.showInfo('Example script copied to clipboard!', 'Success');
      })
      .catch((err) => {
        console.error('Failed to copy example seed script: ', err);
        this.messagesService.showError('Failed to copy to clipboard');
      });
  }

  askAiForSeedHelp(): void {
    if (!this.aiManagerInstance()) return;
    const vendor = (this.modalConnectionInfo?.database?.documentburster?.connection?.databaseserver?.type || 'postgres').toUpperCase();
    const launchConfig: AiManagerLaunchConfig = {
      initialActiveTabKey: 'PROMPTS',
      initialSelectedCategory: 'Database Schema',
      initialExpandedPromptId: 'CUSTOM_DB_SEED_SCRIPT',
      promptVariables: {
        '[VENDOR]': vendor,
        '[VENDOR_EXAMPLE_SCRIPT]': this.getExampleCustomSeedScript(),
      },
    };
    this.aiManagerInstance().launchWithConfiguration(launchConfig);
  }

  highlightGroovyCode = (editor: any) => {
    if (!editor) return;
    const code = this.getSeedRawCode(editor);
    if (!code) return;
    try {
      if (Prism && Prism.languages['groovy']) {
        const html = Prism.highlight(code, Prism.languages['groovy'], 'groovy');
        editor.style.whiteSpace = 'pre-wrap';
        editor.innerHTML = html;
      } else {
        editor.style.whiteSpace = 'pre-wrap';
        editor.innerHTML = code;
      }
    } catch (error) {
      console.error('Error during Groovy script highlighting:', error);
      editor.style.whiteSpace = 'pre-wrap';
      editor.innerHTML = code;
    }
  };

  private getSeedRawCode(editor: any): string {
    try {
      if (editor.textContent !== undefined && editor.textContent !== null) {
        return editor.textContent as string;
      }
    } catch (err) {
      // ignore
    }
    return editor.innerText || '';
  }

  getExampleCustomSeedScript(): string {
    const vendor = (this.modalConnectionInfo?.database?.documentburster?.connection?.databaseserver?.type || 'postgres').toUpperCase();

    const intType = vendor === 'ORACLE' ? 'NUMBER' : (vendor === 'CLICKHOUSE' ? 'UInt32' : 'INT');
    const varcharType = vendor === 'ORACLE' ? 'VARCHAR2' : (vendor === 'CLICKHOUSE' ? 'String' : 'VARCHAR');
    const isClickHouse = vendor === 'CLICKHOUSE';

    const header = `// ============================================================
// Example: Custom seed script for ${vendor}
// ============================================================
// Available variables (pre-configured — do NOT create them):
//   dbSql  - groovy.sql.Sql (already connected to the database)
//   vendor - String ("${vendor}")
//   log    - Logger (SLF4J)
//
// Available libraries on classpath:
//   net.datafaker.Faker — realistic fake data with fixed seed
//   groovy.sql.Sql — Groovy database access (dbSql)
//
// RULES:
//   1. DROP THEN CREATE — every run starts on a clean slate (truly idempotent on every vendor)
//   2. Supply explicit IDs in INSERT — no auto-increment vendor differences
//   3. NEVER touch Northwind tables — only YOUR my_* tables!${isClickHouse ? '' : '\n//   4. Wrap inserts in dbSql.withTransaction { ... } for rollback on error'}
//   ${isClickHouse ? '4' : '5'}. Use DataFaker with fixed seed for deterministic, repeatable data
// ============================================================

import groovy.sql.Sql
import net.datafaker.Faker

// Fixed seed = deterministic data (identical every run)
def faker = new Faker(new Random(42))

// safeDrop: ignore "table doesn't exist" on first run — every vendor throws a different SQLSTATE
def safeDrop = { String table ->
    try { dbSql.execute("DROP TABLE " + table) }
    catch (Exception e) { /* table didn't exist — fine */ }
}

log.info("Starting custom seed for " + vendor + "...")
`;

    if (isClickHouse) {
      return header + `
// --- 1. Drop existing tables (children first), then create fresh ---
dbSql.execute("DROP TABLE IF EXISTS my_employees")
dbSql.execute("DROP TABLE IF EXISTS my_departments")

dbSql.execute("""
  CREATE TABLE my_departments (
    dept_id UInt32,
    dept_name String,
    location String
  ) ENGINE = MergeTree()
  ORDER BY dept_id
""")

dbSql.execute("""
  CREATE TABLE my_employees (
    emp_id UInt32,
    first_name String,
    last_name String,
    email String,
    salary Decimal64(2),
    dept_id UInt32
  ) ENGINE = MergeTree()
  ORDER BY emp_id
""")

// --- 2. Insert departments (explicit IDs — works on every vendor) ---
def deptNames = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations']
deptNames.eachWithIndex { name, i ->
  def location = faker.address().city()
  dbSql.execute(
    "INSERT INTO my_departments (dept_id, dept_name, location) VALUES (?, ?, ?)",
    [i + 1, name, location]
  )
}

// --- 3. Insert employees using DataFaker ---
(1..20).each { i ->
  dbSql.execute(
    "INSERT INTO my_employees (emp_id, first_name, last_name, email, salary, dept_id) VALUES (?, ?, ?, ?, ?, ?)",
    [
      i,
      faker.name().firstName(),
      faker.name().lastName(),
      faker.internet().emailAddress(),
      faker.number().numberBetween(45000, 150000) as BigDecimal,
      faker.number().numberBetween(1, deptNames.size() + 1)
    ]
  )
}

log.info("Custom seed completed for " + vendor + ": 6 departments, 20 employees")
`;
    }

    return header + `
// --- 1. Drop existing tables (children first), then create fresh ---
//     safeDrop swallows "table doesn't exist" on first run so the script
//     is truly idempotent on every vendor — no IF NOT EXISTS quirks needed.
safeDrop("my_employees")
safeDrop("my_departments")

dbSql.execute("""
  CREATE TABLE my_departments (
    dept_id ${intType} NOT NULL PRIMARY KEY,
    dept_name ${varcharType}(100) NOT NULL,
    location ${varcharType}(200)
  )
""")

dbSql.execute("""
  CREATE TABLE my_employees (
    emp_id ${intType} NOT NULL PRIMARY KEY,
    first_name ${varcharType}(50) NOT NULL,
    last_name ${varcharType}(50) NOT NULL,
    email ${varcharType}(100),
    salary DECIMAL(10,2),
    dept_id ${intType}
  )
""")

// --- 2. Insert data in a transaction (rolls back on any error) ---
dbSql.withTransaction {

  // Insert departments (explicit IDs — no auto-increment vendor differences)
  def deptNames = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations']
  deptNames.eachWithIndex { name, i ->
    def location = faker.address().city()
    dbSql.execute(
      "INSERT INTO my_departments (dept_id, dept_name, location) VALUES (?, ?, ?)",
      [i + 1, name, location]
    )
  }

  // Insert employees using DataFaker
  (1..20).each { i ->
    dbSql.execute(
      "INSERT INTO my_employees (emp_id, first_name, last_name, email, salary, dept_id) VALUES (?, ?, ?, ?, ?, ?)",
      [
        i,
        faker.name().firstName(),
        faker.name().lastName(),
        faker.internet().emailAddress(),
        faker.number().numberBetween(45000, 150000) as BigDecimal,
        faker.number().numberBetween(1, deptNames.size() + 1)
      ]
    )
  }
}

log.info("Custom seed completed for " + vendor + ": 6 departments, 20 employees")
`;
  }

}
