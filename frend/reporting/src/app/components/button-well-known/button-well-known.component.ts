import { Component, inject, output } from '@angular/core';

import * as allWellKnownEmailProviders from 'nodemailer-wellknown/services.json';

import { modalWellKnownTemplate } from './modal-well-known.template';
import { TranslateService } from '@ngx-translate/core';

export type EmailProviderSettings = {
  host: string;
  port: string;
  secure: boolean;
  tls: {};
};

@Component({
  selector: 'dburst-button-well-known-email-providers',
  template: `
    <button
      id="btnWellKnownEmailProviders"
      type="button"
      class="btn w-full"
      (click)="onModalShow()"
    >
      <span class="glyphicon glyphicon-cloud-upload"></span>&nbsp;&nbsp;Load
      SMTP Settings for Well-Known Email Providers
    </button>
    ${modalWellKnownTemplate}
  `,
  styles: [
    ':host #btnWellKnownEmailProviders {display: inline-block; width: 100%}',
  ],
})
export class ButtonWellKnownEmailProvidersComponent {
  isModalWellKnownVisible = false;
  showMoreCheckBoxValue = false;

  providers: Array<{
    name: string;
    type: string;
    settings: EmailProviderSettings;
    active: boolean;
  }>;

  sendSelectedProvider = output<EmailProviderSettings>();

  private translate = inject(TranslateService);

  getShortListWellKnownEmailProviders() {
    return this.getAllWellKnownEmailProviders().filter((provider) => {
      return [
        'Outlook365',
        'Gmail',
        'SES',
        'SES-US-EAST-1',
        'SES-US-WEST-2',
        'SES-EU-WEST-1',
        'Mailgun',
        'Mandrill',
        'SendGrid',
        'Sparkpost',
        'Zoho',
      ].includes(provider.name);
    });
  }

  getAllWellKnownEmailProviders(): Array<any> {
    return Object.keys(allWellKnownEmailProviders).map((value) => {
      return {
        name: value,
        settings: allWellKnownEmailProviders[value],
        active: false,
      };
    });
  }

  onProviderClick(provider) {
    if (this.providers) {
      this.providers.forEach((element) => {
        element.active = element.name === provider.name ? true : false;
      });
    }
  }

  getSelectedProvider(): {
    name: string;
    type: string;
    settings: EmailProviderSettings;
    active: boolean;
  } {
    if (!this.providers) {
      return undefined;
    }

    return this.providers.find((provider) => {
      return provider.active;
    });
  }

  onShowMore() {
    if (this.showMoreCheckBoxValue) {
      this.providers = this.getAllWellKnownEmailProviders();
    } else {
      this.providers = this.getShortListWellKnownEmailProviders();
    }
  }

  onModalShow() {
    this.onShowMore();
    this.isModalWellKnownVisible = true;
  }

  onModalClose() {
    this.isModalWellKnownVisible = false;
  }

  onModalOK() {
    this.sendSelectedProvider.emit(this.getSelectedProvider().settings);
    this.isModalWellKnownVisible = false;
  }
}