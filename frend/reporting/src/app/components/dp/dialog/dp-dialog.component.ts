import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
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
    /* Theme-aware modal box — picks up the current daisyUI theme so it never
       looks like a foreign white panel sitting on top of a colored theme. */
    .dp-dialog-box {
      position: relative;
      display: flex;
      flex-direction: column;
      background: var(--color-base-100);
      color: var(--color-base-content);
      border-radius: var(--radius-box, 8px);
      padding: 1rem 1.5rem;
      max-width: 90vw;
      max-height: 85vh;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px color-mix(in oklab, var(--color-base-content) 25%, transparent);
      z-index: 1;
    }
    /* Scrollable body — the ONLY part of the dialog that scrolls. The header
       (drag handle) and footer (modal-action) stay pinned, so dialog action
       buttons are always visible no matter how tall the projected content is. */
    .dp-dialog-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
    }
    /* Close button — top-right of the box, theme-aware bordered circle. */
    .dp-close-btn {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      z-index: 10;
      width: 1.75rem;
      height: 1.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: 1px solid var(--color-base-300);
      background: transparent;
      color: var(--color-base-content);
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
      padding: 0;
    }
    .dp-close-btn:hover { background: var(--color-base-200); }
    /* Drag handle — a Windows-style title bar that fills the WHOLE top of the
       modal (negative margins eat into the box's 1.5rem padding so the user
       gets the grab cursor on the entire header strip, not just on the title
       text). Hand cursor on hover, closed-fist while actually dragging. */
    .dp-drag-handle {
      flex: 0 0 auto;
      margin: -1.5rem -1.5rem 0;
      padding: 1.5rem 1.5rem 0.5rem;
      cursor: grab;
      user-select: none;
    }
    .dp-drag-handle:active,
    .dp-drag-handle.dp-dragging {
      cursor: grabbing;
    }
    .dp-drag-handle h3 {
      margin: 0;
    }
    /* Footer actions row */
    .modal-action {
      flex: 0 0 auto;
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
      [attr.aria-labelledby]="effectiveHeaderId"
      (close)="onNativeClose()"
      (click)="onDialogClick($event)"
    >
      <div #box class="modal-box dp-dialog-box"
        [ngStyle]="boxStyles()"
        (click)="$event.stopPropagation()">
        @if (closable()) {
          <button
            [id]="closeId() || null"
            class="dp-close-btn"
            type="button"
            (click)="close()"
            aria-label="Close"
          >&times;</button>
        }
        <div class="dp-drag-handle"
             [class.dp-dragging]="dragging"
             (mousedown)="onDragStart($event)">
          <h3 [id]="effectiveHeaderId" class="font-bold text-lg pr-8">{{ header() }}</h3>
        </div>
        <div class="dp-dialog-body">
          <ng-content></ng-content>
        </div>
        <div class="modal-action">
          <ng-content select="[footer]"></ng-content>
        </div>
      </div>
    </dialog>
  `
})
export class DpDialogComponent implements AfterViewInit {
  header = input<string>('');
  headerId = input<string | undefined>(undefined);
  closeId = input<string | undefined>(undefined);
  visible = model<boolean>(false);
  modal = input<boolean>(true);
  closable = input<boolean>(true);
  style = input<Record<string, string>>({});
  /** Kept for drop-in API compatibility with p-dialog; z-index is managed by the browser top-layer. */
  baseZIndex = input<number>(1000);

  onShow = output<void>();
  onHide = output<void>();

  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private box = viewChild.required<ElementRef<HTMLDivElement>>('box');

  private readonly defaultHeaderId = `dp-dlg-${Math.random().toString(36).slice(2, 8)}`;

  get effectiveHeaderId(): string {
    return this.headerId() || this.defaultHeaderId;
  }
  private viewReady = false;

  // Drag state — grabbing the header offsets the modal-box via translate3d,
  // composed with whatever transform the caller passes via [style]. We snapshot
  // the box's top-left at drag start so movement is precise even when the
  // dialog is centered by the dialog[open] grid layout.
  protected dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private boxStartLeft = 0;
  private boxStartTop = 0;
  private dx = 0;
  private dy = 0;

  protected boxStyles(): Record<string, string> {
    const base = { ...(this.style() || {}) };
    if (this.dx !== 0 || this.dy !== 0) {
      base['transform'] = `translate3d(${this.dx}px, ${this.dy}px, 0)`;
    }
    return base;
  }

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

  onDragStart(event: MouseEvent) {
    if (event.button !== 0) return;
    const rect = this.box().nativeElement.getBoundingClientRect();
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.boxStartLeft = rect.left;
    this.boxStartTop = rect.top;
    this.dragging = true;
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent) {
    if (!this.dragging) return;
    this.dx += event.clientX - this.dragStartX;
    this.dy += event.clientY - this.dragStartY;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp() {
    if (this.dragging) this.dragging = false;
  }
}
