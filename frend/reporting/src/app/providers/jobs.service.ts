import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

export interface JobRecord {
  jobId: string;
  type: string;
  status: 'queued' | 'running' | 'paused' | 'done' | 'failed';
  startedAt: string;
  completedAt?: string;
  resultMetadata?: Record<string, any>;
}

/**
 * Jobs domain service — wraps /api/jobs/* endpoints.
 *
 * Dispatch: submitJob() → POST /api/jobs → 202 + { jobId }
 * Lifecycle: cancelJob(), pauseJob(), resumeJob() → DELETE/PATCH /api/jobs/{id}
 * Status:    getJobStatus() → GET /api/jobs/{id}
 * SSE logs:  openJobLogStream() → GET /api/jobs/{id}/logs (EventSource)
 * List:      getJobs() → GET /api/jobs
 *
 * Housekeeping (not dispatch):
 *   uploadSingle / uploadMultiple / uploadQa — file upload + burst
 *   clearQuarantine — DELETE /api/jobs/quarantine
 *   prepareMergeList — POST /api/jobs/merge-prepare-list
 *   clearResumeJobFile — DELETE /api/jobs/resume-file (pre-C9 paused jobs)
 */
@Injectable({
  providedIn: 'root',
})
export class JobsService {
  protected apiService = inject(ApiService);

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

  // ========== Async job dispatch ==========

  /** Submit a job. Returns 202 { jobId } — store the id to poll status or cancel. */
  async submitJob(
    type: 'burst' | 'generate' | 'merge',
    params: Record<string, any>,
  ): Promise<{ jobId: string; status: string }> {
    return this.apiService.post('/jobs', { type, ...params });
  }

  // ========== Job lifecycle ==========

  async getJobStatus(jobId: string): Promise<JobRecord> {
    return this.apiService.get(`/jobs/${jobId}`);
  }

  async getJobs(filter?: { status?: string; limit?: number }): Promise<JobRecord[]> {
    const params: Record<string, any> = {};
    if (filter?.status) params['status'] = filter.status;
    if (filter?.limit != null) params['limit'] = filter.limit;
    return this.apiService.get('/jobs', params);
  }

  /** Cancel a running job by UUID. */
  async cancelJob(jobId: string): Promise<void> {
    return this.apiService.delete(`/jobs/${jobId}`);
  }

  /** Pause a running job by UUID. */
  async pauseJob(jobId: string): Promise<void> {
    return this.apiService.patch(`/jobs/${jobId}`, { action: 'pause' });
  }

  /** Resume a paused job by UUID. */
  async resumeJob(jobId: string): Promise<void> {
    return this.apiService.patch(`/jobs/${jobId}`, { action: 'resume' });
  }

  /**
   * Open an SSE stream for per-job status events.
   * Emits { status, id } events: queued → running → done | failed.
   * Caller is responsible for closing the returned EventSource.
   */
  openJobLogStream(jobId: string): EventSource {
    return new EventSource(
      `${this.apiService.BACKEND_URL}/api/jobs/${jobId}/logs`,
    );
  }

  // ========== Housekeeping ==========

  async clearQuarantine(): Promise<any> {
    return this.apiService.delete('/jobs/quarantine');
  }

  async prepareMergeList(filePaths: string[]): Promise<{ listFile: string }> {
    return this.apiService.post('/jobs/merge-prepare-list', { filePaths });
  }

  /**
   * Remove a resume-pending job file that has no UUID in JobStore.
   * Used for jobs that were paused before C9 was introduced.
   */
  async clearResumeJobFile(jobFilePath: string): Promise<void> {
    return this.apiService.delete(
      `/jobs/resume-file?path=${encodeURIComponent(jobFilePath)}`,
    );
  }
}
