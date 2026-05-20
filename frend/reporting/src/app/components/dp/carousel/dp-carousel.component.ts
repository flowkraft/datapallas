import {
  Component,
  ContentChild,
  input,
  model,
  OnChanges,
  output,
  SimpleChanges,
  TemplateRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

@Component({
    selector: 'dp-carousel',
    imports: [NgTemplateOutlet],
    template: `
    <div class="dp-carousel relative flex flex-col" [style]="style()">
      <div class="flex-1 overflow-hidden">
        @if (itemTemplate && value()?.length) {
          <ng-container *ngTemplateOutlet="itemTemplate; context: { $implicit: value()[_page] }"></ng-container>
        }
      </div>
      <div class="flex justify-center items-center gap-4 py-2 shrink-0">
        <button
          type="button"
          class="btn btn-sm btn-circle btn-ghost"
          [disabled]="!circular() && _page === 0"
          (click)="prev()"
          aria-label="Previous"
        >&#8592;</button>
        <span class="text-sm text-base-content/60">{{ _page + 1 }} / {{ value()?.length ?? 0 }}</span>
        <button
          type="button"
          class="btn btn-sm btn-circle btn-ghost"
          [disabled]="!circular() && _page === (value()?.length ?? 1) - 1"
          (click)="next()"
          aria-label="Next"
        >&#8594;</button>
      </div>
    </div>
  `
})
export class DpCarouselComponent implements OnChanges {
  value = input<any[]>([]);
  circular = input<boolean>(false);
  style = input<Record<string, string> | string>({});

  /** Controlled page (0-based). Setting this property also updates internal state. */
  page = model<number>(0);

  onPage = output<{ page: number }>();

  @ContentChild('item') itemTemplate?: TemplateRef<any>;

  _page = 0;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['page']) {
      this._page = changes['page'].currentValue ?? 0;
    }
    if (changes['value'] && this._page >= (this.value()?.length ?? 0)) {
      this._page = 0;
    }
  }

  prev() {
    if (!this.value()?.length) return;
    this._page = this._page === 0
      ? (this.circular() ? this.value().length - 1 : 0)
      : this._page - 1;
    this.onPage.emit({ page: this._page });
  }

  next() {
    if (!this.value()?.length) return;
    const last = this.value().length - 1;
    this._page = this._page === last
      ? (this.circular() ? 0 : last)
      : this._page + 1;
    this.onPage.emit({ page: this._page });
  }
}
