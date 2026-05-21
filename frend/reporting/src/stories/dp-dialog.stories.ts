import type { Meta, StoryObj } from '@storybook/angular';
import { DpDialogComponent } from '../app/components/dp/dialog/dp-dialog.component';

const meta: Meta<DpDialogComponent> = {
  title: 'DataPallas/Components/DpDialog',
  component: DpDialogComponent,
};
export default meta;
type Story = StoryObj<DpDialogComponent>;

export const ConfirmationDialog: Story = {
  args: { header: 'Confirmation', visible: true, closable: true },
  render: (args) => ({
    props: args,
    moduleMetadata: { imports: [DpDialogComponent] },
    template: `
      <dp-dialog [header]="header" [visible]="visible" [closable]="closable">
        <p>Do you want to proceed with this action?</p>
        <div ngProjectAs="[footer]">
          <button class="btn btn-primary">Yes</button>
          <button class="btn btn-secondary">No</button>
        </div>
      </dp-dialog>
    `,
  }),
};

export const ReportSettingsDialog: Story = {
  args: { header: 'Report Settings', visible: true, closable: true },
  render: (args) => ({
    props: args,
    moduleMetadata: { imports: [DpDialogComponent] },
    template: `
      <dp-dialog [header]="header" [visible]="visible" [closable]="closable">
        <div class="flex flex-col gap-3 mt-2" style="min-width:340px">
          <div class="form-control">
            <label class="label text-sm">Output format</label>
            <select class="select select-bordered w-full">
              <option>PDF</option><option>Excel</option><option>CSV</option>
            </select>
          </div>
          <div class="form-control">
            <label class="label text-sm">Recipients</label>
            <input type="text" class="input input-bordered" placeholder="email@example.com" />
          </div>
        </div>
        <div ngProjectAs="[footer]">
          <button class="btn btn-primary">Save</button>
          <button class="btn btn-ghost">Cancel</button>
        </div>
      </dp-dialog>
    `,
  }),
};

export const ProcessingDialog: Story = {
  args: { header: 'Processing...', visible: true, closable: false },
  render: (args) => ({
    props: args,
    moduleMetadata: { imports: [DpDialogComponent] },
    template: `
      <dp-dialog [header]="header" [visible]="visible" [closable]="closable">
        <div class="flex items-center gap-3 py-2">
          <span class="loading loading-spinner loading-md"></span>
          <span>Generating report, please wait...</span>
        </div>
      </dp-dialog>
    `,
  }),
};
