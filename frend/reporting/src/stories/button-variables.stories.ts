import type { Meta, StoryObj } from '@storybook/angular';
import type { ButtonClearLogsComponent } from '../app/components/button-clear-logs/button-clear-logs.component';
import { baseMeta } from './_utils/setup';
import { ButtonVariablesComponent } from '../app/components/button-variables/button-variables.component';
import { StateStoreService } from '../app/providers/state-store.service';

type Story = StoryObj<ButtonClearLogsComponent>;
const defaultMeta: Meta<ButtonClearLogsComponent> = {
  ...baseMeta,
  title: 'DataPallas/Buttons/ButtonVariables',
  component: ButtonVariablesComponent,
};

export default defaultMeta;

const storeVariables = new StateStoreService();

storeVariables.configSys.currentConfigFile.configuration.settings.numberofuservariables = 2;

export const ShouldHaveTwoUseDefinedVariables: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: StateStoreService,
          useValue: storeVariables,
        },
      ],
    },
  }),
};
