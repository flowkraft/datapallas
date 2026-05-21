import type { Meta, StoryObj } from '@storybook/angular';
import { DpDrawerComponent } from '../app/components/dp/drawer/dp-drawer.component';

const meta: Meta<DpDrawerComponent> = {
  title: 'DataPallas/Components/DpDrawer',
  component: DpDrawerComponent,
  argTypes: {
    position: { control: { type: 'radio', options: ['left', 'right'] } },
    visible: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<DpDrawerComponent>;

export const FilterPanel: Story = {
  args: { visible: true, position: 'right' },
  render: (args) => ({
    props: args,
    moduleMetadata: { imports: [DpDrawerComponent] },
    template: `
      <dp-drawer [visible]="visible" [position]="position" [style]="{width: '300px'}">
        <div class="p-4">
          <h3 class="font-bold text-lg mb-4">Report Filters</h3>
          <div class="form-control mb-3">
            <label class="label text-sm font-medium">Date range</label>
            <select class="select select-bordered w-full select-sm">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last 90 days</option>
              <option>Custom range</option>
            </select>
          </div>
          <div class="form-control mb-3">
            <label class="label text-sm font-medium">Output format</label>
            <div class="flex flex-col gap-1">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" class="checkbox checkbox-sm" checked />
                <span class="text-sm">PDF</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" class="checkbox checkbox-sm" />
                <span class="text-sm">Excel</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" class="checkbox checkbox-sm" />
                <span class="text-sm">CSV</span>
              </label>
            </div>
          </div>
          <button class="btn btn-primary w-full mt-4">Apply Filters</button>
        </div>
      </dp-drawer>
    `,
  }),
};

export const NavigationDrawer: Story = {
  args: { visible: true, position: 'left' },
  render: (args) => ({
    props: args,
    moduleMetadata: { imports: [DpDrawerComponent] },
    template: `
      <dp-drawer [visible]="visible" [position]="position" [style]="{width: '260px'}">
        <nav class="p-4">
          <h3 class="font-bold text-lg mb-4">DataPallas</h3>
          <ul class="menu menu-sm gap-1">
            <li><a class="active">Dashboard</a></li>
            <li><a>Burst Reports</a></li>
            <li><a>Email Delivery</a></li>
            <li><a>Scheduled Jobs</a></li>
            <li><a>Logs</a></li>
            <li class="mt-4"><a>Settings</a></li>
          </ul>
        </nav>
      </dp-drawer>
    `,
  }),
};
