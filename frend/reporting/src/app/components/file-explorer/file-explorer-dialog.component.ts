import {
  Component,
  input,
  model,
  output,
  viewChild,
  OnInit,
  NgZone,
  ChangeDetectorRef,
} from '@angular/core';
import { FileExplorerComponent } from './file-explorer.component';

@Component({
    selector: 'dburst-file-explorer-dialog',
    template: `
    <dp-dialog
      [(visible)]="visible"
      [header]="title()"
      (onShow)="onDialogShow()"
      (onHide)="onDialogClosed()"
      >
      <div
        [style]="{ width: '450px', 'min-width': '425px' }"
        class="file-explorer-container"
        >
        @if (visible()) {
          <dburst-file-explorer
            #fileExplorer
            [showPermissionsColumn]="showPermissionsColumn()"
            [showActionsColumn]="showActionsColumn()"
          ></dburst-file-explorer>
        }
      </div>

      <div ngProjectAs="[footer]">
        <div class="flex-row">
          <div class="flex-col">
            @if (fileFilterExtensions()?.length) {
              <small class="text-base-content/60">
                Showing files with extensions:
                {{ fileFilterExtensions().join(', ') }}
              </small>
            }
          </div>
          <div class="flex-col text-right">
            <button
              id="btnSelectFileExplorer"
              class="btn btn-primary"
              type="button"
              [disabled]="!selectedFile"
              (click)="confirmSelection()"
              >
              Select
            </button>
            <button
              id="btnCancelFileExplorer"
              class="btn btn-ghost"
              type="button"
              (click)="cancelSelection()"
              style="margin-left: 5px;"
              >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </dp-dialog>
`,
    styles: [
        `
      .flex-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
      }
      .flex-col {
        flex: 1;
      }
      .text-right {
        text-align: right;
      }
      .file-explorer-container {
        /* Removed fixed height */
        width: 100%;
        overflow-y: auto; /* Allow vertical scroll only if needed */
        min-height: 200px; /* Optional: set a minimum height */
        max-height: 60vh; /* Optional: set a max height relative to viewport */
      }

      :host ::ng-deep {
        .dp-dialog-box {
          max-width: 90vw;
          width: auto !important;
          min-width: 450px;
        }

        .breadcrumb {
          padding: 4px 8px;
          margin-bottom: 10px;
          white-space: normal;
          word-break: break-all;
          min-height: 30px;
        }

        table {
          width: 100%;
          table-layout: fixed;
        }

        .col-name {
          width: 40%;
        }

        .col-permission {
          width: 15%;
        }

        .col-size {
          width: 15%;
        }

        .col-date {
          width: 20%;
        }

        .col-actions {
          width: 10%;
        }

        td,
        th {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    `,
    ],
    standalone: false
})
export class FileExplorerDialogComponent implements OnInit {
  visible = model<boolean>(false);
  title = input<string>('Select File');
  initialPath = input<string>('/db');
  fileFilterExtensions = input<string[]>(['.db', '.sqlite', '.sqlite3']);
  showPermissionsColumn = input<boolean>(false);
  showActionsColumn = input<boolean>(false);

  fileSelected = output<string>();
  canceled = output<void>();

  fileExplorer = viewChild<FileExplorerComponent>('fileExplorer');

  selectedFile: string = null;

  // Inject ChangeDetectorRef
  constructor(
    private ngZone: NgZone,
    private cdRef: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    // Initialize with empty selection
    this.selectedFile = null;
  }

  /**
   * When the dialog visibility changes externally
   */
  ngOnChanges(changes: any) {
    if (changes['visible'] && changes['visible'].currentValue === true) {
      // Reset selection when dialog opens
      this.selectedFile = null;
    }
  }

  /**
   * Called when dialog is shown/opened
   */
  onDialogShow() {
    // Reset selection and load tree
    this.selectedFile = null;
    this.cdRef.detectChanges();

    // Ensure fileExplorer is available
    if (this.fileExplorer()) {
      this.fileExplorer()?.loadFileTree(this.initialPath());

      // Single click callback
      this.fileExplorer().onFileClicked = (file) => {
        this.ngZone.run(() => {
          if (this.isFileAllowed(file.name)) {
            this.selectedFile = file.fullName;
            this.cdRef.detectChanges();
          }
        });
      };

      // Double click callback
      this.fileExplorer().onFileDoubleClicked = (file) => {
        this.ngZone.run(() => {
          if (this.isFileAllowed(file.name)) {
            this.selectedFile = file.fullName;
            this.cdRef.detectChanges();
            setTimeout(() => this.confirmSelection(), 0);
          }
        });
      };
    }
  }

  /**
   * Check if the file extension is allowed
   */
  isFileAllowed(filename: string): boolean {
    if (!this.fileFilterExtensions() || this.fileFilterExtensions().length === 0) {
      return true; // No filter means all files are allowed
    }

    return this.fileFilterExtensions().some((ext) =>
      filename.toLowerCase().endsWith(ext.toLowerCase()),
    );
  }

  confirmSelection() {
    //console.log('Confirm selection called, selectedFile:', this.selectedFile);
    // Ensure selectedFile has a value before proceeding
    if (this.selectedFile) {
      //console.log('Emitting selected file:', this.selectedFile);
      this.fileSelected.emit(this.selectedFile);
      this.visible.set(false);
    } else {
      //console.warn('Confirm selection called but no file is selected.');
    }
  }

  /**
   * Cancel the selection
   */
  cancelSelection() {
    this.canceled.emit();
    this.visible.set(false);
  }

  /**
   * Handle dialog close
   */
  onDialogClosed() {
    // model() handles the visibleChange emission automatically
  }
}
