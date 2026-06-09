import { Component, OnInit, OnDestroy, ChangeDetectorRef, viewChild, DestroyRef, inject, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AngularSplitModule } from 'angular-split';
import { SHARED_IMPORTS } from '../../shared/shared-imports';
import { ConnectionDetailsComponent } from '../../components/connection-details/connection-details.component';
import { LicenseComponent } from '../../components/license/license.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import * as _ from 'lodash';

import { tabsTemplate } from './templates/cubes/_tabs';
import { tabCubeDefinitionsTemplate } from './templates/cubes/tab-cube-definitions';
import { tabLicenseTemplate } from './templates/connections/tab-license';

import { CubesService, CubeDefinition } from '../../providers/cubes.service';
import { ConnectionsService } from '../../providers/connections.service';
import { ApiService } from '../../providers/api.service';
import { ConfirmService } from '../../components/dialog-confirm/confirm.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { ExecutionStatsService } from '../../providers/execution-stats.service';

import Prism from 'prismjs';
import 'prismjs/components/prism-groovy';

import { PAGE_WINDOW_MAX, buildPageWindow } from '../../helpers/pagination';

@Component({
    selector: 'dburst-cube-list',
    template: `
    ${tabsTemplate}

    <ng-template #tabCubeDefinitionsTemplate>
      ${tabCubeDefinitionsTemplate}
    </ng-template>
    ${tabLicenseTemplate}
  `,
    standalone: true,
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [...SHARED_IMPORTS, AngularSplitModule, ConnectionDetailsComponent, LicenseComponent],
})
export class CubeListComponent implements OnInit, OnDestroy {
  private connectionDetailsModalInstance = viewChild.required<ConnectionDetailsComponent>('connectionDetailsModal');
  private showSamplesSub?: Subscription;
  private destroyRef = inject(DestroyRef);
  private cubeSearchSubject = new Subject<string>();

  // Search + pagination
  cubeSearchTerm = '';
  cubePageSize = 5;
  cubePageIndex = 0;
  filteredCubes: CubeDefinition[] = [];
  pagedCubes: CubeDefinition[] = [];

  // Preview toggle (same pattern as tab-reporting-template-output)
  cubePreviewVisible = true;

  // Track field selections from rb-cube-renderer
  hasFieldSelections = false;

  // Modal state
  isCubeModalVisible = false;
  cubeModalTitle = 'Create Cube Definition';
  cubeModalMode: 'create' | 'update' = 'create';
  cubeNameAlreadyExists = false;
  duplicateSourceId: string = '';

  editingCube: CubeDefinition = {
    id: '',
    name: '',
    description: '',
    connectionId: '',
    dslCode: '',
  };

  // DSL preview
  parsedCube: any = null;
  parsedCubeConfigJson: string = '';
  parseDslError: string = '';
  private dslParseDebounce: any;

  // API base URL for the web component
  get apiBaseUrl(): string {
    return this.apiService.BACKEND_URL || '/api';
  }

  // DB connections for dropdown
  dbConnections: any[] = [];

  // Example code (kept as property to avoid Angular ICU template parsing of curly braces)
  cubeExampleCode = `// Cube with dimensions from main + joined table
cube {
  sql_table 'public.orders'
  title 'Orders'
  description 'Customer orders with revenue analysis'

  // Primary key
  dimension { name 'order_id'; title 'Order ID'; description 'Unique order identifier'; sql 'id'; type 'number'; primary_key true }

  // Dimensions from main table (orders)
  dimension { name 'status'; title 'Order Status'; description 'Current fulfillment status'; sql 'status'; type 'string' }
  dimension { name 'created_at'; title 'Created At'; description 'When the order was placed'; sql 'created_at'; type 'time' }

  // Dimensions from joined table (customers)
  dimension { name 'customer_name'; title 'Customer'; description 'Company name of the customer'; sql 'customers.company_name'; type 'string' }
  dimension { name 'country'; title 'Country'; description 'Customer country'; sql 'customers.country'; type 'string' }
  dimension { name 'region'; title 'Region'; description 'Customer region'; sql 'customers.region'; type 'string' }
  dimension { name 'city'; title 'City'; description 'Customer city'; sql 'customers.city'; type 'string' }

  // Measures
  measure { name 'count'; title 'Order Count'; description 'Total number of orders'; type 'count' }
  measure { name 'revenue'; title 'Total Revenue'; description 'Sum of order amounts'; sql 'amount'; type 'sum'; format 'currency' }
  measure { name 'avg_order'; title 'Average Order'; description 'Average order amount'; sql 'amount'; type 'avg'; format 'currency' }

  // Join: many orders -> one customer
  join { name 'customers'; sql '\${CUBE}.customer_id = customers.id'; relationship 'many_to_one' }

  // Segment: reusable filter
  segment { name 'recent'; title 'Last 30 Days'; description 'Orders from the last 30 days'; sql "\${CUBE}.created_at >= CURRENT_DATE - INTERVAL '30 days'" }

  // Hierarchy: drill-down path
  hierarchy { name 'geography'; title 'Customer Geography'; levels 'country', 'region', 'city' }
}`;

  highlightGroovyCode = (editor: any) => {
    if (editor?.textContent) {
      editor.innerHTML = Prism.highlight(
        editor.textContent,
        Prism.languages['groovy'],
        'groovy',
      );
    }
  };

  constructor(
    public cubesService: CubesService,
    protected connectionsService: ConnectionsService,
    protected apiService: ApiService,
    protected confirmService: ConfirmService,
    protected messagesService: ToastrMessagesService,
    protected settingsService: ConfigurationRepository,
    protected executionStatsService: ExecutionStatsService,
    protected cdRef: ChangeDetectorRef,
    protected route: ActivatedRoute,
    protected router: Router,
  ) {}

  async ngOnInit() {
    this.cubeSearchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.cubeSearchTerm = term;
        this.cubePageIndex = 0;
        this.applyCubeFilters();
      });

    await this.cubesService.loadAll();
    await this.loadDbConnections();
    this.applyCubeFilters();

    // Reload list when the user toggles the "Show samples" preference.
    // BehaviorSubject fires the current value synchronously on subscribe — skip
    // that first emission since we already loaded above.
    let firstEmission = true;
    this.showSamplesSub = this.settingsService.showSamples$.subscribe(async () => {
      if (firstEmission) {
        firstEmission = false;
        return;
      }
      // Re-fetch the connections cache so the connection dropdown picks up the
      // synthetic sample DB connections that the backend now includes.
      await this.settingsService.loadAllConnections();
      await this.cubesService.loadAll();
      await this.loadDbConnections();
      this.applyCubeFilters();
      this.cdRef.detectChanges();
    });
  }

  ngOnDestroy() {
    this.showSamplesSub?.unsubscribe();
  }

  // === Search + Pagination ===

  onCubeSearchChange(term: string) {
    this.cubeSearchSubject.next(term ?? '');
  }

  applyCubeFilters() {
    const all = this.cubesService.cubeDefinitions || [];
    const term = (this.cubeSearchTerm || '').trim().toLowerCase();
    this.filteredCubes = term
      ? all.filter((c) =>
          (c.name || '').toLowerCase().includes(term) ||
          (c.description || '').toLowerCase().includes(term)
        )
      : [...all];
    this.clearCubeSelection();
    this.recomputeCubePage();
  }

  recomputeCubePage() {
    const maxPage = Math.max(0, this.totalCubePages - 1);
    if (this.cubePageIndex > maxPage) this.cubePageIndex = maxPage;
    const start = this.cubePageIndex * this.cubePageSize;
    this.pagedCubes = this.filteredCubes.slice(start, start + this.cubePageSize);
  }

  goToCubePage(i: number) { this.cubePageIndex = i; this.clearCubeSelection(); this.recomputeCubePage(); }
  prevCubePage() { if (this.cubePageIndex > 0) this.goToCubePage(this.cubePageIndex - 1); }
  nextCubePage() { if (this.cubePageIndex < this.totalCubePages - 1) this.goToCubePage(this.cubePageIndex + 1); }

  // Exposed for the template: the jump-to-page input only appears once pages are
  // collapsed behind a "…" (more pages than the windowed bar can show).
  readonly cubePageWindowMax = PAGE_WINDOW_MAX;

  jumpToCubePage(event: Event) {
    const input = event.target as HTMLInputElement;
    const n = parseInt(input.value, 10);
    const target = isNaN(n) ? this.cubePageIndex + 1 : Math.min(Math.max(n, 1), this.totalCubePages);
    input.value = String(target);
    this.goToCubePage(target - 1);
  }

  get totalCubePages(): number {
    return Math.max(1, Math.ceil(this.filteredCubes.length / this.cubePageSize));
  }
  get cubePageNumbers(): number[] {
    return buildPageWindow(this.totalCubePages, this.cubePageIndex);
  }
  get cubePageStart(): number { return this.cubePageIndex * this.cubePageSize; }
  get cubePageEnd(): number { return Math.min(this.filteredCubes.length, this.cubePageStart + this.cubePageSize); }

  private clearCubeSelection() {
    for (const c of this.cubesService.cubeDefinitions || []) c.activeClicked = false;
  }

  async loadDbConnections() {
    try {
      this.dbConnections = this.settingsService.connectionFiles
        .filter((c: any) => c.connectionType === 'database-connection');
    } catch (e) {
      this.dbConnections = [];
    }
  }

  // ── List interactions ──

  getSelectedCube(): CubeDefinition | undefined {
    return this.cubesService.cubeDefinitions.find((c) => c.activeClicked);
  }

  onCubeClick(cube: CubeDefinition) {
    this.cubesService.cubeDefinitions.forEach((c) => (c.activeClicked = false));
    cube.activeClicked = true;
  }

  // ── Modal ──

  async showCubeModal(mode: 'create' | 'update', duplicate: boolean = false) {
    this.cubeModalMode = mode;
    this.cubeNameAlreadyExists = false;
    this.parsedCube = null;
    this.parseDslError = '';
    this.duplicateSourceId = '';

    if (mode === 'update') {
      const selected = this.getSelectedCube();
      if (!selected) return;
      this.cubeModalTitle = 'Update Cube Definition';
      const full = await this.cubesService.load(selected.id);
      this.editingCube = { ...full, activeClicked: false };
      this.doParseDsl();
    } else if (duplicate) {
      const selected = this.getSelectedCube();
      if (!selected) return;
      this.cubeModalTitle = 'Create Cube Definition';
      const full = await this.cubesService.load(selected.id);
      this.duplicateSourceId = selected.id;
      this.editingCube = {
        ...full,
        id: '',
        name: '',
        activeClicked: false,
        isSample: false, // duplicate is always a user-owned editable copy
      };
      this.doParseDsl();
    } else {
      this.cubeModalTitle = 'Create Cube Definition';
      // Pre-select default DB connection if available
      const defaultConn = this.dbConnections.find((c: any) => c.defaultConnection);
      this.editingCube = {
        id: '',
        name: '',
        description: '',
        connectionId: defaultConn ? defaultConn.connectionCode : '',
        dslCode: '',
      };
      this.doParseDsl();
    }

    this.isCubeModalVisible = true;
    this.cdRef.detectChanges();
  }

  closeCubeModal() {
    this.isCubeModalVisible = false;
    this.cdRef.detectChanges();
  }

  onCubeNameChanged() {
    const name = this.editingCube.name;
    const id = _.kebabCase(name);

    if (this.cubeModalMode === 'create' || this.duplicateSourceId) {
      this.cubeNameAlreadyExists = this.cubesService.cubeDefinitions.some(
        (c) => c.id === id,
      );
    } else {
      // Update mode — same name is OK
      this.cubeNameAlreadyExists = false;
    }

    // Debounce DSL parse
    if (this.dslParseDebounce) clearTimeout(this.dslParseDebounce);
    this.dslParseDebounce = setTimeout(() => this.doParseDsl(), 500);
  }

  onDslCodeChanged(newCode: string) {
    this.editingCube.dslCode = newCode;
    if (this.dslParseDebounce) clearTimeout(this.dslParseDebounce);
    this.dslParseDebounce = setTimeout(() => this.doParseDsl(), 500);
  }

  showDbConnectionModalForCubeDsl() {
    if (!this.connectionDetailsModalInstance()) return;
    if (!this.editingCube?.connectionId) {
      this.messagesService.showInfo('Pick a database connection for this cube first.');
      return;
    }
    const conn = this.dbConnections.find(
      (c) => c.connectionCode === this.editingCube.connectionId,
    );
    if (!conn) {
      this.messagesService.showError('Cannot find the database connection for this cube.');
      return;
    }
    this.connectionDetailsModalInstance().context.set('cubeDsl');
    this.connectionDetailsModalInstance().showCrudModal(
      'update',
      'database-connection',
      false,
      conn,
    );
  }

  toggleCubePreview() {
    this.cubePreviewVisible = !this.cubePreviewVisible;
    this.cdRef.detectChanges();
  }

  onCubeSelectionChanged(event: any) {
    const detail = event?.detail || event;
    this.lastSelectedDimensions = detail?.selectedDimensions || [];
    this.lastSelectedMeasures = detail?.selectedMeasures || [];
    this.lastSelectedSegments = detail?.selectedSegments || [];
    this.hasFieldSelections = this.lastSelectedDimensions.length > 0 || this.lastSelectedMeasures.length > 0;
    this.cdRef.detectChanges();
  }

  // SQL modal state
  showSqlModal = false;
  generatedSql = '';
  sqlLoading = false;
  private lastSelectedDimensions: string[] = [];
  private lastSelectedMeasures: string[] = [];
  private lastSelectedSegments: string[] = [];

  async viewSql() {
    if (!this.hasFieldSelections) return;

    this.sqlLoading = true;
    this.generatedSql = '';
    this.showSqlModal = true;
    this.cdRef.detectChanges();

    try {
      // Call backend to generate SQL from cube DSL + selections
      const result = await this.cubesService.generateSqlFromDsl(
        this.editingCube.dslCode,
        this.editingCube.connectionId,
        this.lastSelectedDimensions,
        this.lastSelectedMeasures,
        this.lastSelectedSegments,
      );
      this.generatedSql = result?.sql || '-- No SQL generated';
    } catch (e: any) {
      this.generatedSql = '-- Error: ' + (e?.message || 'Failed to generate SQL');
    } finally {
      this.sqlLoading = false;
      this.cdRef.detectChanges();
    }
  }

  closeSqlModal() {
    this.showSqlModal = false;
    this.cdRef.detectChanges();
  }

  copySqlToClipboard() {
    navigator.clipboard.writeText(this.generatedSql).then(
      () => this.messagesService.showSuccess('SQL copied to clipboard'),
      () => this.messagesService.showError('Failed to copy to clipboard'),
    );
  }

  copyCubeExampleToClipboard() {
    navigator.clipboard.writeText(this.cubeExampleCode).then(
      () => this.messagesService.showSuccess('Example Cube DSL copied to clipboard'),
      () => this.messagesService.showError('Failed to copy to clipboard'),
    );
  }

  async doParseDsl() {
    try {
      this.parseDslError = '';
      if (!this.editingCube.dslCode || !this.editingCube.dslCode.trim()) {
        this.parsedCube = null;
        return;
      }
      const result = await this.cubesService.parseDsl(
        this.editingCube.dslCode,
      );
      // Only re-bind `parsedCube` when the parse output actually differs.
      // ngx-codejar can emit (update) events with unchanged content during
      // Angular CD cycles; without this guard each spurious emit creates a new
      // object reference and the WC's reactive `$: if (cubeConfig)` wipes the
      // user's checkbox selections between clicks.
      if (!_.isEqual(this.parsedCube, result)) {
        this.parsedCube = result;
        this.parsedCubeConfigJson = JSON.stringify(result);
        this.cdRef.detectChanges();
      }
    } catch (e: any) {
      this.parseDslError = e?.message || 'Failed to parse DSL';
      this.parsedCube = null;
      this.cdRef.detectChanges();
    }
  }

  async saveCube() {
    const name = this.editingCube.name;
    const id = _.kebabCase(name);

    try {
      if (this.cubeModalMode === 'create' && !this.duplicateSourceId) {
        await this.cubesService.create(id, name);
        await this.cubesService.save(id, this.editingCube);
      } else if (this.duplicateSourceId) {
        await this.cubesService.duplicate(this.duplicateSourceId, id, name);
        await this.cubesService.save(id, this.editingCube);
      } else {
        await this.cubesService.save(this.editingCube.id, this.editingCube);
      }

      this.messagesService.showSuccess('Cube definition saved');
      await this.cubesService.loadAll();
      this.applyCubeFilters();
      this.closeCubeModal();
    } catch (e: any) {
      this.messagesService.showError(
        e?.message || 'Failed to save cube definition',
      );
    }
  }

  async onDeleteCube() {
    const selected = this.getSelectedCube();
    if (!selected) return;

    this.confirmService.askConfirmation({
      message: `Delete cube "${selected.name}"?`,
      confirmAction: async () => {
        try {
          await this.cubesService.delete(selected.id);
          this.messagesService.showSuccess('Cube definition deleted');
          await this.cubesService.loadAll();
          this.applyCubeFilters();
        } catch (e: any) {
          this.messagesService.showError(
            e?.message || 'Failed to delete cube',
          );
        }
      },
    });
  }
}
