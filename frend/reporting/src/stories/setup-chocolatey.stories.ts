import type { Meta, StoryObj } from '@storybook/angular';
import { baseMeta } from './_utils/setup';
import { StateStoreService } from '../app/providers/state-store.service';
import { ChocolateyComponent } from '../app/areas/electron-nodejs/chocolatey/chocolatey.component';
import { RbElectronService } from '../app/areas/electron-nodejs/electron.service';

type Story = StoryObj<ChocolateyComponent>;
const defaultMeta: Meta<ChocolateyComponent> = {
  ...baseMeta,
  title: 'DataPallas/Setup/Chocolatey',
  component: ChocolateyComponent,
};

export default defaultMeta;

const mockElectronService = {
  typeCommandOnTerminalAndThenPressEnter: (command: string) =>
    console.log(`Command executed: ${command}`),
};

const storeServiceIsChocoOkFalse = new StateStoreService();

storeServiceIsChocoOkFalse.configSys.sysInfo.setup.chocolatey.isChocoOk = false;

export const IsChocoOkFalse: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: StateStoreService,
          useValue: storeServiceIsChocoOkFalse,
        },
        {
          provide: RbElectronService,
          useValue: mockElectronService,
        },
      ],
    },
  }),
};

const storeServiceIsChocoOkTrue = new StateStoreService();

storeServiceIsChocoOkTrue.configSys.sysInfo.setup.chocolatey.isChocoOk = true;

export const IsChocoOkTrue: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: StateStoreService,
          useValue: storeServiceIsChocoOkTrue,
        },
        {
          provide: RbElectronService,
          useValue: mockElectronService,
        },
      ],
    },
  }),
};
