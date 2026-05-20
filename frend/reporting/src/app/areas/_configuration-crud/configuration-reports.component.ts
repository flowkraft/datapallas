import { Component, inject, OnInit } from '@angular/core';

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
    standalone: false
})
export class ConfigurationReportsComponent implements OnInit {
  protected settingsService = inject(ConfigurationRepository);

  async ngOnInit() {
    this.settingsService.currentConfigurationTemplateName = '';
    this.settingsService.currentConfigurationTemplatePath = '';
  }
}
