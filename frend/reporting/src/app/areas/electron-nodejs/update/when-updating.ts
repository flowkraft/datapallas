import { Component, OnInit, input } from '@angular/core';
import { ConfigurationRepository } from '../../../providers/configuration-repository.service';
import { UpdateInfo } from '../updater';

import { whenUpdatingTemplate } from './when-updating.template';

@Component({
    selector: 'dburst-when-updating',
    template: ` ${whenUpdatingTemplate} `,
    standalone: false
})
export class WhenUpdatingComponent {
  //@Input() ctx: string = 'updatenow';
  ctx = input<string>('migratecopy');

  updateInfo = input.required<UpdateInfo>();

  constructor() {
    //console.log(`updateInfo = ${this.updateInfo}`);
  }
}
