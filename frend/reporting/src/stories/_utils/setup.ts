import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { moduleMetadata } from '@storybook/angular';
import { ConfirmService } from '../../app/components/dialog-confirm/confirm.service';
import { BsModalService } from 'ngx-bootstrap/modal';
import { FsService } from '../../app/providers/fs.service';
import { ToastrMessagesService } from '../../app/providers/toastr-messages.service';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { DpDialogComponent } from '../../app/components/dp/dialog/dp-dialog.component';

// Base configuration with placeholders
export const baseMeta = {
  title: 'PLACEHOLDER_TITLE',
  component: 'PLACEHOLDER_COMPONENT',
  decorators: [
    moduleMetadata({
      imports: [
        FormsModule,
        BrowserAnimationsModule,
        DpDialogComponent,
        HttpClientModule,
        ToastrModule.forRoot(),
        TranslateModule.forRoot({
          defaultLanguage: 'en',
          loader: {
            provide: TranslateLoader,
            useFactory: HttpLoaderFactory,
            deps: [HttpClient],
          },
        }),
      ],
      providers: [
        ConfirmService,
        BsModalService,
        ToastrService,
        ToastrMessagesService,
      ],
    }),
  ],
};

// AoT requires an exported function for factories
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, '/i18n/', '.json');
}
