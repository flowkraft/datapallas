import { Injectable } from '@angular/core';

import Utilities from '../../helpers/utilities';
import { FsService } from '../../providers/fs.service';

@Injectable({
  providedIn: 'root',
})
export class DesktopAdminService {
  constructor(protected fsService: FsService) {}

  async createJobFile(jobType: string): Promise<string> {
    let filePath = '';
    if (jobType === 'update')
      filePath = `samples/burst/updating DocumentBurster, please wait`;

    const jobFileName = Utilities.getRandomJobFileName();

    const jobFilePath = `temp/${jobFileName}`;
    const jobFileContent = Utilities.getJobFileContent(
      filePath,
      jobType,
      '14234234324324',
    );

    await this.fsService.writeAsync(jobFilePath, jobFileContent);
    return jobFilePath;
  }
}
