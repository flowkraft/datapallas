import { Component, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DpDialogComponent } from '../dp/dialog/dp-dialog.component';

import { modalVariablesTemplate } from './modal-variables.template';
import { StateStoreService } from '../../providers/state-store.service';

@Component({
    selector: 'dburst-button-variables',
    template: `
    <button
      type="button"
      class="btn"
      (click)="onModalShow()"
      style="width: 100%;padding-left:6px"
      [disabled]="shouldBeDisabled()"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>&nbsp;Variables&nbsp;
    </button>
    @if (isModalVariablesVisible) {
      ${modalVariablesTemplate}
    }
  `,
    standalone: true,
    imports: [CommonModule, FormsModule, DpDialogComponent, TranslateModule],
})
export class ButtonVariablesComponent {
  isModalVariablesVisible = false;
  showMoreCheckBoxValue = false;

  variables: Array<{ name: string; type: string; active: boolean }>;

  shouldBeDisabled = input<boolean>(false);
  sendSelectedVariable = output<string>();

  constructor(
    protected stateStore: StateStoreService,
    private translate: TranslateService,
  ) {}

  builtInVariables = [
    {
      name: '${input_document_name}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${input_document_extension}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${output_type_extension}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${burst_token}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${burst_index}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${now?string["yyyy.MM.dd_HH.mm.ss"]}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${now_default_date}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${now_short_date}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${now_medium_date}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${now_long_date}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${now_full_date}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${now_quarter}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${extracted_file_path}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${extracted_file_paths_after_splitting_2nd_time}',
      type: 'built-in',
      active: false,
    },
    {
      name: '${dashboard_url}',
      type: 'built-in',
      active: false,
    },
  ];

  getShortListUserVariables() {
    if (
      this.stateStore.configSys.currentConfigFile.configuration.settings
        .numberofuservariables <= 5
    ) {
      return this.getAllUserVariables();
    } else {
      return this.getAllUserVariables().filter((variable) => {
        return ['${var0}', '${var1}', '${var2}'].includes(variable.name);
      });
    }
  }

  getAllUserVariables() {
    const allUserVariables = [];

    //console.log(
    //  `this.numberOfUserVariables = ${this.stateStore.configSys.currentConfigFile.configuration.settings.numberofuservariables}`,
    //);

    for (
      let i = 0;
      i <
      this.stateStore.configSys.currentConfigFile.configuration.settings
        .numberofuservariables;
      i++
    ) {
      allUserVariables.push({
        name: '${var' + i + '}',
        type: 'user-defined',
        active: false,
      });
    }

    //console.log(`allUserVariables = ${JSON.stringify(allUserVariables)}`);
    return allUserVariables;
  }

  getVariables(): Array<any> {
    return this.builtInVariables.concat(this.getAllUserVariables());
  }

  onShowMore() {
    if (this.showMoreCheckBoxValue) {
      this.variables = this.builtInVariables.concat(this.getAllUserVariables());
    } else {
      this.variables = this.builtInVariables.concat(
        this.getShortListUserVariables(),
      );
    }

    //console.log(
    //  `onShowMore() - this.variables = ${JSON.stringify(this.variables)}`,
    //);
  }

  onVariableClick(variable) {
    this.variables.forEach((element) => {
      element.active = element.name === variable.name ? true : false;
    });
  }

  getSelectedVariable(): {
    name: string;
    type: string;
    active: boolean;
  } {
    if (!this.variables) {
      return undefined;
    }

    return this.variables.find((variable) => {
      return variable.active;
    });
  }

  onModalShow() {
    this.onShowMore();

    this.isModalVariablesVisible = true;
  }

  onModalClose() {
    this.isModalVariablesVisible = false;
  }

  onModalOK() {
    this.sendSelectedVariable.emit(this.getSelectedVariable().name);
    this.isModalVariablesVisible = false;
  }
}
