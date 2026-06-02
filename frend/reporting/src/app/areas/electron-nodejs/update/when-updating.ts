import { Component, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ConfigurationRepository } from '../../../providers/configuration-repository.service';
import { UpdateInfo } from '../updater';

import { whenUpdatingTemplate } from './when-updating.template';

@Component({
    selector: 'dburst-when-updating',
    template: ` ${whenUpdatingTemplate} `,
    standalone: true,
    imports: [CommonModule, FormsModule, TranslateModule],
})
export class WhenUpdatingComponent {
  //@Input() ctx: string = 'updatenow';
  ctx = input<string>('migratecopy');

  updateInfo = input.required<UpdateInfo>();

  constructor() {
    //console.log(`updateInfo = ${this.updateInfo}`);
  }
}
