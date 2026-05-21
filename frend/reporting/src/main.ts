import './assets/web-components/rb-webcomponents.es';
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { APP_CONFIG } from './environments/environment';

document.documentElement.setAttribute(
  'data-theme',
  localStorage.getItem('dp-theme') || 'light',
);

if (APP_CONFIG.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));
