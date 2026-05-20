import { Component } from '@angular/core';

import { dockerTemplate } from './docker.template';
import { StateStoreService } from '../../providers/state-store.service';

@Component({
    selector: 'dburst-docker',
    template: ` ${dockerTemplate} `,
    standalone: false
})
export class DockerComponent {
  constructor(
    protected stateStore: StateStoreService, 
  ) {
    //console.log('DockerComponent stateStore:', JSON.stringify(this.stateStore));
  }

}
