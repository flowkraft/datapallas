import {
  Component,
  input,
  model,
  OnInit,
  AfterViewChecked,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DpDialogComponent } from '../dp/dialog/dp-dialog.component';
import { DpTabsComponent } from '../dp/tabs/dp-tabs.component';
import { DpTabComponent } from '../dp/tabs/dp-tab.component';
import { Subscription } from 'rxjs';
import { AiManagerService, PromptInfo } from './ai-manager.service';
import { InfoService } from '../../components/dialog-info/info.service';
import { AppsManagerService, ManagedApp } from '../apps-manager/apps-manager.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { ConfirmService } from '../dialog-confirm/confirm.service';

// The modal has two tabs (AI Prompts at 0, Hey AI at 1). All callers of
// launchWithConfiguration() target the Prompts tab — so that's the only index
// referenced programmatically. The Hey AI tab is reachable only by user click,
// which routes through onTabSelect with the numeric index from dp-tabs.
const PROMPTS_TAB_INDEX = 0;

export type AiManagerLaunchConfig = {
  // Currently only the Prompts tab is opened programmatically. Kept on the
  // config so existing callers compile unchanged; the Hey AI tab is reachable
  // by user click only.
  initialActiveTabKey?: 'PROMPTS';
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
    standalone: true,
    imports: [CommonModule, FormsModule, TranslateModule, DpDialogComponent, DpTabsComponent, DpTabComponent],
})
export class AiManagerComponent implements OnInit, AfterViewChecked, OnDestroy {
  mode = input<'standalone' | 'modal-only'>('modal-only');
  dropdownDirection = input<'down' | 'up'>('down');

  showChat2db = input<boolean>(false);

  // Used by the Launch Chat2DB dropdown button outside the modal (lines 51-95
  // of the template). Not related to the modal's tabs.
  chat2dbApp?: ManagedApp;

  // Internal state
  isModalVisible: boolean = false;
  aiActiveTabIndex: number = PROMPTS_TAB_INDEX;
  isPromptsTabActive: boolean = true;

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
    const app = this.chat2dbApp;
    if (!app) return;

    const isStarting = app.state !== 'running';
    const dialogQuestion = isStarting
      ? `Start ${app.name}? Be patient — the first start takes longer while required components download and configure; subsequent start/stop cycles are faster.`
      : `Stop ${app.name}?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        // Set immediate UI feedback
        app.state = isStarting ? 'starting' : 'stopping';
        this.cdRef.detectChanges();
        await this.appsManagerService.toggleApp(app);
        // Re-fetch actual state from service after toggle completes
        const freshApp = await this.appsManagerService.getAppById('flowkraft-data-canvas');
        if (freshApp) {
          app.state = freshApp.state;
          app.lastOutput = freshApp.lastOutput;
          app.currentCommandValue = freshApp.currentCommandValue;
        }
        this.cdRef.detectChanges();
      },
    });
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

    const vars = this.promptVariables();
    if (vars) {
      Object.entries(vars).forEach(([key, val]) => {
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

  setActiveTab(index: number): void {
    this.aiActiveTabIndex = index;
    this.isPromptsTabActive = index === PROMPTS_TAB_INDEX;
  }

  // --- Standalone Mode: Dropdown Button Actions ---

  triggerOpenCopilotBrowser(): void {
    const url = this.settingsService.getCopilotUrl();
    window.open(url, '_blank');
  }

  openAiPromptsModal(): void {
    if (this.mode() === 'standalone') {
      this.setActiveTab(PROMPTS_TAB_INDEX);
      this.pendingInit = true;
      this.isModalVisible = true;
    }
  }

  closeModal(): void {
    this.isModalVisible = false;
  }

  onTabSelect(tabIndex: number): void {
    this.setActiveTab(tabIndex);
  }

  // Public method to launch with configuration
  public launchWithConfiguration(config?: AiManagerLaunchConfig): void {
    this.initialExpandedPromptId.set(undefined);
    this.promptVariables.set({});
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
      // Programmatic open always lands on the Prompts tab (the only key the
      // launch config supports). Hey AI is a user-click-only destination.
      this.setActiveTab(PROMPTS_TAB_INDEX);

      const category = this.initialSelectedCategory();
      if (category) {
        this.selectedCategory = category;
        this.applyFilters();
      }
      const expandedId = this.initialExpandedPromptId();
      if (expandedId) {
        const p = this.allPrompts.find((x) => x.id === expandedId);
        if (p) {
          const vars = this.promptVariables();
          if (vars && Object.keys(vars).length > 0) {
            this.expandPromptWithVariables(p);
          } else {
            this.expandPrompt(p);
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
