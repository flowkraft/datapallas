import { Component, input, OnInit, ChangeDetectorRef, OnDestroy, OnChanges, SimpleChanges, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AppsManagerService, ManagedApp } from './apps-manager.service';
import { ConfirmService } from '../dialog-confirm/confirm.service';
import { StateStoreService } from '../../providers/state-store.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { Router } from '@angular/router';
import { AiManagerComponent, AiManagerLaunchConfig } from '../ai-manager/ai-manager.component';
import { PollingHelper } from '../../providers/polling.helper';
import { iconSvg } from '../../shared/icon-svgs';

// This interface should be defined in a shared models file

@Component({
  selector: 'dburst-apps-manager',
  templateUrl: './apps-manager.template.html',
})
export class AppsManagerComponent implements OnInit, OnChanges, OnDestroy {
  readonly iconSvg = iconSvg;

  // Search and Tag Filter State
  searchTerm: string = '';
  selectedTag: string | null = null;
  allTags: string[] = [];
  isLoading: boolean = true;
  isRefreshing: boolean = false;

  // Polling subscription for apps in transitional states (starting/stopping)
  private pollingSubscription: Subscription | null = null;

  // Periodic sync interval — keeps embedded instances in sync when state changes externally
  private syncInterval: any;

  // Search debounce
  public searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;

  inputAppsToShow = input<ManagedApp[] | string[] | undefined>();
  // Actual list displayed by the UI (either all apps after filtering, or provided input app(s))
  public visibleApps: ManagedApp[] = [];
  dropdownDirection = input<'up' | 'down' | 'expandedList'>('down');

  /** Optional: When provided, renders an "Ask AI" button next to Start/Stop in expandedList mode */
  askAiForHelpOutputTypeCode = input<string>('');

  /** Optional: When false, hides dev-oriented controls (command input, build flags). Default: true */
  showDevButtons = input<boolean>(true);

  /** Reference to the embedded AI manager component */
  aiManagerInstance = viewChild<AiManagerComponent>('aiManagerInstance');

  // Keep an unfiltered master list for applying filters
  private masterApps: ManagedApp[] = [];

  // Parent-provided apps to show

  // We can add more specific inputs if needed, e.g., for single-app display
  // @Input() appId: string;

  constructor(
    protected appsManagerService: AppsManagerService,
    protected confirmService: ConfirmService,
    protected stateStore: StateStoreService,
    protected router: Router,
    protected cdRef: ChangeDetectorRef,
    protected sanitizer: DomSanitizer,
    protected messagesService: ToastrMessagesService,
  ) { }

  /**
   * Returns true if Docker is installed and available.
   */
  get isDockerAvailable(): boolean {
    return !!this.stateStore?.configSys?.sysInfo?.setup?.docker?.isDockerOk;
  }

  /**
   * Returns true if the app is running.
   */
  isAppRunning(app: ManagedApp): boolean {
    return app.state === 'running';
  }

  private static readonly FLOWKRAFT_IDS = [
    'flowkraft-data-canvas',
    'flowkraft-grails',
    'flowkraft-next',
    'flowkraft-bkend-boot-groovy',
    'flowkraft-chat2db',
  ];

  private static readonly CMS_WEBPORTAL_IDS = [
    'cms-webportal',
    'cms-webportal-playground',
  ];

  isCmsWebPortal(app: ManagedApp | undefined): boolean {
    return this.matchesByIdOrSiblingService(app, AppsManagerComponent.CMS_WEBPORTAL_IDS);
  }

  isFlowkraftApp(app: ManagedApp | undefined): boolean {
    return this.matchesByIdOrSiblingService(app, AppsManagerComponent.FLOWKRAFT_IDS);
  }

  // Match an app by direct id OR by shared `service_name` with any app in the id list.
  // Lets sibling cards that alias the same Docker service (e.g. data-canvas ↔ flowkraft-ai-hub
  // both on `ai-hub-frend`) share flag visibility without a maintenance burden on the allowlist.
  private matchesByIdOrSiblingService(app: ManagedApp | undefined, idList: string[]): boolean {
    if (!app) return false;
    if (idList.includes(app.id)) return true;
    if (!app.service_name) return false;
    return this.masterApps.some(a => idList.includes(a.id) && a.service_name === app.service_name);
  }

  isStartingOrStopping(app: ManagedApp | undefined): boolean {
    if (!app || !app.state) return false;
    return app.state === 'starting' || app.state === 'stopping';
  }

  isAppStopped(app: ManagedApp | undefined): boolean {
    if (!app || !app.state) return false;
    return app.state === 'stopped' || app.state === 'unknown' || app.state === 'error';
  }

  isAppStarting(app: ManagedApp | undefined): boolean {
    if (!app || !app.state) return false;
    return app.state === 'starting';
  }

  isAppStopping(app: ManagedApp | undefined): boolean {
    if (!app || !app.state) return false;
    return app.state === 'stopping';
  }

  isAppError(app: ManagedApp | undefined): boolean {
    if (!app || !app.state) return false;
    return app.state === 'error';
  }

  trackByAppId(index: number, app: ManagedApp): string {
    return app.id;
  }

  /**
   * Returns true if the app requires Docker (type === 'docker') and Docker is NOT available.
   * Used in the template to disable Start button and show notice.
   */
  isDockerRequiredButMissing(app: ManagedApp): boolean {
    return app.type === 'docker' && !this.isDockerAvailable;
  }

  /**
   * Navigate to the Extra Packages tab to help user install Docker.
   */
  navigateToDockerInstall(): void {
    this.router.navigate(['/help', 'starterPacksMenuSelected'], { queryParams: { activeTab: 'extraPackagesTab' } });
  }

  async ngOnInit(): Promise<void> {
    // Remember whether parent provided an `apps` input (used to hide search/filter UI)
    // Determine if the parent provided explicit app(s) to show
    // (inputAppsToShow is undefined when the caller wants the default behavior)

    // Load apps (will resolve string id(s) or fetch all when no input provided)
    await this.loadInitialApps();
    // Subscribe to search changes
    this.searchSubscription = this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe((term) => {
      this.searchTerm = term;
      this.applyFilters();
    });

    // When showing a fixed set of apps (embedded mode), periodically sync state
    // so changes from other component instances are reflected
    if (this.inputAppsToShow() != null) {
      this.syncInterval = setInterval(async () => {
        // Skip sync while polling is active — polling already refreshes state
        if (this.pollingSubscription && !this.pollingSubscription.closed) return;
        try {
          const fetched = await Promise.all(
            this.masterApps.map(async (app) => this.appsManagerService.getAppById(app.id))
          );
          let changed = false;
          fetched.forEach((fresh, i) => {
            if (fresh && this.masterApps[i] && fresh.state !== this.masterApps[i].state) {
              this.masterApps[i].state = fresh.state;
              this.masterApps[i].lastOutput = fresh.lastOutput;
              changed = true;
            }
          });
          if (changed) {
            this.visibleApps = [...this.masterApps];
            this.cdRef.detectChanges();
            // If any app entered a transitional state externally, start polling
            if (PollingHelper.hasTransitionalItems(this.masterApps)) {
              this.startTransitionPolling();
            }
          }
        } catch (e) { /* ignore sync errors */ }
      }, 3000);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['inputAppsToShow'] && !changes['inputAppsToShow'].firstChange) {
      // Re-load initial apps when parent changes the input (e.g., via async pipe)
      void this.loadInitialApps();
    }
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    this.searchSubject.complete(); // Complete subject to prevent memory leaks
    this.stopTransitionPolling();
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }

  // Load apps and initial statuses
  async loadInitialApps(): Promise<void> {
    this.isLoading = true;
    this.isRefreshing = false;
    // If parent provided an `apps` input, respect its form (string id, string[] ids, ManagedApp, ManagedApp[])
    if (this.inputAppsToShow() != null) {
      const inputApps = this.inputAppsToShow();
      // array of ids
      if (Array.isArray(inputApps) && inputApps.length && typeof (inputApps as any)[0] === 'string') {
        const ids = inputApps as string[];
        const all = await this.appsManagerService.getAllApps();
        this.masterApps = all.filter(a => ids.includes(a.id)).map(a => ({ ...a }));
      }
      // ManagedApp or ManagedApp[] provided directly
      else if (Array.isArray(inputApps)) {
        this.masterApps = (inputApps as ManagedApp[]).map(a => ({ ...a }));
      } else {
        this.masterApps = [{ ...(inputApps as unknown as ManagedApp) }];
      }
      this.visibleApps = [...this.masterApps];
    } else {
      const apps = await this.appsManagerService.getAllApps();
      // Use the apps from the service as the master list and copy into visible list
      this.masterApps = apps.map(app => ({ ...app }));
      this.visibleApps = [...this.masterApps];
    }
    // Refresh statuses using the API
    await this.appsManagerService.refreshAllStatuses(PollingHelper.hasTransitionalItems(this.masterApps));
    // Update state from service
    const fetched = await Promise.all(this.masterApps.map(async (app) => this.appsManagerService.getAppById(app.id)));
    this.masterApps = fetched.map(a => a || ({} as ManagedApp));
    this.visibleApps = [...this.masterApps];
    // Ensure change detection after async updates (e.g., called by setter after async pipe resolves)
    try { this.cdRef.detectChanges(); } catch (e) { /* ignore if not necessary */ }
    // Setup tags and filters only if not showing a fixed set from the parent
    if (this.inputAppsToShow() == null) {
      this.extractAllTags();
      this.applyFilters();
    } else {
      // Clear any former filters so that provided apps are shown unfiltered
      this.selectedTag = null;
      this.searchTerm = '';
    }
    this.isLoading = false;

    // If any app is already in a transitional state (starting/stopping), start polling
    // This handles the case where user navigates away and back while an app is still starting
    const hasTransitionalApps = PollingHelper.hasTransitionalItems(this.masterApps);
    console.debug('loadInitialApps complete. Apps states:', this.masterApps.map(a => ({ id: a.id, state: a.state })));
    console.debug('hasTransitionalApps:', hasTransitionalApps);
    if (hasTransitionalApps) {
      console.debug('Starting transition polling...');
      this.startTransitionPolling();
    }
  }

  extractAllTags(): void {
    const set = new Set<string>();
    this.masterApps.forEach(a => { if (a.tags) a.tags.forEach(t => set.add(t)); });
    this.allTags = Array.from(set).sort();
  }

  applyFilters(): void {
    // Do not apply filters when parent provided a fixed set of apps to show
    if (this.inputAppsToShow() != null) return;
    let list = [...this.masterApps];
    if (this.selectedTag) {
      list = list.filter(a => (a.tags || []).includes(this.selectedTag!));
    }
    const term = this.searchTerm.toLowerCase().trim();
    if (term) {
      list = list.filter(a =>
        (a.name || '').toLowerCase().includes(term) ||
        (a.description || '').toLowerCase().includes(term) ||
        (a.category || '').toLowerCase().includes(term) ||
        (a.service_name || '').toLowerCase().includes(term) ||
        (a.tags || []).some(t => t.toLowerCase().includes(term))
      );
    }
    this.visibleApps = list;
  }

  filterByTag(tag: string): void {
    if (this.selectedTag === tag) { this.clearTagFilter(); } else { this.selectedTag = tag; this.applyFilters(); }
  }

  clearTagFilter(): void { this.selectedTag = null; this.applyFilters(); }

  async refreshData(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    try {
      await this.appsManagerService.refreshAllStatuses(PollingHelper.hasTransitionalItems(this.masterApps));
      // update local UI state
      const fetched = await Promise.all(this.masterApps.map(async (app) => this.appsManagerService.getAppById(app.id)));
      this.masterApps = fetched.map(a => a || ({} as ManagedApp));
      this.visibleApps = [...this.masterApps];
      this.extractAllTags();
      this.applyFilters();
    } catch (err) {
      console.error('Failed refreshing apps statuses', err);
    } finally {
      this.isRefreshing = false;
    }
  }

  sanitizeAppId(id: string): string {
    return id ? id.replace(/\s/g, '') : '';
  }

  onLaunch(app: ManagedApp, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    if (!app || !app.url) return;
    if (app.state !== 'running') return;
    window.open(app.url, '_blank', 'noopener');
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.messagesService.showInfo('Copied to clipboard!', 'Success');
    }).catch((err) => {
      console.error('Failed to copy: ', err);
      this.messagesService.showInfo('Failed to copy to clipboard.', 'Error');
    });
  }

  copyCredential(credential: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    navigator.clipboard.writeText(credential).then(() => {
      this.messagesService.showInfo('Copied!', 'Success');
    }).catch((err) => {
      console.error('Failed to copy: ', err);
      this.messagesService.showInfo('Failed to copy.', 'Error');
    });
  }

  toggleCommandFlag(app: ManagedApp, flag: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const isChecked = checkbox.checked;

    if (!app.currentCommandValue) return;

    // Remove flag if unchecked
    if (!isChecked) {
      app.currentCommandValue = app.currentCommandValue
        .replace(new RegExp(`\\s*${flag}`, 'g'), '')
        .trim();
    } else {
      // Add flag if checked (and not already present)
      if (!app.currentCommandValue.includes(flag)) {
        app.currentCommandValue = app.currentCommandValue.trim() + ' ' + flag;
      }
      // If --no-cache is checked, remove --build (--no-cache implies rebuild)
      if ((flag === '--no-cache' || flag === '--full') && app.currentCommandValue.includes('--build')) {
        app.currentCommandValue = app.currentCommandValue
          .replace(/\s*--build/g, '')
          .trim();
      }

      // If --full is checked, ensure --no-cache is present (full implies no-cache)
      if (flag === '--full' && isChecked && !app.currentCommandValue.includes('--no-cache')) {
        app.currentCommandValue = app.currentCommandValue + ' --no-cache';
      }
    }
  }

  toggleVolumesFlag(app: ManagedApp, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const isChecked = checkbox.checked;

    // We only alter the stop command to avoid adding --volumes to the start command by accident
    if (!app.stopCmd) return;

    if (isChecked) {
      const message = `This will permanently delete data stored in the container volumes for ${app.name}. To confirm, type DELETE below and press Delete.`;
      this.confirmService.askConfirmation({ message, confirmationText: 'DELETE', confirmLabel: 'Delete', declineLabel: 'Cancel' }).then((result: boolean) => {
        if (result) {
          if (!app.stopCmd.includes('--volumes')) {
            app.stopCmd = app.stopCmd.trim() + ' --volumes';
          }
          if (app.state === 'running') {
            app.currentCommandValue = app.stopCmd;
          }
        } else {
          // Revert the checkbox visually when the user cancels
          checkbox.checked = false;
        }
      }).catch(() => {
        checkbox.checked = false;
      });
    } else {
      // Remove flag from stopCmd and update the current value if needed
      app.stopCmd = app.stopCmd.replace(/\s*--volumes/g, '').trim();
      if (app.state === 'running') {
        app.currentCommandValue = app.stopCmd;
      }
    }
  }

  // Note: 'Reprovision' is now a switch that adds '--reprovision' to the start command.
  // The actual start invocation will include this flag when the user clicks Start.

  async onToggleApp(app: ManagedApp) {

    let dialogQuestion = `Stop ${app.name}?`;
    if (app.state !== 'running') {
      // Default concise start message with patience note
      dialogQuestion = `Start ${app.name}? Be patient — the first start takes longer while required components download and configure; subsequent start/stop cycles are faster.`;

      // Special concise message for cms-webportal if not provisioned
      if (this.isCmsWebPortal(app) && !this.stateStore?.configSys?.sysInfo?.setup?.portal?.isProvisioned) {
        dialogQuestion = `Start ${app.name}? Since the portal is not provisioned, the first launch may take longer — please be patient. Subsequent start/stop cycles are faster.`;
      }
    }

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        // Refresh Docker status BEFORE checking it (to get the latest status, not stale cached value)
        if (app.state !== 'running' && app.type === 'docker') {
          await this.appsManagerService.refreshAllStatuses();
        }

        // Check Docker AFTER user confirms they want to start (only for docker apps, not for stopping)
        if (app.state !== 'running' && app.type === 'docker' && !this.stateStore?.configSys?.sysInfo?.setup?.docker?.isDockerOk) {
          const dockerInfo = this.stateStore?.configSys?.sysInfo?.setup?.docker;

          if (dockerInfo && dockerInfo.isDockerInstalled && !dockerInfo.isDockerDaemonRunning) {
            this.messagesService.showWarning(
              `Docker is installed but cannot be reached. Please ensure Docker Desktop is running and that DataPallas was started with "Run as Administrator".`,
              'Docker Not Running'
            );
          } else {
            this.messagesService.showWarning(
              `Docker is not installed and it is required for this application. See Help → Apps / Starter Packs for installation instructions.`,
              'Docker Required'
            );
          }
          return; // Don't proceed with starting
        }

        // Set immediate UI feedback
        app.state = app.state === 'running' ? 'stopping' : 'starting';

        await this.appsManagerService.toggleApp(app);

        // Don't refreshDataSilent() here — it overwrites the optimistic state.
        // Polling every 3s will confirm the real state from Docker.
        this.startTransitionPolling();
      }
    });
  }

  /**
   * Start polling for status updates while any app is in a transitional state (starting/stopping).
   * Polls every 3 seconds until all apps reach a stable state (running/stopped/error/unknown).
   * Uses shared PollingHelper for consistent behavior with starter-packs.
   */
  private startTransitionPolling(): void {
    if (this.pollingSubscription && !this.pollingSubscription.closed) return;

    this.pollingSubscription = PollingHelper.startLifecyclePolling({
      refresh: () => this.refreshDataSilent(),
      getItems: () => this.masterApps,
      onMaxIterations: () => {
        this.appsManagerService.clearAllInFlight();
        this.masterApps.forEach(app => {
          if (app.state === 'starting' || app.state === 'stopping') {
            app.state = 'stopped';
            app.currentCommandValue = app.startCmd;
          }
        });
        this.visibleApps = [...this.masterApps];
        this.cdRef.detectChanges();
      },
      label: 'AppsManager',
    });
  }

  /**
   * Stop transition polling explicitly (called on component destroy).
   */
  private stopTransitionPolling(): void {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
      this.pollingSubscription = null;
    }
  }

  /**
   * Silently refresh data without setting isRefreshing flag (avoids UI flicker during polling).
   */
  private async refreshDataSilent(): Promise<void> {
    try {
      await this.appsManagerService.refreshAllStatuses(true);
      // Update local UI state — merge in-place to preserve user's checkbox flags
      const fetched = await Promise.all(this.masterApps.map(async (app) => this.appsManagerService.getAppById(app.id)));
      fetched.forEach((fresh, i) => {
        if (fresh && this.masterApps[i]) {
          const existing = this.masterApps[i];
          const wasRunningOrStopping = existing.state === 'running' || existing.state === 'stopping';
          const isRunningOrStopping = fresh.state === 'running' || fresh.state === 'stopping';

          // Update status fields
          existing.state = fresh.state;
          existing.lastOutput = fresh.lastOutput;

          // Only reset currentCommandValue when command direction changes
          // (e.g., stopped→running flips to stopCmd, running→stopped flips to startCmd)
          if (wasRunningOrStopping !== isRunningOrStopping) {
            existing.currentCommandValue = fresh.currentCommandValue;
          }
        }
      });
      this.visibleApps = [...this.masterApps];
      this.applyFilters();
      // Force Angular to detect changes - important since we're in an async context
      try {
        this.cdRef.markForCheck();
        this.cdRef.detectChanges();
      } catch (e) {
        // View might be destroyed
      }
    } catch (err) {
      console.error('Failed polling app statuses', err);
    }
  }

  /**
   * Get the AI button label based on the output type code.
   */
  getAiButtonLabel(): string {
    if (this.askAiForHelpOutputTypeCode() === 'cms.webportal') {
      return 'Hey AI, Help Me ...';
    }
    return 'Hey AI, Help Me ...';
  }

  /**
   * Launch the AI manager with the appropriate configuration.
   */
  askAiForHelp(): void {
    if (!this.askAiForHelpOutputTypeCode() || !this.aiManagerInstance()) {
      return;
    }

    if (this.askAiForHelpOutputTypeCode() === 'cms.webportal') {
      const launchConfig: AiManagerLaunchConfig = {
        initialActiveTabKey: 'PROMPTS',
        initialSelectedCategory: 'Web Portal / CMS',
      };
      this.aiManagerInstance()!.launchWithConfiguration(launchConfig);
    }
    // Add more output type handlers as needed
  }

}