import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  forwardRef,
  inject,
  input,
  model,
  NgZone,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgStyle } from '@angular/common';
import Quill from 'quill';

@Component({
  selector: 'dp-editor',
  standalone: true,
  imports: [NgStyle],
  template: `
    <div class="dp-editor-wrapper" [ngStyle]="style">
      <div #toolbar>
        <span class="ql-formats">
          <button type="button" class="ql-bold" aria-label="Bold"></button>
          <button type="button" class="ql-italic" aria-label="Italic"></button>
          <button type="button" class="ql-underline" aria-label="Underline"></button>
        </span>
        <span class="ql-formats">
          <button class="ql-list" value="ordered" type="button" aria-label="Ordered List"></button>
          <button class="ql-list" value="bullet" type="button" aria-label="Unordered List"></button>
        </span>
        <span class="ql-formats">
          <button type="button" class="ql-link" aria-label="Insert Link"></button>
          <button type="button" class="ql-clean" aria-label="Remove Styles"></button>
        </span>
      </div>
      <div #container></div>
    </div>
  `,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => DpEditorComponent),
    multi: true,
  }],
})
export class DpEditorComponent implements AfterViewInit, ControlValueAccessor, OnDestroy {
  readonly = model<boolean>(false);
  style = input<Record<string, string | number> | null>(null);
  placeholder = input<string>('');

  onTextChange = output<{ htmlValue: string; textValue: string; delta: any; source: string }>();
  onSelectionChange = output<{ range: any; oldRange: any; source: string }>();
  onInit = output<{ editor: any }>();

  private containerRef = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private toolbarRef = viewChild.required<ElementRef<HTMLDivElement>>('toolbar');

  private quill: any;
  private pendingValue: string | null = null;

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  private zone = inject(NgZone);

  constructor() {
    effect(() => {
      const isReadonly = this.readonly();
      if (this.quill) isReadonly ? this.quill.disable() : this.quill.enable();
    });
  }

  ngAfterViewInit() {
    this.zone.runOutsideAngular(() => {
      this.quill = new (Quill as any)(this.containerRef().nativeElement, {
        modules: { toolbar: this.toolbarRef().nativeElement },
        placeholder: this.placeholder(),
        readOnly: this.readonly(),
        theme: 'snow',
      });

      this.quill.on('text-change', (delta: any, _old: any, source: string) => {
        const editorEl = this.containerRef().nativeElement.querySelector('.ql-editor') as HTMLElement;
        const html = editorEl.innerHTML;
        const text = this.quill.getText() as string;
        const value = html === '<p><br></p>' ? '' : html;
        this.zone.run(() => {
          // Defer onChange to the next microtask so Angular's form-control status
          // update (ng-untouched → ng-touched) does not fire mid-CD-cycle (NG0100).
          Promise.resolve().then(() => this.onChange(value));
          this.onTextChange.emit({ htmlValue: value, textValue: text, delta, source });
        });
      });

      this.quill.on('selection-change', (range: any, oldRange: any, source: string) => {
        this.zone.run(() => {
          this.onTouched();
          this.onSelectionChange.emit({ range, oldRange, source });
        });
      });
    });

    this.onInit.emit({ editor: this.quill });

    if (this.pendingValue !== null) {
      this.applyValue(this.pendingValue);
      this.pendingValue = null;
    }
  }

  writeValue(value: string) {
    if (this.quill) {
      this.applyValue(value);
    } else {
      this.pendingValue = value ?? '';
    }
  }

  registerOnChange(fn: (v: string) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean) { this.readonly.set(isDisabled); }

  private applyValue(value: string) {
    if (value) {
      this.quill.clipboard.dangerouslyPasteHTML(value);
    } else {
      this.quill.setContents([]);
    }
  }

  ngOnDestroy() {
    // Quill v1 has no destroy() — GC handles cleanup
  }
}
