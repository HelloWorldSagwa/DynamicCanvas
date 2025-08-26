import { CanvasManager } from './CanvasManager';
import { GlobalElementManager } from './GlobalElementManager';
import { CanvasGridManager } from './CanvasGridManager';
import { CanvasData } from './types';

export class MultiCanvasManager {
    private canvases: Map<string, CanvasManager> = new Map();
    private canvasDataMap: Map<string, CanvasData> = new Map();
    private globalElementManager: GlobalElementManager;
    private gridManager: CanvasGridManager;
    private activeCanvasId: string | null = null;
    private canvasContainer: HTMLElement;
    private thumbnailContainer: HTMLElement;
    private canvasCount: number = 0;
    private totalWidth: number = 0;  // Track total width of all canvases
    private currentResolution: { width: number; height: number } = { width: 800, height: 600 };

    constructor() {
        this.globalElementManager = new GlobalElementManager();
        this.gridManager = new CanvasGridManager();
        (window as any).canvasGridManager = this.gridManager;
        this.canvasContainer = document.getElementById('canvasContainer') as HTMLElement;
        this.thumbnailContainer = document.getElementById('thumbnailContainer') as HTMLElement;
        this.setupEventListeners();
        
        // Create initial canvas
        this.addCanvas();
    }

    private setupEventListeners(): void {
        const addCanvasBtn = document.getElementById('addCanvasBtn');
        const addCanvasBelowBtn = document.getElementById('addCanvasBelowBtn');
        
        addCanvasBtn?.addEventListener('click', () => {
            this.addCanvas('right');
        });
        
        addCanvasBelowBtn?.addEventListener('click', () => {
            this.addCanvas('bottom');
        });
        
        // Listen for element movement to re-render canvases
        document.addEventListener('element-moved', () => {
            // Always render all canvases to show linked elements
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
            const customEvent = e as CustomEvent;
            const { globalX, globalY, elementId } = customEvent.detail;
            
            // Find which canvas the element is being dragged over
            this.canvases.forEach((canvasManager, canvasId) => {
                const wrapper = document.getElementById(`wrapper-${canvasId}`);
                if (!wrapper) return;
                
                const canvas = canvasManager.getCanvas();
                const rect = canvas.getBoundingClientRect();
                const containerRect = this.canvasContainer.getBoundingClientRect();
                
                // Calculate the canvas bounds in global coordinates
                const canvasGlobalX = rect.left - containerRect.left;
                const canvasGlobalY = rect.top - containerRect.top;
                
                // Check if the drag position is over this canvas
                const localX = globalX - canvasManager.getOffset().x;
                const localY = globalY - canvasManager.getOffset().y;
                
                const isOverCanvas = localX >= 0 && localX <= canvas.width &&
                                    localY >= 0 && localY <= canvas.height;
                
                if (isOverCanvas && this.activeCanvasId !== canvasId) {
                    // Check if movement is allowed from active canvas to this canvas
                    if (this.activeCanvasId && this.gridManager.areCanvasesLinked(this.activeCanvasId, canvasId)) {
                        // Update element's canvas assignment
                        const element = this.globalElementManager.getElement(elementId);
                        if (element) {
                            this.globalElementManager.updateElement(elementId, { canvasId });
                            this.setActiveCanvas(canvasId);
                        }
                    }
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

    public addCanvas(direction: 'right' | 'bottom' = 'right'): void {
        this.canvasCount++;
        const canvasId = `canvas-${Date.now()}`;
        const canvasName = `캔버스 ${this.canvasCount}`;
        
        // Find grid position for new canvas relative to active canvas
        const gridPos = this.gridManager.findNextPosition(direction, this.activeCanvasId || undefined);
        
        // Create main wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'canvas-wrapper';
        wrapper.id = `wrapper-${canvasId}`;
        wrapper.setAttribute('data-row', gridPos.row.toString());
        wrapper.setAttribute('data-col', gridPos.col.toString());
        
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
        
        // Set grid position
        wrapper.style.gridRow = (gridPos.row + 1).toString();
        wrapper.style.gridColumn = (gridPos.col + 1).toString();
        
        // Don't apply zoom to individual wrappers anymore
        
        this.canvasContainer.appendChild(wrapper);
        
        // Add canvas to grid FIRST
        this.gridManager.addCanvas(canvasId, gridPos.row, gridPos.col);
        
        // Calculate offset based on grid position (no gap in coordinate system)
        const offsetX = gridPos.col * this.currentResolution.width;
        const offsetY = gridPos.row * this.currentResolution.height;
        
        // Create CanvasManager instance with global manager and offset
        const canvasManager = new CanvasManager(canvasId, this.globalElementManager, offsetX, offsetY);
        this.canvases.set(canvasId, canvasManager);
        
        // Create link buttons for this canvas
        this.createLinkButtons(canvasId);
        
        // Also create buttons for adjacent canvases pointing to this new canvas
        const adjacent = this.gridManager.getAdjacentCanvases(canvasId);
        adjacent.forEach((adjacentId) => {
            this.createLinkButtons(adjacentId);
        });
        
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
        
        // Get grid position for this canvas
        const position = this.gridManager.getCanvasPosition(canvasId);
        if (position) {
            // Set grid position for thumbnail
            thumbnailItem.style.gridColumn = (position.col + 1).toString();
            thumbnailItem.style.gridRow = (position.row + 1).toString();
        }
        
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
            // Remove from grid
            this.gridManager.removeCanvas(canvasId);
            
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
    
    private currentZoom: number = 1;
    private viewOffset: { x: number, y: number } = { x: 0, y: 0 };
    private viewportWidth: number = window.innerWidth;
    private viewportHeight: number = window.innerHeight;
    private virtualCanvas = { width: 5000, height: 5000 }; // Virtual infinite canvas
    
    public setZoom(zoomLevel: number): void {
        const container = this.canvasContainer;
        if (!container) return;
        
        // Clamp zoom level
        this.currentZoom = Math.max(0.25, Math.min(3, zoomLevel)); // 25% to 300%
        
        // Apply scale transformation
        container.style.transform = `scale(${this.currentZoom})`;
        container.style.transformOrigin = 'center center';
        
        // Update all canvases
        this.canvases.forEach((canvasManager) => {
            canvasManager.render();
        });
    }
    
    private updateViewTransform(): void {
        const container = this.canvasContainer;
        if (!container) return;
        
        // Apply pan offset
        container.style.transform = `translate(${this.viewOffset.x}px, ${this.viewOffset.y}px) scale(${this.currentZoom})`;
        container.style.transformOrigin = '0 0';
        
        // Re-render all canvases
        this.canvases.forEach((canvasManager) => {
            canvasManager.render();
        });
    }
    
    public setViewOffset(x: number, y: number): void {
        this.viewOffset = { x, y };
        this.updateViewTransform();
    }
    
    public panView(dx: number, dy: number): void {
        this.viewOffset.x += dx;
        this.viewOffset.y += dy;
        this.updateViewTransform();
    }
    
    public getViewOffset(): { x: number, y: number } {
        return this.viewOffset;
    }
    
    public getZoom(): number {
        return this.currentZoom;
    }
    
    public getCanvasAtPosition(x: number, y: number): CanvasManager | null {
        // Find which canvas contains the given screen coordinates
        for (const [canvasId, canvasManager] of this.canvases) {
            const wrapper = document.getElementById(`wrapper-${canvasId}`);
            if (wrapper) {
                const rect = wrapper.getBoundingClientRect();
                const canvas = canvasManager.getCanvas();
                const canvasRect = canvas.getBoundingClientRect();
                
                if (x >= canvasRect.left && x <= canvasRect.right &&
                    y >= canvasRect.top && y <= canvasRect.bottom) {
                    // Set this as active canvas
                    this.setActiveCanvas(canvasId);
                    return canvasManager;
                }
            }
        }
        return null;
    }
    
    public getAllCanvases(): Map<string, CanvasManager> {
        return this.canvases;
    }
    
    private createLinkButtons(canvasId: string): void {
        const wrapper = document.getElementById(`wrapper-${canvasId}`);
        if (!wrapper) return;
        
        const adjacent = this.gridManager.getAdjacentCanvases(canvasId);
        const position = this.gridManager.getCanvasPosition(canvasId);
        if (!position) return;
        
        // Create link buttons for each adjacent canvas
        adjacent.forEach((adjacentId, direction) => {
            // Skip diagonal buttons - we only want orthogonal (horizontal/vertical) links
            const isDiagonal = direction.includes('-');
            if (isDiagonal) {
                return; // Always skip diagonal buttons
            }
            
            // Create a unique ID for the link button between these two canvases
            const linkId = [canvasId, adjacentId].sort().join('-link-');
            
            // Check if this link button already exists anywhere
            if (document.getElementById(linkId)) {
                return; // Skip if button already exists
            }
            
            const linkButton = document.createElement('button');
            linkButton.id = linkId;
            linkButton.className = `canvas-link-button link-${direction}`;
            linkButton.title = `Link between ${canvasId} and ${adjacentId}`;
            
            // Set position based on direction (positioned in the center of the gap)
            // Gap is 50px, so buttons should be at -25px (half of gap) - 12px (half of button size)
            const buttonOffset = '-37px'; // (50px gap / 2) + (24px button / 2)
            const positions: { [key: string]: any } = {
                'top': { position: 'absolute', top: buttonOffset, left: '50%', transform: 'translateX(-50%)' },
                'bottom': { position: 'absolute', bottom: buttonOffset, left: '50%', transform: 'translateX(-50%)' },
                'left': { position: 'absolute', left: buttonOffset, top: '50%', transform: 'translateY(-50%)' },
                'right': { position: 'absolute', right: buttonOffset, top: '50%', transform: 'translateY(-50%)' },
                'top-left': { position: 'absolute', top: buttonOffset, left: buttonOffset },
                'top-right': { position: 'absolute', top: buttonOffset, right: buttonOffset },
                'bottom-left': { position: 'absolute', bottom: buttonOffset, left: buttonOffset },
                'bottom-right': { position: 'absolute', bottom: buttonOffset, right: buttonOffset }
            };
            
            const pos = positions[direction];
            if (pos) {
                Object.assign(linkButton.style, pos);
            }
            
            // Check if link is enabled
            const isLinked = this.gridManager.areCanvasesLinked(canvasId, adjacentId);
            linkButton.classList.toggle('active', isLinked);
            
            // Use a simple flat icon
            linkButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.5 8.5L8.5 5.5M6 3.5L4.5 2C3.67157 1.17157 2.32843 1.17157 1.5 2C0.671573 2.82843 0.671573 4.17157 1.5 5L3 6.5M8 10.5L9.5 12C10.3284 12.8284 11.6716 12.8284 12.5 12C13.3284 11.1716 13.3284 9.82843 12.5 9L11 7.5" 
                      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
            
            linkButton.addEventListener('click', () => {
                const newState = this.gridManager.toggleLink(canvasId, adjacentId);
                linkButton.classList.toggle('active', newState);
                
                // Update corresponding button on the adjacent canvas
                this.updateCorrespondingLinkButton(adjacentId, canvasId, newState);
                
                // Re-render both canvases
                this.canvases.get(canvasId)?.render();
                this.canvases.get(adjacentId)?.render();
            });
            
            wrapper.appendChild(linkButton);
        });
    }
    
    private updateCorrespondingLinkButton(canvasId: string, adjacentId: string, state: boolean): void {
        // Find the link button by its unique ID
        const linkId = [canvasId, adjacentId].sort().join('-link-');
        const linkButton = document.getElementById(linkId);
        if (linkButton) {
            linkButton.classList.toggle('active', state);
        }
    }
    
    
    private recalculateOffsets(): void {
        // Calculate offsets based on grid positions
        this.canvases.forEach((canvasManager, canvasId) => {
            const gridPos = this.gridManager.getCanvasPosition(canvasId);
            if (gridPos) {
                // Calculate offset based on grid position (no gap in coordinate system)
                const offsetX = gridPos.col * this.currentResolution.width;
                const offsetY = gridPos.row * this.currentResolution.height;
                
                canvasManager.setOffset(offsetX, offsetY);
                
                // Update canvas data
                const canvasData = this.canvasDataMap.get(canvasId);
                if (canvasData) {
                    canvasData.offsetX = offsetX;
                    canvasData.offsetY = offsetY;
                }
            }
        });
    }
}