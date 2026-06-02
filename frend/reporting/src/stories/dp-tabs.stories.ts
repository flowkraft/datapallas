import type { Meta, StoryObj } from '@storybook/angular';
import { DpTabsComponent } from '../app/components/dp/tabs/dp-tabs.component';
import { DpTabComponent } from '../app/components/dp/tabs/dp-tab.component';

const meta: Meta<DpTabsComponent> = {
  title: 'DataPallas/Components/DpTabs',
  component: DpTabsComponent,
};
export default meta;
type Story = StoryObj<DpTabsComponent>;

export const ThreeTabs: Story = {
  render: () => ({
    moduleMetadata: { imports: [DpTabsComponent, DpTabComponent] },
    template: `
      <dp-tabs>
        <dp-tab heading="Overview">
          <div class="p-4">
            <h4 class="font-semibold mb-2">Report Overview</h4>
            <p class="text-sm text-base-content/70">Configure general report burst settings here.</p>
          </div>
        </dp-tab>
        <dp-tab heading="Email Settings">
          <div class="p-4">
            <h4 class="font-semibold mb-2">Email Delivery</h4>
            <p class="text-sm text-base-content/70">SMTP server, recipients and subject template.</p>
          </div>
        </dp-tab>
        <dp-tab heading="License">
          <div class="p-4">
            <h4 class="font-semibold mb-2">License Information</h4>
            <p class="text-sm text-base-content/70">DataPallas license key and activation status.</p>
          </div>
        </dp-tab>
      </dp-tabs>
    `,
  }),
};

export const TwoTabsSecondActive: Story = {
  args: { activeIndex: 1 },
  render: (args) => ({
    props: args,
    moduleMetadata: { imports: [DpTabsComponent, DpTabComponent] },
    template: `
      <dp-tabs [activeIndex]="activeIndex">
        <dp-tab heading="Burst Settings">
          <div class="p-4">
            <p class="text-sm">Burst token pattern and output file naming rules.</p>
          </div>
        </dp-tab>
        <dp-tab heading="SFTP / FTP">
          <div class="p-4">
            <p class="text-sm">Remote file transfer configuration (active tab).</p>
          </div>
        </dp-tab>
      </dp-tabs>
    `,
  }),
};
