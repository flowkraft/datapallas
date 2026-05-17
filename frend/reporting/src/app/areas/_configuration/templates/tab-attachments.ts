export const tabAttachmentsTemplate = `<ng-template #tabAttachmentsTemplate>
  <div class="well">

    <div class="panel panel-default">

      <div class="panel-body">

        <div class="row">

          <div class="col-xs-10" style="cursor: pointer; height:200px; overflow:auto;">

            <table id="attachmentsTable" class="table table-responsive table-hover table-bordered" cellspacing="0">

              <thead>
                <tr>
                  <th>{{
                    'AREAS.CONFIGURATION.TAB-ATTACHMENT.ATTACHMENTS' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let attachment of getSortedAttachments()" [ngClass]="{ 'info': attachment.selected }"
                  (click)="onAttachmentSelected(attachment)">
                  <td style="width: 700px">{{attachment.path}}</td>
                </tr>
                <tr *ngIf="xmlSettings?.documentburster.settings.attachments.items.attachmentItems.length ===0">
                  <td style="width: 700px">
                    <em id="noAttachments">{{
                      'AREAS.CONFIGURATION.TAB-ATTACHMENT.NO-ATTACHMENTS' | translate }}</em>
                  </td>
                </tr>
              </tbody>

            </table>

          </div>

          <div class="col-xs-2">

            <button id='btnNewAttachment' type="button" class="btn btn-default btn-block"
              (click)="onNewEditAttachment('new')">
              <span class="glyphicon
                  glyphicon-plus"></span>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.ADD' | translate }}</button>

            <button id='btnDeleteAttachment' type="button" class="btn btn-default btn-block"
              (click)="onDeleteSelectedAttachment()" [disabled]="!selectedAttachment">
              <span class="glyphicon glyphicon-minus"></span>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.DELETE' | translate }}</button>

            <button id='btnEditAttachment' type="button" class="btn btn-default btn-block"
              (click)="onNewEditAttachment('edit')" [disabled]="!selectedAttachment">
              <span class="glyphicon glyphicon-edit"></span>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.EDIT' | translate }}</button>

            <button id='btnUpAttachment' type="button" class="btn btn-default btn-block"
              (click)="onSelectedAttachmentUp()" [disabled]="!selectedAttachment">
              <span class="glyphicon glyphicon-arrow-up"></span>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.UP' | translate }}</button>

            <button id='btnDownAttachment' type="button" class="btn btn-default btn-block"
              (click)="onSelectedAttachmentDown()" [disabled]="!selectedAttachment">
              <span class="glyphicon glyphicon-arrow-down"></span>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.DOWN' | translate }}</button>

            <button id='btnClearAttachments' type="button" class="btn btn-default btn-block"
              (click)="onClearAttachments()">
              <i class="fa fa-eraser"></i>&nbsp;&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.CLEAR' | translate }}</button>

          </div>

        </div>


      </div>

    </div>




    <div class="panel panel-default">

      <div class="panel-heading">
        <i class="fa fa-file-archive-o fa-2x"></i>&nbsp;&nbsp;{{
        'AREAS.CONFIGURATION.TAB-ATTACHMENT.ARCHIVE-ATTACHMENTS' | translate }}</div>

      <div class="panel-body">

        <div class="row">

          <div class="col-xs-2">

          </div>

          <div class="col-xs-7">
            <input type="checkbox" id="btnArchiveAttachmentsTogether"
              [(ngModel)]="xmlSettings?.documentburster.settings.attachments.archive.archiveattachments"
              (ngModelChange)='markSettingsDirty($event)' />
            <label for="btnArchiveAttachmentsTogether" class="checkboxlabel">&nbsp;{{
              'AREAS.CONFIGURATION.TAB-ATTACHMENT.ARCHIVE-ALL-ATTACHMENTS' | translate }}</label>
          </div>

          <div class="col-xs-3">
          </div>

        </div>

        <div class="row">

          <div class="col-xs-2">
            {{
            'AREAS.CONFIGURATION.TAB-ATTACHMENT.FILE-NAME' | translate }}
          </div>

          <div class="col-xs-7">
            <input id="archiveFileName"
              [(ngModel)]="xmlSettings?.documentburster.settings.attachments.archive.archivefilename"
              (ngModelChange)='markSettingsDirty($event)' class="form-control" />
          </div>

          <div class="col-xs-3">
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
