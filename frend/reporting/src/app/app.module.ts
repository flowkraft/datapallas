// rb web components (tabulator, chart, pivot table, parameters)
import '../assets/web-components/rb-webcomponents.es';

import { BrowserModule } from '@angular/platform-browser';
import { APP_INITIALIZER, NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { SharedModule } from './shared/shared.module';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

// NG Translate
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { AppComponent } from './app.component';
import { AreasModule } from './areas/areas.module';
import { InitService } from './providers/init.service';
import { CommonModule } from '@angular/common';
const httpLoaderFactory = (http: HttpClient): TranslateHttpLoader =>
  new TranslateHttpLoader(http, './assets/i18n/', '.json');

@NgModule({
  declarations: [AppComponent],
  imports: [
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: httpLoaderFactory,
        deps: [HttpClient],
      },
    }),
    SharedModule,
    AreasModule,
    CommonModule,
    BrowserModule,
    FormsModule,
    HttpClientModule,
    BrowserAnimationsModule,
  ],
  providers: [
    InitService,
    {
      provide: APP_INITIALIZER,
      useFactory: (initService: InitService) => () => initService.initialize(),
      deps: [InitService],
      multi: true,
    }, // Add the icon loader provider here
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
