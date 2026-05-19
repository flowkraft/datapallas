import {
  Component,
  HostListener,
  input,
  model,
  OnChanges,
  output,
  SimpleChanges,
} from '@angular/core';
import { NgStyle } from '@angular/common';

@Component({
  selector: 'dp-drawer',
  standalone: true,
  imports: [NgStyle],
  template: `
    @if (visible()) {
      <div
        class="fixed inset-0 bg-black/40 z-[1000]"
        (click)="close()"
        aria-hidden="true"
      ></div>
      <aside
        class="fixed top-0 bottom-0 z-[1001] bg-base-100 shadow-xl overflow-y-auto
               transition-transform duration-300"
        [class.right-0]="position() === 'right'"
        [class.left-0]="position() === 'left'"
        [ngStyle]="style()"
        role="complementary"
        [attr.aria-label]="ariaLabel()"
      >
        <ng-content></ng-content>
      </aside>
    }
  `,
})
export class DpDrawerComponent implements OnChanges {
  visible = model<boolean>(false);
  position = input<'left' | 'right'>('right');
  closeOnEscape = input<boolean>(true);
  style = input<Record<string, string>>({});
  ariaLabel = input<string>('Side panel');

  onShow = output<void>();
  onHide = output<void>();

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible']) {
      changes['visible'].currentValue ? this.onShow.emit() : this.onHide.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.visible() && this.closeOnEscape()) this.close();
  }

  close() {
    this.visible.set(false);
    this.onHide.emit();
  }
}
