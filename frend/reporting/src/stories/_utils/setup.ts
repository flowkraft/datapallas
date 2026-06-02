import { HttpClient } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { ConfirmService } from '../../app/components/dialog-confirm/confirm.service';
import { DpDialogComponent } from '../../app/components/dp/dialog/dp-dialog.component';
import { ToastrMessagesService } from '../../app/providers/toastr-messages.service';

export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, '/i18n/', '.json');
}

/**
 * Shared base for DataPallas stories using non-standalone (NgModule-era) components.
 * Provides: translate pipe + service, daisyUI confirm dialog, toastr messages, forms.
 * Root-level providers (animations, httpClient) come from the global preview.ts decorator.
 */
export const baseMeta = {
  title: 'PLACEHOLDER_TITLE',
  component: 'PLACEHOLDER_COMPONENT' as any,
  decorators: [
    applicationConfig({
      providers: [
        importProvidersFrom(
          TranslateModule.forRoot({
            defaultLanguage: 'en',
            loader: {
              provide: TranslateLoader,
              useFactory: HttpLoaderFactory,
              deps: [HttpClient],
            },
          }),
        ),
        ConfirmService,
        ToastrMessagesService,
      ],
    }),
    moduleMetadata({
      imports: [FormsModule, DpDialogComponent],
    }),
  ],
};
