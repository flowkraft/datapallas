import type { Meta, StoryObj } from '@storybook/angular';
import { baseMeta } from './_utils/setup';
import { ButtonHtmlPreviewComponent } from '../app/components/button-html-preview/button-html-preview.component';

type Story = StoryObj<ButtonHtmlPreviewComponent>;
const defaultMeta: Meta<ButtonHtmlPreviewComponent> = {
  ...baseMeta,
  title: 'DataPallas/Buttons/ButtonHTMLPreview',
  component: ButtonHtmlPreviewComponent,
};

export default defaultMeta;

export const ShouldLookOK: Story = {
  args: {
    htmlCode: '<H1>Hard-coded button text</H1>',
  },
};
