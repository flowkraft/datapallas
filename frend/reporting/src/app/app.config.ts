import { ApplicationConfig, APP_INITIALIZER, importProvidersFrom } from '@angular/core';
import { provideRouter, withHashLocation, withDisabledInitialNavigation } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptorsFromDi, HttpClient } from '@angular/common/http';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { MarkdownModule } from 'ngx-markdown';
import { routes } from './app.routes';
import { InitService } from './providers/init.service';
import { ToastrMessagesService } from './providers/toastr-messages.service';
import { ConfirmService } from './components/dialog-confirm/confirm.service';
import { InfoService } from './components/dialog-info/info.service';
import { AskForFeatureService } from './components/ask-for-feature/ask-for-feature.service';

const httpLoaderFactory = (http: HttpClient): TranslateHttpLoader =>
  new TranslateHttpLoader(http, './assets/i18n/', '.json');

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),
    provideRouter(routes, withHashLocation(), withDisabledInitialNavigation()),
    importProvidersFrom(
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: httpLoaderFactory,
          deps: [HttpClient],
        },
      }),
      MarkdownModule.forRoot(),
    ),
    InitService,
    {
      provide: APP_INITIALIZER,
      useFactory: (s: InitService) => () => s.initialize(),
      deps: [InitService],
      multi: true,
    },
    ToastrMessagesService,
    ConfirmService,
    InfoService,
    AskForFeatureService,
  ],
};
