export const tabEmailMessageTemplate = `<ng-template #tabEmailMessageTemplate>
  <div class="space-y-4">

    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

      <div style="grid-column:span 1">{{
        'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.TO' | translate }}</div>
      <div style="grid-column:span 8">
        <input id="emailToAddress" [ngModel]="xmlSettings?.documentburster?.settings?.emailsettings?.to"
          (ngModelChange)="setXmlPath('documentburster.settings.emailsettings.to', $event)" class="input" />
      </div>

      <div style="grid-column:span 3">
        <dburst-button-variables id="btnEmailToAddressVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('emailToAddress',$event)">
</dburst-button-variables>
      </div>

    </div>

    <p>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

        <div style="grid-column:span 1">{{
          'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.CC' | translate }}</div>
        <div style="grid-column:span 8">
          <input id="emailCcAddress" [ngModel]="xmlSettings?.documentburster?.settings?.emailsettings?.cc"
            (ngModelChange)="setXmlPath('documentburster.settings.emailsettings.cc', $event)" class="input" />
        </div>

        <div style="grid-column:span 3">
          <dburst-button-variables id="btnEmailCcAddressVariables"
            (sendSelectedVariable)="updateFormControlWithSelectedVariable('emailCcAddress',$event)">
</dburst-button-variables>
        </div>

      </div>

      <p>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

          <div style="grid-column:span 1">{{
            'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.BCC' | translate }}</div>
          <div style="grid-column:span 8">
            <input id="emailBccAddress" [ngModel]="xmlSettings?.documentburster?.settings?.emailsettings?.bcc"
              (ngModelChange)="setXmlPath('documentburster.settings.emailsettings.bcc', $event)" class="input" />
          </div>

          <div style="grid-column:span 3">
            <dburst-button-variables id="btnEmailBccAddressVariables"
              (sendSelectedVariable)="updateFormControlWithSelectedVariable('emailBccAddress',$event)">
</dburst-button-variables>
          </div>

        </div>

        <p>
          <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

            <div style="grid-column:span 1">{{
              'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.SUBJECT' | translate }}</div>
            <div style="grid-column:span 8">
              <input id="emailSubject" [ngModel]="xmlSettings?.documentburster?.settings?.emailsettings?.subject"
                (ngModelChange)="setXmlPath('documentburster.settings.emailsettings.subject', $event)" class="input" />
            </div>

            <div style="grid-column:span 3">
              <dburst-button-variables id="btnEmailSubjectVariables"
                (sendSelectedVariable)="updateFormControlWithSelectedVariable('emailSubject',$event)">
</dburst-button-variables>
            </div>

          </div>

          <p></p>

          <!-- Message row with label -->
          <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
            <div style="grid-column:span 1">{{
              'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.MESSAGE' | translate }}</div>
            <div style="grid-column:span 8">
              <!-- Split Button Dropdown -->
              @if (xmlSettings?.documentburster.settings.htmlemail && xmlSettings?.documentburster.settings.htmlemaileditcode) {
              <div class="dropdown dropdown-end">
                <!-- Primary button - direct action -->
                <button type="button" id="btnAskAiForHelp" tabindex="0" role="button" class="btn btn-ghost" (click)="askAiForHelp('email.message')">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"/></svg> Hey AI, Help Me Get a Custom Email (HTML) Template ... &#9660;
                </button>

                <!-- Dropdown menu -->
                <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-[1050] min-w-max p-2">
                  <li>
                      <a href="javascript:void(0)" id="btnAskAiForHelpDropdownItem" (click)="askAiForHelp('email.message')">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"/></svg> Hey AI, Help Me Get a Custom Email (HTML) Template ...
                      </a>
                    </li>
                  <li>
                      <a href="javascript:void(0)" id="btnOpenTemplateGalleryDropdownItem" (click)="showGalleryModalForCurrentOutputType('email.message')">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg> {{ 'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.BUTTONS.EXAMPLES-GALLERY' | translate }}
                    </a>
                  </li>
                </ul>
              </div>
              }
            </div>
            <div style="grid-column:span 3">
              @if (xmlSettings?.documentburster.settings.htmlemail && xmlSettings?.documentburster.settings.htmlemaileditcode) {
                <dburst-button-variables
                  id="btnHtmlCodeEmailMessageVariables"
                  (sendSelectedVariable)="updateFormControlWithSelectedVariable('htmlCodeEmailMessage',$event)">
</dburst-button-variables>
              }
              @if (xmlSettings?.documentburster.settings.htmlemail && !xmlSettings?.documentburster.settings.htmlemaileditcode) {
                <dburst-button-variables id="btnWysiwygEmailMessageVariables"
                  (sendSelectedVariable)="updateQuillFormControlWithSelectedVariable($event)">
</dburst-button-variables>
              }
            </div>
          </div>
          
          <!-- Editor row (full width) -->
          <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem;margin-top: 5px; resize: vertical; overflow: auto; min-height: 150px; max-height: 75vh;">
            <div style="grid-column:span 12;display:flex; flex-direction:column; height:100%;">
              <!-- WYSIWYG editor -->
              @if (xmlSettings?.documentburster.settings.htmlemail &&
                !xmlSettings?.documentburster.settings.htmlemaileditcode) {
                <dp-editor [style]="{'height':'100%', 'flex':'1 1 auto', 'min-height':'0'}"
                  id="wysiwygEmailMessage"
                  [ngModel]="xmlSettings?.documentburster?.settings?.emailsettings?.html"
                  (onTextChange)="markSettingsDirtyFromQuill($event)"
                  (onSelectionChange)="onEditorSelectionChanged($event)"
                  (onInit)="onEditorCreated($event)"
                ></dp-editor>
              }

              <!-- Enhanced HTML code editor with preview -->
              @if (xmlSettings?.documentburster.settings.htmlemail && xmlSettings?.documentburster.settings.htmlemaileditcode) {
                <div>
                <!-- Code editor only (when preview is hidden) -->
                @if (!emailPreviewVisible) {
                <div id="codeJarHtmlEmailEditorDiv">
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
                          class="btn btn-outline w-full" 
                          style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                          (click)="toggleEmailPreview()">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> {{ 'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.BUTTONS.SHOW-PREVIEW' | translate }}
                  </button>
                </div>
                }

                <!-- Split pane with editor and preview -->
                @if (emailPreviewVisible) {
                <as-split direction="horizontal"
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
                              class="btn btn-outline w-full" 
                              style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                              (click)="toggleEmailPreview()">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"/></svg> {{ 'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.BUTTONS.EXPAND-EDITOR' | translate }}
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
                      <button id="btnViewEmailInBrowser" type="button" class="btn btn-outline w-full" 
                              style="border-top-left-radius: 0; border-top-right-radius: 0; margin: 0; border: 1px solid #ddd; border-top: none; box-sizing: border-box;"
                              (click)="openTemplateInBrowser(null, settingsService.currentConfigurationTemplatePath)">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg> {{ 'AREAS.CONFIGURATION.TAB-EMAIL-MESSAGE.BUTTONS.VIEW-IN-BROWSER' | translate }}
                      </button>
                    </div>
                  </as-split-area>
                </as-split>
                }
              </div>
              }

              <!-- Plain text editor -->
              @if (!xmlSettings?.documentburster.settings.htmlemail) {
                <textarea class="textarea textarea-bordered" rows="14" id="textEmailMessage"
                  [ngModel]="xmlSettings?.documentburster?.settings?.emailsettings?.text"
                  (ngModelChange)="setXmlPath('documentburster.settings.emailsettings.text', $event)"></textarea>
              }
            </div>
          </div>

  </div>

</ng-template>
`;
