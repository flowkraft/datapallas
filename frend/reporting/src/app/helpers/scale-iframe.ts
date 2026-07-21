import {
  Directive,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  input,
  NgZone,
} from '@angular/core';

@Directive({
    selector: '[scaleIframe]',
    standalone: true,
})
export class ScaleIframeDirective implements AfterViewInit, OnDestroy {
  private resizeObserver: ResizeObserver;
  private loadHandler: () => void;
  private originalScale: number = 1;
  private isZoomed: boolean = false;
  private lastScale: number = 1;

  // Panning variables
  private isPanning: boolean = false;
  private startX: number = 0;
  private startY: number = 0;
  private translateX: number = 0;
  private translateY: number = 0;

  // Bound event handlers to properly remove listeners
  private boundMouseDown: any;
  private boundMouseMove: any;
  private boundMouseUp: any;
  private boundTouchStart: any;
  private boundTouchMove: any;
  private boundTouchEnd: any;
  private boundDblClick: any;

  zoomFactor = input<number>(2.5);

  constructor(
    private el: ElementRef<HTMLIFrameElement>,
    private ngZone: NgZone,
  ) {
    this.loadHandler = this.onIframeLoad.bind(this);

    // Create bound event handlers for proper cleanup
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.boundTouchStart = this.onTouchStart.bind(this);
    this.boundTouchMove = this.onTouchMove.bind(this);
    this.boundTouchEnd = this.onTouchEnd.bind(this);
    this.boundDblClick = this.onDblClick.bind(this);
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      const iframe = this.el.nativeElement;

      // Style the iframe initially
      iframe.style.width = '100%';
      iframe.style.border = '1px solid var(--color-base-300)';
      iframe.style.position = 'absolute';
      iframe.style.transformOrigin = 'center';

      // Create zoom controls
      this.addZoomControls(iframe.parentElement);

      // Enhance carousel navigation arrows
      this.enhanceCarouselArrows();

      // Add pan event listeners to parent container
      if (iframe.parentElement) {
        //console.log('Adding mouse/touch listeners to iframe parent');
        iframe.parentElement.addEventListener('mousedown', this.boundMouseDown);
        iframe.parentElement.addEventListener('dblclick', this.boundDblClick);
        iframe.parentElement.addEventListener(
          'touchstart',
          this.boundTouchStart,
          { passive: false },
        );

        // Set cursor to indicate pannable when zoomed
        const parent = iframe.parentElement;
        parent.style.cursor = 'default';

        // Add overlay div to handle mouse events better
        const overlay = document.createElement('div');
        overlay.className = 'iframe-pan-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.zIndex = '10';
        overlay.style.display = 'none';
        overlay.style.cursor = 'grab';

        // Add overlay to parent
        parent.appendChild(overlay);

        // Add event listeners to overlay
        overlay.addEventListener('mousedown', this.boundMouseDown);
        overlay.addEventListener('touchstart', this.boundTouchStart, {
          passive: false,
        });
      }

      // Add document-level event listeners
      document.addEventListener('mousemove', this.boundMouseMove);
      document.addEventListener('mouseup', this.boundMouseUp);
      document.addEventListener('touchmove', this.boundTouchMove, {
        passive: false,
      });
      document.addEventListener('touchend', this.boundTouchEnd);

      // Create ResizeObserver for container size changes
      this.resizeObserver = new ResizeObserver(() => {
        if (iframe.contentDocument?.readyState === 'complete') {
          this.scaleContent();
        }
      });

      // Observe the iframe's parent container
      if (iframe.parentElement) {
        this.resizeObserver.observe(iframe.parentElement);
        iframe.parentElement.style.position = 'relative';
      }

      // Add load event to handle initial scaling
      iframe.addEventListener('load', this.loadHandler);
    });
  }

  // Enhance carousel navigation arrows to make them more prominent
  enhanceCarouselArrows() {
    setTimeout(() => {
      // Find carousel arrows in the document
      const prevArrows = document.querySelectorAll(
        '.dp-carousel .dp-carousel-prev',
      );
      const nextArrows = document.querySelectorAll(
        '.dp-carousel .dp-carousel-next',
      );

      prevArrows.forEach((arrow) => {
        const el = arrow as HTMLElement;
        // Already max boldness
        el.style.fontWeight = '900';
        el.style.color = 'var(--color-base-content)';
        // Add text shadow for perceived boldness
        // Add stroke outline
        el.style.boxShadow = '0 0 4px rgba(0,0,0,0.2)';
        // Move additional 10px inward (total 20px)
        el.style.marginLeft = '20px';
        // Make slightly bigger
        el.style.fontSize = '1.8rem';
        // Optional: add background for more emphasis
        el.style.backgroundColor = 'var(--color-base-100)';
        el.style.border = '1px solid var(--color-base-300)';
        el.style.borderRadius = '50%';
        el.style.width = '40px';
        el.style.height = '40px';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
      });

      // Apply the same styles to the next arrows
      nextArrows.forEach((arrow) => {
        const el = arrow as HTMLElement;
        el.style.fontWeight = '900';
        el.style.color = 'var(--color-base-content)';
        el.style.boxShadow = '0 0 4px rgba(0,0,0,0.2)';
        el.style.marginRight = '20px';
        el.style.fontSize = '1.8rem';
        el.style.backgroundColor = 'var(--color-base-100)';
        el.style.border = '1px solid var(--color-base-300)';
        el.style.borderRadius = '50%';
        el.style.width = '40px';
        el.style.height = '40px';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
      });
    }, 500); // Short delay to ensure carousel is rendered
  }

  // Touch event handlers
  onTouchStart(event: TouchEvent) {
    //console.log('Touch start', this.isZoomed);
    if (!this.isZoomed || event.touches.length !== 1) return;

    this.isPanning = true;
    this.startX = event.touches[0].clientX;
    this.startY = event.touches[0].clientY;
    event.preventDefault();

    // Show overlay to capture all events
    const overlay = this.getOverlay();
    if (overlay) {
      overlay.style.display = 'block';
    }
  }

  onTouchMove(event: TouchEvent) {
    if (!this.isPanning || event.touches.length !== 1) return;

    const deltaX = event.touches[0].clientX - this.startX;
    const deltaY = event.touches[0].clientY - this.startY;

    this.startX = event.touches[0].clientX;
    this.startY = event.touches[0].clientY;

    this.translateX += deltaX / this.lastScale;
    this.translateY += deltaY / this.lastScale;

    this.updateTransform();
    event.preventDefault();
  }

  onTouchEnd() {
    this.isPanning = false;

    // Hide overlay
    const overlay = this.getOverlay();
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  // Mouse event handlers for panning
  onMouseDown(event: MouseEvent) {
    //console.log('Mouse down', this.isZoomed);
    if (!this.isZoomed) return;

    // Don't pan if clicking on zoom controls
    if (
      (event.target as HTMLElement).closest('.iframe-zoom-controls') ||
      (event.target as HTMLElement).closest('.iframe-help-text')
    ) {
      return;
    }

    this.isPanning = true;
    this.startX = event.clientX;
    this.startY = event.clientY;

    // Show panning cursor
    const parent = this.el.nativeElement.parentElement;
    if (parent) {
      parent.style.cursor = 'grabbing';
    }

    // Show overlay to capture all events
    const overlay = this.getOverlay();
    if (overlay) {
      overlay.style.display = 'block';
      overlay.style.cursor = 'grabbing';
    }

    event.preventDefault();
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isPanning) return;

    const deltaX = event.clientX - this.startX;
    const deltaY = event.clientY - this.startY;

    this.startX = event.clientX;
    this.startY = event.clientY;

    // Adjust translation based on scale (slower movement when zoomed in more)
    this.translateX += deltaX / this.lastScale;
    this.translateY += deltaY / this.lastScale;

    this.updateTransform();
  }

  onMouseUp() {
    if (this.isPanning) {
      const parent = this.el.nativeElement.parentElement;
      if (parent) {
        parent.style.cursor = 'default';
      }

      // Hide overlay
      const overlay = this.getOverlay();
      if (overlay) {
        overlay.style.display = 'none';
        overlay.style.cursor = 'grab';
      }
    }
    this.isPanning = false;
  }

  // Helper to get overlay element
  private getOverlay(): HTMLElement | null {
    const parent = this.el.nativeElement.parentElement;
    if (!parent) return null;
    return parent.querySelector('.iframe-pan-overlay');
  }

  // Combined transform update function
  updateTransform() {
    const iframe = this.el.nativeElement;
    iframe.style.transform = `translate(calc(-50% + ${this.translateX}px), calc(-50% + ${this.translateY + 10}px)) scale(${this.lastScale})`;

    // Update overlay cursor when zoomed
    const overlay = this.getOverlay();
    if (overlay) {
      overlay.style.display = this.isZoomed ? 'block' : 'none';
    }
  }

  // Handle double-click event
  onDblClick(event: MouseEvent) {
    //console.log('Double click detected');

    // Don't toggle if clicking on zoom controls
    if (
      (event.target as HTMLElement).closest('.iframe-zoom-controls') ||
      (event.target as HTMLElement).closest('.iframe-help-text')
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.toggleZoom();
  }

  addZoomControls(container: HTMLElement) {
    if (!container) return;

    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // First, adjust the container to make room for controls at the bottom
    const containerHeight = container.style.height;
    // Store original height if we need to restore it
    container.dataset.originalHeight = containerHeight;

    // Subtract space for controls from the container height
    const controlsHeight = 40; // Height for the controls area
    if (containerHeight && containerHeight.includes('px')) {
      const heightValue = parseInt(containerHeight, 10);
      container.style.height = `${heightValue - controlsHeight}px`;
    }

    // Create controls wrapper that sits below the iframe
    const controlsWrapper = document.createElement('div');
    controlsWrapper.className = 'iframe-controls-wrapper';
    controlsWrapper.style.position = 'relative';
    controlsWrapper.style.width = '100%';
    controlsWrapper.style.height = `${controlsHeight}px`;
    controlsWrapper.style.marginTop = '35px';
    controlsWrapper.style.display = 'flex';
    controlsWrapper.style.flexDirection = 'column';
    controlsWrapper.style.alignItems = 'center';
    controlsWrapper.style.justifyContent = 'center';

    // Create zoom control container
    const controls = document.createElement('div');
    controls.className = 'iframe-zoom-controls';
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.padding = '5px';
    controls.style.background = 'var(--color-base-100)';
    controls.style.border = '1px solid var(--color-base-300)';
    controls.style.borderRadius = '4px';
    controls.style.marginBottom = '5px';

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '5px';

    // Zoom in button
    const zoomIn = document.createElement('button');
    zoomIn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803zM10.5 7.5v6m3-3h-6"/></svg>';
    zoomIn.className = 'btn btn-sm btn-ghost';
    zoomIn.id = `btn-zoom-in-${uniqueId}`; // Add unique ID
    zoomIn.dataset.testid = 'btn-zoom-in'; // Add data-testid for testing
    zoomIn.title = 'Zoom In';
    zoomIn.onclick = () => this.zoomIn();

    // Zoom out button
    const zoomOut = document.createElement('button');
    zoomOut.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803zM13.5 10.5h-6"/></svg>';
    zoomOut.className = 'btn btn-sm btn-ghost';
    zoomOut.id = `btn-zoom-out-${uniqueId}`; // Add unique ID
    zoomOut.dataset.testid = 'btn-zoom-out'; // Add data-testid for testing
    zoomOut.title = 'Zoom Out';
    zoomOut.onclick = () => this.zoomOut();

    // Reset zoom button
    const zoomReset = document.createElement('button');
    zoomReset.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>';
    zoomReset.className = 'btn btn-sm btn-ghost';
    zoomReset.id = `btn-zoom-reset-${uniqueId}`; // Add unique ID
    zoomReset.dataset.testid = 'btn-zoom-reset'; // Add data-testid for testing
    zoomReset.title = 'Reset Zoom';
    zoomReset.onclick = () => this.resetZoom();

    // Add buttons to button container
    buttonContainer.appendChild(zoomIn);
    buttonContainer.appendChild(zoomOut);
    buttonContainer.appendChild(zoomReset);

    // Add button container to controls
    controls.appendChild(buttonContainer);

    // Add help text
    /*
    const helpText = document.createElement('span');
    helpText.innerText = 'Double-click to toggle zoom';
    helpText.style.fontSize = '10px';
    //helpText.style.fontWeight = 'bold';
    helpText.style.color = '#333';
    helpText.style.marginLeft = '10px';

    // Add help text to controls
    controls.appendChild(helpText);
    */

    // Add controls to wrapper
    controlsWrapper.appendChild(controls);

    // Insert wrapper after the container
    if (container.parentNode) {
      container.parentNode.insertBefore(controlsWrapper, container.nextSibling);
    }
  }

  zoomIn() {
    this.isZoomed = true;

    // Apply zoom factor
    const scale = this.lastScale * 1.5;
    this.lastScale = scale;
    this.updateTransform();

    // Show overlay when zoomed
    const overlay = this.getOverlay();
    if (overlay) {
      overlay.style.display = 'block';
    }
  }

  zoomOut() {
    if (this.lastScale > 0.5) {
      const scale = this.lastScale / 1.5;
      this.lastScale = scale;
      this.updateTransform();

      // If we zoom out too much, reset to original view
      if (this.lastScale <= this.originalScale) {
        this.resetZoom();
      }
    }
  }

  resetZoom() {
    this.isZoomed = false;
    this.translateX = 0;
    this.translateY = 0;
    this.scaleContent();

    // Hide overlay when not zoomed
    const overlay = this.getOverlay();
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  toggleZoom() {
    //console.log('Toggle zoom', this.isZoomed);
    this.isZoomed = !this.isZoomed;

    // Reset panning when toggling zoom
    if (this.isZoomed) {
      this.lastScale = this.originalScale * this.zoomFactor();

      // Show overlay when zoomed
      const overlay = this.getOverlay();
      if (overlay) {
        overlay.style.display = 'block';
      }
    } else {
      this.translateX = 0;
      this.translateY = 0;
      this.scaleContent();

      // Hide overlay when not zoomed
      const overlay = this.getOverlay();
      if (overlay) {
        overlay.style.display = 'none';
      }
      return;
    }

    this.updateTransform();
  }

  onIframeLoad() {
    this.scaleContent();
  }

  scaleContent() {
    const iframe = this.el.nativeElement;
    if (!iframe.contentDocument) return;

    try {
      // Skip if we're in zoom mode (to prevent overriding zoom)
      if (this.isZoomed) return;

      const container = iframe.parentElement;
      if (!container) return;

      // Get container dimensions
      const containerWidth = container.clientWidth - 20;
      const containerHeight = container.clientHeight - 20;

      // Get content dimensions
      const content = iframe.contentDocument.documentElement;
      const contentWidth = content.scrollWidth;
      const contentHeight = content.scrollHeight;

      // Calculate scale factor (never scale up, only down)
      const scaleX = Math.min(containerWidth / contentWidth, 1);
      const scaleY = Math.min(containerHeight / contentHeight, 1);
      const scale = Math.min(scaleX, scaleY);

      // Save the original scale for zoom toggle
      this.originalScale = scale;
      this.lastScale = scale;

      // Reset translation
      this.translateX = 0;
      this.translateY = 0;

      // Set dimensions
      iframe.style.width = `${contentWidth}px`;
      iframe.style.height = `${contentHeight}px`;

      // Apply scaling with 10px vertical offset to move down
      this.updateTransform();

      // Center in container
      iframe.style.left = '50%';
      iframe.style.top = '50%';

      // Hide overlay when not zoomed
      const overlay = this.getOverlay();
      if (overlay) {
        overlay.style.display = 'none';
      }
    } catch (err) {
      console.error('Error scaling iframe:', err);
    }
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.el.nativeElement.removeEventListener('load', this.loadHandler);

    // Remove event listeners with proper bound methods
    const parent = this.el.nativeElement.parentElement;
    if (parent) {
      // Restore original height if needed
      if (parent.dataset.originalHeight) {
        parent.style.height = parent.dataset.originalHeight;
      }

      // Remove the controls wrapper
      const controlsWrapper = parent.parentNode?.querySelector(
        '.iframe-controls-wrapper',
      );
      if (controlsWrapper) {
        controlsWrapper.parentNode?.removeChild(controlsWrapper);
      }

      parent.removeEventListener('mousedown', this.boundMouseDown);
      parent.removeEventListener('touchstart', this.boundTouchStart);
      parent.removeEventListener('dblclick', this.boundDblClick);

      // Remove overlay if it exists
      const overlay = parent.querySelector('.iframe-pan-overlay');
      if (overlay) {
        overlay.removeEventListener('mousedown', this.boundMouseDown);
        overlay.removeEventListener('touchstart', this.boundTouchStart);
        parent.removeChild(overlay);
      }

      // Remove zoom controls if they exist
      const controls = parent.querySelector('.iframe-zoom-controls');
      if (controls) {
        parent.removeChild(controls);
      }

      // Remove help text if it exists
      const helpText = parent.querySelector('.iframe-help-text');
      if (helpText) {
        parent.removeChild(helpText);
      }
    }

    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
    document.removeEventListener('touchmove', this.boundTouchMove);
    document.removeEventListener('touchend', this.boundTouchEnd);
  }
}
