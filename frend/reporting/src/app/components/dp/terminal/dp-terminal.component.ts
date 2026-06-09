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
    standalone: true,
    imports: [FormsModule],
    template: `
    <div class="dp-terminal bg-black text-green-400 font-mono text-sm rounded p-2"
         style="min-height:120px; max-height:400px; overflow-y:auto; display:flex; flex-direction:column;"
         (keydown.control.c)="onCopySelection()"
         (keydown.meta.c)="onCopySelection()"
         (contextmenu)="onContextMenu($event)">
      <div #scrollArea style="flex:1; overflow-y:auto; user-select:text; cursor:text;">
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
          spellcheck="false"
          (keydown.enter)="submitCommand()"
          (keydown.arrowup)="historyPrev(); $event.preventDefault()"
          (keydown.arrowdown)="historyNext(); $event.preventDefault()"
          (keydown.control.v)="onPaste($event)"
          (keydown.meta.v)="onPaste($event)"
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

  // Command history buffer (survives clear/cls, like a real shell).
  private history: string[] = [];
  private historyIndex = -1;
  private historyDraft = '';

  private cdr = inject(ChangeDetectorRef);

  ngAfterViewInit() {}

  // Don't steal focus to the input while the user is selecting output text —
  // otherwise the selection collapses and the caret jumps back to the prompt.
  @HostListener('click')
  focusInput() {
    const selection = window.getSelection?.();
    if (selection && selection.toString().length > 0) return;
    this.inputEl()?.nativeElement.focus();
  }

  get inputElement(): HTMLInputElement {
    return this.inputEl()?.nativeElement;
  }

  submitCommand() {
    const cmd = this.currentInput.trim();
    this.entries.push({ text: cmd, response: '' });
    // Record in history, skipping blanks and consecutive duplicates (like a real shell).
    if (cmd && this.history[this.history.length - 1] !== cmd) this.history.push(cmd);
    this.historyIndex = -1;
    this.historyDraft = '';
    this.currentInput = '';
    this.commandEntered.emit(cmd);
    this.scrollToBottom();
  }

  /** Clear the visible buffer (clear/cls). History is preserved, as in a real terminal. */
  clear() {
    this.entries = [];
    this.cdr.detectChanges();
  }

  /** Up arrow — walk backwards through command history. */
  historyPrev() {
    if (this.history.length === 0) return;
    if (this.historyIndex === -1) {
      this.historyDraft = this.currentInput; // stash the in-progress line
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    }
    this.currentInput = this.history[this.historyIndex];
    this.moveCaretToEnd();
  }

  /** Down arrow — walk forwards; stepping past the newest entry restores the stashed draft. */
  historyNext() {
    if (this.historyIndex === -1) return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.currentInput = this.history[this.historyIndex];
    } else {
      this.historyIndex = -1;
      this.currentInput = this.historyDraft;
    }
    this.moveCaretToEnd();
  }

  /** Ctrl/Cmd+V — insert clipboard text at the caret (Electron binds no paste accelerator by default). */
  async onPaste(event: Event) {
    event.preventDefault();
    await this.pasteFromClipboard();
  }

  /** Right-click pastes at the prompt, like Windows/Linux terminals do. */
  async onContextMenu(event: Event) {
    event.preventDefault();
    this.inputEl()?.nativeElement.focus();
    await this.pasteFromClipboard();
  }

  private async pasteFromClipboard() {
    let text = '';
    // Prefer Electron's clipboard (synchronous, no permission prompt, always present
    // in the nodeIntegration renderer); fall back to the Web Clipboard API otherwise.
    try {
      const electron = (window as any).require?.('electron');
      text = electron?.clipboard?.readText?.() ?? '';
    } catch {
      text = '';
    }
    if (!text) {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return;
      }
    }
    if (!text) return;
    const el = this.inputEl()?.nativeElement;
    const start = el?.selectionStart ?? this.currentInput.length;
    const end = el?.selectionEnd ?? this.currentInput.length;
    this.currentInput =
      this.currentInput.slice(0, start) + text + this.currentInput.slice(end);
    this.cdr.detectChanges();
    setTimeout(() => {
      const pos = start + text.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  /** Ctrl/Cmd+C — copy the current selection (Electron binds no copy accelerator by default). */
  onCopySelection() {
    const text = window.getSelection?.()?.toString() ?? '';
    if (text) navigator.clipboard.writeText(text).catch(() => {});
  }

  private moveCaretToEnd() {
    setTimeout(() => {
      const el = this.inputEl()?.nativeElement;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    });
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
