import { Routes } from '@angular/router';
import { ConfigurationComponent } from './areas/_configuration/configuration.component';
import { ConfigurationCrudComponent } from './areas/_configuration-crud/configuration-crud.component';
import { HelpComponent } from './areas/_help/help.component';
import { ProcessingComponent } from './areas/_processing/processing.component';
import { NoJavaGuard } from './app-nojava-route-guard';

export const routes: Routes = [
  {
    path: '',
    component: ProcessingComponent,
  },
  {
    path: 'processing/:leftMenu',
    canActivate: [NoJavaGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingSampleBurst/:leftMenu/:prefilledInputFilePath/:prefilledConfigurationFilePath',
    canActivate: [NoJavaGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingSampleGenerate/:leftMenu/:prefilledSelectedMailMergeClassicReport/:prefilledInputFilePath',
    canActivate: [NoJavaGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingQa/:leftMenu',
    canActivate: [NoJavaGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingQa/:leftMenu/:prefilledInputFilePath',
    canActivate: [NoJavaGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingQa/:leftMenu/:prefilledInputFilePath/:prefilledConfigurationFilePath',
    canActivate: [NoJavaGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingQa/:leftMenu/:prefilledInputFilePath/:prefilledConfigurationFilePath/:whichAction',
    canActivate: [NoJavaGuard],
    component: ProcessingComponent,
  },
  {
    path: 'configuration/:leftMenu/:configurationFilePath/:configurationFileName/:reloadConfiguration',
    canActivate: [NoJavaGuard],
    component: ConfigurationComponent,
  },
  {
    path: 'configuration/:leftMenu/:configurationFilePath/:configurationFileName',
    canActivate: [NoJavaGuard],
    component: ConfigurationComponent,
  },
  {
    path: 'configuration-crud',
    redirectTo: 'configuration-crud/reports',
    pathMatch: 'full',
  },
  {
    path: 'configuration-crud/:section',
    canActivate: [NoJavaGuard],
    component: ConfigurationCrudComponent,
  },
  {
    path: 'configuration-explorer',
    redirectTo: 'configuration-crud/reports',
  },
  {
    path: 'configuration-explorer/:section',
    redirectTo: 'configuration-crud/:section',
  },
  {
    path: 'configuration-reports',
    redirectTo: 'configuration-crud/reports',
  },
  {
    path: 'configuration-connections',
    redirectTo: 'configuration-crud/connections',
  },
  {
    path: 'configuration-cubes',
    redirectTo: 'configuration-crud/cubes',
  },
  {
    path: 'help/:leftMenu',
    component: HelpComponent,
  },
];
