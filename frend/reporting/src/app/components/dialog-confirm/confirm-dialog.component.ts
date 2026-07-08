import { Component, ElementRef, OnInit, inject } from '@angular/core';
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
          <input type="text" [(ngModel)]="confirmInput" class="input input-sm" style="margin-top:6px;" />
        </div>
      }
      <div ngProjectAs="[footer]">
        <button
          id="btnConfirmDialogYes"
          type="button"
          class="btn btn-outline btn-primary dburst-button-question-confirm"
          (click)="confirm()"
          [innerHTML]="confirmLabel"
          [disabled]="!!(confirmationText && confirmInput !== confirmationText)"
        ></button>
        <button
          id="btnConfirmDialogNo"
          type="button"
          class="btn btn-outline ml-2 dburst-button-question-decline"
          (click)="decline()"
          [innerHTML]="declineLabel"
        ></button>
      </div>
    </dp-dialog>
  `
})
export class ConfirmDialogComponent implements OnInit {
  private elRef = inject(ElementRef<HTMLElement>);

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
    // Close FIRST, then run confirmAction. This matches the original ngx-bootstrap
    // behavior (main branch): bsModalRef.hide() → onClose.next → confirmAction().
    // Critical when confirmAction chains another askConfirmation() — opening the
    // next dialog before closing this one leaves both visible simultaneously, so
    // `waitOnConfirmDialogToBecomeInvisible` (count==0) between chained confirms
    // never succeeds. e.g. doTestSMTPConnection: "Save now?" → "Send test email?".
    this._close(true);
    if (this.confirmAction) this.confirmAction();
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
    // Force-hide the entire component subtree synchronously. Setting display:none
    // on the host element is the only path that's guaranteed to make Playwright's
    // `:visible` return false in the same task — independent of Angular CD timing,
    // dp-dialog's effect scheduling, or browser top-layer quirks for native <dialog>.
    // Necessary to match main's ngx-bootstrap behavior where bsModalRef.hide() was a
    // synchronous DOM removal. The component is still destroyed 300ms later by
    // ConfirmService, this just hides it in the meantime.
    const host = this.elRef.nativeElement as HTMLElement;
    host.style.display = 'none';
    const dlg = host.querySelector('dialog') as HTMLDialogElement | null;
    if (dlg?.open) {
      try { dlg.close(); } catch { /* already closing */ }
    }
  }
}
