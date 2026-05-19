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
      this.appRef.attachView(ref.hostView);
      document.body.appendChild(ref.location.nativeElement);

      const inst = ref.instance;
      inst.title = options.title || 'Confirmation';
      inst.message = options.message;
      inst.confirmLabel = options.confirmLabel || 'Yes';
      inst.declineLabel = options.declineLabel || 'No';
      inst.confirmAction = options.confirmAction;
      inst.confirmationText = options.confirmationText || null;

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
