import { Component, OnInit } from '@angular/core';
import { Subject } from 'rxjs';

import { FormsModule } from '@angular/forms';
import { DpDialogComponent } from '../dp/dialog/dp-dialog.component';

@Component({
  selector: 'dburst-confirm-dialog',
  standalone: true,
  imports: [DpDialogComponent, FormsModule],
  template: `
    <dp-dialog id="confirmDialog" [header]="title" [(visible)]="isVisible" (visibleChange)="onVisibleChange($event)">
      <div [innerHTML]="message"></div>
      @if (confirmationText) {
        <div style="margin-top:10px;">
          <label style="font-size: 0.9em; color: #777;">Type <strong>{{confirmationText}}</strong> to confirm</label>
          <input type="text" [(ngModel)]="confirmInput" class="input input-bordered input-sm" style="margin-top:6px;" />
        </div>
      }
      <div ngProjectAs="[footer]">
        <button
          type="button"
          class="btn btn-primary dburst-button-question-confirm"
          (click)="confirm()"
          [innerHTML]="confirmLabel"
          [disabled]="!!(confirmationText && confirmInput !== confirmationText)"
        ></button>
        <button
          type="button"
          class="btn btn-secondary dburst-button-question-decline"
          (click)="decline()"
          [innerHTML]="declineLabel"
        ></button>
      </div>
    </dp-dialog>
  `,
})
export class ConfirmDialogComponent implements OnInit {
  isVisible = true;
  onClose = new Subject<boolean>();
  title = 'Confirmation';
  message = '';
  confirmLabel = 'Yes';
  declineLabel = 'No';
  confirmAction?: Function;
  confirmationText?: string;
  confirmInput = '';

  ngOnInit(): void {
    this.confirmInput = '';
  }

  confirm() {
    if (this.confirmationText && this.confirmInput !== this.confirmationText) return;
    if (this.confirmAction) this.confirmAction();
    this._close(true);
  }

  decline() {
    this._close(false);
  }

  onVisibleChange(visible: boolean) {
    if (!visible) this._close(false);
  }

  private _close(result: boolean) {
    if (this.onClose.isStopped) return;
    this.isVisible = false;
    this.onClose.next(result);
    this.onClose.complete();
  }
}
