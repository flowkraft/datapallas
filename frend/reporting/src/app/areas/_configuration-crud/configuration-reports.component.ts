import { Component, inject, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { SHARED_IMPORTS } from '../../shared/shared-imports';
import { ReportsListComponent } from '../../components/reports-list/reports-list.component';
import { LicenseComponent } from '../../components/license/license.component';

import { tabsTemplate } from './templates/reports/_tabs';
import { tabConfigurationTemplatesTemplate } from './templates/reports/tab-conf-templates';
import { tabLicenseTemplate } from './templates/reports/tab-license';

import { ConfigurationRepository } from '../../providers/configuration-repository.service';

@Component({
    selector: 'dburst-configuration-reports',
    template: /*html*/ `
    <div>${tabsTemplate}</div>
    ${tabConfigurationTemplatesTemplate}
    ${tabLicenseTemplate}
  `,
    standalone: true,
    imports: [...SHARED_IMPORTS, ReportsListComponent, LicenseComponent],
})
export class ConfigurationReportsComponent implements OnInit {
  protected settingsService = inject(ConfigurationRepository);

  async ngOnInit() {
    this.settingsService.currentConfigurationTemplateName = '';
    this.settingsService.currentConfigurationTemplatePath = '';
  }
}
