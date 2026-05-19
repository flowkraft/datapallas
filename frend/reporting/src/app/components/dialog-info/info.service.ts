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
      this.appRef.attachView(ref.hostView);
      document.body.appendChild(ref.location.nativeElement);

      const inst = ref.instance;
      inst.title = options.title || 'Information';
      inst.message = options.message;
      inst.confirmLabel = options.confirmLabel || 'OK';

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
