import type { Meta, StoryObj } from '@storybook/angular';
import { BrandComponent } from '../app/components/brand/brand.component';

type Story = StoryObj<BrandComponent>;
const meta: Meta<BrandComponent> = {
  title: 'DataPallas/Brand',
  component: BrandComponent,
};
// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export default meta;

export const DataPallas: Story = {};
