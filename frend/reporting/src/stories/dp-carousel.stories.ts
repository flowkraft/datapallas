import type { Meta, StoryObj } from '@storybook/angular';
import { DpCarouselComponent } from '../app/components/dp/carousel/dp-carousel.component';

const meta: Meta<DpCarouselComponent> = {
  title: 'DataPallas/Components/DpCarousel',
  component: DpCarouselComponent,
};
export default meta;
type Story = StoryObj<DpCarouselComponent>;

const reportSteps = [
  { title: 'Step 1: Upload Report', desc: 'Upload a PDF or Excel file containing burst tokens.' },
  { title: 'Step 2: Configure Burst', desc: 'Define burst tokens, output format and file naming.' },
  { title: 'Step 3: Deliver', desc: 'Send reports by email, FTP, SharePoint or local folder.' },
];

export const ReportOnboardingSteps: Story = {
  args: { circular: true },
  render: (args) => ({
    props: { ...args, items: reportSteps },
    moduleMetadata: { imports: [DpCarouselComponent] },
    template: `
      <dp-carousel [value]="items" [circular]="circular" [style]="{minHeight: '130px', width: '400px'}">
        <ng-template #item let-step>
          <div class="card bg-base-200 shadow-sm p-4 m-2">
            <h3 class="font-bold text-base">{{ step.title }}</h3>
            <p class="text-sm text-base-content/70 mt-1">{{ step.desc }}</p>
          </div>
        </ng-template>
      </dp-carousel>
    `,
  }),
};

export const SingleItem: Story = {
  args: { circular: false },
  render: (args) => ({
    props: { ...args, items: [reportSteps[0]] },
    moduleMetadata: { imports: [DpCarouselComponent] },
    template: `
      <dp-carousel [value]="items" [circular]="circular" [style]="{minHeight: '130px', width: '400px'}">
        <ng-template #item let-step>
          <div class="card bg-base-200 shadow-sm p-4 m-2">
            <h3 class="font-bold text-base">{{ step.title }}</h3>
            <p class="text-sm text-base-content/70 mt-1">{{ step.desc }}</p>
          </div>
        </ng-template>
      </dp-carousel>
    `,
  }),
};
