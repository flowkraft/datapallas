import './assets/web-components/rb-webcomponents.es';
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { APP_CONFIG } from './environments/environment';
import { DP_THEME_KEY, DP_DEFAULT_THEME } from './app/shared/theme-defaults';

document.documentElement.setAttribute(
  'data-theme',
  localStorage.getItem(DP_THEME_KEY) || DP_DEFAULT_THEME,
);

if (APP_CONFIG.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));
