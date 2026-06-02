export const modalHtmlPreviewTemplate = `<dp-dialog header="{{
  'COMPONENTS.BUTTON-HTML-PREVIEW.HTML-EMAIL-PREVIEW' | translate }}" [(visible)]="isModalHtmlPreviewVisible">

  <div style="width:700px;height:575px; overflow-y: auto; overflow-x: auto; ">
    <iframe id="previewIframe" srcdoc="{{ htmlCode() }}" frameborder="0"></iframe>
  </div>

  <div ngProjectAs="[footer]">
    <button id="btnClose" class="btn btn-outline btn-primary" type="button" (click)="isModalHtmlPreviewVisible = false">{{
      'BUTTONS.CLOSE' | translate }}</button>
  </div>

</dp-dialog>
`;
