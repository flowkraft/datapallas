import { Component } from '@angular/core';
import { SHARED_IMPORTS } from '../../shared/shared-imports';
import { WhatsNewComponent } from './whats-new/whats-new.component';

import { LicenseService } from '../../providers/license.service';

import { ConfirmService } from '../dialog-confirm/confirm.service';
import { ExecutionStatsService } from '../../providers/execution-stats.service';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { StateStoreService } from '../../providers/state-store.service';

@Component({
    selector: 'dburst-license',
    templateUrl: './license.component.html',
    standalone: true,
    imports: [...SHARED_IMPORTS, WhatsNewComponent],
})
export class LicenseComponent {
  licenseKey: string;

  constructor(
    protected licenseService: LicenseService,
    protected confirmService: ConfirmService,
    protected settingsService: ConfigurationRepository,
    protected executionStatsService: ExecutionStatsService,
    protected storeService: StateStoreService,
  ) {}

  verifyLicense(action) {
    let message = 'Activate license?';

    if (action === 'check') {
      message = 'Check license?';
    }

    this.confirmService.askConfirmation({
      message: message,
      confirmAction: async () => {
        await this.licenseService.verifyLicense(action);
        //console.log(`verifyLicense done`);
        await this.licenseService.loadLicense();

        //this.router.navigate(['/help', 'licenseMenuSelected']);
      },
    });
  }

  deActivateLicense() {
    this.confirmService.askConfirmation({
      message: 'Are you sure you want to de-activate the license?',
      confirmAction: async () => {
        this.licenseService.deActivateLicense(async () => {
          await this.licenseService.loadLicense();

          //this.router.navigate(['/help', 'licenseMenuSelected']);
        });
      },
    });
  }

  onLicenseKeyChanged(value: string) {
    // Mirror the #burstFile pattern (tab-burst.ts) — Angular 19's template
    // compiler drops the implicit two-way assignment when an explicit
    // (ngModelChange) is present, so the model write must be done here.
    if (this.licenseService?.licenseDetails?.license) {
      this.licenseService.licenseDetails.license.key = value;
    }
    return this.licenseService.saveLicense();
  }
}
