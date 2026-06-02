export const tabReportingTemplateOutputTemplate = `<ng-template
  #tabReportingTemplateOutputTemplate
>
  <div class="space-y-4">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.OUTPUT-TYPE' | translate }}
      </div>
      <div style="grid-column:span 5">
        <select
          id="reportOutputType"
          class="select select-bordered"
          [ngModel]="xmlReporting?.documentburster?.report?.template?.outputtype"
          (ngModelChange)="setXmlReportingPath('documentburster.report.template.outputtype', $event); onReportOutputTypeChanged()"
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
          @if (isOutputTypeLocked) {
            <option value="output.dashboard">
              Dashboard
            </option>
          }
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
        @if (isOutputTypeLocked) {
        <small class="text-base-content/60" style="display: block; margin-top: 5px;">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg> Output type locked to Dashboard (set by input type)
        </small>
        }
      </div>
      <div style="grid-column:span 5">
        @if (xmlReporting?.documentburster.report.template.outputtype !== 'output.none' && (xmlReporting?.documentburster.report.template.outputtype !== 'output.jasper' || selectedJasperReport?.filePath === '__inline__')) {
        <button id="btnAskAiForHelpOutput" type="button" class="btn btn-outline w-full" (click)="askAiForHelp((xmlReporting?.documentburster.report.template.outputtype))">
              <strong>{{ getAiHelpButtonLabel(xmlReporting?.documentburster.report.template.outputtype) }}</strong>
        </button>
        }
      </div>

    </div>
    <p></p>
    <!-- Add this help text when None is selected -->
    @if (xmlReporting?.documentburster.report.template.outputtype === 'output.none') {
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 10;margin-left:calc(2/12*100%)">
        <span id="noneOutputTypeHelp" class="help-block">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 text-info"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>&nbsp;
          {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.NONE-OUTPUT-HELP' | translate }}
        </span>
      </div>
    </div>
    }

    <!-- JasperReport picker when output.jasper is selected (hidden for standalone jasper from config/reports-jasper/) -->
    @if (xmlReporting?.documentburster.report.template.outputtype === 'output.jasper') {
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        JasperReports
      </div>
      <div style="grid-column:span 5">
        <ng-select
          id="selectJasperReport"
          [ngModel]="selectedJasperReport"
          (ngModelChange)="onJasperReportSelected($event)"
          [groupBy]="groupByJasperHelper"
          appendTo="body"
          placeholder="Select a JasperReport..."
        >
          <ng-option [value]="inlineJrxmlOption">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"/></svg>&nbsp;Write .jrxml code inline
          </ng-option>
          @for (report of this.settingsService.getJasperReportConfigurations(); track $index) {
          <ng-option
            [value]="report"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3"/></svg>&nbsp;{{report.templateName}}
            <span style="color: #999; font-size: 0.85em">({{report.fileName}})</span>
          </ng-option>
          }
        </ng-select>
      </div>
    </div>
    }

    <!-- .jrxml code editor (editable for inline, read-only for reports-jasper/) -->
    <p></p>
    @if (xmlReporting?.documentburster.report.template.outputtype === 'output.jasper' && selectedJasperReport) {
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 2">
        Template
        @if (selectedJasperReport.filePath !== '__inline__') {
          <span class="badge badge-ghost" style="font-size: 0.75em; margin-left: 4px;">read-only</span>
        }
      </div>
      <div style="grid-column:span 10">
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
    }

    @if (askForFeatureService.alreadyImplementedFeatures.includes(xmlReporting?.documentburster.report.template.outputtype)) {
    <div>
      @if (xmlReporting?.documentburster.report.template.outputtype != 'output.none' && xmlReporting?.documentburster.report.template.outputtype != 'output.jasper') {
      <div
        style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem"
        id="reportTemplateContainer"
      >
        <div style="grid-column:span 2">
          {{(
            xmlReporting?.documentburster.report.template.outputtype === 'output.docx' ? 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TEMPLATE-DOCX' :
            xmlReporting?.documentburster.report.template.outputtype === 'output.fop2pdf' ? 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TEMPLATE-XSLFO' :
            xmlReporting?.documentburster.report.template.outputtype === 'output.any' ? 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TEMPLATE-FREEM' :
            'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.TEMPLATE-HTML'
          ) | translate}}
          <br/><br/>
          <button type="button" 
                  id="btnOpenTemplateGallery"
                  class="btn btn-sm btn-ghost" 
                  (click)="showGalleryModalForCurrentOutputType()"
                  style="margin-top: 6px"
                  >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg> {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.BUTTONS.EXAMPLES-GALLERY' | translate }}
          </button>
        </div>

        <div style="grid-column:span 10">

          <!-- Template file selector for DOCX -->
          @if (xmlReporting?.documentburster.report.template.outputtype === 'output.docx') {
          <ng-select
            id="selectTemplateFile"
            [ngModel]="selectedReportTemplateFile"
            (ngModelChange)="onSelectTemplateFileChanged($event)"
            appendTo="body"
            style="margin-bottom: 10px;"
          >
             <ng-template ng-notfound-tmp>
                <div id="noDocxTemplatesFound" class="ng-option disabled">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 text-warning"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
                  {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.NO-TEMPLATES-FOUND' | translate }}<br>
                  <code id="noDocxTemplatesFoundCode" style="background-color: #f8f8f8; padding: 4px; display: block; word-break: break-all;">
                    {{absoluteTemplateFolderPath ? absoluteTemplateFolderPath : 
                      (appPathsService.CONFIGURATION_TEMPLATES_FOLDER_PATH + '/reports/' + 
                      settingsService.currentConfigurationTemplate?.folderName)}}
                  </code>
                </div>
              </ng-template>
            
            @for (reportTemplate of settingsService.getReportTemplates(xmlReporting?.documentburster.report.template.outputtype, {samples: xmlReporting?.documentburster.report.template.documentpath?.includes('/samples/')}); track $index) {
            <ng-option
              [value]="reportTemplate"
              >
              <span id="{{reportTemplate.fileName}}">
              {{reportTemplate.fileName}}
              @if (reportTemplate.type.includes('-sample')) {
                <span>
                  {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.DIALOG.SAMPLE-LABEL' | translate }}
                </span>
              }
              </span>
            </ng-option>
            }
          </ng-select>
          }

          <!-- Shared toolbar for all output types except 'none' -->
          @if (xmlReporting?.documentburster.report.template.outputtype !== 'output.none') {
          <div class="shared-toolbar"
              style="display: flex; align-items: center;">


            <!-- Template path display (right-aligned, expanded) -->
            @if (xmlReporting?.documentburster.report.template.outputtype == 'output.docx') {
            <div style="display: flex; align-items: center; overflow: hidden; flex: 1; margin-left: auto;">
              <div id="divTruncatedAbsoluteTemplateFolderPath" class="truncated-path" 
                  style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background-color: #f8f8f8; padding: 4px 8px; border-radius: 3px; border: 1px solid #e0e0e0; margin-right: 5px; width: 100%;"
                  [title]="absoluteTemplateFolderPath || getTemplateRelativeFolderPath()">
                {{absoluteTemplateFolderPath || getTemplateRelativeFolderPath()}}
              </div>
              <button type="button" 
                      id="btnCopyTemplatePathToClipboard"
                      class="btn btn-sm btn-ghost" 
                      title="Copy path to clipboard"
                      (click)="copyTemplatePathToClipboard()">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.262c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg>
              </button>
             </div>
            }
          </div>
          }


          <!-- HTML editor for HTML, Dashboard, PDF and XLSX -->
          @if (xmlReporting?.documentburster.report.template.outputtype === 'output.html' ||
                    xmlReporting?.documentburster.report.template.outputtype === 'output.dashboard' ||
                    xmlReporting?.documentburster.report.template.outputtype === 'output.pdf' ||
                    xmlReporting?.documentburster.report.template.outputtype === 'output.xlsx') {
          <div>

              <!-- Code editor only (when preview is hidden) -->
              @if (!reportPreviewVisible) {
              <div id="codeJarHtmlTemplateEditorDiv">
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
                        class="btn btn-outline w-full" 
                        style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                        (click)="toggleHtmlPreview()">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.BUTTONS.SHOW-PREVIEW' | translate }}
                </button>
              </div>
              }

              <!-- Split pane with editor and preview -->
              @if (reportPreviewVisible) {
              <as-split direction="horizontal"
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
                            class="btn btn-outline w-full" 
                            style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                            (click)="toggleHtmlPreview()">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"/></svg> {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.BUTTONS.EXPAND-EDITOR' | translate }}
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
                    <button id="btnViewHtmlInBrowser" type="button" class="btn btn-outline w-full" 
                            style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                            (click)="openTemplateInBrowser(null, xmlReporting.documentburster.report.template.documentpath)">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg> {{ 'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.BUTTONS.VIEW-IN-BROWSER' | translate }}
                    </button>
                  </div>
                </as-split-area>
              </as-split>
              }
          </div>
          }

          <!-- Template file selector for output.fop2pdf and output.any -->
          @if (xmlReporting?.documentburster.report.template.outputtype === 'output.fop2pdf' ||
                    xmlReporting?.documentburster.report.template.outputtype === 'output.any') {
          <div>
                    @if (xmlReporting?.documentburster.report.template.outputtype === 'output.fop2pdf') {
                    <ngx-codejar
                      id="codeJarHtmlTemplateEditor"
                      [(code)]="activeReportTemplateContent"
                      (update)="saveTemplateAndRefreshPreview($event)"
                      [highlightMethod]="highlightXmlCode"
                      [highlighter]="'prism'"
                      [showLineNumbers]="true"
                      style="height: 476px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto;">
                    </ngx-codejar>
                    }
                    @if (xmlReporting?.documentburster.report.template.outputtype === 'output.any') {
                    <ngx-codejar
                      id="codeJarHtmlTemplateEditor"
                      [(code)]="activeReportTemplateContent"
                      (update)="saveTemplateAndRefreshPreview($event)"
                      [highlightMethod]="highlightFreeMarkerCode"
                      [highlighter]="'prism'"
                      [showLineNumbers]="true"
                      style="height: 476px; border: 1px solid #ccc; border-radius: 4px; overflow-y: auto;">
                    </ngx-codejar>
                    }
          </div>
          }
          
        </div>
      </div>
      }
    </div>
    }
    @if (!askForFeatureService.alreadyImplementedFeatures.includes(xmlReporting?.documentburster.report.template.outputtype)) {
    <div>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
        <div style="grid-column:span 2"></div>
        <div style="grid-column:span 5">
          <button
            type="button"
            class="btn btn-outline btn-primary w-full"
            (click)="triggerFeatureRequestDialog(xmlReporting?.documentburster.report.template.outputtype)"
          >
            <span [innerHTML]="'AREAS.CONFIGURATION.TAB-REPORT-TEMPLATE-OUTPUT.BUTTONS.REQUEST-FEATURE' | translate"></span>
          </button>
        </div>
      </div>
    </div>
    }
  </div>
</ng-template>`;
