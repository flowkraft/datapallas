import {
  AfterContentInit,
  ChangeDetectorRef,
  Component,
  contentChildren,
  DestroyRef,
  effect,
  input,
  OnChanges,
  output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DpTabComponent } from './dp-tab.component';

@Component({
    selector: 'dp-tabs',
    standalone: true,
    imports: [NgTemplateOutlet, DpTabComponent],
    styles: [`:host { display: block; }`],
    template: `
    <div
      role="tablist"
      class="tabs tabs-border flex-wrap"
      style="border-bottom: 1px solid #ddd; margin-bottom: 0.5rem;"
    >
      @for (tab of _tabs; track tab; let i = $index) {
        <button
          role="tab"
          type="button"
          class="tab"
          [class.tab-active]="activeIdx === i"
          [style.font-weight]="activeIdx === i ? '600' : 'normal'"
          [attr.aria-selected]="activeIdx === i"
          [attr.tabindex]="activeIdx === i ? 0 : -1"
          [attr.aria-controls]="tab.id() ? 'panel-' + tab.id() : 'dp-panel-' + i"
          [id]="tab.id() ? 'tab-btn-' + tab.id() : 'dp-tab-btn-' + i"
          (click)="selectTab(i)"
          (keydown)="onKeyDown($event)"
        >
          @if (tab.headingTpl) {
            <ng-container [ngTemplateOutlet]="tab.headingTpl"></ng-container>
          } @else {
            {{ tab.heading() }}
          }
        </button>
      }
    </div>
    <ng-content></ng-content>
  `
})
export class DpTabsComponent implements AfterContentInit, OnChanges {
  readonly tabComponents = contentChildren(DpTabComponent);

  activeIndex = input<number>(0);
  activeTabChange = output<{ index: number; id: string }>();

  _tabs: DpTabComponent[] = [];
  activeIdx = 0;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // React to content children changes
    effect(() => {
      const tabs = this.tabComponents();
      this._tabs = [...tabs];
      if (this._tabs.length && this.activeIdx >= this._tabs.length) {
        this.activeIdx = 0;
      }
      Promise.resolve().then(() => {
        this._syncActive();
        this.cdr.detectChanges();
      });
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if ('activeIndex' in changes) {
      this.activeIdx = changes['activeIndex'].currentValue ?? 0;
      // Defer past current CD cycle if content is already initialized
      if (this._tabs.length) {
        Promise.resolve().then(() => this._syncActive());
      }
    }
  }

  ngAfterContentInit() {
    this._tabs = [...this.tabComponents()];
    this.activeIdx = this.activeIndex();

    // Defer initial sync past current CD cycle to prevent NG0100
    Promise.resolve().then(() => {
      this._syncActive();
      this.cdr.detectChanges();
    });
  }

  selectTab(idx: number) {
    this.activeIdx = idx;
    this._syncActive();
    const tab = this._tabs[idx];
    this.activeTabChange.emit({ index: idx, id: tab?.id() ?? '' });
  }

  onKeyDown(event: KeyboardEvent) {
    const count = this._tabs.length;
    if (!count) return;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight': next = (this.activeIdx + 1) % count; break;
      case 'ArrowLeft': next = (this.activeIdx - 1 + count) % count; break;
      case 'Home': next = 0; break;
      case 'End': next = count - 1; break;
    }
    if (next !== null) {
      event.preventDefault();
      this.selectTab(next);
      const host = (event.target as HTMLElement).closest('[role=tablist]');
      if (host) {
        const btns = host.querySelectorAll<HTMLElement>('[role=tab]');
        btns[next]?.focus();
      }
    }
  }

  private _syncActive() {
    this._tabs.forEach((tab, i) => {
      const panelId = tab.id() ? `panel-${tab.id()}` : `dp-panel-${i}`;
      const btnId = tab.id() ? `tab-btn-${tab.id()}` : `dp-tab-btn-${i}`;
      tab._activate(i === this.activeIdx, panelId, btnId);
    });
  }
}
