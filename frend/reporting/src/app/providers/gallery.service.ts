import { Injectable } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class GalleryService {
  constructor(private apiService: ApiService) {}

  /**
   * Load gallery template HTML content + asset base directory.
   */
  async loadTemplateContent(
    templateId: string,
    variant: number = 0,
  ): Promise<{ content: string; assetBaseDir: string }> {
    return this.apiService.get(`/system/gallery/templates/${encodeURIComponent(templateId)}/content`, { variant });
  }

  /**
   * Load gallery template README.
   */
  async loadTemplateReadme(templateId: string, variant: number = 0): Promise<string> {
    const textHeaders = new Headers({ Accept: 'text/plain' });
    return this.apiService.get(
      `/system/gallery/templates/${encodeURIComponent(templateId)}/readme`,
      { variant },
      textHeaders,
      'text',
    );
  }

  /**
   * Load gallery template AI prompt (type: 'modify' or 'scratch').
   */
  async loadTemplateAiPrompt(
    templateId: string,
    type: 'modify' | 'scratch',
    variant: number = 0,
  ): Promise<string> {
    const textHeaders = new Headers({ Accept: 'text/plain' });
    return this.apiService.get(
      `/system/gallery/templates/${encodeURIComponent(templateId)}/ai-prompt`,
      { type, variant },
      textHeaders,
      'text',
    );
  }

  /**
   * Get the URL to view a gallery template in the browser.
   */
  getTemplateViewUrl(templateId: string, variant: number = 0): string {
    return `/api/system/gallery/templates/${encodeURIComponent(templateId)}/view?variant=${variant}`;
  }
}
