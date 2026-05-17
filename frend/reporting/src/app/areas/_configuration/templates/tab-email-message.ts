export const tabEmailMessageTemplate = `<ng-template #tabEmailMessageTemplate>
  <div class="well">

    <div class="row">

      <div class="col-xs-1">{{
        'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.TO' | translate }}</div>
      <div class="col-xs-8">
        <input id="emailToAddress" [(ngModel)]="xmlSettings?.documentburster.settings.emailsettings.to"
          (ngModelChange)='markSettingsDirty($event)' class="form-control" />
      </div>

      <div class="col-xs-3">
        <dburst-button-variables id="btnEmailToAddressVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('emailToAddress',$event)">
</dburst-button-variables>
      </div>

    </div>

    <p>
      <div class="row">

        <div class="col-xs-1">{{
          'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.CC' | translate }}</div>
        <div class="col-xs-8">
          <input id="emailCcAddress" [(ngModel)]="xmlSettings?.documentburster.settings.emailsettings.cc"
            (ngModelChange)='markSettingsDirty($event)' class="form-control" />
        </div>

        <div class="col-xs-3">
          <dburst-button-variables id="btnEmailCcAddressVariables"
            (sendSelectedVariable)="updateFormControlWithSelectedVariable('emailCcAddress',$event)">
</dburst-button-variables>
        </div>

      </div>

      <p>
        <div class="row">

          <div class="col-xs-1">{{
            'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.BCC' | translate }}</div>
          <div class="col-xs-8">
            <input id="emailBccAddress" [(ngModel)]="xmlSettings?.documentburster.settings.emailsettings.bcc"
              (ngModelChange)='markSettingsDirty($event)' class="form-control" />
          </div>

          <div class="col-xs-3">
            <dburst-button-variables id="btnEmailBccAddressVariables"
              (sendSelectedVariable)="updateFormControlWithSelectedVariable('emailBccAddress',$event)">
</dburst-button-variables>
          </div>

        </div>

        <p>
          <div class="row">

            <div class="col-xs-1">{{
              'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.SUBJECT' | translate }}</div>
            <div class="col-xs-8">
              <input id="emailSubject" [(ngModel)]="xmlSettings?.documentburster.settings.emailsettings.subject"
                (ngModelChange)='markSettingsDirty($event)' class="form-control" />
            </div>

            <div class="col-xs-3">
              <dburst-button-variables id="btnEmailSubjectVariables"
                (sendSelectedVariable)="updateFormControlWithSelectedVariable('emailSubject',$event)">
</dburst-button-variables>
            </div>

          </div>

          <p></p>

          <!-- Message row with label -->
          <div class="row">
            <div class="col-xs-1">{{
              'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.MESSAGE' | translate }}</div>
            <div class="col-xs-8">
              <!-- Split Button Dropdown -->
              <div class="btn-group" *ngIf="xmlSettings?.documentburster.settings.htmlemail && xmlSettings?.documentburster.settings.htmlemaileditcode">
                <!-- Primary button - direct action -->
                <button type="button" id="btnAskAiForHelp" class="btn btn-default" (click)="askAiForHelp('email.message')">
                  <i class="fa fa-magic"></i> Hey AI, Help Me Get a Custom Email (HTML) Template ...
                </button>
                
                <!-- Dropdown toggle button -->
                <button type="button" id="btnAskAiForHelpDropdownToggle" class="btn btn-default dropdown-toggle" data-toggle="dropdown">
                  <span class="caret"></span>
                </button>
                
                <!-- Dropdown menu -->
                <ul class="dropdown-menu" role="menu">
                  <li>
                      <a href="javascript:void(0)" id="btnAskAiForHelpDropdownItem" (click)="askAiForHelp('email.message')">
                        <i class="fa fa-magic"></i> Hey AI, Help Me Get a Custom Email (HTML) Template ...
                      </a>
                    </li>  
                  <li>
                      <a href="javascript:void(0)" id="btnOpenTemplateGalleryDropdownItem" (click)="showGalleryModalForCurrentOutputType('email.message')">
                      <i class="fa fa-list-alt"></i> {{ 'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.BUTTONS.EXAMPLES-GALLERY' | translate }}
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div class="col-xs-3">
              <dburst-button-variables
                id="btnHtmlCodeEmailMessageVariables"
                (sendSelectedVariable)="updateFormControlWithSelectedVariable('htmlCodeEmailMessage',$event)" *ngIf="xmlSettings?.documentburster.settings.htmlemail && xmlSettings?.documentburster.settings.htmlemaileditcode">
</dburst-button-variables>
              <dburst-button-variables id="btnWysiwygEmailMessageVariables"
                (sendSelectedVariable)="updateQuillFormControlWithSelectedVariable($event)"
                *ngIf="xmlSettings?.documentburster.settings.htmlemail && !xmlSettings?.documentburster.settings.htmlemaileditcode">
</dburst-button-variables>
            </div>
          </div>
          
          <!-- Editor row (full width) -->
          <div class="row" style="margin-top: 5px; resize: vertical; overflow: auto; min-height: 150px; max-height: 75vh;">
            <div class="col-xs-12" style="display:flex; flex-direction:column; height:100%;">
              <!-- WYSIWYG editor -->
              <p-editor style="height:100%; flex:1 1 auto; min-height:0;"
                id="wysiwygEmailMessage"
                *ngIf="xmlSettings?.documentburster.settings.htmlemail && 
                !xmlSettings?.documentburster.settings.htmlemaileditcode"
                [(ngModel)]="xmlSettings?.documentburster.settings.emailsettings.html"
                (onTextChange)="markSettingsDirtyFromQuill($event)"
                (onSelectionChange)="onEditorSelectionChanged($event)"
                (onInit)="onEditorCreated($event)">
                <ng-template pTemplate="header">
                  <span class="ql-formats">
                    <button type="button" class="ql-bold" aria-label="Bold"></button>
                    <button type="button" class="ql-italic" aria-label="Italic"></button>
                    <button type="button" class="ql-underline" aria-label="Underline"></button>
                  </span>
                  <span class="ql-formats">
                    <button class="ql-list" value="ordered" aria-label="Ordered List" type="button"></button>
                    <button class="ql-list" value="bullet" aria-label="Unordered List" type="button"></button>
                  </span>
                </ng-template>
              </p-editor>

              <!-- Enhanced HTML code editor with preview -->
              <div *ngIf="xmlSettings?.documentburster.settings.htmlemail && xmlSettings?.documentburster.settings.htmlemaileditcode">
                <!-- Code editor only (when preview is hidden) -->
                <div id="codeJarHtmlEmailEditorDiv" *ngIf="!emailPreviewVisible">
                  <ngx-codejar
                    id="codeJarHtmlEmailEditor"  
                    [(code)]="xmlSettings.documentburster.settings.emailsettings.html"
                    (update)="onEmailHtmlContentChanged($event)"
                    [highlightMethod]="highlightHtmlCode"
                    [highlighter]="'prism'"
                    [showLineNumbers]="true"
                    style="height: 310px; border: 1px solid #ccc; border-radius: 4px 4px 0 0; overflow-y: auto;"
                  ></ngx-codejar>
                  <button type="button" 
                          id="btnToggleEmailPreviewShow"
                          class="btn btn-default btn-block" 
                          style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                          (click)="toggleEmailPreview()">
                    <i class="fa fa-eye"></i> {{ 'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.BUTTONS.SHOW-PREVIEW' | translate }}
                  </button>
                </div>

                <!-- Split pane with editor and preview -->
                <as-split *ngIf="emailPreviewVisible" direction="horizontal" 
                          [gutterSize]="8" [useTransition]="true"
                          style="height: 340px;">
                  
                  <!-- Editor Pane -->
                  <as-split-area [size]="50" [minSize]="20">
                    <div id="codeJarHtmlEmailEditorDiv" style="height: 100%; display: flex; flex-direction: column;">
                      <ngx-codejar
                        id="codeJarHtmlEmailEditor"
                        [(code)]="xmlSettings.documentburster.settings.emailsettings.html"
                        (update)="onEmailHtmlContentChanged($event)"
                        [highlightMethod]="highlightHtmlCode"
                        [highlighter]="'prism'"
                        [showLineNumbers]="true"
                        style="flex: 1; border: 1px solid #ccc; border-radius: 4px 4px 0 0; overflow-y: auto;"
                      ></ngx-codejar>
                      <button type="button" 
                              id="btnToggleEmailPreviewHide"
                              class="btn btn-default btn-block" 
                              style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                              (click)="toggleEmailPreview()">
                        <i class="fa fa-code"></i> {{ 'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.BUTTONS.EXPAND-EDITOR' | translate }}
                      </button>
                    </div>
                  </as-split-area>
                  
                  <!-- Preview Pane -->
                  <as-split-area [size]="50" [minSize]="20">
                    <div class="preview-container" style="height: 100%; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;">
                      <iframe 
                              id="emailPreviewPane"
                              [srcdoc]="sanitizedEmailPreview" 
                              style="width: 100%; flex: 1; border: 1px solid #ddd; border-radius: 4px 4px 0 0; overflow: auto; box-sizing: border-box;" 
                              frameborder="0">
                      </iframe>
                      <button id="btnViewEmailInBrowser" type="button" class="btn btn-default btn-block" 
                              style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                              (click)="openTemplateInBrowser(null, settingsService.currentConfigurationTemplatePath)">
                        <i class="fa fa-external-link"></i> {{ 'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.BUTTONS.VIEW-IN-BROWSER' | translate }}
                      </button>
                    </div>
                  </as-split-area>
                </as-split>
              </div>

              <!-- Plain text editor -->
              <textarea class="form-control" rows="14" id="textEmailMessage"
                *ngIf="!xmlSettings?.documentburster.settings.htmlemail"
                [(ngModel)]="xmlSettings?.documentburster.settings.emailsettings.text"
                (ngModelChange)='markSettingsDirty($event)'></textarea>
            </div>
          </div>

  </div>

</ng-template>
`;
