import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

interface TerminalEntry {
  text: string;
  response: string;
}

@Component({
    selector: 'dp-terminal',
    imports: [FormsModule],
    template: `
    <div class="dp-terminal bg-black text-green-400 font-mono text-sm rounded p-2"
         style="min-height:120px; max-height:400px; overflow-y:auto; display:flex; flex-direction:column;">
      <div #scrollArea style="flex:1; overflow-y:auto;">
        @for (entry of entries; track $index) {
          <div>
            <span class="text-green-600">{{ prompt() }}</span>
            <span class="ml-1">{{ entry.text }}</span>
          </div>
          @if (entry.response) {
            <div class="text-green-300 whitespace-pre-wrap">{{ entry.response }}</div>
          }
        }
      </div>
      <div class="flex items-center mt-1">
        <span class="text-green-600 shrink-0">{{ prompt() }}</span>
        <input
          #inputEl
          type="text"
          [(ngModel)]="currentInput"
          class="dp-terminal-input bg-transparent border-none outline-none text-green-400 font-mono text-sm ml-1 flex-1"
          autocomplete="off"
          (keydown.enter)="submitCommand()"
        />
      </div>
    </div>
  `
})
export class DpTerminalComponent implements AfterViewInit {
  prompt = input<string>('$ ');

  commandEntered = output<string>();

  private scrollArea = viewChild.required<ElementRef<HTMLDivElement>>('scrollArea');
  private inputEl = viewChild.required<ElementRef<HTMLInputElement>>('inputEl');

  entries: TerminalEntry[] = [];
  currentInput = '';

  private cdr = inject(ChangeDetectorRef);

  ngAfterViewInit() {}

  @HostListener('click')
  focusInput() {
    this.inputEl()?.nativeElement.focus();
  }

  get inputElement(): HTMLInputElement {
    return this.inputEl()?.nativeElement;
  }

  submitCommand() {
    const cmd = this.currentInput.trim();
    this.entries.push({ text: cmd, response: '' });
    this.currentInput = '';
    this.commandEntered.emit(cmd);
    this.scrollToBottom();
  }

  addResponse(response: string) {
    if (this.entries.length > 0) {
      this.entries[this.entries.length - 1].response = response;
      this.cdr.detectChanges();
      this.scrollToBottom();
    }
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = this.scrollArea()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
