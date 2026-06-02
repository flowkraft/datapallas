import { ApplicationRef, createComponent, EnvironmentInjector, Injectable } from '@angular/core';
import { InfoDialogComponent } from './info-dialog.component';

@Injectable()
export class InfoService {
  constructor(
    private appRef: ApplicationRef,
    private envInjector: EnvironmentInjector,
  ) {}

  showInformation(options: any): Promise<boolean> {
    return new Promise((resolve) => {
      const ref = createComponent(InfoDialogComponent, {
        environmentInjector: this.envInjector,
      });

      const inst = ref.instance;
      inst.title = options.title || 'Information';
      inst.message = options.message;
      inst.confirmLabel = options.confirmLabel || 'OK';

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
