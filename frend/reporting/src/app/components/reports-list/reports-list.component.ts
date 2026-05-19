import { Component, OnInit, input, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import _ from 'lodash';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { CfgTmplFileInfo, ConfigurationRepository } from '../../providers/configuration-repository.service';
import { AppPathsService } from '../../providers/app-paths.service';
import { ReportsService } from '../../providers/reports.service';
import { SamplesService } from '../../providers/samples.service';
import { ConfirmService } from '../dialog-confirm/confirm.service';
import Utilities from '../../helpers/utilities';

import { modalConfigurationTemplateTemplate } from '../../areas/_configuration-crud/templates/reports/modal-conf-template';

@Component({
  selector: 'dburst-reports-list',
  template: /*html*/ `
    <div class="well">
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div
          [style.grid-column]="embeddedMode() ? 'span 12' : 'span 10'"
          style="cursor: pointer; overflow: auto"
        >
          <table
            id="confTemplatesTable"
            class="table"
            cellspacing="0"
          >
            <thead>
              <tr>
                <th>{{ 'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.NAME' | translate }}</th>
                <th>{{ 'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.CAPABILITIES' | translate }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</th>
                @if (!embeddedMode()) {
                <th>{{ 'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.HOW-TO-USE' | translate }}</th>
                }
                @if (!embeddedMode()) {
                <th>Actions&nbsp;&nbsp;&nbsp;&nbsp;</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (configurationFile of pagedConfigurationFiles; track $index) {
              <tr
                id="{{configurationFile.folderName}}_{{configurationFile.fileName}}"
                (click)="onConfTemplateClick(configurationFile, $event)"
                [ngClass]="{ 'info': configurationFile.activeClicked }"
              >
                <td>
                  {{ configurationFile.templateName }}
                  @if (configurationFile.type=='config-jasper-reports') {
                  <span class="label" style="margin-left: 5px; background-color: #8fbcd4; color: #fff;">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg> Jasper
                  </span>
                  }
                  @if (configurationFile.filePath === settingsService.currentConfigurationTemplatePath) {
                  <span style="margin-left: 6px; font-size: 11px; color: #777; font-style: italic;">(current)</span>
                  }
                </td>
                <td>
                  @if (!configurationFile.capReportGenerationMailMerge) {
                  <span class="badge badge-ghost">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 11-5.196-3 3 3 0 015.196 3zm1.536.887a2.5 2.5 0 013.81-2.19M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 11-5.196 3 3 3 0 015.196-3zm1.536-.887a2.5 2.5 0 013.81 2.19m-1.733-2.19l2.077-1.2M21 12l-2.429-7.941A2.25 2.25 0 0016.5 2.4H7.5a2.25 2.25 0 00-2.071 1.659L3 12m18 0c0 1.415-.58 2.695-1.512 3.614M21 12H3m0 0c0 1.415.58 2.695 1.512 3.614"/></svg>&nbsp;<em>Splitting</em>
                  </span>
                  }
                  @if (configurationFile.capReportGenerationMailMerge) {
                  <span class="badge badge-ghost">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>&nbsp;<em>Report Generation & Dashboards</em>
                  </span>
                  }&nbsp;
                  @if (configurationFile.capReportDistribution) {
                  <span class="badge badge-ghost">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>&nbsp;<em>Distribution</em>
                  </span>
                  }
                </td>
                @if (!embeddedMode()) {
                <td>
                  @if (!configurationFile.isFallback && !configurationFile.capReportGenerationMailMerge) {
                  <span
                    >&lt;config&gt;{{configurationFile.relativeFilePath}}&lt;/config&gt;</span
                  >
                  }
                  @if (configurationFile.isFallback) {
                  <span
                    [innerHTML]="'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.INNER-HTML.DEFAULT-CONFIGURATION' | translate"
                  ></span>
                  }
                </td>
                }
                @if (!embeddedMode()) {
                <td>
                  <button id="btnRestore_{{configurationFile.folderName}}_{{configurationFile.fileName}}" type="button" class="btn btn-xs btn-ghost" (click)="restoreDefaultConfigurationValues()">Restore Defaults</button>
                </td>
                }
              </tr>
              @if (loadInviteRow?.filePath === configurationFile.filePath) {
              <tr>
                @for (x of loadInviteLeadingCells; track $index) {
                <td style="border-top: none; background: #f4f9fc;"></td>
                }
                <td [attr.colspan]="totalColumns - loadInviteColumnIndex" style="padding: 4px 12px 6px; border-top: none; background: #f4f9fc;">
                  <a id="btnLoadInvite_{{configurationFile.folderName}}_{{configurationFile.fileName}}"
                     href="#" (click)="showLoadConfirm(configurationFile); $event.preventDefault(); $event.stopPropagation()"
                     style="font-size: 12px; color: #3c8dbc; font-weight: bold;">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg> Load
                  </a>
                </td>
              </tr>
              }
              @if (loadConfirmRow?.filePath === configurationFile.filePath) {
              <tr>
                @for (x of loadInviteLeadingCells; track $index) {
                <td style="border-top: none; background: #f4f9fc;"></td>
                }
                <td [attr.colspan]="totalColumns - loadInviteColumnIndex" style="padding: 4px 12px 6px; border-top: none; background: #f4f9fc; font-size: 12px;">
                  <span style="color: #777;">Sure?&nbsp;</span>
                  <a id="btnLoadConfirmYes_{{configurationFile.folderName}}_{{configurationFile.fileName}}"
                     href="#" (click)="confirmLoad(configurationFile); $event.preventDefault(); $event.stopPropagation()"
                     style="color: #3c8dbc; font-weight: 600;">Yes</a>
                  <span style="color: #bbb;">&nbsp;/&nbsp;</span>
                  <a id="btnLoadConfirmNo_{{configurationFile.folderName}}_{{configurationFile.fileName}}"
                     href="#" (click)="cancelLoad(); $event.preventDefault(); $event.stopPropagation()"
                     style="color: #999;">No</a>
                </td>
              </tr>
              }
              }
              @if (pagedConfigurationFiles.length === 0) {
              <tr>
                <td [attr.colspan]="totalColumns" style="text-align: center; color: #999; padding: 20px;">
                  @if (searchTerm) {
                  <span>No reports match '{{ searchTerm }}'</span>
                  }
                  @if (!searchTerm) {
                  <span>No reports yet</span>
                  }
                </td>
              </tr>
              }
            </tbody>
          </table>

          @if (filteredConfigurationFiles.length > pageSize) {
          <nav style="margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #777; font-size: 12px;">
                Showing {{ pageStart + 1 }}-{{ pageEnd }} of {{ filteredConfigurationFiles.length }}
              </span>
              <ul class="pagination" style="margin: 0;">
                <li [ngClass]="{ 'disabled': pageIndex === 0 }">
                  <a href="#" (click)="prevPage(); $event.preventDefault()">&laquo;</a>
                </li>
                @for (p of pageNumbers; track $index) {
                <li
                  [ngClass]="{ 'active': p === pageIndex }"
                >
                  <a href="#" (click)="goToPage(p); $event.preventDefault()">{{ p + 1 }}</a>
                </li>
                }
                <li [ngClass]="{ 'disabled': pageIndex >= totalPages - 1 }">
                  <a href="#" (click)="nextPage(); $event.preventDefault()">&raquo;</a>
                </li>
              </ul>
            </div>
          </nav>
          }
        </div>

        @if (!embeddedMode()) {
        <div style="grid-column:span 2">
          <button
            id="btnNew"
            type="button"
            class="btn btn-ghost"
            (click)="showCrudModal('create')"
            style="width:100%;margin-bottom: 5px"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> {{ 'BUTTONS.NEW' | translate }}
          </button>
          <p></p>
          <button
            id="btnEdit"
            type="button"
            class="btn btn-ghost"
            (click)="showCrudModal('update')"
            [ngClass]="{ 'disabled': !getSelectedConfiguration() }"
            style="width:100%;margin-bottom: 5px"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"/></svg> {{ 'BUTTONS.EDIT' | translate }}
          </button>
          <p></p>
          <button
            id="btnDuplicate"
            type="button"
            class="btn btn-ghost"
            (click)="showCrudModal('create', true)"
            [ngClass]="{ 'disabled': !getSelectedConfiguration() }"
            style="width:100%;margin-bottom: 5px"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg> {{ 'BUTTONS.DUPLICATE' | translate }}
          </button>
          <button
            id="btnDelete"
            type="button"
            class="btn btn-ghost"
            (click)="onDeleteSelectedTemplate()"
            [ngClass]="{ 'disabled': !getSelectedConfiguration() || getSelectedConfiguration().isFallback }"
            style="width:100%"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12h-15"/></svg> {{ 'BUTTONS.DELETE' | translate }}
          </button>
        </div>
        }
      </div>

      @if (totalPages >= 2 || searchTerm) {
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 10px;">
        <div style="grid-column:span 10">
          <div class="join">
            <span class="join-item btn btn-ghost"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z"/></svg></span>
            <input
              type="text"
              id="reportsListSearch"
              class="input input-bordered join-item"
              placeholder="Search by name"
              [ngModel]="searchTerm"
              (ngModelChange)="onSearchChange($event)"
            />
            @if (searchTerm) {
            <button
              type="button"
              class="join-item btn btn-ghost"
              (click)="onSearchChange('')"
              title="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            }
          </div>
        </div>
      </div>
      }
    </div>

    ${modalConfigurationTemplateTemplate}
  `,
})
export class ReportsListComponent implements OnInit {
  embeddedMode = input<boolean>(false);

  isModalConfigurationTemplateVisible = false;

  modalConfigurationTemplateInfo: {
    fileInfo: CfgTmplFileInfo;
    copyFromPath: string;
    templateFilePathExists: boolean | string;
    templateHowTo: string;
    crudMode: string;
    duplicate: boolean;
    modalTitle: string;
  };

  searchTerm = '';
  pageSize = 5;
  pageIndex = 0;

  filteredConfigurationFiles: CfgTmplFileInfo[] = [];
  pagedConfigurationFiles: CfgTmplFileInfo[] = [];

  loadInviteRow: CfgTmplFileInfo | null = null;
  loadConfirmRow: CfgTmplFileInfo | null = null;
  loadInviteColumnIndex = 0;

  get totalColumns(): number {
    return this.embeddedMode() ? 2 : 4;
  }

  get loadInviteLeadingCells(): number[] {
    return Array.from({ length: this.loadInviteColumnIndex }, (_, i) => i);
  }

  private searchSubject = new Subject<string>();
  private destroyRef = inject(DestroyRef);

  constructor(
    public settingsService: ConfigurationRepository,
    protected appPathsService: AppPathsService,
    protected confirmService: ConfirmService,
    protected messagesService: ToastrMessagesService,
    protected reportsService: ReportsService,
    protected samplesService: SamplesService,
    protected router: Router,
  ) {
    this.modalConfigurationTemplateInfo = {
      fileInfo: {
        fileName: '',
        filePath: '',
        templateName: '',
        capReportGenerationMailMerge: false,
        capReportDistribution: false,
        dsInputType: '',
        notes: '',
        type: 'config-reports',
        folderName: '',
        relativeFilePath: '',
        isFallback: false,
        scriptOptionsSelectFileExplorer: 'notused',
        reportParameters: [],
      },
      copyFromPath: '',
      templateFilePathExists: false,
      templateHowTo: '',
      crudMode: 'create',
      duplicate: false,
      modalTitle: '',
    };
  }

  async ngOnInit() {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.searchTerm = term;
        this.pageIndex = 0;
        this.applyFilters();
      });

    this.settingsService.configurationFiles =
      await this.settingsService.loadAllReports();

    this.applyFilters();
  }

  // === Search + Pagination ===

  onSearchChange(term: string) {
    this.searchSubject.next(term ?? '');
  }

  applyFilters() {
    const all = this.settingsService.getConfigurations() || [];
    const term = (this.searchTerm || '').trim().toLowerCase();

    this.filteredConfigurationFiles = term
      ? all.filter((c) => (c.templateName || '').toLowerCase().includes(term))
      : [...all];

    this.clearSelection();
    this.recomputePage();
  }

  recomputePage() {
    const maxPageIndex = Math.max(0, this.totalPages - 1);
    if (this.pageIndex > maxPageIndex) this.pageIndex = maxPageIndex;

    const start = this.pageIndex * this.pageSize;
    this.pagedConfigurationFiles = this.filteredConfigurationFiles.slice(
      start,
      start + this.pageSize,
    );
  }

  goToPage(i: number) {
    this.pageIndex = i;
    this.clearSelection();
    this.recomputePage();
  }

  prevPage() {
    if (this.pageIndex > 0) this.goToPage(this.pageIndex - 1);
  }

  nextPage() {
    if (this.pageIndex < this.totalPages - 1) this.goToPage(this.pageIndex + 1);
  }

  get totalPages(): number {
    return Math.max(
      1,
      Math.ceil(this.filteredConfigurationFiles.length / this.pageSize),
    );
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }

  get pageStart(): number {
    return this.pageIndex * this.pageSize;
  }

  get pageEnd(): number {
    return Math.min(
      this.filteredConfigurationFiles.length,
      this.pageStart + this.pageSize,
    );
  }

  private clearSelection() {
    for (const c of this.settingsService.configurationFiles || []) {
      c.activeClicked = false;
    }
  }

  // === Selection & CRUD (moved from ConfigurationReportsComponent) ===

  onConfTemplateClick(confTemplateClicked: CfgTmplFileInfo, event?: MouseEvent) {
    for (const configurationFile of this.settingsService.configurationFiles) {
      configurationFile.activeClicked =
        configurationFile.templateName === confTemplateClicked.templateName;
    }

    // Determine which column was clicked for invitation positioning
    const target = event?.target as HTMLElement;
    const td = target?.closest('td');
    const tr = td?.closest('tr');
    if (td && tr) {
      this.loadInviteColumnIndex = Array.from(tr.children).indexOf(td as Element);
    }

    // Skip invitation when clicking the Actions column (last column, non-embedded only)
    if (!this.embeddedMode() && this.loadInviteColumnIndex === this.totalColumns - 1) {
      this.loadInviteRow = null;
      this.loadConfirmRow = null;
      return;
    }

    const isCurrent = confTemplateClicked.filePath === this.settingsService.currentConfigurationTemplatePath;
    if (isCurrent) {
      this.loadInviteRow = null;
      this.loadConfirmRow = null;
    } else if (this.loadInviteRow?.filePath === confTemplateClicked.filePath) {
      // toggle off if same row clicked again
      this.loadInviteRow = null;
      this.loadConfirmRow = null;
    } else {
      this.loadInviteRow = confTemplateClicked;
      this.loadConfirmRow = null;
    }
  }

  showLoadConfirm(configurationFile: CfgTmplFileInfo) {
    this.loadConfirmRow = configurationFile;
    this.loadInviteRow = null;
  }

  confirmLoad(configurationFile: CfgTmplFileInfo) {
    this.loadInviteRow = null;
    this.loadConfirmRow = null;
    this.router.navigate(
      ['/configuration', 'generalSettingsMenuSelected', configurationFile.filePath, configurationFile.templateName],
      { skipLocationChange: true },
    );
  }

  cancelLoad() {
    this.loadInviteRow = null;
    this.loadConfirmRow = null;
  }

  getSelectedConfiguration() {
    if (!this.settingsService.configurationFiles) return undefined;
    return this.settingsService.configurationFiles.find(
      (configuration) => configuration.activeClicked,
    );
  }

  onDeleteSelectedTemplate() {
    const selectedConfiguration = this.getSelectedConfiguration();
    if (!selectedConfiguration || selectedConfiguration.isFallback) return;

    this.confirmService.askConfirmation({
      message: 'Delete selected item?',
      confirmAction: async () => {
        await this.reportsService.deleteReport(selectedConfiguration.folderName);
        this.settingsService.invalidateConfigDetailsCache(selectedConfiguration.filePath);
        _.remove(
          this.settingsService.configurationFiles,
          (o) => o.filePath === selectedConfiguration.filePath,
        );
        this.applyFilters();
        this.messagesService.showInfo('Done');
      },
    });
  }

  async restoreDefaultConfigurationValues() {
    const selectedConfiguration = this.getSelectedConfiguration();

    const dialogQuestion = `Restore the default configuration values and override the existing "${selectedConfiguration?.templateName}" configuration?`;
    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        await this.reportsService.restoreDefaults(selectedConfiguration.folderName);

        this.settingsService.configurationFiles =
          await this.settingsService.loadAllReports({ forceReload: true });
        this.applyFilters();
        this.messagesService.showInfo('Saved');
      },
    });
  }

  async showCrudModal(crudMode: string, duplicate?: boolean) {
    this.modalConfigurationTemplateInfo.crudMode = crudMode;
    this.modalConfigurationTemplateInfo.duplicate = duplicate;

    if (crudMode == 'update') {
      this.modalConfigurationTemplateInfo.modalTitle = 'Update Report';

      const selectedConfiguration = this.getSelectedConfiguration();

      this.modalConfigurationTemplateInfo.fileInfo.isFallback =
        selectedConfiguration.isFallback;
      this.modalConfigurationTemplateInfo.fileInfo.templateName =
        selectedConfiguration.templateName;
      this.modalConfigurationTemplateInfo.fileInfo.capReportDistribution =
        selectedConfiguration.capReportDistribution;
      this.modalConfigurationTemplateInfo.fileInfo.capReportGenerationMailMerge =
        selectedConfiguration.capReportGenerationMailMerge;
      this.modalConfigurationTemplateInfo.fileInfo.type =
        selectedConfiguration.type;
      this.modalConfigurationTemplateInfo.fileInfo.filePath =
        selectedConfiguration.filePath;
      this.modalConfigurationTemplateInfo.fileInfo.relativeFilePath =
        selectedConfiguration.relativeFilePath;

      if (
        !selectedConfiguration.isFallback &&
        !selectedConfiguration.capReportGenerationMailMerge
      )
        this.modalConfigurationTemplateInfo.templateHowTo = `<config>${selectedConfiguration.relativeFilePath}</config>`;

      const settingsXmlConfigurationValues =
        await this.reportsService.loadReportSettings(
          selectedConfiguration.folderName,
        );

      this.modalConfigurationTemplateInfo.fileInfo.notes =
        settingsXmlConfigurationValues.documentburster.settings.notes;
    } else if (crudMode == 'create') {
      this.modalConfigurationTemplateInfo.fileInfo.type = 'config-reports';
      this.modalConfigurationTemplateInfo.modalTitle = 'Create Report';
      this.modalConfigurationTemplateInfo.fileInfo.templateName = '';
      this.modalConfigurationTemplateInfo.fileInfo.isFallback = false;

      let copyFromXmlConfigurationValues: any;

      if (!duplicate) {
        this.modalConfigurationTemplateInfo.copyFromPath =
          this.settingsService.getDefaultsConfigurationValuesFilePath();
        copyFromXmlConfigurationValues = await this.reportsService.loadDefaults();
      } else {
        const selectedConfiguration = this.getSelectedConfiguration();
        this.modalConfigurationTemplateInfo.modalTitle = `Create Report by Duplicating '${selectedConfiguration?.templateName}' Configuration Values`;
        this.modalConfigurationTemplateInfo.copyFromPath =
          selectedConfiguration.filePath;
        copyFromXmlConfigurationValues =
          await this.reportsService.loadReportSettings(
            Utilities.basename(Utilities.dirname(this.modalConfigurationTemplateInfo.copyFromPath)),
          );
      }

      this.modalConfigurationTemplateInfo.fileInfo.capReportDistribution =
        copyFromXmlConfigurationValues.documentburster.settings.capabilities.reportdistribution;
      this.modalConfigurationTemplateInfo.fileInfo.capReportGenerationMailMerge =
        copyFromXmlConfigurationValues.documentburster.settings.capabilities.reportgenerationmailmerge;
      this.modalConfigurationTemplateInfo.fileInfo.notes =
        copyFromXmlConfigurationValues.documentburster.settings.notes;
    }

    await this.updateModelAndForm();
    this.isModalConfigurationTemplateVisible = true;
  }

  async updateModelAndForm() {
    if (this.modalConfigurationTemplateInfo.crudMode == 'create') {
      const folderName = this.modalConfigurationTemplateInfo.fileInfo.templateName
        ? _.kebabCase(this.modalConfigurationTemplateInfo.fileInfo.templateName)
        : '${folder-name}';

      this.modalConfigurationTemplateInfo.fileInfo.filePath = `${this.appPathsService.CONFIGURATION_REPORTS_FOLDER_PATH}/${folderName}/settings.xml`;
      this.modalConfigurationTemplateInfo.fileInfo.relativeFilePath = `./config/reports/${folderName}/settings.xml`;
      this.modalConfigurationTemplateInfo.fileInfo.folderName = folderName;

      this.modalConfigurationTemplateInfo.templateFilePathExists =
        this.settingsService.configurationFiles.some(
          (c) => c.folderName === folderName,
        );

      this.modalConfigurationTemplateInfo.templateHowTo = '';

      if (
        !this.modalConfigurationTemplateInfo.fileInfo.capReportGenerationMailMerge &&
        !this.modalConfigurationTemplateInfo.fileInfo.isFallback
      ) {
        this.modalConfigurationTemplateInfo.templateHowTo =
          '<config>' +
          this.modalConfigurationTemplateInfo.fileInfo.relativeFilePath +
          '</config>';
      }
    } else if (this.modalConfigurationTemplateInfo.crudMode == 'update') {
      delete this.modalConfigurationTemplateInfo.templateFilePathExists;
    }
  }

  onModalClose() {
    this.isModalConfigurationTemplateVisible = false;
  }

  async onModalOK() {
    if (this.modalConfigurationTemplateInfo.crudMode == 'create') {
      const folderName = Utilities.basename(
        Utilities.dirname(this.modalConfigurationTemplateInfo.fileInfo.filePath),
      );

      let copyFromReportId: string = undefined;
      if (this.modalConfigurationTemplateInfo.duplicate) {
        copyFromReportId = Utilities.basename(
          Utilities.dirname(this.modalConfigurationTemplateInfo.copyFromPath),
        );
      }

      const result = await this.reportsService.createReport(
        folderName,
        this.modalConfigurationTemplateInfo.fileInfo.templateName,
        this.modalConfigurationTemplateInfo.fileInfo.capReportDistribution,
        this.modalConfigurationTemplateInfo.fileInfo.capReportGenerationMailMerge,
        copyFromReportId,
      );

      this.settingsService.configurationFiles.push(result);
      this.applyFilters();
      this.isModalConfigurationTemplateVisible = false;
      this.router.navigate(
        ['/configuration', 'generalSettingsMenuSelected', result.filePath, result.templateName],
        { skipLocationChange: true },
      );
      return;
    } else if (this.modalConfigurationTemplateInfo.crudMode == 'update') {
      let loadingValuesFilePath =
        this.modalConfigurationTemplateInfo.fileInfo.filePath;

      if (this.modalConfigurationTemplateInfo.copyFromPath) {
        loadingValuesFilePath = this.modalConfigurationTemplateInfo.copyFromPath;
      }

      const configurationValues = await this.reportsService.loadReportSettings(
        Utilities.basename(Utilities.dirname(loadingValuesFilePath)),
      );

      configurationValues.documentburster.settings.template =
        this.modalConfigurationTemplateInfo.fileInfo.templateName;
      configurationValues.documentburster.settings.capabilities.reportdistribution =
        this.modalConfigurationTemplateInfo.fileInfo.capReportDistribution;
      configurationValues.documentburster.settings.capabilities.reportgenerationmailmerge =
        this.modalConfigurationTemplateInfo.fileInfo.capReportGenerationMailMerge;
      configurationValues.documentburster.settings.notes =
        this.modalConfigurationTemplateInfo.fileInfo.notes;

      await this.reportsService.saveReportSettings(
        Utilities.basename(Utilities.dirname(this.modalConfigurationTemplateInfo.fileInfo.filePath)),
        configurationValues,
      );

      const selected = this.getSelectedConfiguration();
      if (selected) {
        selected.templateName = this.modalConfigurationTemplateInfo.fileInfo.templateName;
        selected.capReportDistribution = this.modalConfigurationTemplateInfo.fileInfo.capReportDistribution;
        selected.capReportGenerationMailMerge = this.modalConfigurationTemplateInfo.fileInfo.capReportGenerationMailMerge;

        if (selected.filePath === this.settingsService.currentConfigurationTemplatePath) {
          this.settingsService.currentConfigurationTemplateName = selected.templateName;
        }
      }

      this.applyFilters();
      this.isModalConfigurationTemplateVisible = false;
      this.router.navigate(
        ['/configuration', 'generalSettingsMenuSelected', this.modalConfigurationTemplateInfo.fileInfo.filePath, this.modalConfigurationTemplateInfo.fileInfo.templateName],
        { skipLocationChange: true },
      );
    }
  }
}
