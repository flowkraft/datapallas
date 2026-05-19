import {
  AfterViewInit,
  Component,
  ElementRef,
  effect,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { NgStyle } from '@angular/common';

@Component({
  selector: 'dp-dialog',
  standalone: true,
  imports: [NgStyle],
  styles: [`
    /* Reset browser chrome on the dialog element itself */
    dialog {
      padding: 0;
      border: none;
      background: transparent;
      overflow: visible;
      color: inherit;
      max-width: unset;
      max-height: unset;
    }
    /* Fill the viewport as a centering grid — only when open.
       browser default display:none for :not([open]) is preserved. */
    dialog[open] {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
    }
    /* Visible modal box — always white, always visible */
    .dp-dialog-box {
      position: relative;
      background: #fff;
      border-radius: 8px;
      padding: 1.5rem;
      max-width: 90vw;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      z-index: 1;
    }
    /* Close button — top-right of the box */
    .dp-close-btn {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      width: 1.75rem;
      height: 1.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: 1px solid #e5e7eb;
      background: transparent;
      cursor: pointer;
      font-size: 0.875rem;
      line-height: 1;
      padding: 0;
    }
    .dp-close-btn:hover { background: #f3f4f6; }
    /* Footer actions row */
    .modal-action {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      padding-top: 1rem;
    }
  `],
  template: `
    <dialog
      #dlg
      class="modal"
      [attr.aria-labelledby]="headerId"
      (close)="onNativeClose()"
      (click)="onDialogClick($event)"
    >
      <div class="modal-box dp-dialog-box" [ngStyle]="style()" (click)="$event.stopPropagation()">
        @if (closable()) {
          <button
            class="dp-close-btn"
            type="button"
            (click)="close()"
            aria-label="Close"
          >✕</button>
        }
        <h3 [id]="headerId" class="font-bold text-lg pr-8">{{ header() }}</h3>
        <ng-content></ng-content>
        <div class="modal-action">
          <ng-content select="[footer]"></ng-content>
        </div>
      </div>
    </dialog>
  `,
})
export class DpDialogComponent implements AfterViewInit {
  header = input<string>('');
  visible = model<boolean>(false);
  modal = input<boolean>(true);
  closable = input<boolean>(true);
  style = input<Record<string, string>>({});
  /** Kept for drop-in API compatibility with p-dialog; z-index is managed by the browser top-layer. */
  baseZIndex = input<number>(1000);

  onShow = output<void>();
  onHide = output<void>();

  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  readonly headerId = `dp-dlg-${Math.random().toString(36).slice(2, 8)}`;
  private viewReady = false;

  constructor() {
    // React to visible signal changes after view is ready
    effect(() => {
      const v = this.visible();
      if (!this.viewReady) return;
      v ? this.openDialog() : this.closeDialog();
    });
  }

  ngAfterViewInit() {
    this.viewReady = true;
    if (this.visible()) this.openDialog();
  }

  close() {
    this.dlg().nativeElement.close();
  }

  private openDialog() {
    const el = this.dlg().nativeElement;
    if (!el.open) {
      el.showModal();
      this.onShow.emit();
    }
  }

  private closeDialog() {
    const el = this.dlg().nativeElement;
    if (el.open) el.close();
  }

  onNativeClose() {
    this.visible.set(false);
    this.onHide.emit();
  }

  onDialogClick(event: MouseEvent) {
    if (this.closable() && event.target === this.dlg().nativeElement) {
      this.close();
    }
  }
}
