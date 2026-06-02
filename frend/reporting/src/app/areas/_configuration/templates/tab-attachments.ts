export const tabAttachmentsTemplate = `<ng-template #tabAttachmentsTemplate>
  <div class="space-y-4">

    <div class="card card-border">

      <div class="card-body">

        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

          <div style="grid-column:span 10;cursor: pointer; height:200px; overflow:auto;">

            <table id="attachmentsTable" class="table" cellspacing="0">

              <thead>
                <tr>
                  <th>{{
                    'AREAS.CONFIGURATION.TAB-ATTACHMENT.ATTACHMENTS' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (attachment of getSortedAttachments(); track $index) {
                  <tr [ngClass]="{'bg-primary/10': attachment.selected}"
                    (click)="onAttachmentSelected(attachment)">
                    <td style="width: 700px">{{attachment.path}}</td>
                  </tr>
                }
                @if (xmlSettings?.documentburster.settings.attachments.items.attachmentItems.length ===0) {
                  <tr>
                    <td style="width: 700px">
                      <em id="noAttachments">{{
                        'AREAS.CONFIGURATION.TAB-ATTACHMENT.NO-ATTACHMENTS' | translate }}</em>
                    </td>
                  </tr>
                }
              </tbody>

            </table>

          </div>

          <div style="grid-column:span 2">

            <button id='btnNewAttachment' type="button" class="btn btn-outline w-full"
              (click)="onNewEditAttachment('new')">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.ADD' | translate }}</button>

            <div class="mt-2 space-y-1">
            <button id='btnDeleteAttachment' type="button" class="btn btn-outline w-full"
              (click)="onDeleteSelectedAttachment()" [disabled]="!selectedAttachment">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14"/></svg>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.DELETE' | translate }}</button>

            <button id='btnEditAttachment' type="button" class="btn btn-outline w-full"
              (click)="onNewEditAttachment('edit')" [disabled]="!selectedAttachment">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.EDIT' | translate }}</button>

            <button id='btnUpAttachment' type="button" class="btn btn-outline w-full"
              (click)="onSelectedAttachmentUp()" [disabled]="!selectedAttachment">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75"/></svg>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.UP' | translate }}</button>

            <button id='btnDownAttachment' type="button" class="btn btn-outline w-full"
              (click)="onSelectedAttachmentDown()" [disabled]="!selectedAttachment">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75"/></svg>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.DOWN' | translate }}</button>

            <button id='btnClearAttachments' type="button" class="btn btn-outline w-full"
              (click)="onClearAttachments()">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.374-6.375a1.125 1.125 0 010-1.59L9.54 4.72a1.125 1.125 0 011.59 0l7.124 7.126a1.125 1.125 0 010 1.59l-3.873 3.873a1.125 1.125 0 01-1.59 0z"/></svg>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.CLEAR' | translate }}</button>
            </div>

          </div>

        </div>


      </div>

    </div>




    <div class="card card-border">

      <div class="card-title">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.75 7.5h16.5M12 3h.008v.008H12V3zm0 3h.008v.008H12V6zm0 3h.008v.008H12V9z"/></svg>&nbsp;&nbsp;{{
        'AREAS.CONFIGURATION.TAB-ATTACHMENT.ARCHIVE-ATTACHMENTS' | translate }}</div>

      <div class="card-body">

        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

          <div style="grid-column:span 2">

          </div>

          <div style="grid-column:span 7">
            <input type="checkbox" id="btnArchiveAttachmentsTogether"
              [ngModel]="xmlSettings?.documentburster?.settings?.attachments?.archive?.archiveattachments"
              (ngModelChange)="setXmlPath('documentburster.settings.attachments.archive.archiveattachments', $event)" />
            <label for="btnArchiveAttachmentsTogether" class="checkboxlabel">&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.ARCHIVE-ALL-ATTACHMENTS' | translate }}</label>
          </div>

          <div style="grid-column:span 3">
          </div>

        </div>

        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">

          <div style="grid-column:span 2">
            {{
            'AREAS.CONFIGURATION.TAB-ATTACHMENT.FILE-NAME' | translate }}
          </div>

          <div style="grid-column:span 7">
            <input id="archiveFileName"
              [ngModel]="xmlSettings?.documentburster?.settings?.attachments?.archive?.archivefilename"
              (ngModelChange)="setXmlPath('documentburster.settings.attachments.archive.archivefilename', $event)" class="input" />
          </div>

          <div style="grid-column:span 3">
            <dburst-button-variables id="btnArchiveFileNameVariables"
              (sendSelectedVariable)="updateFormControlWithSelectedVariable('archiveFileName',$event)">
            </dburst-button-variables>

          </div>

        </div>

      </div>

    </div>

  </div>
</ng-template>
`;
