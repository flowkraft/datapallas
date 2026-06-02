export const modalAttachmentTemplate = `@if (isModalAttachmentVisible) {
<dp-dialog id="modalSelectAttachment"
  header="{{ 'AREAS.CONFIGURATION.MODAL-ATTACHMENT.SELECT-ATTACHMENT' | translate }}"
  [(visible)]="isModalAttachmentVisible"
>
  <div class="modal-body" id="modal-body" style="height: 250px">
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
      <div style="grid-column:span 1">
        {{ 'AREAS.CONFIGURATION.MODAL-ATTACHMENT.PATH' | translate }}
      </div>

      <div style="grid-column:span 7">
        <input
          id="attachmentPath"
          class="input"
          [ngModel]="modalAttachmentInfo.attachmentFilePath"
          (ngModelChange)="modalAttachmentInfo.attachmentFilePath = $event"
          size="52"
        />
      </div>

      <div style="grid-column:span 2">
        <dburst-button-variables
          id="btnAttachmentPathVariables"
          (sendSelectedVariable)="updateFormControlWithSelectedVariable('attachmentPath',$event)"
        >
        </dburst-button-variables>
      </div>

      <div style="grid-column:span 2">
        <!--
        <dburst-button-native-system-dialog
          dialogType="file"
          (pathsSelected)="onSelectAttachmentFilePath($event)"
        >
        </dburst-button-native-system-dialog>
        -->
      </div>
    </div>
  </div>
  <div ngProjectAs="[footer]">
    <button
      id="btnOKConfirmation"
      class="btn btn-outline btn-primary dburst-button-question-confirm-attachment"
      type="button"
      (click)="onOKAttachmentModal()"
      [disabled]="!modalAttachmentInfo.attachmentFilePath"
    >
      {{ 'BUTTONS.OK' | translate }}
    </button>
    <button
      class="btn btn-ghost"
      type="button"
      (click)="onCancelAttachmentModal()"
    >
      {{ 'BUTTONS.CANCEL' | translate }}
    </button>
  </div>
</dp-dialog>
}
`;
