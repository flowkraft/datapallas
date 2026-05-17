import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { Router } from '@angular/router';

import _ from 'lodash';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

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
      <div class="row">
        <div
          [ngClass]="embeddedMode ? 'col-xs-12' : 'col-xs-10'"
          style="cursor: pointer; overflow: auto"
        >
          <table
            id="confTemplatesTable"
            class="table table-responsive table-hover table-bordered"
            cellspacing="0"
          >
            <thead>
              <tr>
                <th>{{ 'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.NAME' | translate }}</th>
                <th>{{ 'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.CAPABILITIES' | translate }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</th>
                <th *ngIf="!embeddedMode">{{ 'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.HOW-TO-USE' | translate }}</th>
                <th *ngIf="!embeddedMode">Actions&nbsp;&nbsp;&nbsp;&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              <ng-container *ngFor="let configurationFile of pagedConfigurationFiles">
              <tr
                id="{{configurationFile.folderName}}_{{configurationFile.fileName}}"
                (click)="onConfTemplateClick(configurationFile, $event)"
                [ngClass]="{ 'info': configurationFile.activeClicked }"
              >
                <td>
                  {{ configurationFile.templateName }}
                  <span *ngIf="configurationFile.type=='config-jasper-reports'" class="label" style="margin-left: 5px; background-color: #8fbcd4; color: #fff;">
                    <i class="fa fa-diamond"></i> Jasper
                  </span>
                  <span *ngIf="configurationFile.filePath === settingsService.currentConfigurationTemplatePath" style="margin-left: 6px; font-size: 11px; color: #777; font-style: italic;">(current)</span>
                </td>
                <td>
                  <span class="label label-default" *ngIf="!configurationFile.capReportGenerationMailMerge">
                    <i class="fa fa-scissors">&nbsp;</i><em>Splitting</em>
                  </span>
                  <span class="label label-default" *ngIf="configurationFile.capReportGenerationMailMerge">
                    <i class="fa fa-file-text-o">&nbsp;</i><em>Report Generation & Dashboards</em>
                  </span>&nbsp;
                  <span class="label label-default" *ngIf="configurationFile.capReportDistribution">
                    <i class="fa fa-envelope-o">&nbsp;</i><em>Distribution</em>
                  </span>
                </td>
                <td *ngIf="!embeddedMode">
                  <span *ngIf="!configurationFile.isFallback && !configurationFile.capReportGenerationMailMerge"
                    >&lt;config&gt;{{configurationFile.relativeFilePath}}&lt;/config&gt;</span
                  >
                  <span
                    *ngIf="configurationFile.isFallback"
                    [innerHTML]="'AREAS.CONFIGURATION-TEMPLATES.TAB-CONF-TEMPLATES.INNER-HTML.DEFAULT-CONFIGURATION' | translate"
                  ></span>
                </td>
                <td *ngIf="!embeddedMode">
                  <button id="btnRestore_{{configurationFile.folderName}}_{{configurationFile.fileName}}" type="button" class="btn btn-xs btn-default" (click)="restoreDefaultConfigurationValues()">Restore Defaults</button>
                </td>
              </tr>
              <tr *ngIf="loadInviteRow?.filePath === configurationFile.filePath">
                <td *ngFor="let x of loadInviteLeadingCells" style="border-top: none; background: #f4f9fc;"></td>
                <td [attr.colspan]="totalColumns - loadInviteColumnIndex" style="padding: 4px 12px 6px; border-top: none; background: #f4f9fc;">
                  <a id="btnLoadInvite_{{configurationFile.folderName}}_{{configurationFile.fileName}}"
                     href="#" (click)="showLoadConfirm(configurationFile); $event.preventDefault(); $event.stopPropagation()"
                     style="font-size: 12px; color: #3c8dbc; font-weight: bold;">
                    <i class="fa fa-sign-in"></i> Load
                  </a>
                </td>
              </tr>
              <tr *ngIf="loadConfirmRow?.filePath === configurationFile.filePath">
                <td *ngFor="let x of loadInviteLeadingCells" style="border-top: none; background: #f4f9fc;"></td>
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
              </ng-container>
              <tr *ngIf="pagedConfigurationFiles.length === 0">
                <td [attr.colspan]="totalColumns" style="text-align: center; color: #999; padding: 20px;">
                  <span *ngIf="searchTerm">No reports match '{{ searchTerm }}'</span>
                  <span *ngIf="!searchTerm">No reports yet</span>
                </td>
              </tr>
            </tbody>
          </table>

          <nav *ngIf="filteredConfigurationFiles.length > pageSize" style="margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #777; font-size: 12px;">
                Showing {{ pageStart + 1 }}-{{ pageEnd }} of {{ filteredConfigurationFiles.length }}
              </span>
              <ul class="pagination" style="margin: 0;">
                <li [ngClass]="{ 'disabled': pageIndex === 0 }">
                  <a href="#" (click)="prevPage(); $event.preventDefault()">&laquo;</a>
                </li>
                <li
                  *ngFor="let p of pageNumbers"
                  [ngClass]="{ 'active': p === pageIndex }"
                >
                  <a href="#" (click)="goToPage(p); $event.preventDefault()">{{ p + 1 }}</a>
                </li>
                <li [ngClass]="{ 'disabled': pageIndex >= totalPages - 1 }">
                  <a href="#" (click)="nextPage(); $event.preventDefault()">&raquo;</a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div class="col-xs-2" *ngIf="!embeddedMode">
          <button
            id="btnNew"
            type="button"
            class="btn btn-flat btn-default col-xs-12"
            (click)="showCrudModal('create')"
            style="margin-bottom: 5px"
          >
            <i class="fa fa-plus"></i> {{ 'BUTTONS.NEW' | translate }}
          </button>
          <p></p>
          <button
            id="btnEdit"
            type="button"
            class="btn btn-flat btn-default col-xs-12"
            (click)="showCrudModal('update')"
            [ngClass]="{ 'disabled': !getSelectedConfiguration() }"
            style="margin-bottom: 5px"
          >
            <i class="fa fa-pencil-square-o"></i> {{ 'BUTTONS.EDIT' | translate }}
          </button>
          <p></p>
          <button
            id="btnDuplicate"
            type="button"
            class="btn btn-flat btn-default col-xs-12"
            (click)="showCrudModal('create', true)"
            [ngClass]="{ 'disabled': !getSelectedConfiguration() }"
            style="margin-bottom: 5px"
          >
            <i class="fa fa-clone"></i> {{ 'BUTTONS.DUPLICATE' | translate }}
          </button>
          <button
            id="btnDelete"
            type="button"
            class="btn btn-flat btn-default col-xs-12"
            (click)="onDeleteSelectedTemplate()"
            [ngClass]="{ 'disabled': !getSelectedConfiguration() || getSelectedConfiguration().isFallback }"
          >
            <i class="fa fa-minus"></i> {{ 'BUTTONS.DELETE' | translate }}
          </button>
        </div>
      </div>

      <div class="row" style="margin-top: 10px;" *ngIf="totalPages >= 2 || searchTerm">
        <div class="col-xs-10">
          <div class="input-group">
            <span class="input-group-addon"><i class="fa fa-search"></i></span>
            <input
              type="text"
              id="reportsListSearch"
              class="form-control"
              placeholder="Search by name"
              [ngModel]="searchTerm"
              (ngModelChange)="onSearchChange($event)"
            />
            <span class="input-group-btn" *ngIf="searchTerm">
              <button
                type="button"
                class="btn btn-default"
                (click)="onSearchChange('')"
                title="Clear search"
              >
                <i class="fa fa-times"></i>
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>

    ${modalConfigurationTemplateTemplate}
  `,
})
export class ReportsListComponent implements OnInit, OnDestroy {
  @Input() embeddedMode = false;

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
    return this.embeddedMode ? 2 : 4;
  }

  get loadInviteLeadingCells(): number[] {
    return Array.from({ length: this.loadInviteColumnIndex }, (_, i) => i);
  }

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

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
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((term) => {
        this.searchTerm = term;
        this.pageIndex = 0;
        this.applyFilters();
      });

    this.settingsService.configurationFiles =
      await this.settingsService.loadAllReports();

    this.applyFilters();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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
    if (!this.embeddedMode && this.loadInviteColumnIndex === this.totalColumns - 1) {
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
