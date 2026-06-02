import type { Meta, StoryObj } from '@storybook/angular';
import { ButtonClearLogsComponent } from '../app/components/button-clear-logs/button-clear-logs.component';
import { ExecutionStatsService } from '../app/providers/execution-stats.service';
import { baseMeta } from './_utils/setup';

type Story = StoryObj<ButtonClearLogsComponent>;
const defaultMeta: Meta<ButtonClearLogsComponent> = {
  ...baseMeta,
  title: 'DataPallas/Buttons/ButtonClearLogs',
  component: ButtonClearLogsComponent,
};

export default defaultMeta;

const executionStatsServiceNoJobsAndEmptyLogs = new ExecutionStatsService();

executionStatsServiceNoJobsAndEmptyLogs.jobStats.numberOfActiveJobs = 0;
executionStatsServiceNoJobsAndEmptyLogs.logStats.foundDirtyLogFiles = false;

export const NoJobsAndEmptyLogsShouldBeDisabled: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: ExecutionStatsService,
          useValue: executionStatsServiceNoJobsAndEmptyLogs,
        },
      ],
    },
  }),
};

const executionStatsServiceOneJobAndEmptyLogs = new ExecutionStatsService();

executionStatsServiceOneJobAndEmptyLogs.jobStats.numberOfActiveJobs = 1;
executionStatsServiceOneJobAndEmptyLogs.logStats.foundDirtyLogFiles = false;

export const OneJobAndEmptyLogsShouldBeDisabled: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: ExecutionStatsService,
          useValue: executionStatsServiceOneJobAndEmptyLogs,
        },
      ],
    },
  }),
};

const executionStatsServiceNoJobsAndDirtyLogs = new ExecutionStatsService();

executionStatsServiceNoJobsAndDirtyLogs.jobStats.numberOfActiveJobs = 0;
executionStatsServiceNoJobsAndDirtyLogs.logStats.foundDirtyLogFiles = true;

export const NoJobsAndDirtyLogsShouldBeEnabled: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: ExecutionStatsService,
          useValue: executionStatsServiceNoJobsAndDirtyLogs,
        },
      ],
    },
  }),
};

const executionStatsServiceOneJobAndDirtyLogs = new ExecutionStatsService();

executionStatsServiceOneJobAndDirtyLogs.jobStats.numberOfActiveJobs = 0;
executionStatsServiceOneJobAndDirtyLogs.logStats.foundDirtyLogFiles = true;

export const OneJobAndDirtyLogsShouldBeEnabled: Story = {
  render: () => ({
    // Define application-wide providers directly in the render function
    applicationConfig: {
      providers: [
        {
          provide: ExecutionStatsService,
          useValue: executionStatsServiceOneJobAndDirtyLogs,
        },
      ],
    },
  }),
};
