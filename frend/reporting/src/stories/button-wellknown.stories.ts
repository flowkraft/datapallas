import type { Meta, StoryObj } from '@storybook/angular';
import { baseMeta } from './_utils/setup';
import { ButtonWellKnownEmailProvidersComponent } from '../app/components/button-well-known/button-well-known.component';

type Story = StoryObj<ButtonWellKnownEmailProvidersComponent>;
const defaultMeta: Meta<ButtonWellKnownEmailProvidersComponent> = {
  ...baseMeta,
  title: 'DataPallas/Buttons/ButtonWellKnownEmailProviders',
  component: ButtonWellKnownEmailProvidersComponent,
};

export default defaultMeta;

export const ShouldLookOK: Story = {};
