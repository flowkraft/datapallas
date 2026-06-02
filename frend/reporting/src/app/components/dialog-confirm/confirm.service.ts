import { ApplicationRef, createComponent, EnvironmentInjector, Injectable } from '@angular/core';
import { ConfirmDialogComponent } from './confirm-dialog.component';

@Injectable()
export class ConfirmService {
  constructor(
    private appRef: ApplicationRef,
    private envInjector: EnvironmentInjector,
  ) {}

  askConfirmation(options: any, modalConfig?: any): Promise<boolean> {
    return new Promise((resolve) => {
      const ref = createComponent(ConfirmDialogComponent, {
        environmentInjector: this.envInjector,
      });

      const inst = ref.instance;
      inst.title = options.title || 'Confirmation';
      inst.message = options.message;
      inst.confirmLabel = options.confirmLabel || 'Yes';
      inst.declineLabel = options.declineLabel || 'No';
      inst.confirmAction = options.confirmAction;
      inst.confirmationText = options.confirmationText || null;

      document.body.appendChild(ref.location.nativeElement);
      this.appRef.attachView(ref.hostView);
      ref.changeDetectorRef.detectChanges();

      // Belt-and-suspenders: directly open the native <dialog>. If dp-dialog's
      // effect-based auto-open misfires (signal propagation timing, viewReady race),
      // this guarantees the modal becomes visible synchronously after CD.
      const dialogEl = ref.location.nativeElement.querySelector('dialog') as HTMLDialogElement | null;
      if (dialogEl && !dialogEl.open) {
        try { dialogEl.showModal(); } catch { /* already shown or detached */ }
      }

      inst.onClose.subscribe({
        next: (result: boolean) => resolve(result),
        complete: () => {
          setTimeout(() => {
            this.appRef.detachView(ref.hostView);
            ref.destroy();
          }, 300);
        },
      });
    });
  }
}
