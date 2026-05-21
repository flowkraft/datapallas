import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DpDialogComponent } from '../dp/dialog/dp-dialog.component';
import { modalHtmlPreviewTemplate } from './modal-html-preview.template';

@Component({
    selector: 'dburst-button-html-preview',
    template: `
    <button
      type="button"
      id="btnHtmlEmailPreview"
      class="btn"
      (click)="onClick()"
      style="margin-top: 100px; margin-bottom: 50px; width: 100%;"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> Preview
    </button>
    ${modalHtmlPreviewTemplate}
  `,
    standalone: true,
    imports: [CommonModule, TranslateModule, DpDialogComponent],
})
export class ButtonHtmlPreviewComponent {
  htmlCode = input<string>();

  protected isModalHtmlPreviewVisible = false;

  constructor() {}

  onClick() {
    this.isModalHtmlPreviewVisible = true;
  }

  onCloseModal() {
    this.isModalHtmlPreviewVisible = false;
  }
}
