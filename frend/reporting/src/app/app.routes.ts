import { Routes } from '@angular/router';
import { ConfigurationComponent } from './areas/_configuration/configuration.component';
import { ConfigurationCrudComponent } from './areas/_configuration-crud/configuration-crud.component';
import { HelpComponent } from './areas/_help/help.component';
import { ProcessingComponent } from './areas/_processing/processing.component';
import { LoginComponent } from './areas/_login/login.component';
import { NoJavaGuard } from './app-nojava-route-guard';
import { AuthGuard } from './app-auth-route-guard';
import { CapabilityGuard } from './app-capability-route-guard';

export const routes: Routes = [
  {
    // No NoJavaGuard here, matching the pre-auth behaviour: the landing route must render even when
    // Java is missing, so Help can explain how to install it. ProcessingComponent handles that state
    // itself.
    //
    // AuthGuard, however, belongs on the very first screen more than on any other. Without it a
    // server opens straight into Processing and fires every backend call it makes as an anonymous
    // caller — which is not a login screen, it is a working screen full of empty lists. The guard
    // costs the desktop nothing: it passes through whenever the mode is not a server, including
    // while the identity is still unknown.
    path: '',
    canActivate: [AuthGuard],
    component: ProcessingComponent,
  },
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: 'processing/:leftMenu',
    canActivate: [NoJavaGuard, AuthGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingSampleBurst/:leftMenu/:prefilledInputFilePath/:prefilledConfigurationFilePath',
    canActivate: [NoJavaGuard, AuthGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingSampleGenerate/:leftMenu/:prefilledSelectedMailMergeClassicReport/:prefilledInputFilePath',
    canActivate: [NoJavaGuard, AuthGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingQa/:leftMenu',
    canActivate: [NoJavaGuard, AuthGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingQa/:leftMenu/:prefilledInputFilePath',
    canActivate: [NoJavaGuard, AuthGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingQa/:leftMenu/:prefilledInputFilePath/:prefilledConfigurationFilePath',
    canActivate: [NoJavaGuard, AuthGuard],
    component: ProcessingComponent,
  },
  {
    path: 'processingQa/:leftMenu/:prefilledInputFilePath/:prefilledConfigurationFilePath/:whichAction',
    canActivate: [NoJavaGuard, AuthGuard],
    component: ProcessingComponent,
  },
  {
    path: 'configuration/:leftMenu/:configurationFilePath/:configurationFileName/:reloadConfiguration',
    canActivate: [NoJavaGuard, AuthGuard, CapabilityGuard],
    data: { capability: 'viewConfiguration' },
    component: ConfigurationComponent,
  },
  {
    path: 'configuration/:leftMenu/:configurationFilePath/:configurationFileName',
    canActivate: [NoJavaGuard, AuthGuard, CapabilityGuard],
    data: { capability: 'viewConfiguration' },
    component: ConfigurationComponent,
  },
  {
    path: 'configuration-crud',
    redirectTo: 'configuration-crud/reports',
    pathMatch: 'full',
  },
  {
    path: 'configuration-crud/:section',
    canActivate: [NoJavaGuard, AuthGuard, CapabilityGuard],
    data: { capability: 'viewConfiguration' },
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
