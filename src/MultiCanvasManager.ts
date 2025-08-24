import { CanvasManager } from './CanvasManager';
import { GlobalElementManager } from './GlobalElementManager';
import { CanvasData } from './types';

export class MultiCanvasManager {
    private canvases: Map<string, CanvasManager> = new Map();
    private canvasDataMap: Map<string, CanvasData> = new Map();
    private globalElementManager: GlobalElementManager;
    private activeCanvasId: string | null = null;
    private canvasContainer: HTMLElement;
    private thumbnailContainer: HTMLElement;
    private canvasCount: number = 0;
    private totalWidth: number = 0;  // Track total width of all canvases
    private currentResolution: { width: number; height: number } = { width: 800, height: 600 };
    private isLinkingEnabled: boolean = true;  // Cross-canvas linking state (enabled by default)
    private linkButtons: Map<string, HTMLElement> = new Map();  // Store link buttons

    constructor() {
        this.globalElementManager = new GlobalElementManager();
        this.canvasContainer = document.getElementById('canvasContainer') as HTMLElement;
        this.thumbnailContainer = document.getElementById('thumbnailContainer') as HTMLElement;
        this.setupEventListeners();
        
        // Create initial canvas
        this.addCanvas();
    }

    private setupEventListeners(): void {
        const addCanvasBtn = document.getElementById('addCanvasBtn');
        addCanvasBtn?.addEventListener('click', () => {
            this.addCanvas();
        });
        
        // Listen for element movement to re-render all canvases
        document.addEventListener('element-moved', () => {
            this.renderAllCanvases();
        });
        
        // Listen for canvas click events to activate the clicked canvas
        document.addEventListener('canvas-clicked', (e) => {
            const customEvent = e as CustomEvent;
            const canvasId = customEvent.detail?.canvasId;
            if (canvasId && this.canvases.has(canvasId)) {
                this.setActiveCanvas(canvasId);
            }
        });
        
        // Listen for element drag events to handle cross-canvas movement
        document.addEventListener('element-dragging', (e) => {
            if (!this.isLinkingEnabled) return;
            
            const customEvent = e as CustomEvent;
            const { globalX, globalY } = customEvent.detail;
            
            // Find which canvas should be active based on element position
            this.canvasDataMap.forEach((canvasData, canvasId) => {
                const isInCanvas = globalX >= canvasData.offsetX && 
                                 globalX < canvasData.offsetX + canvasData.width;
                
                if (isInCanvas && this.activeCanvasId !== canvasId) {
                    this.setActiveCanvas(canvasId);
                }
            });
        });
    }
    
    private renderAllCanvases(): void {
        this.canvases.forEach(canvas => {
            canvas.render();
        });
    }
    
    private handleElementOverflow(detail: any): void {
        const { element, canvasId, bounds } = detail;
        const sourceCanvas = this.canvases.get(canvasId);
        if (!sourceCanvas) return;
        
        // Get canvas position in container
        const canvasWrapper = document.getElementById(`wrapper-${canvasId}`);
        if (!canvasWrapper) return;
        
        const canvasRect = canvasWrapper.getBoundingClientRect();
        const containerRect = this.canvasContainer.getBoundingClientRect();
        
        // Check for adjacent canvases
        this.canvases.forEach((targetCanvas, targetId) => {
            if (targetId === canvasId) return;
            
            const targetWrapper = document.getElementById(`wrapper-${targetId}`);
            if (!targetWrapper) return;
            
            const targetRect = targetWrapper.getBoundingClientRect();
            
            // Check if element overflows into this canvas
            if (this.isOverflowing(canvasRect, targetRect, bounds)) {
                this.createOverflowElement(element, sourceCanvas, targetCanvas, canvasRect, targetRect);
            }
        });
    }
    
    private isOverflowing(sourceRect: DOMRect, targetRect: DOMRect, bounds: any): boolean {
        // Check horizontal overflow (canvas is to the right)
        if (targetRect.left >= sourceRect.right - 50 && bounds.right > sourceRect.width) {
            return true;
        }
        // Check horizontal overflow (canvas is to the left)
        if (targetRect.right <= sourceRect.left + 50 && bounds.left < 0) {
            return true;
        }
        return false;
    }
    
    private createOverflowElement(element: any, sourceCanvas: CanvasManager, targetCanvas: CanvasManager, sourceRect: DOMRect, targetRect: DOMRect): void {
        // Calculate relative position for the overflow element
        const relativeX = element.x - (targetRect.left - sourceRect.left);
        const relativeY = element.y;
        
        // Create a temporary visual indicator (you can expand this to actually duplicate elements)
        console.log('Element overflowing from', sourceCanvas.getCanvas().id, 'to', targetCanvas.getCanvas().id);
    }

    public addCanvas(): void {
        this.canvasCount++;
        const canvasId = `canvas-${Date.now()}`;
        const canvasName = `캔버스 ${this.canvasCount}`;
        
        // Create main wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'canvas-wrapper';
        wrapper.id = `wrapper-${canvasId}`;
        
        // Create title (outside canvas)
        const title = document.createElement('div');
        title.className = 'canvas-title';
        title.contentEditable = 'true';
        title.textContent = canvasName;
        title.addEventListener('blur', () => {
            const data = this.canvasDataMap.get(canvasId);
            if (data) {
                data.name = title.textContent || canvasName;
                this.updateThumbnailLabel(canvasId, data.name);
            }
        });
        
        // Create canvas content wrapper
        const canvasContent = document.createElement('div');
        canvasContent.className = 'canvas-content';
        
        // Add click event to canvas content to activate canvas
        canvasContent.addEventListener('click', (e) => {
            this.setActiveCanvas(canvasId);
        });
        
        // Create canvas element
        const canvas = document.createElement('canvas');
        canvas.id = canvasId;
        
        // Assemble the structure: wrapper > [title, canvasContent > canvas]
        canvasContent.appendChild(canvas);
        wrapper.appendChild(title);
        wrapper.appendChild(canvasContent);
        this.canvasContainer.appendChild(wrapper);
        
        // Add link button after this canvas (if not the first canvas)
        if (this.canvases.size > 0) {
            this.addLinkButton(canvasId);
        }
        
        // Calculate offset for this canvas based on actual DOM positions
        // We'll update this after the element is added to DOM
        let offsetX = this.totalWidth;
        let offsetY = 0;
        
        // Create CanvasManager instance with global manager and offset
        const canvasManager = new CanvasManager(canvasId, this.globalElementManager, offsetX, offsetY);
        this.canvases.set(canvasId, canvasManager);
        
        // Store canvas data
        const canvasData: CanvasData = {
            id: canvasId,
            name: canvasName,
            width: this.currentResolution.width,
            height: this.currentResolution.height,
            offsetX: offsetX,
            offsetY: offsetY
        };
        this.canvasDataMap.set(canvasId, canvasData);
        
        // Set resolution for the new canvas
        canvasManager.setResolution(this.currentResolution.width, this.currentResolution.height);
        
        // Calculate real offset based on canvas widths only, excluding gaps
        setTimeout(() => {
            this.recalculateOffsets();
        }, 0);
        
        // Update total width (only canvas widths, no gaps)
        this.totalWidth += this.currentResolution.width;
        
        // Create thumbnail
        this.createThumbnail(canvasId, canvasName);
        
        // Set as active canvas
        this.setActiveCanvas(canvasId);
        
        // Scroll to the new canvas
        wrapper.scrollIntoView({ behavior: 'smooth', inline: 'end' });
    }

    private createThumbnail(canvasId: string, name: string): void {
        const thumbnailItem = document.createElement('div');
        thumbnailItem.className = 'thumbnail-item';
        thumbnailItem.id = `thumb-${canvasId}`;
        
        // Create thumbnail canvas
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.className = 'thumbnail-canvas';
        thumbCanvas.width = 120;
        thumbCanvas.height = 90;
        
        // Create label
        const label = document.createElement('div');
        label.className = 'thumbnail-label';
        label.textContent = name;
        
        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'thumbnail-delete';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.deleteCanvas(canvasId);
        };
        
        thumbnailItem.appendChild(thumbCanvas);
        thumbnailItem.appendChild(label);
        thumbnailItem.appendChild(deleteBtn);
        
        // Add click handler
        thumbnailItem.addEventListener('click', () => {
            this.setActiveCanvas(canvasId);
            const wrapper = document.getElementById(`wrapper-${canvasId}`);
            wrapper?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
        });
        
        this.thumbnailContainer.appendChild(thumbnailItem);
    }

    private setActiveCanvas(canvasId: string): void {
        // Remove active class from all
        document.querySelectorAll('.canvas-wrapper').forEach(wrapper => {
            wrapper.classList.remove('active');
        });
        document.querySelectorAll('.thumbnail-item').forEach(thumb => {
            thumb.classList.remove('active');
        });
        
        // Add active class to selected
        const wrapper = document.getElementById(`wrapper-${canvasId}`);
        const thumbnail = document.getElementById(`thumb-${canvasId}`);
        wrapper?.classList.add('active');
        thumbnail?.classList.add('active');
        
        this.activeCanvasId = canvasId;
        
        // Update thumbnail
        this.updateThumbnail(canvasId);
    }

    private updateThumbnail(canvasId: string): void {
        const canvasManager = this.canvases.get(canvasId);
        const thumbnail = document.querySelector(`#thumb-${canvasId} .thumbnail-canvas`) as HTMLCanvasElement;
        
        if (canvasManager && thumbnail) {
            const sourceCanvas = document.getElementById(canvasId) as HTMLCanvasElement;
            if (sourceCanvas) {
                const ctx = thumbnail.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, thumbnail.width, thumbnail.height);
                    
                    // Calculate scale to fit
                    const scale = Math.min(
                        thumbnail.width / sourceCanvas.width,
                        thumbnail.height / sourceCanvas.height
                    );
                    
                    const scaledWidth = sourceCanvas.width * scale;
                    const scaledHeight = sourceCanvas.height * scale;
                    const x = (thumbnail.width - scaledWidth) / 2;
                    const y = (thumbnail.height - scaledHeight) / 2;
                    
                    ctx.drawImage(sourceCanvas, x, y, scaledWidth, scaledHeight);
                }
            }
        }
    }

    private updateThumbnailLabel(canvasId: string, name: string): void {
        const label = document.querySelector(`#thumb-${canvasId} .thumbnail-label`);
        if (label) {
            label.textContent = name;
        }
    }

    private deleteCanvas(canvasId: string): void {
        if (this.canvases.size <= 1) {
            alert('최소 하나의 캔버스는 필요합니다.');
            return;
        }
        
        if (confirm('이 캔버스를 삭제하시겠습니까?')) {
            // Remove from maps
            this.canvases.delete(canvasId);
            this.canvasDataMap.delete(canvasId);
            
            // Remove DOM elements
            const wrapper = document.getElementById(`wrapper-${canvasId}`);
            const thumbnail = document.getElementById(`thumb-${canvasId}`);
            const linkButton = document.getElementById(`link-${canvasId}`);
            wrapper?.remove();
            thumbnail?.remove();
            linkButton?.remove();
            
            // Remove from link buttons map
            this.linkButtons.delete(canvasId);
            
            // If this was the active canvas, select another
            if (this.activeCanvasId === canvasId) {
                const firstCanvasId = this.canvases.keys().next().value;
                if (firstCanvasId) {
                    this.setActiveCanvas(firstCanvasId);
                }
            }
            
            // Recalculate offsets after deletion
            setTimeout(() => {
                this.recalculateOffsets();
            }, 0);
        }
    }

    public getActiveCanvas(): CanvasManager | null {
        if (this.activeCanvasId) {
            return this.canvases.get(this.activeCanvasId) || null;
        }
        return null;
    }

    public updateAllThumbnails(): void {
        this.canvases.forEach((_, canvasId) => {
            this.updateThumbnail(canvasId);
        });
    }
    
    public setResolutionForAll(width: number, height: number): void {
        this.currentResolution = { width, height };
        
        // Reset total width
        this.totalWidth = 0;
        
        // Update each canvas with new resolution
        this.canvases.forEach((canvasManager, canvasId) => {
            canvasManager.setResolution(width, height);
            const canvasData = this.canvasDataMap.get(canvasId);
            if (canvasData) {
                canvasData.width = width;
                canvasData.height = height;
            }
        });
        
        // Recalculate offsets after resolution change
        setTimeout(() => {
            this.recalculateOffsets();
        }, 0);
        
        // Update total width based on actual positions
        this.updateAllThumbnails();
    }
    
    public getActiveCanvasResolution(): { width: number; height: number } | null {
        if (this.activeCanvasId) {
            const canvasData = this.canvasDataMap.get(this.activeCanvasId);
            if (canvasData) {
                return { width: canvasData.width, height: canvasData.height };
            }
        }
        return null;
    }
    
    private addLinkButton(canvasId: string): void {
        const linkButton = document.createElement('button');
        linkButton.className = 'canvas-link-button';
        linkButton.id = `link-${canvasId}`;
        linkButton.title = '개체간 링크';
        
        // Create link icon (chain icon)
        linkButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
        `;
        
        // Set initial active state
        linkButton.classList.add('active');
        
        // Toggle linking state
        linkButton.addEventListener('click', () => {
            this.isLinkingEnabled = !this.isLinkingEnabled;
            linkButton.classList.toggle('active', this.isLinkingEnabled);
            
            // Update all link buttons to maintain consistent state
            this.linkButtons.forEach(btn => {
                btn.classList.toggle('active', this.isLinkingEnabled);
            });
            
            // Notify canvases about linking state change
            const event = new CustomEvent('linking-state-changed', {
                detail: { enabled: this.isLinkingEnabled }
            });
            document.dispatchEvent(event);
        });
        
        // Insert button before the canvas wrapper
        const wrapper = document.getElementById(`wrapper-${canvasId}`);
        if (wrapper && wrapper.parentElement) {
            wrapper.parentElement.insertBefore(linkButton, wrapper);
            this.linkButtons.set(canvasId, linkButton);
        }
    }
    
    public isLinkingActive(): boolean {
        return this.isLinkingEnabled;
    }
    
    private recalculateOffsets(): void {
        // Calculate offsets based on canvas widths only, not DOM positions
        // This ensures no gaps in the global coordinate system
        let currentOffset = 0;
        const canvasArray = Array.from(this.canvases.entries());
        
        canvasArray.forEach(([canvasId, canvasManager], index) => {
            // Set logical offset (no gaps)
            canvasManager.setOffset(currentOffset, 0);
            
            // Update canvas data
            const canvasData = this.canvasDataMap.get(canvasId);
            if (canvasData) {
                canvasData.offsetX = currentOffset;
                
                // Offsets have been updated
            }
            
            // Move to next canvas position (only canvas width, no gap)
            currentOffset += canvasData?.width || this.currentResolution.width;
        });
        
        // Update total width
        this.totalWidth = currentOffset;
    }
}