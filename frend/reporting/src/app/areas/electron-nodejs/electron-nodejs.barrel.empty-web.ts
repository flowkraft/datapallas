import { Component, Injectable } from '@angular/core';

@Component({ selector: 'dburst-java', standalone: true, template: '' })
export class JavaComponent {}

@Component({ selector: 'dburst-extra-packages', standalone: true, template: '' })
export class ExtraPackagesComponent {}

@Component({ selector: 'dburst-terminal', standalone: true, template: '' })
export class TerminalComponent {}

@Component({ selector: 'dburst-system-diagnostics', standalone: true, template: '' })
export class SystemDiagnosticsComponent {}

@Component({ selector: 'dburst-chocolatey', standalone: true, template: '' })
export class ChocolateyComponent {}

@Component({ selector: 'dburst-button-native-system-dialog', standalone: true, template: '' })
export class ButtonNativeSystemDialogComponent {}

@Component({ selector: 'dburst-update', standalone: true, template: '' })
export class UpdateComponent {}

@Component({ selector: 'dburst-when-updating', standalone: true, template: '' })
export class WhenUpdatingComponent {}

@Injectable({ providedIn: 'root' })
export class DesktopAdminService {
  typeCommandOnTerminalAndThenPressEnter(_command: string): void {}
  createJobFile(_tag: string): Promise<string> { return Promise.resolve(''); }
}

export { RbElectronService } from './electron.service.empty-web';
