import { CanvasElement, Point, DragState, ResizeState, ResizeHandle } from './types';
import { GlobalElementManager } from './GlobalElementManager';

export class CanvasManager {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private globalManager: GlobalElementManager;
    private offsetX: number = 0;  // Canvas offset in global coordinate system
    private offsetY: number = 0;
    private scale: number = 1;
    // Linking state is tracked by checking link button status
    // private editingElementId: string | null = null; // Removed - not needed anymore  // Track element being edited
    private cropMode: boolean = false;  // Track crop mode
    private cropHandle: string | null = null;  // Current crop handle being dragged
    private cropStartPoint: Point = { x: 0, y: 0 };  // Start point for crop dragging
    private cropDragging: boolean = false;  // Track if dragging crop area
    private cropResizing: boolean = false;  // Track if resizing crop area
    private cropResizeHandle: string = '';  // Which resize handle is being dragged
    private dragState: DragState = {
        isDragging: false,
        element: null,
        startPoint: { x: 0, y: 0 },
        elementStartPoint: { x: 0, y: 0 }
    };
    private resizeState: ResizeState = {
        isResizing: false,
        element: null,
        handle: null,
        startPoint: { x: 0, y: 0 },
        originalBounds: { x: 0, y: 0, width: 0, height: 0 }
    };
    private textToolbar: HTMLElement;
    private contextMenu: HTMLElement;
    private clipboard: CanvasElement | null = null;
    private lastContextMenuPosition: Point = { x: 0, y: 0 };

    constructor(canvasId: string, globalManager: GlobalElementManager, offsetX: number = 0, offsetY: number = 0) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        const context = this.canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get canvas context');
        }
        this.ctx = context;
        this.globalManager = globalManager;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.textToolbar = document.getElementById('textToolbar') as HTMLElement;
        this.contextMenu = document.getElementById('contextMenu') as HTMLElement;
        this.setupCanvas();
        this.setupEventListeners();
        this.setupTextToolbar();
        this.setupContextMenu();
        
        // Listen for linking state changes
        document.addEventListener('linking-state-changed', (e) => {
            const customEvent = e as CustomEvent;
            this.render(); // Re-render when linking state changes
        });
    }
    
    public getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }
    
    private isLinkingEnabled(): boolean {
        // Check if any link button is active (has 'active' class)
        const linkButtons = document.querySelectorAll('.canvas-link-button');
        return Array.from(linkButtons).some(btn => btn.classList.contains('active'));
    }
    
    public setOffset(offsetX: number, offsetY: number): void {
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.render();
    }
    
    // Convert global coordinates to local canvas coordinates
    private globalToLocal(globalX: number, globalY: number): Point {
        return {
            x: globalX - this.offsetX,
            y: globalY - this.offsetY
        };
    }
    
    // Convert local canvas coordinates to global coordinates
    private localToGlobal(localX: number, localY: number): Point {
        return {
            x: localX + this.offsetX,
            y: localY + this.offsetY
        };
    }

    private setupCanvas(): void {
        this.setResolution(800, 600);
    }

    public setResolution(width: number, height: number): void {
        // Store the actual resolution
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Calculate display size based on aspect ratio and viewport
        this.updateCanvasDisplaySize();
        
        // Re-render with new resolution
        this.render();
    }
    
    private updateCanvasDisplaySize(): void {
        const canvasContent = this.canvas.parentElement; // canvas-content
        if (!canvasContent) return;
        
        // Maximum available space (accounting for UI elements)
        // Subtract space for toolbar (approx 70px), thumbnail bar (120px), title (30px), and some padding
        const maxAvailableWidth = window.innerWidth - 80; // Some padding for scrollbar
        const maxAvailableHeight = window.innerHeight - 300; // Toolbar + thumbnail bar + title + padding
        
        // Calculate the ideal display size
        const canvasAspectRatio = this.canvas.width / this.canvas.height;
        
        let displayWidth: number;
        let displayHeight: number;
        
        // Determine the base scale (trying to show canvas at a reasonable size)
        // Use a base scale that makes sense for typical screen sizes
        const baseScale = Math.min(
            maxAvailableWidth / this.canvas.width,
            maxAvailableHeight / this.canvas.height,
            1.0  // Don't scale up beyond 100%
        );
        
        // Apply the scale
        displayWidth = this.canvas.width * baseScale;
        displayHeight = this.canvas.height * baseScale;
        
        // Ensure minimum size for usability
        const minWidth = 400;
        const minHeight = 300;
        
        if (displayWidth < minWidth && displayHeight < minHeight) {
            // Scale up to minimum size while maintaining aspect ratio
            const minScale = Math.max(
                minWidth / this.canvas.width,
                minHeight / this.canvas.height
            );
            displayWidth = this.canvas.width * minScale;
            displayHeight = this.canvas.height * minScale;
        }
        
        // Final scale for mouse position calculations
        this.scale = displayWidth / this.canvas.width;
        
        // Apply calculated dimensions to canvas display
        this.canvas.style.width = `${displayWidth}px`;
        this.canvas.style.height = `${displayHeight}px`;
    }

    private setupEventListeners(): void {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        
        // Use document-level mouse move and up for better cross-canvas dragging
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // Add click event to activate canvas when clicked
        this.canvas.addEventListener('click', (e) => {
            // Dispatch custom event to notify MultiCanvasManager
            const event = new CustomEvent('canvas-clicked', {
                detail: { canvasId: this.canvas.id }
            });
            document.dispatchEvent(event);
        });
        
        // Add keyboard event listener for crop mode
        document.addEventListener('keydown', (e) => {
            if (this.cropMode) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.applyCrop();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.cropMode = false;
                    this.canvas.classList.remove('crop-mode');
                    this.hideCropToolbar();
                    this.render();
                }
            }
        });
        
        // Add window resize listener for responsive canvas
        window.addEventListener('resize', () => {
            this.updateCanvasDisplaySize();
        });
        
        // Listen for linking state changes
        document.addEventListener('linking-state-changed', (e) => {
            const customEvent = e as CustomEvent;
            // Linking state changed, re-render
            this.render();
            // Re-render when linking state changes
            this.render();
        });
        
        // Hide context menu when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!this.contextMenu.contains(e.target as Node)) {
                this.contextMenu.style.display = 'none';
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'c') {
                    e.preventDefault();
                    this.copyElement();
                } else if (e.key === 'v') {
                    e.preventDefault();
                    this.pasteElement();
                } else if (e.key === 'd') {
                    e.preventDefault();
                    this.duplicateElement();
                }
            }
            
            // Enter key to apply crop
            if (e.key === 'Enter' && this.cropMode) {
                e.preventDefault();
                this.applyCrop();
            }
            
            // Escape key to cancel crop
            if (e.key === 'Escape' && this.cropMode) {
                e.preventDefault();
                this.cropMode = false;
                this.render();
            }
        });
    }

    private setupTextToolbar(): void {
        const fontFamily = document.getElementById('fontFamily') as HTMLSelectElement;
        const fontSize = document.getElementById('fontSize') as HTMLInputElement;
        const boldBtn = document.getElementById('boldBtn');
        const italicBtn = document.getElementById('italicBtn');
        const alignLeft = document.getElementById('alignLeft');
        const alignCenter = document.getElementById('alignCenter');
        const alignRight = document.getElementById('alignRight');
        const textColor = document.getElementById('textColor') as HTMLInputElement;

        fontFamily?.addEventListener('change', () => {
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement?.type === 'text') {
                this.globalManager.updateElement(selectedElement.id, { fontFamily: fontFamily.value });
                this.render();
            }
        });

        fontSize?.addEventListener('input', () => {
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement?.type === 'text') {
                this.globalManager.updateElement(selectedElement.id, { fontSize: parseInt(fontSize.value) });
                this.render();
            }
        });

        boldBtn?.addEventListener('click', () => {
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement?.type === 'text') {
                this.globalManager.updateElement(selectedElement.id, {
                    fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold'
                });
                boldBtn.classList.toggle('active');
                this.render();
            }
        });

        italicBtn?.addEventListener('click', () => {
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement?.type === 'text') {
                this.globalManager.updateElement(selectedElement.id, {
                    fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic'
                });
                italicBtn.classList.toggle('active');
                this.render();
            }
        });

        const alignButtons = [alignLeft, alignCenter, alignRight];
        const alignValues: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];
        
        alignButtons.forEach((btn, index) => {
            btn?.addEventListener('click', () => {
                const selectedElement = this.globalManager.getSelectedElement();
                if (selectedElement?.type === 'text') {
                    this.globalManager.updateElement(selectedElement.id, { textAlign: alignValues[index] });
                    alignButtons.forEach(b => b?.classList.remove('active'));
                    btn.classList.add('active');
                    this.render();
                }
            });
        });

        textColor?.addEventListener('input', () => {
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement?.type === 'text') {
                this.globalManager.updateElement(selectedElement.id, { color: textColor.value });
                this.render();
            }
        });
    }

    private updateTextToolbar(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (selectedElement?.type === 'text') {
            this.textToolbar.style.display = 'block';
            
            const fontFamily = document.getElementById('fontFamily') as HTMLSelectElement;
            const fontSize = document.getElementById('fontSize') as HTMLInputElement;
            const boldBtn = document.getElementById('boldBtn');
            const italicBtn = document.getElementById('italicBtn');
            const textColor = document.getElementById('textColor') as HTMLInputElement;
            const alignButtons = [
                document.getElementById('alignLeft'),
                document.getElementById('alignCenter'),
                document.getElementById('alignRight')
            ];
            
            if (fontFamily) fontFamily.value = selectedElement.fontFamily || 'Arial';
            if (fontSize) fontSize.value = (selectedElement.fontSize || 24).toString();
            if (textColor) textColor.value = selectedElement.color || '#2d3748';
            
            boldBtn?.classList.toggle('active', selectedElement.fontWeight === 'bold');
            italicBtn?.classList.toggle('active', selectedElement.fontStyle === 'italic');
            
            const alignIndex = ['left', 'center', 'right'].indexOf(selectedElement.textAlign || 'left');
            alignButtons.forEach((btn, i) => {
                btn?.classList.toggle('active', i === alignIndex);
            });
        } else {
            this.textToolbar.style.display = 'none';
        }
    }

    private handleMouseDown(e: MouseEvent): void {
        // First, activate this canvas
        const event = new CustomEvent('canvas-clicked', {
            detail: { canvasId: this.canvas.id }
        });
        document.dispatchEvent(event);
        
        const localPoint = this.getMousePosition(e);
        const globalPoint = this.localToGlobal(localPoint.x, localPoint.y);
        
        // Check if we're in crop mode
        if (this.cropMode) {
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement && selectedElement.type === 'image' && 
                selectedElement.cropX !== undefined && selectedElement.cropY !== undefined) {
                
                // Check if clicking on crop handle
                const cropHandle = this.getCropHandle(localPoint, selectedElement);
                if (cropHandle) {
                    this.cropResizing = true;
                    this.cropResizeHandle = cropHandle;
                    this.cropStartPoint = localPoint;
                    return;
                }
                
                // Check if clicking inside crop area for dragging
                const localX = selectedElement.x - this.offsetX;
                const localY = selectedElement.y - this.offsetY;
                if (localPoint.x >= localX + selectedElement.cropX &&
                    localPoint.x <= localX + selectedElement.cropX + selectedElement.cropWidth &&
                    localPoint.y >= localY + selectedElement.cropY &&
                    localPoint.y <= localY + selectedElement.cropY + selectedElement.cropHeight) {
                    this.cropDragging = true;
                    this.cropStartPoint = localPoint;
                    return;
                }
            }
        }
        
        // Get element at global position
        const element = this.globalManager.getElementAtPoint(globalPoint.x, globalPoint.y);
        
        if (element) {
            const selectedElement = this.globalManager.getSelectedElement();
            const handle = selectedElement && element.id === selectedElement.id ? 
                this.getResizeHandle(localPoint, element) : null;
            
            if (handle) {
                this.resizeState = {
                    isResizing: true,
                    element: element,
                    handle: handle,
                    startPoint: globalPoint,
                    originalBounds: {
                        x: element.x,
                        y: element.y,
                        width: element.width,
                        height: element.height,
                        originalFontSize: element.fontSize
                    } as any
                };
            } else {
                this.globalManager.setSelectedElement(element.id);
                this.dragState = {
                    isDragging: true,
                    element: element,
                    startPoint: globalPoint,
                    elementStartPoint: { x: element.x, y: element.y }
                };
                this.updateTextToolbar();
            }
        } else {
            this.globalManager.setSelectedElement(null);
            this.updateTextToolbar();
        }
        
        this.render();
    }
    
    private getCropHandle(point: Point, element: CanvasElement): string | null {
        if (!element.cropX || element.cropX === undefined) return null;
        
        const localX = element.x - this.offsetX;
        const localY = element.y - this.offsetY;
        const handleSize = 10;
        const halfSize = handleSize / 2;
        
        const handles = [
            { x: localX + element.cropX, y: localY + element.cropY, type: 'nw' },
            { x: localX + element.cropX + element.cropWidth/2, y: localY + element.cropY, type: 'n' },
            { x: localX + element.cropX + element.cropWidth, y: localY + element.cropY, type: 'ne' },
            { x: localX + element.cropX + element.cropWidth, y: localY + element.cropY + element.cropHeight/2, type: 'e' },
            { x: localX + element.cropX + element.cropWidth, y: localY + element.cropY + element.cropHeight, type: 'se' },
            { x: localX + element.cropX + element.cropWidth/2, y: localY + element.cropY + element.cropHeight, type: 's' },
            { x: localX + element.cropX, y: localY + element.cropY + element.cropHeight, type: 'sw' },
            { x: localX + element.cropX, y: localY + element.cropY + element.cropHeight/2, type: 'w' }
        ];
        
        for (const handle of handles) {
            if (point.x >= handle.x - halfSize && point.x <= handle.x + halfSize &&
                point.y >= handle.y - halfSize && point.y <= handle.y + halfSize) {
                return handle.type;
            }
        }
        
        return null;
    }
    
    private getCursorForCropHandle(handle: string): string {
        const cursors: { [key: string]: string } = {
            'nw': 'nw-resize',
            'n': 'n-resize',
            'ne': 'ne-resize',
            'e': 'e-resize',
            'se': 'se-resize',
            's': 's-resize',
            'sw': 'sw-resize',
            'w': 'w-resize'
        };
        return cursors[handle] || 'default';
    }
    
    private handleCropDrag(currentPoint: Point, element: CanvasElement): void {
        if (element.cropX === undefined || element.cropY === undefined) return;
        
        const dx = currentPoint.x - this.cropStartPoint.x;
        const dy = currentPoint.y - this.cropStartPoint.y;
        
        let newCropX = element.cropX + dx;
        let newCropY = element.cropY + dy;
        
        // Constrain within image bounds
        newCropX = Math.max(0, Math.min(newCropX, element.width - element.cropWidth));
        newCropY = Math.max(0, Math.min(newCropY, element.height - element.cropHeight));
        
        this.globalManager.updateElement(element.id, {
            cropX: newCropX,
            cropY: newCropY
        });
        
        this.cropStartPoint = currentPoint;
    }
    
    private handleCropResize(currentPoint: Point, element: CanvasElement): void {
        if (element.cropX === undefined || element.cropY === undefined ||
            element.cropWidth === undefined || element.cropHeight === undefined) return;
        
        const dx = currentPoint.x - this.cropStartPoint.x;
        const dy = currentPoint.y - this.cropStartPoint.y;
        
        let newCropX = element.cropX;
        let newCropY = element.cropY;
        let newCropWidth = element.cropWidth;
        let newCropHeight = element.cropHeight;
        
        // Update based on which handle is being dragged
        switch (this.cropResizeHandle) {
            case 'nw':
                newCropX += dx;
                newCropY += dy;
                newCropWidth -= dx;
                newCropHeight -= dy;
                break;
            case 'n':
                newCropY += dy;
                newCropHeight -= dy;
                break;
            case 'ne':
                newCropY += dy;
                newCropWidth += dx;
                newCropHeight -= dy;
                break;
            case 'e':
                newCropWidth += dx;
                break;
            case 'se':
                newCropWidth += dx;
                newCropHeight += dy;
                break;
            case 's':
                newCropHeight += dy;
                break;
            case 'sw':
                newCropX += dx;
                newCropWidth -= dx;
                newCropHeight += dy;
                break;
            case 'w':
                newCropX += dx;
                newCropWidth -= dx;
                break;
        }
        
        // Ensure minimum size
        const minSize = 20;
        if (newCropWidth < minSize) {
            if (this.cropResizeHandle.includes('w')) {
                newCropX = element.cropX + element.cropWidth - minSize;
            }
            newCropWidth = minSize;
        }
        if (newCropHeight < minSize) {
            if (this.cropResizeHandle.includes('n')) {
                newCropY = element.cropY + element.cropHeight - minSize;
            }
            newCropHeight = minSize;
        }
        
        // Constrain within image bounds
        newCropX = Math.max(0, newCropX);
        newCropY = Math.max(0, newCropY);
        newCropWidth = Math.min(newCropWidth, element.width - newCropX);
        newCropHeight = Math.min(newCropHeight, element.height - newCropY);
        
        this.globalManager.updateElement(element.id, {
            cropX: newCropX,
            cropY: newCropY,
            cropWidth: newCropWidth,
            cropHeight: newCropHeight
        });
        
        this.cropStartPoint = currentPoint;
    }

    private handleMouseMove(e: MouseEvent): void {
        const localPoint = this.getMousePosition(e);
        const globalPoint = this.localToGlobal(localPoint.x, localPoint.y);
        
        // Handle crop mode interactions
        if (this.cropMode) {
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement && selectedElement.type === 'image') {
                if (this.cropDragging) {
                    this.handleCropDrag(localPoint, selectedElement);
                    this.render();
                    return;
                } else if (this.cropResizing) {
                    this.handleCropResize(localPoint, selectedElement);
                    this.render();
                    return;
                } else {
                    // Update cursor for crop handles
                    const cropHandle = this.getCropHandle(localPoint, selectedElement);
                    if (cropHandle) {
                        this.canvas.style.cursor = this.getCursorForCropHandle(cropHandle);
                    } else {
                        const localX = selectedElement.x - this.offsetX;
                        const localY = selectedElement.y - this.offsetY;
                        if (selectedElement.cropX !== undefined &&
                            localPoint.x >= localX + selectedElement.cropX &&
                            localPoint.x <= localX + selectedElement.cropX + selectedElement.cropWidth &&
                            localPoint.y >= localY + selectedElement.cropY &&
                            localPoint.y <= localY + selectedElement.cropY + selectedElement.cropHeight) {
                            this.canvas.style.cursor = 'move';
                        } else {
                            this.canvas.style.cursor = 'default';
                        }
                    }
                }
            }
        }
        
        // Only handle if we're actively dragging or resizing from this canvas
        if (!this.dragState.isDragging && !this.resizeState.isResizing && !this.cropDragging && !this.cropResizing) {
            // Check for hover effects only if mouse is over this canvas
            if (e.target === this.canvas && !this.cropMode) {
                const element = this.globalManager.getElementAtPoint(globalPoint.x, globalPoint.y);
                const selectedElement = this.globalManager.getSelectedElement();
                const handle = selectedElement && element && element.id === selectedElement.id ? 
                    this.getResizeHandle(localPoint, element) : null;
                this.canvas.style.cursor = handle ? this.getCursorForHandle(handle) : 'default';
            }
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const localPoint = {
            x: (e.clientX - rect.left) / this.scale,
            y: (e.clientY - rect.top) / this.scale
        };
        const globalPoint = this.localToGlobal(localPoint.x, localPoint.y);
        
        if (this.resizeState.isResizing && this.resizeState.element) {
            this.handleResize(globalPoint);
        } else if (this.dragState.isDragging && this.dragState.element) {
            const dx = globalPoint.x - this.dragState.startPoint.x;
            const dy = globalPoint.y - this.dragState.startPoint.y;
            
            let newX = this.dragState.elementStartPoint.x + dx;
            let newY = this.dragState.elementStartPoint.y + dy;
            
            // If linking is disabled, allow partial hiding but prevent complete loss
            if (!this.isLinkingEnabled()) {
                const element = this.dragState.element;
                const minVisible = 50; // Minimum pixels that must remain visible
                
                // Ensure at least minVisible pixels remain on canvas
                newX = Math.max(this.offsetX - element.width + minVisible, 
                               Math.min(newX, this.offsetX + this.canvas.width - minVisible));
                newY = Math.max(this.offsetY - element.height + minVisible, 
                               Math.min(newY, this.offsetY + this.canvas.height - minVisible));
            }
            
            // Update element's global position
            this.globalManager.updateElement(this.dragState.element.id, {
                x: newX,
                y: newY
            });
            
            // Only emit dragging event when linking is enabled
            if (this.isLinkingEnabled()) {
                document.dispatchEvent(new CustomEvent('element-dragging', {
                    detail: {
                        elementId: this.dragState.element.id,
                        globalX: newX,
                        globalY: newY
                    }
                }));
            }
            
            // Trigger re-render on all canvases
            document.dispatchEvent(new CustomEvent('element-moved'));
        } else {
            const element = this.globalManager.getElementAtPoint(globalPoint.x, globalPoint.y);
            const selectedElement = this.globalManager.getSelectedElement();
            const handle = selectedElement && element && element.id === selectedElement.id ? 
                this.getResizeHandle(localPoint, element) : null;
            this.canvas.style.cursor = handle ? this.getCursorForHandle(handle) : 'default';
        }
        
        this.render();
    }
    
    private handleElementOverflow(element: CanvasElement): void {
        // Emit event for multi-canvas manager to handle overflow
        const event = new CustomEvent('element-overflow', {
            detail: {
                element: element,
                canvasId: this.canvas.id,
                bounds: {
                    left: element.x,
                    right: element.x + element.width,
                    top: element.y,
                    bottom: element.y + element.height
                }
            }
        });
        document.dispatchEvent(event);
    }

    private handleResize(point: Point): void {
        if (!this.resizeState.element || !this.resizeState.handle) return;
        
        const dx = point.x - this.resizeState.startPoint.x;
        const dy = point.y - this.resizeState.startPoint.y;
        const original = this.resizeState.originalBounds;
        const element = this.resizeState.element;
        
        // Check if it's a corner handle for proportional resizing
        const isCorner = ['nw', 'ne', 'se', 'sw'].includes(this.resizeState.handle);
        
        let updates: Partial<CanvasElement> = {};
        
        if (isCorner) {
            // Proportional resizing for corners
            const aspectRatio = original.width / original.height;
            let newWidth = original.width;
            let newHeight = original.height;
            
            switch (this.resizeState.handle) {
                case 'nw':
                    newWidth = original.width - dx;
                    newHeight = newWidth / aspectRatio;
                    updates.x = original.x + original.width - newWidth;
                    updates.y = original.y + original.height - newHeight;
                    break;
                case 'ne':
                    newWidth = original.width + dx;
                    newHeight = newWidth / aspectRatio;
                    updates.y = original.y + original.height - newHeight;
                    break;
                case 'se':
                    newWidth = original.width + dx;
                    newHeight = newWidth / aspectRatio;
                    break;
                case 'sw':
                    newWidth = original.width - dx;
                    newHeight = newWidth / aspectRatio;
                    updates.x = original.x + original.width - newWidth;
                    break;
            }
            
            updates.width = Math.max(20, newWidth);
            updates.height = Math.max(20, newHeight);
            
            // Scale font size for text elements
            if (element.type === 'text' && element.fontSize) {
                const scale = newWidth / original.width;
                updates.fontSize = (this.resizeState.originalBounds as any).originalFontSize * scale;
            }
        } else {
            // Free resizing for edge handles
            switch (this.resizeState.handle) {
                case 'n':
                    updates.y = original.y + dy;
                    updates.height = original.height - dy;
                    break;
                case 'e':
                    updates.width = original.width + dx;
                    break;
                case 's':
                    updates.height = original.height + dy;
                    break;
                case 'w':
                    updates.x = original.x + dx;
                    updates.width = original.width - dx;
                    break;
            }
            
            if (updates.width !== undefined) updates.width = Math.max(20, updates.width);
            if (updates.height !== undefined) updates.height = Math.max(20, updates.height);
        }
        
        // Update element through global manager
        this.globalManager.updateElement(element.id, updates);
        
        // Trigger re-render on all canvases
        document.dispatchEvent(new CustomEvent('element-moved'));
    }

    private getCursorForHandle(handle: ResizeHandle): string {
        const cursors: Record<ResizeHandle, string> = {
            'nw': 'nw-resize',
            'n': 'n-resize',
            'ne': 'ne-resize',
            'e': 'e-resize',
            'se': 'se-resize',
            's': 's-resize',
            'sw': 'sw-resize',
            'w': 'w-resize'
        };
        return cursors[handle];
    }

    private getResizeHandle(localPoint: Point, element: CanvasElement): ResizeHandle | null {
        if (!element) return null;
        
        // Convert element global position to local for handle calculation
        const localPos = this.globalToLocal(element.x, element.y);
        const handleSize = 8 / this.scale;
        const handles: { handle: ResizeHandle; x: number; y: number }[] = [
            { handle: 'nw', x: localPos.x, y: localPos.y },
            { handle: 'n', x: localPos.x + element.width / 2, y: localPos.y },
            { handle: 'ne', x: localPos.x + element.width, y: localPos.y },
            { handle: 'e', x: localPos.x + element.width, y: localPos.y + element.height / 2 },
            { handle: 'se', x: localPos.x + element.width, y: localPos.y + element.height },
            { handle: 's', x: localPos.x + element.width / 2, y: localPos.y + element.height },
            { handle: 'sw', x: localPos.x, y: localPos.y + element.height },
            { handle: 'w', x: localPos.x, y: localPos.y + element.height / 2 }
        ];
        
        for (const h of handles) {
            if (Math.abs(localPoint.x - h.x) <= handleSize && 
                Math.abs(localPoint.y - h.y) <= handleSize) {
                return h.handle;
            }
        }
        
        return null;
    }

    private handleMouseUp(e: MouseEvent): void {
        // Reset crop states
        if (this.cropDragging || this.cropResizing) {
            this.cropDragging = false;
            this.cropResizing = false;
            this.cropResizeHandle = '';
            this.render();
            return;
        }
        
        // Only reset states if this canvas was the one dragging/resizing
        if (this.dragState.isDragging || this.resizeState.isResizing) {
            this.dragState = {
                isDragging: false,
                element: null,
                startPoint: { x: 0, y: 0 },
                elementStartPoint: { x: 0, y: 0 }
            };
            this.resizeState = {
                isResizing: false,
                element: null,
                handle: null,
                startPoint: { x: 0, y: 0 },
                originalBounds: { x: 0, y: 0, width: 0, height: 0 }
            };
            
            // Re-render all canvases to ensure proper state
            document.dispatchEvent(new CustomEvent('element-moved'));
        }
    }

    private handleDoubleClick(e: MouseEvent): void {
        const localPoint = this.getMousePosition(e);
        const globalPoint = this.localToGlobal(localPoint.x, localPoint.y);
        const element = this.globalManager.getElementAtPoint(globalPoint.x, globalPoint.y);
        
        if (element) {
            if (element.type === 'text') {
                this.startInlineEditing(element);
            } else if (element.type === 'image') {
                // Double-click on image activates crop mode
                this.globalManager.setSelectedElement(element.id);
                this.toggleCropMode();
            }
        }
    }
    
    private createInlineTextEditor(globalX: number, globalY: number, initialText: string, fontSize: number): void {
        // Check if we're already editing
        const existingEditor = document.querySelector('.text-editor-active');
        if (existingEditor) {
            return; // Already editing
        }
        
        
        // NOTE: For NEW text, we DON'T pre-generate an ID - we'll create it when saving
        // This avoids confusion with element lookups
        
        // Convert global position to local for display
        const localPos = this.globalToLocal(globalX, globalY);
        
        // Create a contentEditable div for inline editing
        const editor = document.createElement('div');
        editor.className = 'text-editor-active text-editor-create'; // Add class to identify NEW text editor
        editor.setAttribute('data-editor-type', 'create');
        // DON'T set element ID for new text - it doesn't exist yet!
        editor.contentEditable = 'true';
        editor.innerText = initialText;
        editor.style.position = 'fixed';
        
        // Calculate position based on canvas position and scale
        const rect = this.canvas.getBoundingClientRect();
        const toolbarHeight = this.textToolbar ? this.textToolbar.offsetHeight : 0;
        const editorTop = rect.top + localPos.y * this.scale;
        
        // Check if editor would overlap with toolbar and adjust position
        let adjustedTop = editorTop;
        // Text toolbar is at fixed position top: 60px, so check if editor is too high
        const textToolbarBottom = 60 + (toolbarHeight || 50); // 60px top + toolbar height
        if (editorTop < textToolbarBottom + 10) {
            adjustedTop = textToolbarBottom + 20; // Position below toolbar with margin
        }
        
        editor.style.left = `${rect.left + localPos.x * this.scale}px`;
        editor.style.top = `${adjustedTop}px`;
        editor.style.minWidth = `${100 * this.scale}px`;
        editor.style.minHeight = `${fontSize * 1.5 * this.scale}px`;
        editor.style.maxWidth = `${(this.canvas.width - localPos.x) * this.scale}px`;
        
        // Apply text styles
        editor.style.font = `${fontSize * this.scale}px Arial`;
        editor.style.color = '#2d3748';
        editor.style.textAlign = 'left';
        
        // Visual styles for better visibility with semi-transparent background
        editor.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        editor.style.border = '2px solid #3182ce';
        editor.style.borderRadius = '4px';
        editor.style.padding = `${5 * this.scale}px`;
        editor.style.margin = '0';
        editor.style.zIndex = '10000';
        editor.style.whiteSpace = 'pre-wrap';
        editor.style.wordBreak = 'break-word';
        editor.style.overflow = 'auto';
        editor.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        editor.style.outline = 'none';
        editor.style.lineHeight = '1.2';
        
        document.body.appendChild(editor);
        
        // Select all text
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
        
        let isFinished = false;
        
        const finishEditing = () => {
            if (isFinished) return;
            isFinished = true;
            
            // Generate ID only when we're actually creating the element
            const newElementId = `element-${Date.now()}`;
            
            // Get the content - remove zero-width spaces
            let content = editor.innerText.replace(/\u200B/g, '').trim();
            if (!content || content.length === 0) {
                content = '텍스트'; // Default text if empty
            }
            
            // Now create the actual element with the edited content
            const element: CanvasElement = {
                id: newElementId,
                type: 'text',
                x: globalX,
                y: globalY,
                width: 200,
                height: fontSize * 1.5,
                content: content,
                fontSize: fontSize,
                fontFamily: 'Arial',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textAlign: 'left',
                color: '#2d3748',
                canvasId: this.canvas.id
            };
            
            // Add element to canvas
            this.globalManager.addElement(element);
            this.globalManager.setSelectedElement(element.id);
            this.updateTextToolbar();
            
            // Update dimensions
            this.updateTextDimensions(element);
            
            if (document.body.contains(editor)) {
                document.body.removeChild(editor);
            }
            
            this.render();
        };
        
        const cancelEditing = () => {
            if (isFinished) return;
            isFinished = true;
            
            // Just remove editor without creating element
            if (document.body.contains(editor)) {
                document.body.removeChild(editor);
            }
        };
        
        // Track if we should handle blur
        let shouldHandleBlur = true;
        let isProcessingKeyboard = false;
        
        // Event handlers
        editor.addEventListener('blur', (e) => {
            
            // Don't process blur if we're in the middle of keyboard processing
            if (isProcessingKeyboard) {
                return;
            }
            
            // Check if we're clicking on the text toolbar
            const relatedTarget = e.relatedTarget as HTMLElement;
            if (relatedTarget && this.textToolbar && this.textToolbar.contains(relatedTarget)) {
                // Refocus the editor if clicking on toolbar
                setTimeout(() => {
                    if (document.body.contains(editor)) {
                        editor.focus();
                    }
                }, 0);
                return;
            }
            
            // Only process blur if we should
            if (shouldHandleBlur) {
                // Use requestAnimationFrame to ensure all input events have completed
                requestAnimationFrame(() => {
                    if (!isProcessingKeyboard && document.body.contains(editor)) {
                        finishEditing();
                    }
                });
            }
        });
        
        editor.addEventListener('keydown', (e) => {
            // Handle special keys
            if (e.key === 'Escape') {
                e.preventDefault();
                isProcessingKeyboard = true;
                shouldHandleBlur = false;
                cancelEditing();
                return;
            }
            
            // Enter to confirm (without Shift)
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                isProcessingKeyboard = true;
                shouldHandleBlur = false;
                finishEditing();
                return;
            }
            
            // Tab to confirm
            if (e.key === 'Tab') {
                e.preventDefault();
                isProcessingKeyboard = true;
                shouldHandleBlur = false;
                finishEditing();
                return;
            }
        });
        
        // Handle backspace/delete separately to prevent issues
        editor.addEventListener('beforeinput', (e) => {
            
            // If deleting and text would become empty, prevent default and handle manually
            if ((e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward')) {
                const currentText = editor.innerText || '';
                const selection = window.getSelection()?.toString() || '';
                
                // If we're about to delete the last character
                if (currentText.length <= 1 || (selection === currentText)) {
                    // Don't prevent default - let it delete, but maintain minimum content
                    requestAnimationFrame(() => {
                        const afterDeleteText = editor.innerText || '';
                        
                        if (!editor.innerText || editor.innerText.length === 0) {
                            editor.innerHTML = '\u200B';
                            // Position cursor at start
                            const range = document.createRange();
                            const sel = window.getSelection();
                            if (editor.firstChild) {
                                range.setStart(editor.firstChild, 0);
                                range.collapse(true);
                                sel?.removeAllRanges();
                                sel?.addRange(range);
                            }
                        }
                    });
                }
            }
        });
        
        // Track composition state for Korean/IME input
        let isComposing = false;
        let lastCompositionData = '';
        
        editor.addEventListener('compositionstart', (e) => {
            isComposing = true;
        });
        
        editor.addEventListener('compositionupdate', (e) => {
            lastCompositionData = e.data || '';
        });
        
        editor.addEventListener('compositionend', (e) => {
            isComposing = false;
            
            // Fix for Korean IME duplication in Chrome/Safari
            // Check if the last character is duplicated
            setTimeout(() => {
                const text = editor.innerText;
                if (text.length >= 2) {
                    const lastChar = text[text.length - 1];
                    const secondLastChar = text[text.length - 2];
                    
                    // If last two characters are the same and it's a Korean character
                    if (lastChar === secondLastChar && /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(lastChar)) {
                        // Remove the duplicate
                        editor.innerText = text.slice(0, -1);
                        
                        // Restore cursor position to end
                        const range = document.createRange();
                        const sel = window.getSelection();
                        range.selectNodeContents(editor);
                        range.collapse(false);
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                    }
                }
            }, 0);
        });
        
        // Combined input handler for resize only
        editor.addEventListener('input', (e) => {
            // Don't manipulate during composition
            if (isComposing) {
                return;
            }
            
            // Auto-resize
            const newHeight = editor.scrollHeight;
            if (newHeight > parseInt(editor.style.minHeight)) {
                editor.style.height = `${newHeight}px`;
            }
        });
    }
    
    private startInlineEditing(element: CanvasElement): void {
        if (element.type !== 'text') return;
        
        
        // Get fresh element reference from global manager
        const currentElement = this.globalManager.getElement(element.id);
        if (!currentElement) {
            return;
        }
        
        // Store element ID early for use in attributes
        const elementId = currentElement.id;
        
        // Check if we're already editing this element
        const existingEditor = document.querySelector('.text-editor-active');
        if (existingEditor) {
            return; // Already editing
        }
        
        // Keep the element selected and toolbar visible during editing
        this.globalManager.setSelectedElement(element.id);
        this.updateTextToolbar();
        
        // Create a contentEditable div for inline editing
        const editor = document.createElement('div');
        editor.className = 'text-editor-active text-editor-edit'; // Add class to identify EDIT text editor
        editor.setAttribute('data-editor-type', 'edit');
        editor.setAttribute('data-element-id', elementId);
        editor.contentEditable = 'true';
        editor.innerText = currentElement.content;
        editor.style.position = 'fixed';
        
        // Calculate position based on canvas position and scale
        const rect = this.canvas.getBoundingClientRect();
        const container = this.canvas.parentElement?.getBoundingClientRect();
        
        // Convert global element position to local canvas position
        const localPos = this.globalToLocal(element.x, element.y);
        
        // Adjust for container scroll if needed
        const scrollLeft = this.canvas.parentElement?.scrollLeft || 0;
        const scrollTop = this.canvas.parentElement?.scrollTop || 0;
        
        // Check if editor would overlap with toolbar and adjust position
        const toolbarHeight = this.textToolbar ? this.textToolbar.offsetHeight : 0;
        const editorTop = rect.top + (localPos.y - scrollTop) * this.scale;
        let adjustedTop = editorTop;
        
        // Text toolbar is at fixed position top: 60px, so check if editor is too high
        const textToolbarBottom = 60 + (toolbarHeight || 50); // 60px top + toolbar height
        if (editorTop < textToolbarBottom + 10) {
            adjustedTop = Math.max(editorTop, textToolbarBottom + 20); // Keep below toolbar
        }
        
        editor.style.left = `${rect.left + (localPos.x - scrollLeft) * this.scale}px`;
        editor.style.top = `${adjustedTop}px`;
        editor.style.minWidth = `${Math.max(100, element.width) * this.scale}px`;
        editor.style.minHeight = `${element.height * this.scale}px`;
        editor.style.maxWidth = `${(this.canvas.width - localPos.x) * this.scale}px`;
        
        // Apply text styles exactly matching canvas
        const style = element.fontStyle === 'italic' ? 'italic ' : '';
        const weight = element.fontWeight === 'bold' ? 'bold ' : '';
        editor.style.font = `${style}${weight}${(element.fontSize || 24) * this.scale}px ${element.fontFamily || 'Arial'}`;
        editor.style.color = element.color || '#2d3748';
        editor.style.textAlign = element.textAlign || 'left';
        
        // Visual styles for better visibility with semi-transparent background
        editor.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        editor.style.border = '2px solid #3182ce';
        editor.style.borderRadius = '4px';
        editor.style.padding = `${5 * this.scale}px`;
        editor.style.margin = '0';
        editor.style.zIndex = '10000';
        editor.style.whiteSpace = 'pre-wrap';
        editor.style.wordBreak = 'break-word';
        editor.style.overflow = 'auto';
        editor.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        editor.style.outline = 'none';
        
        // Line height to match canvas rendering
        editor.style.lineHeight = '1.2';
        
        // Store original content but DON'T hide the canvas text
        const originalContent = currentElement.content;
        // elementId already declared above
        
        // Don't set editingElementId - keep text visible
        // this.editingElementId = elementId; // REMOVED - keep text visible
        // this.render(); // Don't re-render to avoid flicker
        
        document.body.appendChild(editor);
        
        // Select all text
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
        
        let isFinished = false;
        
        const finishEditing = () => {
            
            if (isFinished) {
                return;
            }
            isFinished = true;
            
            // Get the current content - handle all whitespace properly
            let rawContent = editor.innerText || editor.textContent || '';
            
            // Remove zero-width spaces and normalize
            let newContent = rawContent.replace(/\u200B/g, '').replace(/\u00A0/g, ' ').trim();
            
            // Always ensure we have content
            if (!newContent || newContent.length === 0) {
                newContent = '텍스트'; // Default text if empty
            }
            
            // Get the existing element to preserve its properties
            const existingElement = this.globalManager.getElement(elementId);
            if (!existingElement) {
                if (document.body.contains(editor)) {
                    document.body.removeChild(editor);
                }
                return;
            }
            
            // 새 엘리먼트 생성 대신 기존 엘리먼트 업데이트로 변경
            // 이유: 새 ID로 교체하면 선택 상태나 다른 참조가 깨질 수 있음
            this.globalManager.updateElement(elementId, { 
                content: newContent 
            });
            
            
            // Remove editor
            if (document.body.contains(editor)) {
                document.body.removeChild(editor);
            }
            
            // Update text dimensions for the updated element
            const updatedElement = this.globalManager.getElement(elementId);
            if (updatedElement) {
                this.updateTextDimensions(updatedElement);
                // Keep element selected and toolbar visible
                this.globalManager.setSelectedElement(elementId);
                this.updateTextToolbar();
            }
            this.render();
        };
        
        const cancelEditing = () => {
            if (isFinished) return;
            isFinished = true;
            
            // Don't update - just leave the original element as is
            if (document.body.contains(editor)) {
                document.body.removeChild(editor);
            }
            this.render();
        };
        
        // Track if we should handle blur and keyboard processing
        let shouldHandleBlur = true;
        let isProcessingKeyboard = false;
        let finishingViaKeyboard = false;
        
        // Event handlers
        editor.addEventListener('blur', (e) => {
            
            // 이미 키보드로 처리중이면 blur 무시
            if (isProcessingKeyboard) {
                return;
            }
            
            // 이미 종료되었으면 무시
            if (isFinished) {
                return;
            }
            
            // Check if we're clicking on the text toolbar
            const relatedTarget = e.relatedTarget as HTMLElement;
            if (relatedTarget && this.textToolbar && this.textToolbar.contains(relatedTarget)) {
                // Refocus the editor if clicking on toolbar
                setTimeout(() => {
                    if (document.body.contains(editor)) {
                        editor.focus();
                    }
                }, 0);
                return;
            }
            
            // 직접 finishEditing 호출 (지연 없이)
            finishEditing();
        });
        
        editor.addEventListener('keydown', (e) => {
            // Handle special keys
            if (e.key === 'Escape') {
                e.preventDefault();
                isProcessingKeyboard = true;
                shouldHandleBlur = false;
                cancelEditing();
                return;
            }
            
            // Enter to confirm (without Shift)
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                isProcessingKeyboard = true;
                finishingViaKeyboard = true;
                shouldHandleBlur = false;
                finishEditing();
                return;
            }
            
            // Tab to confirm
            if (e.key === 'Tab') {
                e.preventDefault();
                isProcessingKeyboard = true;
                finishingViaKeyboard = true;
                shouldHandleBlur = false;
                finishEditing();
                return;
            }
        });
        
        // Handle backspace/delete separately to prevent issues
        editor.addEventListener('beforeinput', (e) => {
            
            // If deleting and text would become empty, prevent default and handle manually
            if ((e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward')) {
                const currentText = editor.innerText || '';
                const selection = window.getSelection()?.toString() || '';
                
                // If we're about to delete the last character
                if (currentText.length <= 1 || (selection === currentText)) {
                    // Don't prevent default - let it delete, but maintain minimum content
                    requestAnimationFrame(() => {
                        const afterDeleteText = editor.innerText || '';
                        
                        if (!editor.innerText || editor.innerText.length === 0) {
                            editor.innerHTML = '\u200B';
                            // Position cursor at start
                            const range = document.createRange();
                            const sel = window.getSelection();
                            if (editor.firstChild) {
                                range.setStart(editor.firstChild, 0);
                                range.collapse(true);
                                sel?.removeAllRanges();
                                sel?.addRange(range);
                            }
                        }
                    });
                }
            }
        });
        
        // Keep toolbar visible during editing
        editor.addEventListener('focus', () => {
            this.globalManager.setSelectedElement(elementId);
            this.updateTextToolbar();
        });
        
        // Track composition state for Korean/IME input
        let isComposing = false;
        let lastCompositionData = '';
        
        editor.addEventListener('compositionstart', (e) => {
            isComposing = true;
        });
        
        editor.addEventListener('compositionupdate', (e) => {
            lastCompositionData = e.data || '';
        });
        
        editor.addEventListener('compositionend', (e) => {
            isComposing = false;
            
            // Fix for Korean IME duplication in Chrome/Safari
            // Check if the last character is duplicated
            setTimeout(() => {
                const text = editor.innerText;
                if (text.length >= 2) {
                    const lastChar = text[text.length - 1];
                    const secondLastChar = text[text.length - 2];
                    
                    // If last two characters are the same and it's a Korean character
                    if (lastChar === secondLastChar && /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(lastChar)) {
                        // Remove the duplicate
                        editor.innerText = text.slice(0, -1);
                        
                        // Restore cursor position to end
                        const range = document.createRange();
                        const sel = window.getSelection();
                        range.selectNodeContents(editor);
                        range.collapse(false);
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                    }
                }
            }, 0);
        });
        
        // Combined input handler for resize only
        editor.addEventListener('input', (e) => {
            // Don't manipulate during composition
            if (isComposing) {
                return;
            }
            
            // Auto-resize
            const newHeight = editor.scrollHeight;
            if (newHeight > parseInt(editor.style.minHeight)) {
                editor.style.height = `${newHeight}px`;
            }
        });
        
        // Update position if canvas scrolls
        const updatePosition = () => {
            const rect = this.canvas.getBoundingClientRect();
            const localPos = this.globalToLocal(currentElement.x, currentElement.y);
            editor.style.left = `${rect.left + localPos.x * this.scale}px`;
            editor.style.top = `${rect.top + localPos.y * this.scale}px`;
        };
        
        window.addEventListener('scroll', updatePosition);
        window.addEventListener('resize', updatePosition);
        
        // Clean up scroll listeners when done
        const originalFinish = finishEditing;
        const cleanup = () => {
            window.removeEventListener('scroll', updatePosition);
            window.removeEventListener('resize', updatePosition);
        };
        
        editor.addEventListener('blur', cleanup);
    }
    
    private updateTextDimensions(element: CanvasElement): void {
        if (element.type !== 'text') return;
        
        this.ctx.save();
        
        const style = element.fontStyle === 'italic' ? 'italic ' : '';
        const weight = element.fontWeight === 'bold' ? 'bold ' : '';
        this.ctx.font = `${style}${weight}${element.fontSize || 24}px ${element.fontFamily || 'Arial'}`;
        
        // Handle multi-line text
        const lines = element.content.split('\n');
        const lineHeight = (element.fontSize || 24) * 1.2;
        
        // Calculate max width from all lines
        let maxWidth = 0;
        lines.forEach(line => {
            const metrics = this.ctx.measureText(line);
            maxWidth = Math.max(maxWidth, metrics.width);
        });
        
        this.globalManager.updateElement(element.id, {
            width: maxWidth + 10,
            height: lineHeight * lines.length
        });
        
        this.ctx.restore();
    }

    private getMousePosition(e: MouseEvent): Point {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.scale;
        const y = (e.clientY - rect.top) / this.scale;
        return { x, y };
    }

    private getElementAtPoint(localPoint: Point): CanvasElement | null {
        const globalPoint = this.localToGlobal(localPoint.x, localPoint.y);
        return this.globalManager.getElementAtPoint(globalPoint.x, globalPoint.y);
    }

    public addText(text: string = '텍스트'): void {
        const baseFontSize = 24;
        
        // Convert local center position to global position
        const localCenter = {
            x: this.canvas.width / 2 - 50,
            y: this.canvas.height / 2 - baseFontSize / 2
        };
        const globalPos = this.localToGlobal(localCenter.x, localCenter.y);
        
        // Create editor directly without adding element first
        this.createInlineTextEditor(globalPos.x, globalPos.y, text, baseFontSize);
    }

    public addImage(imageUrl: string): void {
        const img = new Image();
        img.onload = () => {
            const maxSize = 300;
            let width = img.width;
            let height = img.height;
            
            if (width > maxSize || height > maxSize) {
                const ratio = Math.min(maxSize / width, maxSize / height);
                width *= ratio;
                height *= ratio;
            }
            
            // Convert local center position to global position
            const localCenter = {
                x: this.canvas.width / 2 - width / 2,
                y: this.canvas.height / 2 - height / 2
            };
            const globalPos = this.localToGlobal(localCenter.x, localCenter.y);
            
            const element: CanvasElement = {
                id: `element-${Date.now()}`,
                type: 'image',
                x: globalPos.x,  // Global position
                y: globalPos.y,
                width: width,
                height: height,
                content: imageUrl,
                imageElement: img,
                canvasId: this.canvas.id
            };
            
            this.globalManager.addElement(element);
            this.globalManager.setSelectedElement(element.id);
            this.render();
        };
        img.src = imageUrl;
    }

    public clear(): void {
        // Clear all elements from global manager
        this.globalManager.clearAll();
        this.updateTextToolbar();
        this.render();
    }

    public deleteSelected(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (selectedElement) {
            this.globalManager.removeElement(selectedElement.id);
            this.updateTextToolbar();
            this.render();
        }
    }

    public render(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        
        // Get all elements that should be visible on this canvas
        const visibleElements = this.globalManager.getElementsForCanvas(
            this.offsetX, 
            this.offsetY, 
            this.canvas.width, 
            this.canvas.height
        );
        
        // Render each visible element
        for (const element of visibleElements) {
            // If linking is disabled, only render elements that belong to this canvas
            // or elements being dragged (to allow partial visibility)
            if (!this.isLinkingEnabled() && element.canvasId !== this.canvas.id) {
                // Skip elements from other canvases unless they're being dragged
                if (!this.dragState.isDragging || this.dragState.element?.id !== element.id) {
                    continue;
                }
            }
            
            this.ctx.save();
            
            
            // Convert element's global position to local position for rendering
            const localPos = this.globalToLocal(element.x, element.y);
            const localElement = { ...element, x: localPos.x, y: localPos.y };
            
            
            if (element.type === 'text') {
                this.renderText(localElement);
            } else if (element.type === 'image' && element.imageElement) {
                this.renderImage(localElement);
            }
            
            // Render selection if this element is selected
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement && element.id === selectedElement.id) {
                this.renderSelection(localElement);
                this.renderResizeHandles(localElement);
            }
            
            this.ctx.restore();
        }
    }

    private renderText(element: CanvasElement): void {
        // Don't skip rendering - always show text even during editing
        // This allows the text to remain visible behind the edit overlay
        
        this.ctx.save();
        
        const style = element.fontStyle === 'italic' ? 'italic ' : '';
        const weight = element.fontWeight === 'bold' ? 'bold ' : '';
        this.ctx.font = `${style}${weight}${element.fontSize}px ${element.fontFamily}`;
        this.ctx.fillStyle = element.color || '#000000';
        
        // Handle multi-line text
        const lines = element.content.split('\n');
        const lineHeight = (element.fontSize || 24) * 1.2;
        
        // Calculate total width and height
        let maxWidth = 0;
        lines.forEach(line => {
            const metrics = this.ctx.measureText(line);
            maxWidth = Math.max(maxWidth, metrics.width);
        });
        
        element.width = maxWidth + 10; // Reduced padding
        element.height = lineHeight * lines.length;
        
        // Render each line - allow rendering outside canvas bounds
        lines.forEach((line, index) => {
            let textX = element.x + 5;
            if (element.textAlign === 'center') {
                textX = element.x + element.width / 2;
                this.ctx.textAlign = 'center';
            } else if (element.textAlign === 'right') {
                textX = element.x + element.width - 5;
                this.ctx.textAlign = 'right';
            } else {
                this.ctx.textAlign = 'left';
            }
            
            const textY = element.y + lineHeight * (index + 0.5);
            this.ctx.textBaseline = 'middle';
            
            // Draw text even if it goes outside canvas bounds
            this.ctx.fillText(line, textX, textY);
        });
        
        this.ctx.restore();
    }

    private renderImage(element: CanvasElement): void {
        if (element.imageElement) {
            if (element.cropX !== undefined && element.cropY !== undefined && 
                element.cropWidth !== undefined && element.cropHeight !== undefined) {
                // Render cropped image
                this.ctx.drawImage(
                    element.imageElement,
                    element.cropX, element.cropY,  // Source position
                    element.cropWidth, element.cropHeight,  // Source dimensions
                    element.x, element.y,  // Destination position
                    element.width, element.height  // Destination dimensions
                );
            } else {
                // Render full image
                this.ctx.drawImage(
                    element.imageElement,
                    element.x,
                    element.y,
                    element.width,
                    element.height
                );
            }
            
            // Render crop overlay if in crop mode
            const selected = this.globalManager.getSelectedElement();
            if (this.cropMode && selected?.id === element.id) {
                this.renderCropOverlay(element);
            }
        }
    }
    
    private renderCropOverlay(element: CanvasElement): void {
        if (!this.cropMode || element.type !== 'image' || 
            element.cropX === undefined || element.cropY === undefined ||
            element.cropWidth === undefined || element.cropHeight === undefined) {
            return;
        }
        
        const localX = element.x - this.offsetX;
        const localY = element.y - this.offsetY;
        
        // Save context state
        this.ctx.save();
        
        // Draw dark overlay for entire image
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(localX, localY, element.width, element.height);
        
        // Clear the crop area (make it visible)
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillRect(localX + element.cropX, localY + element.cropY, 
                         element.cropWidth, element.cropHeight);
        
        // Reset composite operation
        this.ctx.globalCompositeOperation = 'source-over';
        
        // Draw crop area border with white solid line
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(localX + element.cropX, localY + element.cropY, 
                           element.cropWidth, element.cropHeight);
        
        // Draw rule of thirds grid
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1;
        // Vertical lines
        for (let i = 1; i <= 2; i++) {
            const x = localX + element.cropX + (element.cropWidth * i / 3);
            this.ctx.beginPath();
            this.ctx.moveTo(x, localY + element.cropY);
            this.ctx.lineTo(x, localY + element.cropY + element.cropHeight);
            this.ctx.stroke();
        }
        // Horizontal lines
        for (let i = 1; i <= 2; i++) {
            const y = localY + element.cropY + (element.cropHeight * i / 3);
            this.ctx.beginPath();
            this.ctx.moveTo(localX + element.cropX, y);
            this.ctx.lineTo(localX + element.cropX + element.cropWidth, y);
            this.ctx.stroke();
        }
        
        // Draw resize handles
        this.drawCropHandles(localX + element.cropX, localY + element.cropY, 
                            element.cropWidth, element.cropHeight);
        
        // Draw crop dimensions
        const cropText = `${Math.round(element.cropWidth)} × ${Math.round(element.cropHeight)}`;
        this.ctx.font = 'bold 12px Arial';
        const textMetrics = this.ctx.measureText(cropText);
        const padding = 6;
        const textX = localX + element.cropX + element.cropWidth/2;
        const textY = localY + element.cropY + element.cropHeight + 25;
        
        // Background for text
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(textX - textMetrics.width/2 - padding, 
                         textY - 12, 
                         textMetrics.width + padding * 2, 
                         18);
        
        // Text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(cropText, textX, textY);
        this.ctx.textAlign = 'start';
        
        // Restore context state
        this.ctx.restore();
    }
    
    private drawCropHandles(x: number, y: number, width: number, height: number): void {
        const handleSize = 10;
        const handles = [
            { x: x, y: y, cursor: 'nw-resize', type: 'nw' }, // top-left
            { x: x + width/2, y: y, cursor: 'n-resize', type: 'n' }, // top-center
            { x: x + width, y: y, cursor: 'ne-resize', type: 'ne' }, // top-right
            { x: x + width, y: y + height/2, cursor: 'e-resize', type: 'e' }, // right-center
            { x: x + width, y: y + height, cursor: 'se-resize', type: 'se' }, // bottom-right
            { x: x + width/2, y: y + height, cursor: 's-resize', type: 's' }, // bottom-center
            { x: x, y: y + height, cursor: 'sw-resize', type: 'sw' }, // bottom-left
            { x: x, y: y + height/2, cursor: 'w-resize', type: 'w' } // left-center
        ];
        
        handles.forEach(handle => {
            // White border
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(handle.x - handleSize/2 - 1, handle.y - handleSize/2 - 1, 
                             handleSize + 2, handleSize + 2);
            
            // Blue handle
            this.ctx.fillStyle = '#3182ce';
            this.ctx.fillRect(handle.x - handleSize/2, handle.y - handleSize/2, 
                             handleSize, handleSize);
        });
    }

    private renderSelection(element: CanvasElement): void {
        this.ctx.strokeStyle = '#3182ce';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(element.x, element.y, element.width, element.height);
        this.ctx.setLineDash([]);
    }

    private renderResizeHandles(element: CanvasElement): void {
        const handles = [
            { x: element.x, y: element.y },
            { x: element.x + element.width / 2, y: element.y },
            { x: element.x + element.width, y: element.y },
            { x: element.x + element.width, y: element.y + element.height / 2 },
            { x: element.x + element.width, y: element.y + element.height },
            { x: element.x + element.width / 2, y: element.y + element.height },
            { x: element.x, y: element.y + element.height },
            { x: element.x, y: element.y + element.height / 2 }
        ];
        
        this.ctx.fillStyle = '#3182ce';
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 1;
        
        handles.forEach(handle => {
            this.ctx.fillRect(handle.x - 4, handle.y - 4, 8, 8);
            this.ctx.strokeRect(handle.x - 4, handle.y - 4, 8, 8);
        });
    }
    
    private setupContextMenu(): void {
        // Handle menu item clicks using event delegation
        this.contextMenu.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const menuItem = target.closest('.context-menu-item');
            
            if (!menuItem || menuItem.classList.contains('has-submenu')) {
                return;
            }
            
            e.stopPropagation();
            const action = (menuItem as HTMLElement).dataset.action;
            
            switch (action) {
                case 'bring-front':
                    this.bringToFront();
                    break;
                case 'bring-forward':
                    this.bringForward();
                    break;
                case 'send-backward':
                    this.sendBackward();
                    break;
                case 'send-back':
                    this.sendToBack();
                    break;
                case 'duplicate':
                    this.duplicateElement();
                    break;
                case 'copy':
                    this.copyElement();
                    break;
                case 'paste':
                    this.pasteElement();
                    break;
                case 'delete':
                    this.deleteSelected();
                    break;
                case 'crop':
                    this.toggleCropMode();
                    break;
                case 'apply-crop':
                    this.applyCrop();
                    break;
            }
            
            this.contextMenu.style.display = 'none';
            this.render();
        });
        
        // Prevent context menu from closing when hovering over submenu
        this.contextMenu.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    
    private handleContextMenu(e: MouseEvent): void {
        e.preventDefault();
        
        const localPoint = this.getMousePosition(e);
        const globalPoint = this.localToGlobal(localPoint.x, localPoint.y);
        const element = this.globalManager.getElementAtPoint(globalPoint.x, globalPoint.y);
        
        // Store click position for paste (in global coordinates)
        this.lastContextMenuPosition = globalPoint;
        
        if (element) {
            // Show full menu for elements
            this.globalManager.setSelectedElement(element.id);
            this.updateTextToolbar();
            
            // Show all menu items, but hide crop if not an image
            const menuItems = this.contextMenu.querySelectorAll('.context-menu-item');
            menuItems.forEach(item => {
                const action = (item as HTMLElement).dataset.action;
                if (action === 'crop' && element.type !== 'image') {
                    (item as HTMLElement).style.display = 'none';
                } else {
                    (item as HTMLElement).style.display = '';
                }
            });
            const separators = this.contextMenu.querySelectorAll('.context-menu-separator');
            separators.forEach(sep => {
                (sep as HTMLElement).style.display = '';
            });
        } else {
            // Show limited menu for empty space (only paste)
            this.globalManager.setSelectedElement(null);
            this.updateTextToolbar();
            
            // Hide all items except paste
            const menuItems = this.contextMenu.querySelectorAll('.context-menu-item');
            menuItems.forEach(item => {
                const action = (item as HTMLElement).dataset.action;
                if (action === 'paste' && this.clipboard) {
                    (item as HTMLElement).style.display = '';
                } else {
                    (item as HTMLElement).style.display = 'none';
                }
            });
            const separators = this.contextMenu.querySelectorAll('.context-menu-separator');
            separators.forEach(sep => {
                (sep as HTMLElement).style.display = 'none';
            });
        }
        
        // Position context menu exactly at mouse cursor
        this.contextMenu.style.left = `${e.clientX}px`;
        this.contextMenu.style.top = `${e.clientY}px`;
        this.contextMenu.style.display = 'block';
        
        // Ensure menu stays within viewport
        requestAnimationFrame(() => {
            const menuRect = this.contextMenu.getBoundingClientRect();
            let adjustedX = e.clientX;
            let adjustedY = e.clientY;
            
            // Adjust horizontal position if menu goes off right edge
            if (menuRect.right > window.innerWidth) {
                adjustedX = Math.max(0, window.innerWidth - menuRect.width - 5);
            }
            
            // Adjust vertical position if menu goes off bottom edge
            if (menuRect.bottom > window.innerHeight) {
                adjustedY = Math.max(0, window.innerHeight - menuRect.height - 5);
            }
            
            if (adjustedX !== e.clientX || adjustedY !== e.clientY) {
                this.contextMenu.style.left = `${adjustedX}px`;
                this.contextMenu.style.top = `${adjustedY}px`;
            }
        });
        
        this.render();
    }
    
    private bringToFront(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (!selectedElement) return;
        
        this.globalManager.moveElementToFront(selectedElement.id);
    }
    
    private bringForward(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (!selectedElement) return;
        
        // For now, just move to front (can be improved with layer ordering)
        this.globalManager.moveElementToFront(selectedElement.id);
    }
    
    private sendBackward(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (!selectedElement) return;
        
        // For now, just move to back (can be improved with layer ordering)
        this.globalManager.moveElementToBack(selectedElement.id);
    }
    
    private sendToBack(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (!selectedElement) return;
        
        this.globalManager.moveElementToBack(selectedElement.id);
    }
    
    private copyElement(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (selectedElement) {
            this.clipboard = { ...selectedElement };
        }
    }
    
    private pasteElement(): void {
        if (this.clipboard) {
            const newElement: CanvasElement = {
                ...this.clipboard,
                id: `element-${Date.now()}`,
                x: this.lastContextMenuPosition.x || this.clipboard.x + 20,
                y: this.lastContextMenuPosition.y || this.clipboard.y + 20,
                canvasId: this.canvas.id
            };
            
            // If it's an image, clone the image element
            if (newElement.type === 'image' && this.clipboard.imageElement) {
                const img = new Image();
                img.src = this.clipboard.imageElement.src;
                newElement.imageElement = img;
            }
            
            this.globalManager.addElement(newElement);
            this.globalManager.setSelectedElement(newElement.id);
            this.updateTextToolbar();
        }
    }
    
    private duplicateElement(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (selectedElement) {
            const duplicate = this.globalManager.duplicateElement(selectedElement.id, 20, 20);
            if (duplicate) {
                this.globalManager.setSelectedElement(duplicate.id);
                this.updateTextToolbar();
            }
        }
    }
    
    private toggleCropMode(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (!selectedElement || selectedElement.type !== 'image') {
            return;
        }
        
        this.cropMode = !this.cropMode;
        this.cropDragging = false;
        this.cropResizing = false;
        
        if (this.cropMode) {
            // Store original dimensions if not already stored
            if (!selectedElement.originalWidth) {
                this.globalManager.updateElement(selectedElement.id, {
                    originalWidth: selectedElement.width,
                    originalHeight: selectedElement.height,
                    originalImageWidth: selectedElement.imageElement?.naturalWidth || selectedElement.width,
                    originalImageHeight: selectedElement.imageElement?.naturalHeight || selectedElement.height
                });
            }
            
            // Initialize crop area to center 80% of image if not set
            if (selectedElement.cropX === undefined) {
                const cropWidth = selectedElement.width * 0.8;
                const cropHeight = selectedElement.height * 0.8;
                const cropX = (selectedElement.width - cropWidth) / 2;
                const cropY = (selectedElement.height - cropHeight) / 2;
                
                this.globalManager.updateElement(selectedElement.id, {
                    cropX: cropX,
                    cropY: cropY,
                    cropWidth: cropWidth,
                    cropHeight: cropHeight
                });
            }
            
            // Add crop mode class to canvas for styling
            this.canvas.classList.add('crop-mode');
            
            // Show crop toolbar
            this.showCropToolbar();
        } else {
            // Remove crop mode class
            this.canvas.classList.remove('crop-mode');
            
            // Hide crop toolbar
            this.hideCropToolbar();
        }
        
        this.render();
    }
    
    private showCropToolbar(): void {
        // Remove existing toolbar if any
        this.hideCropToolbar();
        
        const toolbar = document.createElement('div');
        toolbar.className = 'crop-mode-toolbar';
        toolbar.id = 'cropToolbar';
        
        const applyBtn = document.createElement('button');
        applyBtn.className = 'apply-crop';
        applyBtn.textContent = '✅ 크롭 적용';
        applyBtn.onclick = () => this.applyCrop();
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-crop';
        cancelBtn.textContent = '❌ 취소';
        cancelBtn.onclick = () => {
            this.cropMode = false;
            this.canvas.classList.remove('crop-mode');
            this.hideCropToolbar();
            this.render();
        };
        
        const infoSpan = document.createElement('span');
        infoSpan.className = 'crop-info';
        infoSpan.textContent = '드래그하여 크롭 영역을 조절하세요';
        
        toolbar.appendChild(applyBtn);
        toolbar.appendChild(infoSpan);
        toolbar.appendChild(cancelBtn);
        document.body.appendChild(toolbar);
    }
    
    private hideCropToolbar(): void {
        const toolbar = document.getElementById('cropToolbar');
        if (toolbar) {
            toolbar.remove();
        }
    }
    
    private applyCrop(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (!selectedElement || selectedElement.type !== 'image' || !this.cropMode) {
            return;
        }
        
        // Apply the crop by creating a new cropped image
        if (selectedElement.cropX !== undefined && selectedElement.cropY !== undefined &&
            selectedElement.cropWidth && selectedElement.cropHeight && selectedElement.imageElement) {
            
            // Create a temporary canvas for cropping
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = selectedElement.cropWidth;
            tempCanvas.height = selectedElement.cropHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            if (tempCtx) {
                // Draw the cropped portion of the image
                tempCtx.drawImage(
                    selectedElement.imageElement,
                    selectedElement.cropX, selectedElement.cropY,
                    selectedElement.cropWidth, selectedElement.cropHeight,
                    0, 0,
                    selectedElement.cropWidth, selectedElement.cropHeight
                );
                
                // Create new image from cropped canvas
                const newImg = new Image();
                newImg.onload = () => {
                    // Update element with cropped image
                    this.globalManager.updateElement(selectedElement.id, {
                        imageElement: newImg,
                        width: selectedElement.cropWidth,
                        height: selectedElement.cropHeight,
                        originalWidth: selectedElement.cropWidth,
                        originalHeight: selectedElement.cropHeight,
                        cropX: undefined,
                        cropY: undefined,
                        cropWidth: undefined,
                        cropHeight: undefined
                    });
                    
                    // Exit crop mode
                    this.cropMode = false;
                    this.canvas.classList.remove('crop-mode');
                    this.hideCropToolbar();
                    this.render();
                };
                newImg.src = tempCanvas.toDataURL();
            }
        }
    }
}