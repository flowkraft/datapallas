import type { Meta, StoryObj} from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { baseMeta } from './_utils/setup';

import { StateStoreService } from '../app/providers/state-store.service';
import { JavaComponent } from '../app/areas/electron-nodejs/java/java.component';
import { ChocolateyComponent } from '../app/areas/electron-nodejs/chocolatey/chocolatey.component';
import { RbElectronService } from '../app/areas/electron-nodejs/electron.service';

type Story = StoryObj<JavaComponent>;

const defaultMeta: Meta<JavaComponent> = {
  ...baseMeta,
  title: 'DataPallas/Setup/Java',
  component: JavaComponent,
  decorators: [
    ...baseMeta.decorators,
    moduleMetadata({
      declarations: [ChocolateyComponent],
    }),
  ],
};

export default defaultMeta;

const mockElectronService = {
  restartElectronApp: () => console.log('restartElectronApp called'),
  typeCommandOnTerminalAndThenPressEnter: (command: string) =>
    console.log(`Command executed: ${command}`),
};

const storeServiceIsRestartRequiredTrue = new StateStoreService();

storeServiceIsRestartRequiredTrue.configSys.sysInfo.setup.isRestartRequired =
  true;

export const isRestartRequiredTrue: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: StateStoreService,
          useValue: storeServiceIsRestartRequiredTrue,
        },
        {
          provide: RbElectronService,
          useValue: mockElectronService,
        },
      ],
    },
  }),
};

const storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse1 =
  new StateStoreService();

storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse1.configSys.sysInfo.setup.isRestartRequired =
  false;

//storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse.configSys.sysInfo.setup.java.isJavaOk =
//  false;
//storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse.configSys.sysInfo.setup.chocolatey.isChocoOk =
//  false;

export const isRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse1: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: StateStoreService,
          useValue:
            storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse1,
        },
        {
          provide: RbElectronService,
          useValue: mockElectronService,
        },
      ],
    },
  }),
};

const storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse2 =
  new StateStoreService();

storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse2.configSys.sysInfo.setup.isRestartRequired =
  false;

storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse2.configSys.sysInfo.setup.java.isJavaOk =
  false;
storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse2.configSys.sysInfo.setup.chocolatey.isChocoOk =
  false;

export const isRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse2: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: StateStoreService,
          useValue:
            storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKFalse2,
        },
        {
          provide: RbElectronService,
          useValue: mockElectronService,
        },
      ],
    },
  }),
};

const storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKTrue =
  new StateStoreService();

storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKTrue.configSys.sysInfo.setup.isRestartRequired =
  false;

storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKTrue.configSys.sysInfo.setup.java.isJavaOk =
  false;
storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKTrue.configSys.sysInfo.setup.chocolatey.isChocoOk =
  true;

export const isRestartRequiredFalseIsJavaOKFalseIsChocoOKTrue: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: StateStoreService,
          useValue:
            storeServiceIsRestartRequiredFalseIsJavaOKFalseIsChocoOKTrue,
        },
        {
          provide: RbElectronService,
          useValue: mockElectronService,
        },
      ],
    },
  }),
};

const storeServiceIsRestartRequiredFalseIsJavaOKTrueIsChocoOKTrue =
  new StateStoreService();

storeServiceIsRestartRequiredFalseIsJavaOKTrueIsChocoOKTrue.configSys.sysInfo.setup.isRestartRequired =
  false;

storeServiceIsRestartRequiredFalseIsJavaOKTrueIsChocoOKTrue.configSys.sysInfo.setup.java.isJavaOk =
  true;
storeServiceIsRestartRequiredFalseIsJavaOKTrueIsChocoOKTrue.configSys.sysInfo.setup.chocolatey.isChocoOk =
  true;

export const isRestartRequiredFalseIsJavaOKTrueIsChocoOKTrue: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: StateStoreService,
          useValue: storeServiceIsRestartRequiredFalseIsJavaOKTrueIsChocoOKTrue,
        },
        {
          provide: RbElectronService,
          useValue: mockElectronService,
        },
      ],
    },
  }),
};
