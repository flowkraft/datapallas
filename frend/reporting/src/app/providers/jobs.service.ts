import { Injectable } from '@angular/core';
import { ApiService } from './api.service';

/**
 * Jobs domain service — wraps /api/jobs/* endpoints.
 * Handles file uploads for processing, job control (pause/cancel/resume),
 * quarantine management, and atomic burst pipeline operations.
 * Mirrors the backend JobsController vocabulary (V2 aligned).
 */
@Injectable({
  providedIn: 'root',
})
export class JobsService {
  constructor(protected apiService: ApiService) {}

  // ========== File uploads ==========

  async uploadSingle(formData: FormData): Promise<any> {
    const customHeaders = new Headers({ Accept: 'application/json' });
    return this.apiService.post('/jobs/upload-and-burst', formData, customHeaders);
  }

  async uploadMultiple(formData: FormData): Promise<any> {
    const customHeaders = new Headers({ Accept: 'application/json' });
    return this.apiService.post('/jobs/upload-and-burst-many', formData, customHeaders);
  }

  async uploadQa(formData: FormData): Promise<any> {
    const customHeaders = new Headers({ Accept: 'application/json' });
    return this.apiService.post('/jobs/upload-and-qa', formData, customHeaders);
  }

  // ========== Job control ==========

  async pause(jobFilePath: string): Promise<any> {
    return this.apiService.post('/jobs/pause', { id: 'pause', info: jobFilePath });
  }

  async cancel(jobFilePath: string): Promise<any> {
    return this.apiService.post('/jobs/cancel', { id: 'cancel', info: jobFilePath });
  }

  /** @deprecated Use pause() or cancel() directly. Kept for existing callers. */
  async pauseOrCancel(command: string, jobFilePath: string): Promise<any> {
    return command === 'pause' ? this.pause(jobFilePath) : this.cancel(jobFilePath);
  }

  async clearQuarantine(): Promise<any> {
    return this.apiService.delete('/jobs/quarantine');
  }

  // ========== IN-PROCESS JOB EXECUTION ==========

  async burst(params: { inputFile: string; reportId?: string }): Promise<any> {
    return this.apiService.post('/jobs/burst', params);
  }

  async generate(params: {
    reportId: string;
    input?: string;
    params?: Record<string, string>;
  }): Promise<any> {
    return this.apiService.post('/jobs/generate', params);
  }

  async merge(params: {
    listFile: string;
    outputName: string;
    burst?: boolean;
    reportId?: string;
  }): Promise<any> {
    return this.apiService.post('/jobs/merge', params);
  }

  async prepareMergeList(filePaths: string[]): Promise<{ listFile: string }> {
    return this.apiService.post('/jobs/merge-prepare-list', { filePaths });
  }

  // ========== Stats ==========

  async getStats(): Promise<any> {
    return this.apiService.get('/jobs/stats');
  }
}
