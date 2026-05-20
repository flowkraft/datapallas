import { Component, ContentChild, ElementRef, input, TemplateRef, inject } from '@angular/core';
import { DpTabHeadingDirective } from './dp-tab-heading.directive';

@Component({
    selector: 'dp-tab',
    imports: [],
    host: { role: 'tabpanel' },
    template: `<ng-content></ng-content>`
})
export class DpTabComponent {
  id = input<string>('');
  heading = input<string>('');

  @ContentChild(DpTabHeadingDirective, { read: TemplateRef })
  headingTpl?: TemplateRef<any>;

  private readonly el = inject(ElementRef<HTMLElement>);

  /** Called by DpTabsComponent — sets visibility + ARIA attributes. */
  _activate(active: boolean, panelId: string, labelledBy: string) {
    const host = this.el.nativeElement;
    host.hidden = !active;
    host.id = panelId;
    host.setAttribute('aria-labelledby', labelledBy);
  }
}
