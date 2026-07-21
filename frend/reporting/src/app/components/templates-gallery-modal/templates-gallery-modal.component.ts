import { Component, input, output, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MarkdownModule } from 'ngx-markdown';
import { HtmlDocTemplateDisplay, HtmlDocTemplateInfo, SamplesService } from '../../providers/samples.service';
import { ConfirmService } from '../dialog-confirm/confirm.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { TranslateService } from '@ngx-translate/core';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { ReportsService } from '../../providers/reports.service';
import { GalleryService } from '../../providers/gallery.service';
import { ApiService } from '../../providers/api.service';
import { DpDialogComponent } from '../dp/dialog/dp-dialog.component';
import { DpCarouselComponent } from '../dp/carousel/dp-carousel.component';
import { ScaleIframeDirective } from '../../helpers/scale-iframe';

@Component({
    selector: 'dburst-templates-gallery-modal',
    templateUrl: './templates-gallery-modal.template.html',
    standalone: true,
    imports: [CommonModule, TranslateModule, MarkdownModule, DpDialogComponent, DpCarouselComponent, ScaleIframeDirective],
})
export class TemplatesGalleryModalComponent {

  galleryTags = input<string[] | null>(null);
  useTemplate = output<HtmlDocTemplateDisplay>();

  constructor(
    protected settingsService: ConfigurationRepository,
    protected reportsService: ReportsService,
    protected galleryService: GalleryService,
    protected messagesService: ToastrMessagesService,
    protected translateService: TranslateService,
    protected sanitizer: DomSanitizer,
    protected confirmService: ConfirmService,
    protected samplesService: SamplesService,
    protected apiService: ApiService,
  ) { }

  templateSanitizedHtmlCache = new Map<string, SafeHtml>();

  // With this single state variable:
  templateGalleryState: string = 'closed'; // Possible values: 'closed', 'examples-gallery', 'hey-ai', 'readme', 'ai-prompt'

  selectedTemplateAiPrompt: string = '';
  selectedPromptType: 'modify' | 'rebuild' | null = null;
  galleryDialogTitle = 'Examples (Gallery)';

  galleryTemplates: HtmlDocTemplateDisplay[] = [];
  allAvailableTemplates: HtmlDocTemplateInfo[] = []; // Store all templates once loaded
  templatesLoaded = false;

  selectedGalleryTemplateIndex = 0;

  templatePreviewFadeState: string = 'visible';

  selectedTemplateReadme: string = '';
  previousStateBeforeReadme: any = null;
  previousStateBeforeAiPrompt: any = null;

  selectedTemplateModifyPrompt: string = '';
  selectedTemplateScratchPrompt: string = '';

  galleryAiInstructions: string = '';

  templateCarousel = viewChild<any>('templateCarousel');


  // Component method to add
  escKeyHandler: any;

  addDialogEscapeHandler() {
    // Handle ESC key
    const escHandler = (event) => {
      if (event.key === 'Escape' && this.templateGalleryState !== 'closed') {
        this.closeTemplateGallery();
        // Remove the event listener after closing
        document.removeEventListener('keydown', escHandler);
      }
    };

    // Add event listener
    document.addEventListener('keydown', escHandler);

    // Store for cleanup if needed
    this.escKeyHandler = escHandler;
  }

  async openTemplateGallery() {
    // Reset template index
    this.selectedGalleryTemplateIndex = 0;

    // Set state to examples-gallery with instructions
    // this.templateGalleryState = 'examples-gallery';
    this.templateGalleryState = 'templates';

    // Set initial dialog header
    this.galleryDialogTitle = 'Examples (Gallery)';

    // Clear the HTML cache to ensure fresh rendering
    this.templateSanitizedHtmlCache.clear();

    // Load general AI instructions content
    //const content = await this.settingsService.loadTemplateFileAsync(
    //  'templates/gallery/readme-examples-gallery.md',
    //);

    // Set the content
    // this.galleryAiInstructions = String(content);

    // Reset examples and reload
    this.galleryTemplates = [];
    await this.loadGalleryTemplates();

    if (this.templateCarousel()) {
      this.templateCarousel().page.set(0);
    }
  }



  closeTemplateGallery() {
    // Simply set state to closed
    this.templateGalleryState = 'closed';

    // Clear content caches that might influence next open
    this.selectedTemplateReadme = '';
    this.selectedTemplateAiPrompt = '';
    this.previousStateBeforeReadme = null;
    this.previousStateBeforeAiPrompt = null;

    // Clear cached HTML
    this.templateSanitizedHtmlCache.clear();
  }

  closeGeneralAiInstructions() {
    if (this.templateGalleryState === 'examples-gallery') {
      this.templateGalleryState = 'templates';
      this.onGalleryTemplateSelected({ page: 0 });
    }
  }

  async onGalleryTemplateSelected(event: any): Promise<void> {
    const page = Number.isFinite(event?.page) ? event.page : 0;

    // Skip if page hasn't changed (avoid redundant processing)
    if (this.selectedGalleryTemplateIndex === page) {
      return;
    }

    this.selectedGalleryTemplateIndex = page;
    const currentTemplate = this.getSelectedGalleryTemplate();

    if (!currentTemplate) return;

    // Update dialog header
    this.galleryDialogTitle = `Examples (Gallery) - ${currentTemplate.name || currentTemplate.displayName}`;

    // First hide the current content
    this.templatePreviewFadeState = 'hidden';

    // Update display information
    this.updateGalleryTemplateVariantInfo(currentTemplate);
    this.selectedTemplateReadme = currentTemplate.readmeContent || '';
    this.selectedTemplateModifyPrompt =
      currentTemplate.selectedTemplateModifyPrompt || '';
    this.selectedTemplateScratchPrompt =
      currentTemplate.selectedTemplateScratchPrompt || '';

    // After a short delay, show the new content and force rescale
    setTimeout(() => {
      this.templatePreviewFadeState = 'visible';
      setTimeout(() => {
        // This will ensure scaling is recalculated
        window.dispatchEvent(new Event('resize'));
      }, 50);
    }, 100);
  }

  getSelectedGalleryTemplate(): HtmlDocTemplateDisplay {
    if (!this.galleryTemplates || this.galleryTemplates.length === 0) {
      return null;
    }

    const template =
      this.galleryTemplates[this.selectedGalleryTemplateIndex || 0];

    // Update display name for multi-file templates
    if (template?.originalTemplate?.templateFilePaths?.length > 1) {
      const total = template.originalTemplate.templateFilePaths.length;
      const current = template.collectionIndex || 1;
      template.displayName = `${template.name} (${current} of ${total})`;
    }

    return template;
  }


  useSelectedTemplate(template: HtmlDocTemplateDisplay) {
    if (
      !template ||
      !template.htmlContent ||
      template.htmlContent.length === 0
    ) {
      return;
    }

    // No context/output type logic here—just emit the selected template
    this.confirmService.askConfirmation({
      message: 'Are you sure you want to replace the current template with this one?',
      confirmAction: () => {
        this.useTemplate.emit(template);
        this.closeTemplateGallery();
      },
      cancelAction: () => {
        // Do nothing if No is pressed
      }
    });
  }


  viewCurrentTemplateInBrowser() {
    const currentTemplate = this.getSelectedGalleryTemplate();
    if (!currentTemplate) return;

    const variantOffset = currentTemplate.collectionIndex ? currentTemplate.collectionIndex - 1 : 0;
    const url = this.galleryService.getTemplateViewUrl(currentTemplate.id, variantOffset);
    window.open(url, '_blank');
  }

  showCurrentTemplateAiPrompt(
    promptType: 'modify' | 'rebuild',
  ): void {
    const currentTemplate = this.getSelectedGalleryTemplate();
    if (!currentTemplate) return;
    this.selectedPromptType = promptType;

    // Set appropriate dialog header based on prompt type
    if (promptType === 'modify') {
      this.galleryDialogTitle =
        'prompt 1: modify this HTML template with some changes, as needed';
    } else {
      this.galleryDialogTitle =
        "prompt 2: build your HTML template from scratch, using this template's (full) prompt as a guide";
    }

    const content =
      promptType === 'modify'
        ? currentTemplate.selectedTemplateModifyPrompt
        : currentTemplate.selectedTemplateScratchPrompt;

    if (!content) {
      this.messagesService.showInfo(
        'No AI prompt available for this template.',
        'Information',
      );
      return;
    }

    this.previousStateBeforeAiPrompt = {
      previousState: this.templateGalleryState,
      templateIndex: this.selectedGalleryTemplateIndex, // Also store the current template index
    };

    this.selectedTemplateAiPrompt = content;
    this.templateGalleryState = 'ai-prompt';
  }

  showCurrentTemplateReadme(): void {
    const currentTemplate = this.getSelectedGalleryTemplate();
    if (!currentTemplate || !currentTemplate.readmeContent) {
      this.messagesService.showInfo(
        'No README available for this template.',
        'Information',
      );
      return;
    }

    // Store the current template index explicitly when opening README
    if (this.templateGalleryState !== 'readme') {
      this.previousStateBeforeReadme = {
        previousState: this.templateGalleryState,
        templateIndex: this.selectedGalleryTemplateIndex,
      };
    }

    this.selectedTemplateReadme = currentTemplate.readmeContent;
    this.templateGalleryState = 'readme';
    this.galleryDialogTitle = 'README';
  }



  closeTemplateReadme() {
    // Always restore the previous state - will always be 'templates'
    this.templateGalleryState = this.previousStateBeforeReadme.previousState;

    // Restore the specific template index
    this.selectedGalleryTemplateIndex =
      this.previousStateBeforeReadme.templateIndex;

    // Update the carousel position if needed
    if (this.templateCarousel()) {
      this.templateCarousel().page.set(this.selectedGalleryTemplateIndex);
    }

    // Update the dialog header to reflect the template name
    const currentTemplate = this.getSelectedGalleryTemplate();
    if (currentTemplate) {
      this.galleryDialogTitle = `Examples (Gallery) - ${currentTemplate.name || currentTemplate.displayName}`;
    }
  }


  closeTemplateAiPrompt() {
    // Always restore the previous state - will always be 'templates'
    this.templateGalleryState = this.previousStateBeforeAiPrompt.previousState;

    // Restore the specific template index
    this.selectedGalleryTemplateIndex =
      this.previousStateBeforeAiPrompt.templateIndex;

    // Update the carousel position if needed
    if (this.templateCarousel()) {
      this.templateCarousel().page.set(this.selectedGalleryTemplateIndex);
    }

    // Update the dialog header to reflect the template name
    const currentTemplate = this.getSelectedGalleryTemplate();
    if (currentTemplate) {
      this.galleryDialogTitle = `Examples (Gallery) - ${currentTemplate.name || currentTemplate.displayName}`;
    }

    // Clear the backup state after using it
    this.previousStateBeforeAiPrompt = null;
    this.selectedPromptType = null;
  }

  async copyTemplatePromptToClipboard(): Promise<void> {
    if (!this.selectedTemplateAiPrompt) {
      this.messagesService.showInfo('No prompt content to copy', 'Information');
      return;
    }

    await navigator.clipboard.writeText(this.selectedTemplateAiPrompt);
    this.messagesService.showInfo('Prompt copied to clipboard!', 'Success');
  }

  openBingAICopilot() {
    const url = this.settingsService.getCopilotUrl();
    window.open(url, '_blank');
  }

  /**
   * Render the template AI prompt for DISPLAY (copy-to-clipboard still uses the raw text),
   * highlighting the parts the user provides/updates: the "Customization Instructions" and the
   * "Reference HTML Template" sections (and any `[...…...]` placeholders). A theme-aware warning
   * tint keeps the highlighted text readable in any daisyUI theme.
   */
  renderTemplateAiPromptHtml(prompt: string): SafeHtml {
    const esc = (s: string) =>
      (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const box = (inner: string) =>
      `<span style="background-color: color-mix(in oklab, var(--color-warning) 18%, transparent); ` +
      `box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-warning) 45%, transparent); ` +
      `border-radius: 4px; padding: 2px 4px;">${inner}</span>`;

    const text = prompt || '';
    // Match the two section headers as a standalone header LINE — tolerant of the exact format the
    // backend emits (**bold**, ## heading, and/or a trailing colon), so it works across templates.
    // Requiring a line start skips the inline mentions in the intro paragraph.
    const headerRe = (label: string) =>
      new RegExp(`(?:^|\\n)[ \\t]*(?:#{1,6}[ \\t]*)?(?:\\*\\*)?${label}(?:\\*\\*)?[ \\t]*:?[ \\t]*(?:\\*\\*)?(?=\\n|$)`, 'i');
    const ciM = headerRe('Customization Instructions').exec(text);
    const rhM = headerRe('Reference HTML Template').exec(text);

    let out: string;
    if (this.selectedPromptType === 'rebuild') {
      // Prompt 2 (build from scratch): there are no "provide these" sub-sections — the ENTIRE
      // prompt is the guide the user adapts, so highlight all of it.
      out = box(esc(text.trim()));
    } else if (ciM && rhM && rhM.index > ciM.index) {
      const ciEnd = ciM.index + ciM[0].length;
      const rhEnd = rhM.index + rhM[0].length;
      out =
        esc(text.slice(0, ciEnd)) +
        '\n\n' + box(esc(text.slice(ciEnd, rhM.index).trim())) + '\n\n' +
        esc(text.slice(rhM.index, rhEnd)) +
        '\n\n' + box(esc(text.slice(rhEnd).trim()));
    } else {
      out = esc(text).replace(/\[\.\.\.[^\]]*\]/g, (m) => box(m));
    }
    // light markdown: strip code fences, render **bold**
    out = out
      .replace(/```html\n?/g, '')
      .replace(/```/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return this.sanitizer.bypassSecurityTrustHtml(out);
  }

  sanitizeHtmlForIframe(html: string, assetBaseDir?: string): SafeHtml {
    if (!html) {
      return this.sanitizer.bypassSecurityTrustHtml('');
    }
    // Cache by content hash to avoid re-processing on every change detection cycle
    const cacheKey = assetBaseDir ? `${assetBaseDir}:${html.length}` : `${html.length}`;
    const cached = this.templateSanitizedHtmlCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const baseDirUrl = assetBaseDir || '';
    const tempDoc = document.implementation.createHTMLDocument('');
    const tempDiv = tempDoc.createElement('div');
    tempDiv.innerHTML = html;

    // Process regular images
    const images = tempDiv.querySelectorAll('img');
    images.forEach((img) => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        const assetPath = `${baseDirUrl}${src}`;
        img.setAttribute(
          'src',
          `${this.apiService.BACKEND_URL}/reports/serve-asset?path=${encodeURIComponent(assetPath)}`,
        );
      }
    });

    // Process background images
    const elementsWithStyle = tempDiv.querySelectorAll(
      '[style*="background-image"]',
    );
    elementsWithStyle.forEach((el) => {
      const style = el.getAttribute('style');
      if (style) {
        const bgMatch = style.match(
          /background-image:\s*url\(['"]?([^'")]+)['"]?\)/i,
        );
        if (
          bgMatch &&
          bgMatch[1] &&
          !bgMatch[1].startsWith('http') &&
          !bgMatch[1].startsWith('data:')
        ) {
          const assetPath = `${baseDirUrl}${bgMatch[1]}`;
          const newStyle = style.replace(
            bgMatch[0],
            `background-image: url('${this.apiService.BACKEND_URL}/reports/serve-asset?path=${encodeURIComponent(assetPath)}')`,
          );
          el.setAttribute('style', newStyle);
        }
      }
    });

    // Rewrite @font-face and other url() references in <style> blocks
    let processedHtml = tempDiv.innerHTML;
    if (baseDirUrl) {
      processedHtml = processedHtml.replace(
        /url\(['"]?(?!http|data:|\/api)([^'")]+)['"]?\)/gi,
        (_match, relPath) => `url('${this.apiService.BACKEND_URL}/reports/serve-asset?path=${encodeURIComponent(baseDirUrl + relPath)}')`
      );
    }

    const safeHtml = this.sanitizer.bypassSecurityTrustHtml(processedHtml);
    this.templateSanitizedHtmlCache.set(cacheKey, safeHtml);
    return safeHtml;
  }

  async loadGalleryTemplates() {
    this.galleryTemplates = [];

    // Reset display properties
    this.selectedTemplateReadme = '';

    //console.log(
    //  'Current output type when loading examples:',
    //  currentOutputType,
    //);

    // Load templates only once
    if (!this.templatesLoaded) {
      this.allAvailableTemplates =
        await this.samplesService.getHtmlDocTemplates();
      this.templatesLoaded = true;
    }



    //console.log(`Filtered templates count: ${filteredTemplates.length}`);
    const filteredTemplates = this.allAvailableTemplates.filter((template) => {
      if (this.galleryTags() === null) {
        // Show all except 'excel'
        return !template.tags?.includes('excel');
      }
      // Otherwise: match any of the tags
      return template.tags.some(tag => this.galleryTags().includes(tag));
    });

    // Process filtered templates
    filteredTemplates.forEach((template) => {
      //console.log(`Adding template to gallery: ${template.name}`);

      if (template.templateFilePaths.length > 1) {
        // For multi-file templates, create variants
        template.templateFilePaths.forEach((path, index) => {
          const variantTemplate: HtmlDocTemplateDisplay = {
            ...template,
            templateFilePaths: [path], // Keep only the current path
            displayName: `${template.name} (${index + 1} of ${template.templateFilePaths.length})`,
            originalTemplate: template,
            collectionIndex: index + 1,
            currentVariantIndex: 0,
            isLoaded: false,
            htmlContent: [],
            category: this.deriveCategoryFromTags(template.tags),
          };
          this.galleryTemplates.push(variantTemplate);
        });
      } else {
        // Single template handling
        this.galleryTemplates.push({
          ...template,
          displayName: template.name,
          isLoaded: false,
          htmlContent: [],
          currentVariantIndex: 0,
          category: this.deriveCategoryFromTags(template.tags),
        });
      }
    });

    if (this.galleryTemplates.length > 0) {
      this.selectedGalleryTemplateIndex = 0;
      await Promise.all(
        this.galleryTemplates.map((_, index) =>
          this.loadGalleryTemplateContent(index),
        ),
      );
      const firstTemplate = this.galleryTemplates[0];
      if (firstTemplate) {
        this.selectedTemplateReadme = firstTemplate.readmeContent || '';
        this.selectedTemplateModifyPrompt =
          firstTemplate.selectedTemplateModifyPrompt || '';
        this.selectedTemplateScratchPrompt =
          firstTemplate.selectedTemplateScratchPrompt || '';
      }
    }
  }

  async loadGalleryTemplateContent(index: number) {
    const template = this.galleryTemplates[index];
    if (!template) return;
    if (template.isLoaded) return; // do not reload if already loaded

    // Reset loading state
    template.isLoaded = false;
    template.htmlContent = [];
    template.currentVariantIndex = 0;

    try {
      const templateId = template.id;
      const variantOffset = template.collectionIndex ? template.collectionIndex - 1 : 0;

      // Load each HTML variant of the template via ID-based endpoint
      for (let i = 0; i < template.templateFilePaths.length; i++) {
        const variant = variantOffset + i;
        const cacheKey = `${templateId}:${variant}`;
        const result = await this.galleryService.loadTemplateContent(templateId, variant);
        if (result?.content) {
          template.htmlContent.push(result.content);
          template.assetBaseDir = result.assetBaseDir;
          if (!this.templateSanitizedHtmlCache.has(cacheKey)) {
            const safeHtml = this.sanitizeHtmlForIframe(result.content, result.assetBaseDir);
            this.templateSanitizedHtmlCache.set(cacheKey, safeHtml);
          }
        }
      }

      // Load README
      try {
        const readmeContent = await this.galleryService.loadTemplateReadme(templateId, variantOffset);
        template.readmeContent = readmeContent?.length > 0 ? readmeContent : '';
      } catch (error) {
        template.readmeContent = '';
      }

      // Load AI prompt for “modify”
      try {
        const modifyContent = await this.galleryService.loadTemplateAiPrompt(templateId, 'modify', variantOffset);
        template.selectedTemplateModifyPrompt = modifyContent?.length > 0 ? modifyContent : '';
      } catch (error) {
        template.selectedTemplateModifyPrompt = '';
      }

      // Load AI prompt for “scratch”
      try {
        const scratchContent = await this.galleryService.loadTemplateAiPrompt(templateId, 'scratch', variantOffset);
        template.selectedTemplateScratchPrompt = scratchContent?.length > 0 ? scratchContent : '';
      } catch (error) {
        template.selectedTemplateScratchPrompt = '';
      }

      template.isLoaded = true;
    } catch (error) {
      console.error('Error loading template content:', error);
      template.isLoaded = false;
    }
  }


  private updateGalleryTemplateVariantInfo(
    template: HtmlDocTemplateDisplay,
  ): void {
    if (!template) return;
    if (template.originalTemplate?.templateFilePaths?.length > 1) {
      const total = template.originalTemplate.templateFilePaths.length;
      const current = (template.currentVariantIndex || 0) + 1;
      template.displayName = `${template.name} (${current} of ${total})`;
    }
    //this.changeDetectorRef.detectChanges();
  }

  private deriveCategoryFromTags(tags: string[]): string {
    if (tags.includes('invoice')) return 'Invoice';
    if (tags.includes('report')) return 'Report';
    if (tags.includes('letter')) return 'Letter';
    return 'Other';
  }
}