import { Injectable, inject } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '../../providers/api.service';

// Define the structure for prompt information.
// promptText is optional — the list endpoint (/api/ai/prompts) returns metadata only;
// the detail endpoint (/api/ai/prompts/{id}) returns the full prompt including promptText.
export interface PromptInfo {
  id: string;
  title: string;
  description: string;
  promptText?: string;
  tags: string[];
  category:
    | 'Database Schema'
    | 'Template Creation/Modification'
    | 'Email Templates'
    | 'Email Templates (Responsive)'
    | 'Excel Report Generation'
    | 'JasperReports (.jrxml) Generation'
    | 'PDF Generation (from HTML)'
    | 'PDF Generation (from XSL-FO)'
    | 'SQL Writing Assistance'
    | 'Script Writing Assistance'
    | 'Dashboard Creation'
    | 'DSL Configuration'
    | 'Web Portal / CMS (WordPress)';
}

@Injectable({
  providedIn: 'root',
})
export class AiManagerService {
  // ApiService.BACKEND_URL already includes '/api' (resolves to http://localhost:9090/api
  // in Electron mode), so paths here are relative to that — no '/api' prefix needed.
  private apiService = inject(ApiService);

  /** Fetch all prompts — metadata only (no promptText). */
  getAllPrompts(): Observable<PromptInfo[]> {
    return from(this.apiService.get('/system/ai-prompts'));
  }

  /** Fetch a single prompt by id — includes full promptText. */
  getPromptById(id: string): Observable<PromptInfo> {
    return from(this.apiService.get(`/system/ai-prompts/${encodeURIComponent(id)}`));
  }

  /** Fetch all prompts then filter client-side by category. */
  getPromptsByCategory(category: PromptInfo['category']): Observable<PromptInfo[]> {
    return this.getAllPrompts().pipe(
      map((prompts) => prompts.filter((p) => p.category === category))
    );
  }
}
