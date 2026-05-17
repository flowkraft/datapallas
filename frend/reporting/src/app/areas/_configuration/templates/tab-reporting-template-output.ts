export const tabReportingTemplateOutputTemplate = `<ng-template
  #tabReportingTemplateOutputTemplate
>
  <div class="well">
    <div class="row">
      <div class="col-xs-2">
        {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.OUTPUT-TYPE' | translate }}
      </div>
      <div class="col-xs-5">
        <select
          id="reportOutputType"
          class="form-control"
          [(ngModel)]="xmlReporting?.documentburster.report.template.outputtype"
          (ngModelChange)="markSettingsDirty($event)"
          (change)="onReportOutputTypeChanged()"
          [disabled]="isOutputTypeLocked"
        >
          <option value="output.none">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TYPE-NONE' | translate }}
          </option>
          <option value="output.pdf">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TYPE-PDF' | translate }}
          </option>
          <option value="output.xlsx">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TYPE-XLSX' | translate }}
          </option>
          <option value="output.html">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TYPE-HTML' | translate }}
          </option>
          <option value="output.dashboard" *ngIf="isOutputTypeLocked">
            Dashboard
          </option>
          <option value="output.docx">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TYPE-DOCX' | translate }}
          </option>

          <option value="output.fop2pdf">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TYPE-PDF-USING-FOP' | translate }}
          </option>
          <option value="output.any">
            {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TYPE-ANY' | translate }}
          </option>
          <option value="output.jasper">
            JasperReports (.jrxml)
          </option>
        </select>
        <small *ngIf="isOutputTypeLocked" class="text-muted" style="display: block; margin-top: 5px;">
          <i class="fa fa-lock"></i> Output type locked to Dashboard (set by input type)
        </small>
      </div>
      <div class="col-xs-5">
        <button id="btnAskAiForHelpOutput" type="button" class="btn btn-default" (click)="askAiForHelp((xmlReporting?.documentburster.report.template.outputtype))" *ngIf="xmlReporting?.documentburster.report.template.outputtype !== 'output.none' && (xmlReporting?.documentburster.report.template.outputtype !== 'output.jasper' || selectedJasperReport?.filePath === '__inline__')">
              <strong>{{ getAiHelpButtonLabel(xmlReporting?.documentburster.report.template.outputtype) }}</strong>
        </button>
      </div>

    </div>
    <p></p>
    <!-- Add this help text when None is selected -->
    <div class="row" *ngIf="xmlReporting?.documentburster.report.template.outputtype === 'output.none'">
      <div class="col-xs-offset-2 col-xs-10">
        <span id="noneOutputTypeHelp" class="help-block">
          <i class="fa fa-info-circle text-info"></i>&nbsp;
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.NONE-OUTPUT-HELP' | translate }}
        </span>
      </div>
    </div>

    <!-- JasperReport picker when output.jasper is selected (hidden for standalone jasper from config/reports-jasper/) -->
    <div class="row" *ngIf="xmlReporting?.documentburster.report.template.outputtype === 'output.jasper'">
      <div class="col-xs-2">
        JasperReports
      </div>
      <div class="col-xs-5">
        <ng-select
          id="selectJasperReport"
          [(ngModel)]="selectedJasperReport"
          [groupBy]="groupByJasperHelper"
          (change)="onJasperReportSelected($event)"
          appendTo="body"
          placeholder="Select a JasperReport..."
        >
          <ng-option [value]="inlineJrxmlOption">
            <i class="fa fa-pencil"></i>&nbsp;Write .jrxml code inline
          </ng-option>
          <ng-option
            *ngFor="let report of this.settingsService.getJasperReportConfigurations()"
            [value]="report"
          >
            <i class="fa fa-diamond"></i>&nbsp;{{report.templateName}}
            <span style="color: #999; font-size: 0.85em">({{report.fileName}})</span>
          </ng-option>
        </ng-select>
      </div>
    </div>

    <!-- .jrxml code editor (editable for inline, read-only for reports-jasper/) -->
    <p></p>
    <div class="row" *ngIf="xmlReporting?.documentburster.report.template.outputtype === 'output.jasper' && selectedJasperReport">
      <div class="col-xs-2">
        Template
        <span *ngIf="selectedJasperReport.filePath !== '__inline__'" class="label label-default" style="font-size: 0.75em; margin-left: 4px;">read-only</span>
      </div>
      <div class="col-xs-10">
        <ngx-codejar
          id="codeJarJrxmlTemplateEditor"
          [(code)]="activeReportTemplateContent"
          (update)="saveTemplateAndRefreshPreview($event)"
          [highlightMethod]="highlightXmlCode"
          [highlighter]="'prism'"
          [showLineNumbers]="true"
          [readonly]="selectedJasperReport.filePath !== '__inline__'"
          style="height: 476px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto;">
        </ngx-codejar>
      </div>
    </div>
    
    <div
      *ngIf="askForFeatureService.alreadyImplementedFeatures.includes(xmlReporting?.documentburster.report.template.outputtype)"
    >
      <div
        class="row"
        id="reportTemplateContainer"
        *ngIf="xmlReporting?.documentburster.report.template.outputtype != 'output.none' && xmlReporting?.documentburster.report.template.outputtype != 'output.jasper'"
      >
        <div class="col-xs-2">
          {{(
            xmlReporting?.documentburster.report.template.outputtype === 'output.docx' ? 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TEMPLATE-DOCX' :
            xmlReporting?.documentburster.report.template.outputtype === 'output.fop2pdf' ? 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TEMPLATE-XSLFO' :
            xmlReporting?.documentburster.report.template.outputtype === 'output.any' ? 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TEMPLATE-FREEM' :
            'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TEMPLATE-HTML'
          ) | translate}}
          <br/><br/>
          <button type="button" 
                  id="btnOpenTemplateGallery"
                  class="btn btn-sm btn-default" 
                  (click)="showGalleryModalForCurrentOutputType()"
                  style="margin-top: 6px"
                  >
            <i class="fa fa-list-alt"></i> {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.BUTTONS.EXAMPLES-GALLERY' | translate }}
          </button>
        </div>

        <div class="col-xs-10">
        
          <!-- Template file selector for DOCX -->
          <ng-select
            *ngIf="xmlReporting?.documentburster.report.template.outputtype === 'output.docx'"
            id="selectTemplateFile"
            [(ngModel)]="selectedReportTemplateFile"
            (change)="onSelectTemplateFileChanged($event)"
            appendTo="body"
            style="margin-bottom: 10px;"
          >
             <ng-template ng-notfound-tmp>
                <div id="noDocxTemplatesFound" class="ng-option disabled">
                  <i class="fa fa-exclamation-triangle text-warning"></i> 
                  {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.NO-TEMPLATES-FOUND' | translate }}<br>
                  <code id="noDocxTemplatesFoundCode" style="background-color: #f8f8f8; padding: 4px; display: block; word-break: break-all;">
                    {{absoluteTemplateFolderPath ? absoluteTemplateFolderPath : 
                      (appPathsService.CONFIGURATION_TEMPLATES_FOLDER_PATH + '/reports/' + 
                      settingsService.currentConfigurationTemplate?.folderName)}}
                  </code>
                </div>
              </ng-template>
            
            <ng-option
              *ngFor="let reportTemplate of settingsService.getReportTemplates(xmlReporting?.documentburster.report.template.outputtype, {samples: xmlReporting?.documentburster.report.template.documentpath?.includes('/samples/')})"
              [value]="reportTemplate"
              >
              <span id="{{reportTemplate.fileName}}">
              {{reportTemplate.fileName}}
              <span *ngIf="reportTemplate.type.includes('-sample')">
                {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.DIALOG.SAMPLE-LABEL' | translate }}
              </span>
              </span>  
              </ng-option
            >
          </ng-select>

          <!-- Shared toolbar for all output types except 'none' -->
          <div class="shared-toolbar" 
              *ngIf="xmlReporting?.documentburster.report.template.outputtype !== 'output.none'"
              style="display: flex; align-items: center;">
            
            
            <!-- Template path display (right-aligned, expanded) -->
            <div *ngIf="xmlReporting?.documentburster.report.template.outputtype == 'output.docx'" 
                style="display: flex; align-items: center; overflow: hidden; flex: 1; margin-left: auto;">
              <div id="divTruncatedAbsoluteTemplateFolderPath" class="truncated-path" 
                  style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background-color: #f8f8f8; padding: 4px 8px; border-radius: 3px; border: 1px solid #e0e0e0; margin-right: 5px; width: 100%;"
                  [title]="absoluteTemplateFolderPath || getTemplateRelativeFolderPath()">
                {{absoluteTemplateFolderPath || getTemplateRelativeFolderPath()}}
              </div>
              <button type="button" 
                      id="btnCopyTemplatePathToClipboard"
                      class="btn btn-sm btn-default" 
                      title="Copy path to clipboard"
                      (click)="copyTemplatePathToClipboard()">
                <i class="fa fa-clipboard"></i>
              </button>
             </div>
          </div>


          <!-- HTML editor for HTML, Dashboard, PDF and XLSX -->
          <div *ngIf="xmlReporting?.documentburster.report.template.outputtype === 'output.html' ||
                    xmlReporting?.documentburster.report.template.outputtype === 'output.dashboard' ||
                    xmlReporting?.documentburster.report.template.outputtype === 'output.pdf' ||
                    xmlReporting?.documentburster.report.template.outputtype === 'output.xlsx'
                   ">
              
              <!-- Code editor only (when preview is hidden) -->
              <div id="codeJarHtmlTemplateEditorDiv" *ngIf="!reportPreviewVisible">
                <ngx-codejar
                  id="codeJarHtmlTemplateEditor"  
                  [(code)]="activeReportTemplateContent"
                  (update)="saveTemplateAndRefreshPreview($event)"
                  [highlightMethod]="highlightHtmlCode"
                  [highlighter]="'prism'"
                  [showLineNumbers]="true"
                  style="height: 476px; border: 1px solid #ccc; border-radius: 4px 4px 0 0; overflow-y: auto;"
                ></ngx-codejar>
                <button type="button" 
                        id="btnToggleHtmlPreviewShow"
                        class="btn btn-default btn-block" 
                        style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                        (click)="toggleHtmlPreview()">
                  <i class="fa fa-eye"></i> {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.BUTTONS.SHOW-PREVIEW' | translate }}
                </button>
              </div>

              <!-- Split pane with editor and preview -->
              <as-split *ngIf="reportPreviewVisible" direction="horizontal" 
                        [gutterSize]="8" [useTransition]="true"
                        style="height: 510px;">
                
                <!-- Editor Pane -->
                <as-split-area [size]="50" [minSize]="20">
                  <div id="codeJarHtmlTemplateEditorDiv" style="height: 100%; display: flex; flex-direction: column;">
                    <ngx-codejar
                      id="codeJarHtmlTemplateEditor"
                      [(code)]="activeReportTemplateContent"
                      (update)="saveTemplateAndRefreshPreview($event)"
                      [highlightMethod]="highlightHtmlCode"
                      [highlighter]="'prism'"
                      [showLineNumbers]="true"
                      style="flex: 1; border: 1px solid #ccc; border-radius: 4px 4px 0 0; overflow-y: auto;"
                    ></ngx-codejar>
                    <button type="button" 
                            id="btnToggleHtmlPreviewHide"
                            class="btn btn-default btn-block" 
                            style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                            (click)="toggleHtmlPreview()">
                      <i class="fa fa-code"></i> {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.BUTTONS.EXPAND-EDITOR' | translate }}
                    </button>
                  </div>
                </as-split-area>
                
                <!-- Preview Pane -->
                <as-split-area [size]="50" [minSize]="20">
                  <div class="preview-container" style="height: 100%; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;">
                    <iframe 
                            id="reportPreviewPane"
                            [srcdoc]="this.sanitizedReportPreview"
                            style="width: 100%; flex: 1; border: 1px solid #ddd; border-radius: 4px 4px 0 0; overflow: auto; box-sizing: border-box;" 
                            frameborder="0">
                    </iframe>
                    <button id="btnViewHtmlInBrowser" type="button" class="btn btn-default btn-block" 
                            style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                            (click)="openTemplateInBrowser(null, xmlReporting.documentburster.report.template.documentpath)">
                      <i class="fa fa-external-link"></i> {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.BUTTONS.VIEW-IN-BROWSER' | translate }}
                    </button>
                  </div>
                </as-split-area>
              </as-split>
              
          </div>

          <!-- Template file selector for output.fop2pdf and output.any -->
          <div *ngIf="xmlReporting?.documentburster.report.template.outputtype === 'output.fop2pdf' || 
                    xmlReporting?.documentburster.report.template.outputtype === 'output.any'">
          
                    <ngx-codejar
                      id="codeJarHtmlTemplateEditor"
                      *ngIf="xmlReporting?.documentburster.report.template.outputtype === 'output.fop2pdf'"
                      [(code)]="activeReportTemplateContent"
                      (update)="saveTemplateAndRefreshPreview($event)"
                      [highlightMethod]="highlightXmlCode"
                      [highlighter]="'prism'"
                      [showLineNumbers]="true"
                      style="height: 476px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto;">
                    </ngx-codejar>
          
                    <ngx-codejar
                      id="codeJarHtmlTemplateEditor"
                      *ngIf="xmlReporting?.documentburster.report.template.outputtype === 'output.any'"
                      [(code)]="activeReportTemplateContent"
                      (update)="saveTemplateAndRefreshPreview($event)"
                      [highlightMethod]="highlightFreeMarkerCode"
                      [highlighter]="'prism'"
                      [showLineNumbers]="true"
                      style="height: 476px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto;">
                    </ngx-codejar>
          </div>
          
        </div>
      </div>
    </div>
    <div
      *ngIf="!askForFeatureService.alreadyImplementedFeatures.includes(xmlReporting?.documentburster.report.template.outputtype)"
    >
      <div class="row">
        <div class="col-xs-2"></div>
        <div class="col-xs-5">
          <button
            type="button"
            class="btn btn-primary btn-block"
            (click)="triggerFeatureRequestDialog(xmlReporting?.documentburster.report.template.outputtype)"
          >
            <span [innerHTML]="'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.BUTTONS.REQUEST-FEATURE' | translate"></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</ng-template>`;
