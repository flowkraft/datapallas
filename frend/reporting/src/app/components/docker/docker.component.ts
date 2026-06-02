import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { dockerTemplate } from './docker.template';
import { StateStoreService } from '../../providers/state-store.service';

@Component({
    selector: 'dburst-docker',
    template: ` ${dockerTemplate} `,
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, TranslateModule],
})
export class DockerComponent {
  constructor(
    protected stateStore: StateStoreService, 
  ) {
    //console.log('DockerComponent stateStore:', JSON.stringify(this.stateStore));
  }

}
