import { Injectable } from '@angular/core';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { SystemService } from '../../providers/system.service';
import { StateStoreService } from '../../providers/state-store.service';
import { PollingHelper } from '../../providers/polling.helper';
import { DockerLifecycleService } from '../../providers/docker-lifecycle.service';

export interface ManagedApp {
  id: string;
  name: string;
  description: string;
  category?: string;
  type: 'docker' | 'local' | 'desktop' | 'url';
  icon?: string;
  entrypoint?: string;
  service_name?: string;
  command?: string;
  url?: string;
  website?: string;
  state?: 'running' | 'stopped' | 'unknown' | 'starting' | 'stopping' | 'error';
  index?: number;
  value?: string;
  startCmd?: string;
  stopCmd?: string;
  lastOutput?: string;
  currentCommandValue?: string;
  tags?: string[];
  visible?: boolean;
  launch?: boolean; // Set to false to hide Launch button (e.g., for headless/API-only apps)
  // Multiple launch URLs for apps with several entry points (dropdown)
  launchLinks?: { label: string; url: string; icon?: string }[];
  // Build flags for Flowkraft apps
  buildOnStart?: boolean;
  noCacheOnStart?: boolean;
  // Demo login info HTML (shown when app is running)
  demoInfo?: string;
  tutorialLink?: { label: string; url: string };
}

@Injectable({
  providedIn: 'root',
})
export class AppsManagerService {
  // Simulated backend state for each app (by id)
  private appStates: { [id: string]: 'running' | 'stopped' | 'unknown' | 'starting' | 'stopping' | 'error' } = {};

  // Simulated last output for each app
  private appLastOutputs: { [id: string]: string } = {};

  // Simulated "backend" data (replace with REST call in future)
  private allAppsData: { apps: ManagedApp[] } = {
    apps: [
      {
        id: 'flowkraft-data-canvas',
        name: 'Explore Data & Build Dashboards',
        icon: 'bar-chart',
        category: 'Data & Analytics',
        type: 'docker',
        description: 'Explore your databases visually, create stunning charts and build interactive dashboards. Connect to Oracle, SQL Server, PostgreSQL, MySQL, ClickHouse and more. Use <strong>data tables</strong>, <strong>KPI cards</strong>, <strong>charts</strong>, <strong>pivot tables</strong>, and <strong>filter panes</strong> to create BI dashboards powered by your own data. AI assistance is available (when needed).',
        url: 'http://localhost:8440/explore-data',
        launchLinks: [
          { label: 'Explore Data', url: 'http://localhost:8440/explore-data', icon: 'th-large' },
          { label: 'Chat2DB', url: 'http://localhost:8440/chat2db', icon: 'flask' },
        ],
        entrypoint: 'flowkraft/_ai-hub/docker-compose.yml',
        service_name: 'ai-hub-frend',
        startCmd: 'system service app start ai-hub-frend 8440',
        stopCmd: 'system service app stop ai-hub-frend',
        tags: ['bi', 'charts', 'analytics', 'olap', 'visualization', 'data-warehouse', 'dashboards', 'flowkraft-data-canvas', 'explore-data', 'DataPallas\'s App'],
        visible: true,
        tutorialLink: { label: 'See how to (quickly) build dashboards →', url: 'https://datapallas.com/docs/bi-analytics/dashboards' },
      },
      {
        id: 'flowkraft-grails',
        name: 'DataPallas Grails App',
        icon: 'cube',
        category: 'Full-Stack Apps',
        type: 'docker',
        description: 'Build admin panels and self-service portals using Grails — our <em>default stack</em> for consistency with DataPallas\'s scripting and backend. Create custom apps with real-time analytics dashboards (DuckDB/ClickHouse OLAP), secure document distribution (payslips, invoices with payments, student portals), and interactive data visualization.',
        url: 'http://localhost:8400',
        launchLinks: [
          { label: 'Front-Facing Area /', url: 'http://localhost:8400', icon: 'globe' },
          { label: 'Admin Area /admin', url: 'http://localhost:8400/admin', icon: 'cog' }
        ],
        entrypoint: 'flowkraft/grails-playground/docker-compose.yml',
        service_name: 'grails-playground',
        startCmd: 'system service app start grails-playground 8400',
        stopCmd: 'system service app stop grails-playground',
        tags: ['flowkraft', 'admin-panel', 'grails', 'front-facing' , 'customer-portal', 'payments', 'bi', 'charts', 'analytics', 'olap', 'visualization', 'data-warehouse', 'DataPallas\'s App'],
        visible: true,
        tutorialLink: { label: 'Want to get your own self-service document web portal? See a real walkthrough →', url: 'https://datapallas.com/docs/ai-crew/athena#athena---new-billing-portal' },
      },
      {
        id: 'flowkraft-bkend-boot-groovy',
        name: 'DataPallas Backend App (Automation & Job Scheduling)',
        icon: 'cogs',
        category: 'Backend Services',
        type: 'docker',
        description: 'Schedule report generation jobs, automate document delivery (payslips, invoices, statements), build ETL/data warehouse pipelines, and manage cron-based batch processing across your business systems.',
        url: 'http://localhost:8410',
        entrypoint: 'flowkraft/bkend-boot-groovy-playground/docker-compose.yml',
        service_name: 'bkend-boot-groovy-playground',
        startCmd: 'system service app start bkend-boot-groovy-playground 8410',
        stopCmd: 'system service app stop bkend-boot-groovy-playground',
        tags: ['flowkraft', 'backend', 'etl', 'automation', 'crons-job-scheduling', 'DataPallas\'s App'],
        visible: true,
        launch: false, // No UI - API/automation only
        tutorialLink: { label: 'Want to get your own automation & job scheduling backend application? See a real walkthrough →', url: 'https://datapallas.com/docs/ai-crew/hephaestus#billing-portal--payment-reminders-for-overdue-bills' },
      },
      {
        id: 'flowkraft-next',
        name: 'DataPallas Next.js App (Alternative Stack)',
        icon: 'cube',
        category: 'Full-Stack Apps',
        type: 'docker',
        description: 'Build dashboards and portals using <strong>Next.js 15 + Tailwind 4 + shadcn</strong> — for users who prefer the modern React/TypeScript ecosystem. Same capabilities as the Grails app but with a different tech stack.',
        url: 'http://localhost:8420',
        launchLinks: [
          { label: 'Front-Facing Area /', url: 'http://localhost:8420', icon: 'globe' },
          { label: 'Admin Area /admin', url: 'http://localhost:8420/admin', icon: 'cog' }
        ],
        entrypoint: 'flowkraft/next-playground/docker-compose.yml',
        service_name: 'next-playground',
        startCmd: 'system service app start next-playground 8420',
        stopCmd: 'system service app stop next-playground',
        tags: ['flowkraft', 'admin-panel', 'front-facing', 'dashboards', 'customer-portal', 'payments', 'next.js', 'react', 'bi', 'charts', 'analytics', 'olap', 'visualization', 'data-warehouse', 'DataPallas\'s App'],
        visible: true,
        tutorialLink: { label: 'Want to get your own self-service document web portal? See a real walkthrough →', url: 'https://datapallas.com/docs/ai-crew/athena#athena---new-billing-portal' },
      },
      {
        id: 'cms-webportal',
        name: 'WebPortal / Customer Portal',
        icon: 'users',
        category: 'Web Portal',
        type: 'docker',
        description: 'The fastest way to build your <em>You Name It</em> <strong>Web Portal</strong> - could be Employee Portal, Customer Portal, Partner Portal, Student Portal or any other Self-Service Portal <a href="https://datapallas.com/docs/document-portal" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1em;height:1em;vertical-align:-0.125em"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>&nbsp;see how</a>',
        url: 'http://localhost:8080/wp-admin',
        demoInfo: `
          <div style="margin-top: 18px; padding: 14px 16px; background: #f0f7fa; border: 1px solid #d0e4ed; border-radius: 6px; font-size: 0.88em; color: #333;">
            <div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #d0e4ed; color: #555;">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1em;height:1em;vertical-align:-0.125em;color:#5a9bb8;margin-right:6px"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/></svg>Try the demo logins
            </div>
            <div style="line-height: 1.85;">
              <div style="margin-bottom: 8px;">
                <span style="color: #666;">Admin:</span>
                <span style="font-weight: 600; color: #2c5282; margin-left: 8px; background: #fff; padding: 2px 8px; border-radius: 3px; border: 1px solid #d0e4ed;">u2changeme</span>
                <span style="color: #bbb; margin: 0 6px;">/</span>
                <span style="font-weight: 600; color: #2c5282; background: #fff; padding: 2px 8px; border-radius: 3px; border: 1px solid #d0e4ed;">p2changeme123!</span>
                <a href="http://localhost:8080/wp-admin" target="_blank" style="color: #5a9bb8;">admin area</a>
                <span style="color: #ddd; margin: 0 6px;">•</span>
                <a href="http://localhost:8080/my-documents" target="_blank" style="color: #5a9bb8;">frontend</a>
              </div>
              <div>
                <span style="color: #666;">Employee:</span>
                <span style="font-weight: 600; color: #2c5282; margin-left: 8px; background: #fff; padding: 2px 8px; border-radius: 3px; border: 1px solid #d0e4ed;">clyde.grew</span>
                <span style="color: #bbb; margin: 0 6px;">/</span>
                <span style="font-weight: 600; color: #2c5282; background: #fff; padding: 2px 8px; border-radius: 3px; border: 1px solid #d0e4ed;">demo1234</span>
                <a href="http://localhost:8080/my-documents" target="_blank" style="color: #5a9bb8;">frontend</a>
                <span style="color: #888; margin-left: 12px;">— sees only own docs</span>
              </div>
            </div>
            <div style="margin-top: 12px; font-size: 0.85em; color: #999;">
              Other employees: kyle.butford, alfreda.waldback (password: demo1234)
            </div>
          </div>
        `,

        entrypoint: 'cms-webportal-playground/docker-compose.yml',
        service_name: 'cms-webportal-playground',
        startCmd: 'system service app start cms-webportal-playground 8080',
        stopCmd: 'system service app stop cms-webportal-playground',
        tags: ['flowkraft', 'cms', 'admin-panel', 'front-facing', 'customer-portal', 'cms', 'wordpress', 'DataPallas\'s App'],
        visible: true,
        tutorialLink: { label: 'Want to get your own CMS document web portal? See a real walkthrough →', url: 'https://datapallas.com/docs/ai-crew/athena#athena---new-billing-portal' },
      },
      {
        id: 'cloudbeaver',
        name: 'CloudBeaver (Database Manager)',
        icon: 'database',
        category: 'Database Management',
        type: 'docker',
        description: 'The professional data management software trusted by experts.',
        url: 'http://localhost:8978',
        entrypoint: 'cloudbeaver/docker-compose.yml',
        service_name: 'cloudbeaver',
        startCmd: 'system service app start cloudbeaver 8978',
        stopCmd: 'system service app stop cloudbeaver',
        tags: ['database-management'],
        visible: true,
        website: 'https://cloudbeaver.io/',
      },
      {
        id: 'rundeck',
        name: 'Rundeck (Automation & Job Scheduling)',
        icon: 'cogs',
        category: 'Automation & Job Scheduling',
        type: 'docker',
        description: 'Runbook automation service with a web console, command line tools and a WebAPI. It lets you easily standardize tasks to improve operational quality by deploying automation across your organization.',
        url: 'http://localhost:4440',
        entrypoint: 'rundeck/docker-compose.yml',
        service_name: 'rundeck',
        startCmd: 'system service app start rundeck 4440',
        stopCmd: 'system service app stop rundeck',
        tags: ['automation', 'crons-job-scheduling'],
        visible: true,
        website: 'https://www.rundeck.com/',
      },
      {
        id: 'matomo',
        name: 'Matomo (Web Analytics)',
        icon: 'bar-chart',
        category: 'Analytics & Tracking',
        type: 'docker',
        description: 'Open-source web analytics platform, a privacy-friendly alternative to Google Analytics.',
        url: 'http://localhost:8081',
        entrypoint: 'matomo/docker-compose.yml',
        service_name: 'matomo',
        startCmd: 'system service app start matomo 8081',
        stopCmd: 'system service app stop matomo',
        tags: ['web-analytics'],
        visible: true,
        website: 'https://matomo.org/',
      },
      {
        id: 'docuseal',
        name: 'Docuseal (Document Signing)',
        icon: 'file-signature',
        category: 'Document Management',
        type: 'docker',
        description: 'Self-hosted document signing platform with secure workflows and audit trails.',
        url: 'http://localhost:3001',
        entrypoint: 'docuseal/docker-compose.yml',
        service_name: 'docuseal',
        startCmd: 'system service app start docuseal 3001',
        stopCmd: 'system service app stop docuseal',
        tags: ['document-signing', 'security'],
        visible: true,
        website: 'https://docuseal.com/',
      },
      {
        id: 'metabase',
        name: 'Metabase',
        icon: 'line-chart',
        category: 'BI & Visualization',
        type: 'docker',
        description: 'Open Source business intelligence and analytics platform.',
        url: 'http://localhost:3000',
        entrypoint: 'metabase/docker-compose.yml',
        service_name: 'metabase',
        startCmd: 'system service app start metabase 3000',
        stopCmd: 'system service app stop metabase',
        tags: ['bi', 'analytics'],
        visible: true,
        website: 'https://www.metabase.com/',
      },
      // ClickHouse moved to Starter Packs (Databases) - see starter-packs.service.ts
      {
        id: 'redash',
        name: 'Redash',
        category: 'BI & Visualization',
        type: 'docker',
        description: 'Query builder and dashboard tool.',
        url: 'http://localhost:5000',

        entrypoint: 'docker-compose.yml',
        service_name: 'redash',
        state: 'stopped' as ManagedApp['state'],
      },
      {
        id: 'superset',
        name: 'Apache Superset',
        category: 'BI & Visualization',
        type: 'docker',
        description: 'Enterprise-ready data visualization platform.',
        url: 'http://localhost:8088',

        entrypoint: 'docker-compose.yml',
        service_name: 'superset',
        state: 'stopped' as ManagedApp['state'],
      },
      {
        id: 'vscode',
        name: 'VS Code',
        icon: 'free-code-camp',
        category: 'Developer Tools',
        type: 'desktop',
        description: 'Launch local installation of Visual Studio Code.',

        command: 'code',
        visible: false,
        state: 'stopped' as ManagedApp['state'],
      },
      {
        id: 'notepad++',
        name: 'Notepad++ (Local)',
        category: 'Developer Tools',
        type: 'desktop',
        description: 'Launch local installation of Notepad++.',

        command: 'notepad++',
        state: 'stopped' as ManagedApp['state'],
      },
    ],
  };

  // localStorage key for cleaning up stale transitional states
  private static readonly TRANSITIONAL_STATES_KEY = 'rb-apps-transitional-states';

  constructor(
    private messagesService: ToastrMessagesService,
    private systemService: SystemService,
    private stateStore: StateStoreService,
    private dockerLifecycle: DockerLifecycleService,
  ) { }

  private clearTransitionalState(appId: string): void {
    try {
      const stored = JSON.parse(localStorage.getItem(AppsManagerService.TRANSITIONAL_STATES_KEY) || '{}');
      delete stored[appId];
      localStorage.setItem(AppsManagerService.TRANSITIONAL_STATES_KEY, JSON.stringify(stored));
    } catch (e) { /* ignore localStorage errors */ }
  }

  /** Clear all in-flight commands — called when polling reaches max iterations */
  public clearAllInFlight(): void {
    this.dockerLifecycle.clearAllInFlight();
    // Reset all transitional appStates to stopped
    for (const [id, state] of Object.entries(this.appStates)) {
      if (state === 'starting' || state === 'stopping') {
        this.appStates[id] = 'stopped';
        this.clearTransitionalState(id);
      }
    }
  }

  // Add method to fetch statuses from API
  public async refreshAllStatuses(skipProbe: boolean = false): Promise<void> {
    try {
      // Refresh system info (docker status) along with service statuses
      await this.dockerLifecycle.refreshSystemInfo();

      const response = await this.systemService.getServicesStatus(skipProbe);
      const statuses: any[] = response;  // Array of {name, status, ports, health}

      // Use debug-level logging to avoid noisy console output in normal operation
      console.debug('[AppsManager] API response statuses:', statuses);

      // Update app states based on API response
      for (const app of this.allAppsData.apps) {
        // Match by: exact service_name, container name contains service_name, or container name contains app.id
        // Prefer exact/endsWith matches to avoid matching sibling containers like -db or -cli
        const service = statuses.find(s => {
          const name = (s.name || '').toLowerCase();
          const svc = (app.service_name || '').toLowerCase();
          const id = (app.id || '').toLowerCase();
          if (!svc && !id) return false;
          if (svc && (name === svc || name === `rb-${svc}` || name.endsWith(`-${svc}`) || name.endsWith(`/${svc}`))) return true;
          if (id && (name === id || name === `rb-${id}` || name.endsWith(`-${id}`) || name.endsWith(`/${id}`))) return true;
          return false;
        });

        // Debug-level output so it only appears when debug logging is enabled
        console.debug(`[AppsManager] App ${app.id}: service_name=${app.service_name}, matched service=`, service);

        const dockerStatus = service
          ? PollingHelper.mapBackendStatusToUiState(service.status)
          : null;
        const resolved = this.dockerLifecycle.resolveNextStatus(
          app.id,
          this.appStates[app.id],
          dockerStatus,
        );
        this.appStates[app.id] = resolved.status as NonNullable<ManagedApp['state']>;
        if (resolved.clearInFlight) {
          this.clearTransitionalState(app.id);
          this.dockerLifecycle.markCommandEnd(app.id);
        }

        if (service) {
          // If app has no `url`, derive one from the container's exposed ports (use first host-mapped port)
          try {
            if (!app.url && service.ports) {
              // Example of service.ports: "0.0.0.0:8080->80/tcp, [::]:8080->80/tcp"
              const portMatch = (service.ports || '').match(/:(\d+)->/);
              if (portMatch && portMatch[1]) {
                app.url = `http://localhost:${portMatch[1]}`;
              }
            }
          } catch (e) {
            console.warn('[AppsManager] Failed to derive app.url from service.ports', e);
          }

          // Track provisioned state for cms-webportal
          if (app.id === 'cms-webportal' && this.appStates[app.id] === 'running') {
            this.stateStore.configSys.sysInfo.setup.portal.isProvisioned = true;
          }
        }
      }

      // Sync state across apps that share the same service_name (e.g. data-canvas and
      // flowkraft-ai-hub both run as 'ai-hub-frend'). The per-app loop above only preserves
      // transitional state for the in-flight app; sibling apps sharing the same service_name
      // would otherwise be wrongly reset to 'stopped'.
      // Priority: running > starting > stopping > error > unknown > stopped
      type AppState = 'running' | 'stopped' | 'unknown' | 'starting' | 'stopping' | 'error';
      const statePriority: AppState[] = ['running', 'starting', 'stopping', 'error', 'unknown', 'stopped'];
      const byServiceName: { [svc: string]: string[] } = {};
      for (const app of this.allAppsData.apps) {
        if (app.service_name) {
          if (!byServiceName[app.service_name]) byServiceName[app.service_name] = [];
          byServiceName[app.service_name].push(app.id);
        }
      }
      for (const ids of Object.values(byServiceName)) {
        if (ids.length < 2) continue;
        const states: AppState[] = ids.map(id => this.appStates[id] ?? 'stopped');
        const best: AppState = statePriority.find(s => states.includes(s)) ?? 'stopped';
        for (const id of ids) {
          if ((this.appStates[id] ?? 'stopped') !== best) {
            this.appStates[id] = best;
          }
        }
      }
    } catch (error) {
      console.error('Error refreshing statuses:', error);
      // Set to 'error' or leave as-is
    }
  }

  public async getAllApps(): Promise<ManagedApp[]> {
    const appsToReturn = this.allAppsData.apps.filter(app => app.visible === true);
    return appsToReturn.map(app => {
      const state = this.appStates[app.id] ?? 'stopped';
      return {
        ...app,
        type: app.type as 'docker' | 'local' | 'desktop' | 'url',
        state: state,
        lastOutput: this.appLastOutputs[app.id] ?? '',
        // Show stopCmd when running OR starting (so user can stop a starting app)
        currentCommandValue: (state === 'running' || state === 'starting') ? app.stopCmd : app.startCmd,
      };
    });
  }

  public async getAppById(id: string): Promise<ManagedApp> {
    const appData = this.allAppsData.apps.find(app => app.id === id);
    if (!appData) return undefined;
    const state = this.appStates[id] ?? 'stopped';
    return {
      ...appData,
      type: appData.type as 'docker' | 'local' | 'desktop' | 'url',
      state: state,
      lastOutput: this.appLastOutputs[id] ?? '',
      // Show stopCmd when running OR starting (so user can stop a starting app)
      currentCommandValue: (state === 'running' || state === 'starting') ? appData.stopCmd : appData.startCmd,
    };
  }

  // Toggle app state (start/stop)
  public async toggleApp(app: ManagedApp): Promise<void> {
    if ((this.appStates[app.id] ?? 'stopped') === 'running') {
      await this.stopApp(app);
    } else {
      await this.startApp(app);
    }
  }

  // Start an app
  private async startApp(app: ManagedApp): Promise<void> {
    let commandStr: string;
    let successMessage = `App '${app.name}' started successfully.`;

    if (app.type === 'docker') {
      if (app.currentCommandValue) {
        commandStr = app.currentCommandValue;
      } else {
        this.messagesService.showError(`No command defined for '${app.name}'.`);
        return;
      }
    } else if (app.type === 'local' || app.type === 'desktop') {
      if (app.command) {
        commandStr = app.command;
      } else {
        this.messagesService.showError(`No command defined for '${app.name}'.`);
        return;
      }
    } else if (app.type === 'url') {
      if (app.url) {
        window.open(app.url, '_blank');
        this.messagesService.showSuccess(successMessage);
      } else {
        this.messagesService.showError(`No URL defined for '${app.name}'.`);
      }
      return;
    } else {
      this.messagesService.showError(`Unknown app type for '${app.name}'.`);
      return;
    }

    // Set instant feedback
    this.appStates[app.id] = 'starting';
    this.dockerLifecycle.markCommandStart(app.id);
    this.appLastOutputs[app.id] = 'Executing start...';

    try {
      const response = await this.dockerLifecycle.executeCommand(commandStr);
      if (response && response.status && response.status !== 'error') {
        // Keep in-flight — backend runs async (fire-and-forget), Docker may not have
        // started yet. refreshAllStatuses() preserves transitional state while in-flight.
        this.appStates[app.id] = 'starting';
        this.appLastOutputs[app.id] = response.output || `✓ ${app.name} container started, waiting for health check...`;
        app.state = 'starting';
        app.lastOutput = this.appLastOutputs[app.id];
      } else {
        this.dockerLifecycle.markCommandEnd(app.id);
        this.appStates[app.id] = 'error';
        this.clearTransitionalState(app.id);
        this.appLastOutputs[app.id] = response?.output || `✗ Failed to start ${app.name}.`;
        app.state = 'error';
        app.lastOutput = this.appLastOutputs[app.id];
        app.currentCommandValue = app.startCmd;
      }
    } catch (e: any) {
      this.dockerLifecycle.markCommandEnd(app.id);
      this.appStates[app.id] = 'error';
      this.clearTransitionalState(app.id);
      this.appLastOutputs[app.id] = e?.message || `✗ Failed to start ${app.name}.`;
      app.state = 'error';
      app.lastOutput = this.appLastOutputs[app.id];
      app.currentCommandValue = app.startCmd;
    }
  }

  // Reprovision action for WordPress CMS. Executes startCmd with --reprovision (alias to rebuild-theme)
  public async reprovision(app: ManagedApp): Promise<void> {
    if (app.type !== 'docker') {
      this.messagesService.showError(`Reprovision is only supported for Docker apps`);
      return;
    }
    if (!app.startCmd) {
      this.messagesService.showError(`No start command defined for '${app.name}'.`);
      return;
    }

    let commandStr = app.startCmd;
    if (!commandStr.includes('--reprovision')) {
      commandStr = commandStr.trim() + ' --reprovision';
    }

    this.appStates[app.id] = 'starting';
    this.dockerLifecycle.markCommandStart(app.id);
    this.appLastOutputs[app.id] = 'Starting theme rebuild...';

    try {
      const response = await this.dockerLifecycle.executeCommand(commandStr);
      this.dockerLifecycle.markCommandEnd(app.id);
      if (response && response.status && response.status !== 'error') {
        this.appStates[app.id] = 'starting';
        this.appLastOutputs[app.id] = response.output || `✓ Reprovision started for ${app.name}`;
        app.state = 'starting';
        app.lastOutput = this.appLastOutputs[app.id];
      } else {
        this.appStates[app.id] = 'error';
        this.clearTransitionalState(app.id);
        this.appLastOutputs[app.id] = response?.output || `✗ Failed to reprovision ${app.name}.`;
        app.state = 'error';
        app.lastOutput = this.appLastOutputs[app.id];
      }
    } catch (e: any) {
      this.dockerLifecycle.markCommandEnd(app.id);
      this.appStates[app.id] = 'error';
      this.clearTransitionalState(app.id);
      this.appLastOutputs[app.id] = e?.message || `✗ Failed to reprovision ${app.name}.`;
      app.state = 'error';
      app.lastOutput = this.appLastOutputs[app.id];
    }
  }

  // Stop an app
  private async stopApp(app: ManagedApp): Promise<void> {
    let commandStr: string;
    let successMessage = `App '${app.name}' stopped successfully.`;

    if (app.type === 'docker') {
      if (app.currentCommandValue) {
        commandStr = app.currentCommandValue;
      } else {
        this.messagesService.showError(`No command defined for '${app.name}'.`);
        return;
      }
    } else if (app.type === 'local' || app.type === 'desktop') {
      if (app.command) {
        commandStr = app.command;
      } else {
        this.messagesService.showInfo(
          `Stopping local/desktop app '${app.name}' is not automatically supported. Please close it manually.`
        );
        this.appStates[app.id] = 'stopped';
        await this.refreshAllStatuses();
        return;
      }
    } else if (app.type === 'url') {
      // Cannot "stop" a URL
      return;
    } else {
      this.messagesService.showError(`Unknown app type for '${app.name}'.`);
      return;
    }

    // Set instant feedback
    this.appStates[app.id] = 'stopping';
    this.dockerLifecycle.markCommandStart(app.id);
    this.appLastOutputs[app.id] = 'Executing stop...';

    try {
      const response = await this.dockerLifecycle.executeCommand(commandStr);
      if (response && response.status && response.status !== 'error') {
        // Keep in-flight — backend runs async (fire-and-forget), docker compose down
        // may not have finished yet. refreshAllStatuses() preserves transitional
        // 'stopping' state while in-flight.
        this.appStates[app.id] = 'stopping';
        this.appLastOutputs[app.id] = response.output || `Stopping ${app.name}...`;
        try { app.state = 'stopping'; } catch (e) { }
        try { app.lastOutput = this.appLastOutputs[app.id]; } catch (e) { }
      } else {
        this.dockerLifecycle.markCommandEnd(app.id);
        this.appStates[app.id] = 'error';
        this.clearTransitionalState(app.id);
        this.appLastOutputs[app.id] = response?.output || `✗ Failed to stop ${app.name}.`;
        try { app.state = 'error'; } catch (e) { }
        try { app.lastOutput = this.appLastOutputs[app.id]; } catch (e) { }
      }
    } catch (e: any) {
      this.dockerLifecycle.markCommandEnd(app.id);
      this.appStates[app.id] = 'error';
      this.clearTransitionalState(app.id);
      this.appLastOutputs[app.id] = e?.message || `✗ Failed to stop ${app.name}.`;
      try { app.state = 'error'; } catch (e2) { }
      try { app.lastOutput = this.appLastOutputs[app.id]; } catch (e2) { }
    }
  }
}