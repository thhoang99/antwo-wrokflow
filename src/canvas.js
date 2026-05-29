/**
 * antwo workflow - Canvas Navigation Engine
 * Handles zooming, panning, grid alignment, and screen-to-canvas coordinate mapping.
 */
export class GraphCanvas {
  constructor(containerId, gridId) {
    this.container = document.getElementById(containerId);
    this.grid = document.getElementById(gridId);
    
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    
    this.minScale = 0.15;
    this.maxScale = 3.0;
    
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    
    this.onCanvasClickCallback = null;

    this.initEvents();
    this.updateTransform();
  }

  /**
   * Initialize mouse and touch event listeners for navigation
   */
  initEvents() {
    // Zoom on wheel
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = 0.08;
      const direction = e.deltaY < 0 ? 1 : -1;
      const nextScale = Math.min(
        this.maxScale,
        Math.max(this.minScale, this.scale + direction * zoomFactor * this.scale)
      );

      // Zoom towards mouse cursor
      const rect = this.container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Calculate canvas coordinates before zoom
      const canvasX = (mouseX - this.offsetX) / this.scale;
      const canvasY = (mouseY - this.offsetY) / this.scale;

      this.scale = nextScale;
      
      // Calculate new offsets to lock mouse position on canvas
      this.offsetX = mouseX - canvasX * this.scale;
      this.offsetY = mouseY - canvasY * this.scale;

      this.updateTransform();
    }, { passive: false });

    // Drag to Pan
    this.container.addEventListener('mousedown', (e) => {
      // Only pan on left click when clicking background, or middle click anywhere
      const isLeftClickOnBg = e.button === 0 && !e.target.closest('.node-card') && !e.target.closest('.port-dot') && !e.target.closest('.wire-delete-handle');
      const isMiddleClick = e.button === 1;

      if (isLeftClickOnBg || isMiddleClick) {
        this.isPanning = true;
        this.panStartX = e.clientX - this.offsetX;
        this.panStartY = e.clientY - this.offsetY;
        this.container.style.cursor = 'grabbing';
        
        // Blur active inputs to save their state
        if (document.activeElement) {
          document.activeElement.blur();
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.offsetX = e.clientX - this.panStartX;
      this.offsetY = e.clientY - this.panStartY;
      this.updateTransform();
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.style.cursor = 'grab';
      }
    });

    // Canvas click to deselect elements
    this.container.addEventListener('click', (e) => {
      const isClickOnBg = !e.target.closest('.node-card') && !e.target.closest('.port-dot') && !e.target.closest('.wire-delete-handle');
      if (isClickOnBg && this.onCanvasClickCallback) {
        this.onCanvasClickCallback();
      }
    });
  }

  /**
   * Reset Zoom and Pan offsets to default home coordinates
   */
  reset() {
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.updateTransform();
  }

  /**
   * Apply transforms to the canvas grid container
   */
  updateTransform() {
    // Translate and Scale the Grid layer
    this.grid.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
    
    // Adjust grid dot pattern spacing programmatically to preserve visual crispness
    // under severe scaling if needed, but standard scaling is handled nicely by transform
  }

  /**
   * Convert Screen client (DOM) coordinate to Workspace Canvas coordinate
   */
  screenToCanvas(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    const x = (clientX - rect.left - this.offsetX) / this.scale;
    const y = (clientY - rect.top - this.offsetY) / this.scale;
    return { x, y };
  }

  /**
   * Convert Workspace Canvas coordinate to Screen client (DOM) coordinate
   */
  canvasToScreen(canvasX, canvasY) {
    const rect = this.container.getBoundingClientRect();
    const x = canvasX * this.scale + this.offsetX + rect.left;
    const y = canvasY * this.scale + this.offsetY + rect.top;
    return { x, y };
  }

  /**
   * Register deselect callback
   */
  onCanvasClick(callback) {
    this.onCanvasClickCallback = callback;
  }
}
