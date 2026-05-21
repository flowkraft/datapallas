import { Component, OnInit, OnDestroy, SecurityContext, ChangeDetectorRef, viewChild } from '@angular/core'; // Import SecurityContext
import { SHARED_IMPORTS } from '../../shared/shared-imports';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'; // Import DomSanitizer
import { Subscription, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

// Import specific icons you need from simple-icons
// Using distinct placeholders for Oracle/SQLServer/DB2/ClickHouse
import {
  siPostgresql,
  siMysql,
  siMariadb,
  siSqlite,
  siMongodb, // Placeholder 1
  siElasticsearch, // Placeholder 2
  siServerless, // Placeholder 3
  siApachecassandra, // Placeholder 4 - for ClickHouse (columnar DB)
  siSupabase,
  siRedis,
  siInfluxdb,
} from 'simple-icons';

import { AiManagerComponent } from '../ai-manager/ai-manager.component';
import { ApiService } from '../../providers/api.service';
import { SystemService } from '../../providers/system.service';
// Import the new service and definition interface
// Ensure this path is correct relative to the current file
import {
  StarterPacksService,
  StarterPackDefinition,
} from './starter-packs.service';
import { ConfirmService } from '../dialog-confirm/confirm.service';
import { StateStoreService } from '../../providers/state-store.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { Router } from '@angular/router';
import { PollingHelper } from '../../providers/polling.helper';
import { DockerLifecycleService } from '../../providers/docker-lifecycle.service';

// Interface for dynamic status data from API
interface StarterPackStatusData {
  id: string; // ID must match the one in StarterPackDefinition
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown';
  info?: any; // Or a more specific type if known (e.g., string for logs)
  lastOutput?: string; // Last output message from the backend process
}

// Interface for combined UI data (static definition + dynamic status + UI state)
// Inherits static props from StarterPackDefinition
interface StarterPackUIData extends StarterPackDefinition {
  // Dynamic props from API (overwrites definition if names clash, e.g., id)
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown';
  info?: any;
  lastOutput?: string;

  // UI State props (added by component for managing UI interactions)
  currentCommandValue: string; // The command currently displayed and editable in the input field
}

// Define expected response types for clarity
// API now returns only the dynamic status part
interface PackStatusResponse extends Array<StarterPackStatusData> { }
interface ExecuteResponse {
  output: string;
  newStatus: StarterPackUIData['status'];
}

// --- Map icon names (from definition) to imported simple-icons objects ---
const iconMap = {
  // Use distinct, non-brand icons as placeholders
  oracle: siMongodb, // Placeholder 1
  sqlserver: siElasticsearch, // Placeholder 2
  db2: siServerless, // Placeholder 3
  clickhouse: siApachecassandra, // Placeholder 4 - columnar DB icon
  postgresql: siPostgresql,
  mysql: siMysql,
  mariadb: siMariadb,
  sqlite: siSqlite,
  supabase: siSupabase,
  redis: siRedis,
  timescaledb: siInfluxdb, // simple-icons has no TimescaleDB brand; InfluxDB is the closest time-series icon
};

// Helper function to construct default commands based on definition
// Uses the defaultStartCmd and defaultStopCmd from the definition
const getDefaultCommand = (
  definition: StarterPackDefinition,
  action: 'start' | 'stop',
): string => {
  return action === 'start' ? definition.startCmd : definition.stopCmd;
};

@Component({
    selector: 'dburst-starter-packs',
    templateUrl: './starter-packs.template.html',
    standalone: true,
    imports: [...SHARED_IMPORTS],
})
export class StarterPacksComponent implements OnInit, OnDestroy {
  // --- State ---
  starterPacks: StarterPackUIData[] = []; // Master list (merged static + dynamic)
  filteredStarterPacks: StarterPackUIData[] = []; // List displayed in the template
  isLoading: boolean = true; // For initial load indicator
  isRefreshing: boolean = false; // For manual refresh indicator
  error: string | null = null; // Global error message

  // Search and Filter State
  searchTerm: string = '';
  selectedTag: string | null = null;
  allTags: string[] = []; // Unique tags extracted from definitions

  // Debounce search input
  public searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;

  // Polling subscription for packs in transitional states (starting/stopping)
  private pollingSubscription: Subscription | null = null;

  // AI Manager
  private aiManagerInstance = viewChild<AiManagerComponent>(AiManagerComponent);

  // Inject DomSanitizer along with other services
  constructor(
    protected apiService: ApiService,
    protected systemService: SystemService,
    protected starterPacksService: StarterPacksService,
    protected confirmService: ConfirmService,
    protected stateStore: StateStoreService,
    protected messagesService: ToastrMessagesService,
    protected router: Router,
    protected sanitizer: DomSanitizer,
    protected cdRef: ChangeDetectorRef,
    protected dockerLifecycle: DockerLifecycleService,
  ) { }

  /**
   * Returns true if Docker is installed and available.
   */
  get isDockerAvailable(): boolean {
    return !!this.stateStore?.configSys?.sysInfo?.setup?.docker?.isDockerOk;
  }

  ngOnInit(): void {
    this.loadInitialData(); // Fetch data when component initializes

    // Subscribe to search term changes with debounce
    this.searchSubscription = this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((term) => {
        this.searchTerm = term;
        this.applyFilters(); // Re-apply filters when search term changes
      });
  }

  ngOnDestroy(): void {
    // Unsubscribe to prevent memory leaks
    this.searchSubscription?.unsubscribe();
    this.searchSubject.complete(); // Complete subject to prevent memory leaks
    this.stopTransitionPolling();
  }

  // --- Data Fetching & Processing ---

  /**
   * Loads the initial data on component startup.
   */
  async loadInitialData(): Promise<void> {
    this.isLoading = true;
    this.isRefreshing = false;
    this.error = null;
    await this.fetchStarterPacksStatus();
  }

  /**
   * Manually triggers a refresh of the starter pack statuses.
   */
  async refreshData(): Promise<void> {
    // Prevent concurrent refreshes
    if (this.isRefreshing || this.isLoading) {
      //console.log('Refresh skipped (already in progress or loading)');
      return;
    }
    //console.log('Starting manual refresh...');
    this.isRefreshing = true;
    this.error = null; // Clear previous errors on refresh
    await this.fetchStarterPacksStatus();
  }

  /**
   * Fetches static definitions and dynamic statuses, then merges them.
   */
  async fetchStarterPacksStatus(): Promise<void> {
    try {
      // 1. Get static definitions from the service (this is local, no API call)
      const definitions = this.starterPacksService.getStarterPackDefinitions();

      // 2. Create UI data with all packs initially in "stopped" state
      this.starterPacks = definitions.map(definition => {
        return {
          ...definition,
          status: 'stopped',
          lastOutput: undefined,
          currentCommandValue: definition.startCmd,
        };
      });

      // 2. Fetch real statuses from the backend
      await this.refreshAllStatuses(); // This sets statuses for all packs

      // 3. Merge definitions with statuses (assuming statuses are already set on packs)
      this.starterPacks = definitions.map(definition => {
        const existingPack = this.starterPacks.find(p => p.id === definition.id);
        const currentStatus = existingPack?.status || 'unknown';
        return {
          ...definition,
          status: currentStatus,
          lastOutput: existingPack?.lastOutput || (currentStatus === 'running' ? `Running ${definition.displayName}` : `Ready to start ${definition.displayName}`),
          // Show stopCmd when running OR starting (so user can stop a starting pack)
          currentCommandValue: (currentStatus === 'running' || currentStatus === 'starting') ? definition.stopCmd : definition.startCmd,
        };
      });

      // 3. Setup UI elements
      this.extractAllTags();
      this.applyFilters();

      // 4. If any pack is in a transitional state (starting/stopping), start polling
      // This handles the case where user navigates away and back while a pack is starting
      if (PollingHelper.hasTransitionalItems(this.starterPacks)) {
        console.log('[StarterPacks] Detected transitional states on init, starting polling...');
        this.startTransitionPolling();
      }

    } catch (err) {
      console.error('Error setting up starter packs:', err);
      this.error = 'Failed to initialize starter packs';
    } finally {
      // CRITICAL: This line was missing, causing the spinner to run forever
      this.isLoading = false;
      this.isRefreshing = false;
    }
  }


  async refreshAllStatuses(skipProbe: boolean = false): Promise<void> {

    // Note: We use a separate loading flag or rely on caller to manage 'isLoading' if needed,
    // but here we just proceed. If careful throttling is needed, check `this.isLoading` if appropriate.
    // However, fetchStarterPacksStatus manages isLoading too.

    try {
      // 1. Refresh System Info (Docker status)
      await this.dockerLifecycle.refreshSystemInfo();

      // 2. Fetch container statuses
      const statuses = await this.systemService.getServicesStatus(skipProbe);

      console.debug('[StarterPacks] API response statuses:', statuses);

      for (const pack of this.starterPacks) {
        /* Matching logic adjusted to match AppsManager:
           - Prefer exact match on service_name
           - Fallback to container name/id logic
        */
        const service = (statuses as any[]).find((s: any) => {
          const name = (s.name || '').toLowerCase();
          // 'pack.id' is what we use as service_name key in this component (e.g. 'postgres', 'ibm-db2')
          const id = (pack.id || '').toLowerCase();

          if (!id) return false;
          // Check for exact match or rb-{id} or -{id} suffix
          if (name === id || name === `rb-${id}` || name.endsWith(`-${id}`)) return true;
          // Also match Docker container naming convention: rb-{packName}-{target}
          const packName = (pack.packName || '').toLowerCase();
          const target = (pack.target || '').toLowerCase();
          if (packName && target && name === `rb-${packName}-${target}`) return true;

          return false;
        });

        const dockerStatus = service
          ? PollingHelper.mapBackendStatusToUiState(service.status)
          : null;
        const resolved = this.dockerLifecycle.resolveNextStatus(
          pack.id,
          pack.status,
          dockerStatus,
        );
        pack.status = resolved.status as StarterPackUIData['status'];
        if (resolved.clearInFlight) {
          this.dockerLifecycle.markCommandEnd(pack.id);
        }

        // Keep displayed command in sync with status so the correct
        // start/stop command is used when the user clicks the button.
        // Without this, currentCommandValue can get stuck on stopCmd
        // after a stop completes, causing a "start" click to actually
        // send a stop command to the backend.
        const isActive = (pack.status === 'running' || pack.status === 'starting');
        pack.currentCommandValue = isActive ? pack.stopCmd : pack.startCmd;
      }

    } catch (error) {
      console.error('[StarterPacks] Error refreshing statuses:', error);
    }
  }

  // --- Action Trigger ---

  // In starter-packs.component.ts
  async togglePackState(pack: StarterPackUIData): Promise<void> {
    if (pack.status === 'starting' || pack.status === 'stopping') return;

    const action: 'start' | 'stop' = pack.status === 'running' ? 'stop' : 'start';

    let dialogQuestion = `${action === 'start' ? 'Start' : 'Stop'} ${pack.displayName}?`;

    if (action === 'start') {
      dialogQuestion += ' Be patient — the first start takes longer while required components download and configure; subsequent start/stop cycles are faster.';
    }

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        // Refresh Docker status BEFORE checking it (to get the latest status, not stale cached value)
        if (action === 'start') {
          await this.dockerLifecycle.refreshSystemInfo();
        }

        // Check Docker AFTER user confirms they want to start
        if (action === 'start' && !this.stateStore?.configSys?.sysInfo?.setup?.docker?.isDockerOk) {
          const dockerInfo = this.stateStore?.configSys?.sysInfo?.setup?.docker;

          if (dockerInfo && dockerInfo.isDockerInstalled && !dockerInfo.isDockerDaemonRunning) {
            this.messagesService.showWarning(
              `Docker is installed but cannot be reached. Please ensure Docker Desktop is running and that DataPallas was started with "Run as Administrator".`,
              'Docker Not Running'
            );
          } else {
            this.messagesService.showWarning(
              `Docker is not installed and it is required for this starter pack. See the Docker / Extra Utilities tab for installation instructions.`,
              'Docker Required'
            );
          }
          return; // Don't proceed with starting
        }

        this.executePackAction(pack, action);
      },
    });
  }

  private async executePackAction(pack: StarterPackUIData, action: 'start' | 'stop'): Promise<void> {
    pack.status = action === 'start' ? 'starting' : 'stopping';
    pack.lastOutput = `Executing ${action}...`;
    this.dockerLifecycle.markCommandStart(pack.id);
    this.cdRef.detectChanges();

    try {
      const response = await this.dockerLifecycle.executeCommand(pack.currentCommandValue);
      if (response && response.status && response.status !== 'error') {
        // Keep transitional state until polling picks up the real Docker status.
        pack.status = action === 'start' ? 'starting' : 'stopping';
        pack.lastOutput = response.output || `${pack.displayName} container ${action}ed, waiting for health check...`;
      } else {
        pack.status = 'error';
        pack.currentCommandValue = pack.startCmd;
        pack.lastOutput = response?.output || `Failed to ${action} ${pack.displayName}`;
        this.dockerLifecycle.markCommandEnd(pack.id);
      }
    } catch (e: any) {
      pack.status = 'error';
      pack.currentCommandValue = pack.startCmd;
      pack.lastOutput = e?.message || `Failed to ${action} ${pack.displayName}`;
      this.dockerLifecycle.markCommandEnd(pack.id);
    }
    this.startTransitionPolling();
  }

  // --- UI Interaction Methods ---

  /**
   * Extracts all unique tags from the starter pack definitions.
   */
  extractAllTags(): void {
    const tagSet = new Set<string>();
    // Use starterPacks which now contains merged data including tags from definition
    this.starterPacks.forEach((pack) => {
      pack.tags?.forEach((tag) => tagSet.add(tag));
    });
    this.allTags = Array.from(tagSet).sort(); // Store sorted unique tags
  }

  /**
   * Applies the current search term and selected tag filter to the starterPacks list.
   */
  applyFilters(): void {
    let packs = [...this.starterPacks]; // Start with the full merged list

    // Filter by selected tag
    if (this.selectedTag) {
      packs = packs.filter((pack) => pack.tags?.includes(this.selectedTag!));
    }

    // Filter by search term (case-insensitive)
    const term = this.searchTerm.toLowerCase().trim();
    if (term) {
      packs = packs.filter(
        (pack) =>
          pack.displayName.toLowerCase().includes(term) ||
          pack.description.toLowerCase().includes(term) ||
          pack.family.toLowerCase().includes(term) ||
          pack.packName.toLowerCase().includes(term) ||
          (pack.target && pack.target.toLowerCase().includes(term)) ||
          (pack.tags &&
            pack.tags.some((tag) => tag.toLowerCase().includes(term))),
      );
    }
    this.filteredStarterPacks = packs; // Update the list displayed in the template
  }

  /**
   * Sets or clears the selected tag filter.
   * @param tag The tag to filter by.
   */
  filterByTag(tag: string): void {
    if (this.selectedTag === tag) {
      this.clearTagFilter(); // Toggle off if the same tag is clicked again
    } else {
      this.selectedTag = tag;
      this.applyFilters(); // Apply the new tag filter
    }
  }

  /**
   * Clears the selected tag filter.
   */
  clearTagFilter(): void {
    this.selectedTag = null;
    this.applyFilters(); // Re-apply filters without the tag constraint
  }

  trackPackById(index: number, pack: StarterPackUIData): string {
    return pack.id; // Use the unique ID for tracking
  }

  // --- Helper function to get SVG HTML for an icon name ---
  getIconSvg(iconKey: string | undefined): SafeHtml | null {
    if (!iconKey) {
      return null;
    }
    // Ensure the key is lowercase for matching the map
    const lowerCaseKey = iconKey.toLowerCase();
    // Look up the imported icon object using the map
    const iconData = iconMap[lowerCaseKey as keyof typeof iconMap];

    if (iconData) {
      // Construct the full SVG string
      // You can adjust height, width, fill, class, style as needed
      const svg = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="20" width="20" style="fill: currentColor; margin-right: 10px; vertical-align: middle;" class="float-left"><title>${iconData.title}</title><path d="${iconData.path}"/></svg>`;
      // Sanitize the HTML before binding
      return this.sanitizer.bypassSecurityTrustHtml(svg);
    }
    console.warn(`Simple Icon not found or mapped for key: ${iconKey}`);
    return null; // Icon not found in map or simple-icons import
  }

  async copyToClipboard(text: string | undefined | null): Promise<void> {
    if (!text) {
      console.warn('Attempted to copy empty text.');
      return;
    }
    if (!navigator.clipboard) {
      console.error('Clipboard API not available in this browser.');
      // Optionally, implement a fallback using document.execCommand (older method)
      alert('Clipboard API not supported in your browser.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      //console.log('Text copied to clipboard:', text);
      // Optional: Add visual feedback to the user (e.g., change button icon/text briefly, show a toast)
      // Example: Temporarily change button text (requires adding state to the pack or component)
      // alert('Copied!'); // Simple feedback
    } catch (err) {
      //console.error('Failed to copy text to clipboard:', err);
      alert('Failed to copy text.');
    }
  }

  // --- Polling Methods (shared logic with apps-manager via PollingHelper) ---

  /**
   * Start polling for status updates while any pack is in a transitional state.
   * Delegates to shared PollingHelper.startLifecyclePolling for consistency with apps-manager.
   */
  private startTransitionPolling(): void {
    if (this.pollingSubscription && !this.pollingSubscription.closed) return;

    this.pollingSubscription = PollingHelper.startLifecyclePolling({
      refresh: () => this.refreshDataSilent(),
      getItems: () => this.starterPacks,
      onMaxIterations: () => {
        this.dockerLifecycle.clearAllInFlight();
        this.starterPacks.forEach(pack => {
          if (pack.status === 'starting' || pack.status === 'stopping') {
            pack.status = 'stopped';
            pack.currentCommandValue = pack.startCmd;
          }
        });
        this.cdRef.detectChanges();
      },
      label: 'StarterPacks',
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
      await this.refreshAllStatuses(true);
      this.applyFilters();
      // Force Angular to detect changes - important since we're in an async context
      try {
        this.cdRef.markForCheck();
        this.cdRef.detectChanges();
      } catch (e) {
        // View might be destroyed
      }
    } catch (err) {
      console.error('Failed polling pack statuses', err);
    }
  }

  toggleCommandFlag(pack: StarterPackUIData, flag: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const isChecked = checkbox.checked;

    if (!pack.currentCommandValue) return;

    if (!isChecked) {
      pack.currentCommandValue = pack.currentCommandValue
        .replace(new RegExp(`\\s*${flag}`, 'g'), '')
        .trim();
    } else {
      if (!pack.currentCommandValue.includes(flag)) {
        pack.currentCommandValue = pack.currentCommandValue.trim() + ' ' + flag;
      }
    }
  }

}
