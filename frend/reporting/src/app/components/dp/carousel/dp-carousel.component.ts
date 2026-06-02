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
    standalone: true,
    imports: [NgTemplateOutlet],
    template: `
    <div class="dp-carousel" [style]="containerStyle">
      <div style="display:flex;flex-direction:row;align-items:center;flex:1;overflow:hidden;min-height:0;">
        <button
          type="button"
          class="btn btn-ghost dp-carousel-prev"
          [style.visibility]="(value()?.length ?? 0) > 1 ? 'visible' : 'hidden'"
          style="flex-shrink:0;align-self:center;height:5rem;width:2.5rem;padding:0;font-size:1.75rem;border-radius:50%;"
          [disabled]="!circular() && _page === 0"
          (click)="prev()"
          aria-label="Previous"
        >&#8249;</button>
        <div style="flex:1;overflow:hidden;height:100%;">
          @if (itemTemplate && value()?.length) {
            <ng-container *ngTemplateOutlet="itemTemplate; context: { $implicit: value()[_page] }"></ng-container>
          }
        </div>
        <button
          type="button"
          class="btn btn-ghost dp-carousel-next"
          [style.visibility]="(value()?.length ?? 0) > 1 ? 'visible' : 'hidden'"
          style="flex-shrink:0;align-self:center;height:5rem;width:2.5rem;padding:0;font-size:1.75rem;border-radius:50%;"
          [disabled]="!circular() && _page === (value()?.length ?? 1) - 1"
          (click)="next()"
          aria-label="Next"
        >&#8250;</button>
      </div>
      @if ((value()?.length ?? 0) > 1) {
        <div style="text-align:center;padding:2px 0;font-size:0.8rem;color:#888;flex-shrink:0;">
          {{ _page + 1 }} / {{ value()?.length ?? 0 }}
        </div>
      }
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

  get containerStyle(): Record<string, string> | string {
    const base: Record<string, string> = {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    };
    const override = this.style();
    if (!override || (typeof override === 'object' && Object.keys(override).length === 0)) {
      return base;
    }
    if (typeof override === 'string') {
      return `display:flex;flex-direction:column;height:100%;${override}`;
    }
    return { ...base, ...override };
  }

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
