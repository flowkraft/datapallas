import {
  Component,
  input,
  model,
  OnInit,
  AfterViewChecked,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { AiManagerService, PromptInfo } from './ai-manager.service';
import { InfoService } from '../../components/dialog-info/info.service';
import { AppsManagerService, ManagedApp } from '../apps-manager/apps-manager.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { ConfirmService } from '../dialog-confirm/confirm.service';

// Define constants for tab indices for clarity
const CHAT2DB_TAB_INDEX = 0;
const PROMPTS_TAB_INDEX = 1;
const HEY_AI_TAB_INDEX = 2;

// Add launch configuration interface
export type AiManagerLaunchConfig = {
  initialActiveTabKey?: 'PROMPTS' | 'CHAT2DB' | 'HEY_AI';
  initialSelectedCategory?: string;
  initialExpandedPromptId?: string;
  promptVariables?: { [key: string]: string };
};

interface CategoryWithCount {
  name: string;
  count: number;
}

@Component({
    selector: 'dburst-ai-manager',
    templateUrl: './ai-manager.template.html',
    standalone: false
})
export class AiManagerComponent implements OnInit, AfterViewChecked, OnDestroy {
  mode = input<'standalone' | 'embedded' | 'launchCopilot'>('standalone');
  dropdownDirection = input<'down' | 'up'>('down');

  showChat2db = input<boolean>(false);

  chat2dbApp: ManagedApp;

  // Internal state
  isModalVisible: boolean = false;
  intendedTabIndex: number = PROMPTS_TAB_INDEX;
  aiActiveTabIndex: number = 0;

  // Flags to keep track of which tab is logically active
  isChat2dbTabActive: boolean = false;
  isPromptsTabActive: boolean = false;
  isHeyAiTabActive: boolean = false;

  // --- AI Prompts Tab State ---
  allPrompts: PromptInfo[] = [];
  filteredPrompts: PromptInfo[] = [];
  promptsLoading = false;
  private promptsSubscription: Subscription | null = null;
  uniqueTags: string[] = [];
  categoriesWithCounts: CategoryWithCount[] = [];
  searchTerm: string = '';
  selectedCategory: string = 'All Prompts';
  selectedTag: string | null = null;
  expandedPrompt: PromptInfo | null = null;
  // --- End AI Prompts Tab State ---

  // initialState properties from modal (model() to allow internal writes from launchWithConfiguration)
  initialActiveTabKey = model<'PROMPTS' | 'CHAT2DB' | 'HEY_AI' | undefined>(undefined);
  initialSelectedCategory = model<string | undefined>(undefined);
  initialExpandedPromptId = model<string | undefined>(undefined);
  promptVariables = model<{ [key: string]: string } | undefined>(undefined);


  // guard to run init logic once per open
  private pendingInit = false;

  // Periodic refresh to stay in sync with other components (apps-manager, starter-packs)
  private chat2dbRefreshInterval: any;

  constructor(
    private aiManagerService: AiManagerService,
    private cdRef: ChangeDetectorRef,
    private infoService: InfoService,
    protected appsManagerService: AppsManagerService,
    private settingsService: ConfigurationRepository,
    private confirmService: ConfirmService,
  ) {
  }

  async ngOnInit(): Promise<void> {
    try {
      this.loadPrompts();
      this.chat2dbApp = await this.appsManagerService.getAppById('flowkraft-data-canvas');

      // Periodically refresh chat2dbApp state to stay in sync with other components
      // (e.g., when the app is started from Apps/Starter Packs page or Chat2DB tab)
      if (this.showChat2db()) {
        this.chat2dbRefreshInterval = setInterval(async () => {
          try {
            // If app is in a transitional state, trigger a real Docker status refresh
            // so healthcheck results are picked up (not just cached state)
            if (this.chat2dbApp?.state === 'starting' || this.chat2dbApp?.state === 'stopping') {
              await this.appsManagerService.refreshAllStatuses(true);
            }
            const freshApp = await this.appsManagerService.getAppById('flowkraft-data-canvas');
            if (freshApp && this.chat2dbApp && freshApp.state !== this.chat2dbApp.state) {
              this.chat2dbApp.state = freshApp.state;
              this.chat2dbApp.lastOutput = freshApp.lastOutput;
              this.chat2dbApp.currentCommandValue = freshApp.currentCommandValue;
              this.cdRef.detectChanges();
            }
          } catch (e) { /* ignore refresh errors */ }
        }, 3000);
      }
    } catch (error) {
      console.error('Error during AiManagerComponent ngOnInit:', error);
    }
  }

  ngAfterViewChecked(): void {
    if (this.pendingInit) {
      this.pendingInit = false;
      this.completeInitialization();
      this.cdRef.detectChanges();
    }
  }

  ngOnDestroy(): void {
    if (this.chat2dbRefreshInterval) {
      clearInterval(this.chat2dbRefreshInterval);
    }
    this.promptsSubscription?.unsubscribe();
  }

  /**
   * Toggle the chat2dbApp (start/stop) with confirmation dialog and immediate UI feedback.
   * Called from the template's play/stop button in the dropdown.
   */
  toggleChat2dbApp(): void {
    if (!this.chat2dbApp) return;

    const isStarting = this.chat2dbApp.state !== 'running';
    const dialogQuestion = isStarting
      ? `Start ${this.chat2dbApp.name}? Be patient — the first start takes longer while required components download and configure; subsequent start/stop cycles are faster.`
      : `Stop ${this.chat2dbApp.name}?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        // Set immediate UI feedback
        this.chat2dbApp.state = isStarting ? 'starting' : 'stopping';
        this.cdRef.detectChanges();
        await this.appsManagerService.toggleApp(this.chat2dbApp);
        // Re-fetch actual state from service after toggle completes
        const freshApp = await this.appsManagerService.getAppById('flowkraft-data-canvas');
        if (freshApp) {
          this.chat2dbApp.state = freshApp.state;
          this.chat2dbApp.lastOutput = freshApp.lastOutput;
          this.chat2dbApp.currentCommandValue = freshApp.currentCommandValue;
        }
        this.cdRef.detectChanges();
      },
    });
  }

  /**
   * Determine active tab based on configuration and update tab state
   */
  private initializeTabConfiguration(): void {
    let tabIndexToActivate = this.determineInitialActiveTab();
    this.setActiveTab(tabIndexToActivate);
  }

  /**
   * Calculate which tab should be active initially
   */
  private determineInitialActiveTab(): number {
    // Default tab based on Chat2DB visibility
    let tabIndexToActivate = this.showChat2db()
      ? CHAT2DB_TAB_INDEX
      : PROMPTS_TAB_INDEX;

    // Override with explicit configuration if provided
    if (this.initialActiveTabKey()) {
      switch (this.initialActiveTabKey()) {
        case 'PROMPTS':
          tabIndexToActivate = this.showChat2db()
            ? PROMPTS_TAB_INDEX
            : CHAT2DB_TAB_INDEX;
          break;
        case 'CHAT2DB':
          if (this.showChat2db()) tabIndexToActivate = CHAT2DB_TAB_INDEX;
          break;
        case 'HEY_AI':
          tabIndexToActivate = this.showChat2db()
            ? HEY_AI_TAB_INDEX
            : PROMPTS_TAB_INDEX;
          break;
      }
    }

    return tabIndexToActivate;
  }

  /**
   * Apply any filters specified in the initial configuration
   */
  private applyInitialFiltersIfNeeded(): void {
    // Only apply filters if the prompts tab is active
    if (this.isPromptsTabActive) {
      this.selectedCategory = this.initialSelectedCategory() || 'All Prompts';
      this.applyFilters();
    }
  }

  /**
   * Process and expand the specified prompt if needed
   */
  private processExpandedPromptIfNeeded(): void {
    // Only process if the prompts tab is active and an expanded prompt ID was specified
    if (this.isPromptsTabActive && this.initialExpandedPromptId()) {
      const promptDef = this.allPrompts.find(
        (p) => p.id === this.initialExpandedPromptId(),
      );

      if (promptDef) {
        this.expandPromptWithVariables(promptDef);
      }
    }
  }

  private expandPromptWithVariables(promptDef: PromptInfo): void {
    if (!promptDef.promptText) {
      // Fetch full prompt first, then apply variables
      this.aiManagerService.getPromptById(promptDef.id).subscribe({
        next: (full) => {
          this._applyVariablesAndExpand(full);
          this.cdRef.detectChanges();
        },
        error: () => {
          this.expandedPrompt = { ...promptDef, promptText: '' };
          this.cdRef.detectChanges();
        },
      });
      return;
    }
    this._applyVariablesAndExpand(promptDef);
  }

  private _applyVariablesAndExpand(promptDef: PromptInfo): void {
    let text = promptDef.promptText || '';

    if (this.promptVariables()) {
      Object.entries(this.promptVariables()).forEach(([key, val]) => {
        // Remove brackets and collapse whitespace for the regex
        const inner = key.replace(/^\[|\]$/g, '').replace(/\s+/g, '\\s+');
        // Match [ ... ] with any whitespace inside
        const regex = new RegExp(`\\[\\s*${inner}\\s*\\]`, 'g');
        text = text.replace(regex, val);
      });
    }

    this.expandedPrompt = { ...promptDef, promptText: text };
  }

  // --- Prompt Loading and Filtering ---
  loadPrompts(): void {
    this.promptsLoading = true;
    this.promptsSubscription?.unsubscribe();
    this.promptsSubscription = this.aiManagerService.getAllPrompts().subscribe({
      next: (prompts) => {
        this.allPrompts = prompts;
        this.calculateUniqueTags();
        this.calculateCategoriesWithCounts();
        this.applyFilters();
        this.promptsLoading = false;
        this.cdRef.detectChanges();
      },
      error: () => {
        this.promptsLoading = false;
        this.cdRef.detectChanges();
      },
    });
  }

  calculateUniqueTags(): void {
    const tags = new Set<string>();
    this.allPrompts.forEach((p) => p.tags.forEach((tag) => tags.add(tag)));
    this.uniqueTags = Array.from(tags).sort();
  }

  calculateCategoriesWithCounts(): void {
    const counts: { [key: string]: number } = {};
    this.allPrompts.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });

    this.categoriesWithCounts = [
      { name: 'All Prompts', count: this.allPrompts.length },
      ...Object.entries(counts)
        .map(([name, count]) => ({
          name: name as PromptInfo['category'],
          count,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)), // Sort categories alphabetically
    ];
  }

  applyFilters(): void {
    let tempPrompts = [...this.allPrompts];

    // 1. Filter by Category
    if (this.selectedCategory !== 'All Prompts') {
      tempPrompts = tempPrompts.filter(
        (p) => p.category === this.selectedCategory,
      );
    }

    // 2. Filter by Tag
    if (this.selectedTag) {
      tempPrompts = tempPrompts.filter((p) =>
        p.tags.includes(this.selectedTag!),
      );
    }

    // 3. Filter by Search Term
    const term = this.searchTerm.toLowerCase().trim();
    if (term) {
      tempPrompts = tempPrompts.filter(
        (p) =>
          p.title.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term) ||
          (p.promptText?.toLowerCase().includes(term) ?? false) ||
          p.tags.some((tag) => tag.toLowerCase().includes(term)),
      );
    }

    this.filteredPrompts = tempPrompts;
    this.expandedPrompt = null; // Collapse any expanded prompt when filters change
  }

  filterByCategory(category: string): void {
    this.selectedCategory = category;
    this.selectedTag = null; // Reset tag filter when category changes
    this.applyFilters();
  }

  filterByTag(tag: string | null): void {
    // If clicking the same tag, toggle it off
    this.selectedTag = this.selectedTag === tag ? null : tag;
    this.applyFilters();
  }

  onSearchChange(): void {
    this.applyFilters();
  }
  // --- End Prompt Loading and Filtering ---

  // --- Prompt Display ---
  expandPrompt(prompt: PromptInfo): void {
    if (prompt.promptText) {
      this.expandedPrompt = prompt;
    } else {
      // promptText is absent from list-endpoint results — fetch the full prompt on demand
      this.aiManagerService.getPromptById(prompt.id).subscribe({
        next: (full) => {
          this.expandedPrompt = full;
          this.cdRef.detectChanges();
        },
        error: () => {
          this.expandedPrompt = { ...prompt, promptText: '' };
          this.cdRef.detectChanges();
        },
      });
    }
  }

  collapsePrompt(): void {
    this.expandedPrompt = null;
  }
  // --- End Prompt Display ---

  // --- Copy to Clipboard ---
  copyToClipboard(text: string): void {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.infoService.showInformation({
          message: 'Prompt copied to clipboard!',
        });
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
        this.infoService.showInformation({
          message: 'Failed to copy prompt.',
        });
      });
  }

  /** Copy from the list view — fetches full promptText on demand if not yet loaded. */
  copyPromptText(prompt: PromptInfo): void {
    if (prompt.promptText) {
      this.copyToClipboard(prompt.promptText);
    } else {
      this.aiManagerService.getPromptById(prompt.id).subscribe({
        next: (full) => this.copyToClipboard(full.promptText || ''),
        error: () => {},
      });
    }
  }
  // --- End Copy to Clipboard ---

  onAiTabChange(e: { index: number; id: string }): void {
    this.onTabSelect(e.index);
  }

  // Helper to set the active tab flags
  setActiveTab(index: number): void {
    this.intendedTabIndex = index;
    this.aiActiveTabIndex = index;
    this.isChat2dbTabActive = this.showChat2db() && index === CHAT2DB_TAB_INDEX;
    // Adjust index checks based on Chat2DB visibility
    const promptsIndex = this.showChat2db() ? PROMPTS_TAB_INDEX : CHAT2DB_TAB_INDEX;
    const heyAiIndex = this.showChat2db() ? HEY_AI_TAB_INDEX : PROMPTS_TAB_INDEX;

    this.isPromptsTabActive = index === promptsIndex;
    this.isHeyAiTabActive = index === heyAiIndex;

    // Ensure only one tab is active if Chat2DB is hidden and indices shift
    if (!this.showChat2db()) {
      if (this.isPromptsTabActive && this.isHeyAiTabActive) {
        // Default to prompts if somehow both became active due to index shift
        this.isHeyAiTabActive = false;
      }
    } else {
      // Ensure only one is active when Chat2DB is shown
      if (
        this.isChat2dbTabActive &&
        (this.isPromptsTabActive || this.isHeyAiTabActive)
      ) {
        this.isPromptsTabActive = false;
        this.isHeyAiTabActive = false;
      } else if (this.isPromptsTabActive && this.isHeyAiTabActive) {
        this.isHeyAiTabActive = false; // Prioritize prompts if conflict
      }
    }
  }

  // --- Standalone Mode: Dropdown Button Actions ---

  triggerOpenCopilotBrowser(): void {
    const url = this.settingsService.getCopilotUrl();
    window.open(url, '_blank');
  }

  openChat2dbModal(): void {
    if (this.mode() === 'standalone' && this.showChat2db()) {
      this.setActiveTab(CHAT2DB_TAB_INDEX);
      this.pendingInit = true;
      this.isModalVisible = true;
    }
  }

  openAiPromptsModal(): void {
    if (this.mode() === 'standalone') {
      const targetIndex = this.showChat2db() ? PROMPTS_TAB_INDEX : CHAT2DB_TAB_INDEX;
      this.setActiveTab(targetIndex);
      this.pendingInit = true;
      this.isModalVisible = true;
    }
  }

  closeModal(): void {
    this.isModalVisible = false;
  }

  // Method called when a tab is selected to update internal state if needed
  onTabSelect(tabIndex: number): void {
    console.log(`Tab selected: ${tabIndex}`);
    this.setActiveTab(tabIndex);
    // Add any logic needed when a tab becomes active
  }

  // Public method to launch with configuration
  public launchWithConfiguration(config?: AiManagerLaunchConfig): void {
    if (config?.initialActiveTabKey)
      this.initialActiveTabKey.set(config.initialActiveTabKey);
    if (config?.initialSelectedCategory)
      this.initialSelectedCategory.set(config.initialSelectedCategory);
    if (config?.initialExpandedPromptId)
      this.initialExpandedPromptId.set(config.initialExpandedPromptId);
    if (config?.promptVariables) this.promptVariables.set(config.promptVariables);
    this.pendingInit = true;
    this.isModalVisible = true;
  }

  /**
   * Launch Microsoft Copilot in a new browser tab
   */
  launchExternalCopilot(): void {
    const url = this.settingsService.getCopilotUrl();
    window.open(url, '_blank');
  }

  private completeInitialization(): void {
    try {
      const idx = this.determineInitialActiveTab();
      this.setActiveTab(idx);
      if (this.isPromptsTabActive) {
        if (this.initialSelectedCategory()) {
          this.selectedCategory = this.initialSelectedCategory();
          this.applyFilters();
        }
        if (this.initialExpandedPromptId()) {
          const p = this.allPrompts.find(
            (x) => x.id === this.initialExpandedPromptId(),
          );
          if (p) {
            if (
              this.promptVariables() &&
              Object.keys(this.promptVariables()).length > 0
            ) {
              this.expandPromptWithVariables(p);
            } else {
              this.expandPrompt(p);
            }
          }
        }
      }
    } catch (error) {
      console.error(
        'Error during AiManagerComponent completeInitialization:',
        error,
      );
    }
  }
}
