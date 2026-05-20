import { Component, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { DpDialogComponent } from '../dp/dialog/dp-dialog.component';

@Component({
    selector: 'dburst-info-dialog',
    imports: [DpDialogComponent],
    template: `
    <dp-dialog [header]="title" [(visible)]="isVisible" (visibleChange)="onVisibleChange($event)">
      <div [innerHTML]="message"></div>
      <div ngProjectAs="[footer]">
        <button
          type="button"
          class="btn btn-primary dburst-button-question-confirm"
          (click)="confirm()"
          [innerHTML]="confirmLabel"
        ></button>
      </div>
    </dp-dialog>
  `
})
export class InfoDialogComponent implements OnInit {
  isVisible = true;
  onClose = new Subject<boolean>();
  title = 'Information';
  message = '';
  confirmLabel = 'OK';

  ngOnInit(): void {}

  confirm() {
    this._close(true);
  }

  onVisibleChange(visible: boolean) {
    if (!visible) this._close(true);
  }

  private _close(result: boolean) {
    if (this.onClose.isStopped) return;
    this.isVisible = false;
    this.onClose.next(result);
    this.onClose.complete();
  }
}
