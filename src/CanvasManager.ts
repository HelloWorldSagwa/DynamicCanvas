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
    private cropBounds: { left: number, top: number, right: number, bottom: number } | null = null;
    private cropOriginalBounds: { left: number, top: number, right: number, bottom: number } | null = null;
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
    private isSelectionDragging: boolean = false;
    private selectionStartPoint: Point = { x: 0, y: 0 };
    private selectionEndPoint: Point = { x: 0, y: 0 };
    private originalPositions: Map<string, Point> = new Map();
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
        
        // Listen for directional link changes
        document.addEventListener('directional-link-changed', (e) => {
            this.render(); // Re-render when directional links change
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
    
    // Check if linking is enabled for a specific direction from this canvas
    private isLinkEnabledForDirection(direction: 'left' | 'right' | 'top' | 'bottom'): boolean {
        // Get the grid manager to check adjacent canvas and link state
        const gridManager = (window as any).canvasGridManager;
        if (!gridManager) return false;
        
        const adjacent = gridManager.getAdjacentCanvases(this.canvas.id);
        const adjacentCanvasId = adjacent.get(direction);
        
        if (!adjacentCanvasId) return false;
        
        // Check if link is enabled between these canvases
        return gridManager.areCanvasesLinked(this.canvas.id, adjacentCanvasId);
    }
    
    public setOffset(offsetX: number, offsetY: number): void {
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.render();
    }
    
    public getOffset(): { x: number, y: number } {
        return { x: this.offsetX, y: this.offsetY };
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
        
        // WARNING: CROP MODE BEHAVIOR - DO NOT MODIFY WITHOUT EXPLICIT USER INSTRUCTION
        // 크롭 모드: 더블클릭으로 활성화, 외부 클릭으로 적용
        // Crop mode: activate with double-click, apply with outside click
        // CROP MODE: Only allow crop handle dragging, disable ALL other mouse functions
        if (this.cropMode) {
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement && selectedElement.type === 'image' && this.cropBounds) {
                const localX = selectedElement.x - this.offsetX;
                const localY = selectedElement.y - this.offsetY;
                const mouseX = localPoint.x - localX;
                const mouseY = localPoint.y - localY;
                
                // Check if click is outside the image bounds - if so, apply crop
                if (mouseX < 0 || mouseY < 0 || 
                    mouseX > selectedElement.width || mouseY > selectedElement.height) {
                    console.log('[CROP] Click outside image - applying crop');
                    this.applyCrop();
                    return;
                }
                
                // Check which edge/corner is being clicked (20px threshold for easier clicking)
                const threshold = 20;
                const bounds = this.cropBounds;
                
                const nearLeft = Math.abs(mouseX - bounds.left) < threshold;
                const nearRight = Math.abs(mouseX - bounds.right) < threshold;
                const nearTop = Math.abs(mouseY - bounds.top) < threshold;
                const nearBottom = Math.abs(mouseY - bounds.bottom) < threshold;
                
                // Determine handle (corners have priority)
                if (nearLeft && nearTop) {
                    this.cropHandle = 'nw';
                } else if (nearRight && nearTop) {
                    this.cropHandle = 'ne';
                } else if (nearRight && nearBottom) {
                    this.cropHandle = 'se';
                } else if (nearLeft && nearBottom) {
                    this.cropHandle = 'sw';
                } else if (nearLeft) {
                    this.cropHandle = 'w';
                } else if (nearRight) {
                    this.cropHandle = 'e';
                } else if (nearTop) {
                    this.cropHandle = 'n';
                } else if (nearBottom) {
                    this.cropHandle = 's';
                }
                
                if (this.cropHandle) {
                    console.log(`[CROP] Handle detected: ${this.cropHandle}`);
                    this.cropOriginalBounds = { ...this.cropBounds };
                } else {
                    console.log(`[CROP] No handle detected at mouse position`);
                }
            } else if (this.cropMode) {
                // No selected image or click outside any image - apply crop and exit crop mode
                console.log('[CROP] Click in empty space - applying crop');
                this.applyCrop();
            }
            // In crop mode, stop here - no dragging, no selection, no other interactions
            return;
        }
        
        // Check for resize handles FIRST if we have a selected element
        const selectedElement = this.globalManager.getSelectedElement();
        let handle: ResizeHandle | null = null;
        
        if (selectedElement && !this.cropMode) {
            // Check if clicking on resize handle (even if outside element bounds)
            handle = this.getResizeHandle(localPoint, selectedElement);
            
            if (handle) {
                this.resizeState = {
                    isResizing: true,
                    element: selectedElement,
                    handle: handle,
                    startPoint: globalPoint,
                    originalBounds: {
                        x: selectedElement.x,
                        y: selectedElement.y,
                        width: selectedElement.width,
                        height: selectedElement.height,
                        originalFontSize: selectedElement.fontSize
                    } as any
                };
                return; // Stop here if we're starting a resize
            }
        }
        
        // If not resizing, check for element selection
        const element = this.globalManager.getElementAtPoint(globalPoint.x, globalPoint.y);
        
        if (element && !this.cropMode) {
            if (!handle) {  // Only process selection if not resizing
                // Check if Shift or Cmd/Ctrl is held for multi-selection
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                    // Toggle selection
                    if (this.globalManager.isSelected(element.id)) {
                        this.globalManager.removeFromSelection(element.id);
                    } else {
                        this.globalManager.addToSelection(element.id);
                    }
                } else {
                    // Single selection
                    this.globalManager.clearSelection();
                    this.globalManager.setSelectedElement(element.id);
                }
                
                this.dragState = {
                    isDragging: true,
                    element: element,
                    startPoint: globalPoint,
                    elementStartPoint: { x: element.x, y: element.y }
                };
                
                // Store original positions of all selected elements for multi-drag
                this.originalPositions.clear();
                const selectedElements = this.globalManager.getSelectedElements();
                selectedElements.forEach(el => {
                    this.originalPositions.set(el.id, { x: el.x, y: el.y });
                });
                this.updateTextToolbar();
                
                // Dispatch selection changed event
                const event = new CustomEvent('selection-changed', {
                    detail: { element: element }
                });
                document.dispatchEvent(event);
            }
        } else if (!this.cropMode) {  // Only allow selection rectangle when NOT in crop mode
            // Start selection rectangle if not clicking on an element
            if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
                this.globalManager.clearSelection();
            }
            
            // Start selection dragging
            this.isSelectionDragging = true;
            this.selectionStartPoint = globalPoint;
            this.selectionEndPoint = globalPoint;
            
            this.updateTextToolbar();
            
            // Dispatch selection changed event with null
            const event = new CustomEvent('selection-changed', {
                detail: { element: null }
            });
            document.dispatchEvent(event);
        }
        
        this.render();
    }
    
    private getCropHandle(point: Point, element: CanvasElement): string | null {
        if (!element.cropX || element.cropX === undefined) return null;
        
        const localX = element.x - this.offsetX;
        const localY = element.y - this.offsetY;
        const handleSize = 10;
        const halfSize = handleSize / 2;
        
        const cropY = element.cropY || 0;
        const cropWidth = element.cropWidth || 0;
        const cropHeight = element.cropHeight || 0;
        
        const handles = [
            { x: localX + element.cropX, y: localY + cropY, type: 'nw' },
            { x: localX + element.cropX + cropWidth/2, y: localY + cropY, type: 'n' },
            { x: localX + element.cropX + cropWidth, y: localY + cropY, type: 'ne' },
            { x: localX + element.cropX + cropWidth, y: localY + cropY + cropHeight/2, type: 'e' },
            { x: localX + element.cropX + cropWidth, y: localY + cropY + cropHeight, type: 'se' },
            { x: localX + element.cropX + cropWidth/2, y: localY + cropY + cropHeight, type: 's' },
            { x: localX + element.cropX, y: localY + cropY + cropHeight, type: 'sw' },
            { x: localX + element.cropX, y: localY + cropY + cropHeight/2, type: 'w' }
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
        newCropX = Math.max(0, Math.min(newCropX, element.width - (element.cropWidth || 0)));
        newCropY = Math.max(0, Math.min(newCropY, element.height - (element.cropHeight || 0)));
        
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
        
        // Handle crop mode - drag handles to crop
        if (this.cropMode && this.cropHandle && this.cropBounds) {
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement && selectedElement.type === 'image') {
                const localX = selectedElement.x - this.offsetX;
                const localY = selectedElement.y - this.offsetY;
                const mouseX = Math.max(0, Math.min(localPoint.x - localX, selectedElement.width));
                const mouseY = Math.max(0, Math.min(localPoint.y - localY, selectedElement.height));
                
                // Update crop bounds based on which handle is being dragged
                const bounds = { ...this.cropBounds };
                
                // Update the appropriate edge based on handle
                if (this.cropHandle.includes('n')) bounds.top = mouseY;
                if (this.cropHandle.includes('s')) bounds.bottom = mouseY;
                if (this.cropHandle.includes('w')) bounds.left = mouseX;
                if (this.cropHandle.includes('e')) bounds.right = mouseX;
                
                // Ensure minimum size of 20px
                const minSize = 20;
                if (bounds.right - bounds.left >= minSize && bounds.bottom - bounds.top >= minSize) {
                    this.cropBounds = bounds;
                    
                    // Don't update element crop values during drag - only update bounds
                    // The actual crop values are only set when applyCrop is called
                    
                    // Update crop info display
                    this.updateCropInfo();
                }
                
                this.render();
                return;
            }
        }
        
        // Handle selection rectangle dragging
        if (this.isSelectionDragging) {
            this.selectionEndPoint = globalPoint;
            
            // Calculate selection rectangle bounds
            const x = Math.min(this.selectionStartPoint.x, this.selectionEndPoint.x);
            const y = Math.min(this.selectionStartPoint.y, this.selectionEndPoint.y);
            const width = Math.abs(this.selectionEndPoint.x - this.selectionStartPoint.x);
            const height = Math.abs(this.selectionEndPoint.y - this.selectionStartPoint.y);
            
            // Get all elements in the selection rectangle
            const elementsInRect = this.globalManager.getElementsInRectangle(x, y, width, height);
            
            // Clear and reselect elements
            this.globalManager.clearSelection();
            elementsInRect.forEach(element => {
                this.globalManager.addToSelection(element.id);
            });
            
            this.render();
            return;
        }
        
        // Only handle if we're actively dragging or resizing from this canvas
        if (!this.dragState.isDragging && !this.resizeState.isResizing && !this.cropDragging && !this.cropResizing) {
            // Check for hover effects
            if (e.target === this.canvas) {
                if (this.cropMode) {
                    // In crop mode, only change cursor near crop handles
                    const selectedElement = this.globalManager.getSelectedElement();
                    if (selectedElement && selectedElement.type === 'image' && this.cropBounds) {
                        const localX = selectedElement.x - this.offsetX;
                        const localY = selectedElement.y - this.offsetY;
                        const mouseX = localPoint.x - localX;
                        const mouseY = localPoint.y - localY;
                        
                        const threshold = 20;
                        const bounds = this.cropBounds;
                        
                        const nearLeft = Math.abs(mouseX - bounds.left) < threshold;
                        const nearRight = Math.abs(mouseX - bounds.right) < threshold;
                        const nearTop = Math.abs(mouseY - bounds.top) < threshold;
                        const nearBottom = Math.abs(mouseY - bounds.bottom) < threshold;
                        
                        // Set cursor based on proximity to handles
                        if (nearLeft && nearTop) {
                            this.canvas.style.cursor = 'nw-resize';
                        } else if (nearRight && nearTop) {
                            this.canvas.style.cursor = 'ne-resize';
                        } else if (nearRight && nearBottom) {
                            this.canvas.style.cursor = 'se-resize';
                        } else if (nearLeft && nearBottom) {
                            this.canvas.style.cursor = 'sw-resize';
                        } else if (nearLeft) {
                            this.canvas.style.cursor = 'w-resize';
                        } else if (nearRight) {
                            this.canvas.style.cursor = 'e-resize';
                        } else if (nearTop) {
                            this.canvas.style.cursor = 'n-resize';
                        } else if (nearBottom) {
                            this.canvas.style.cursor = 's-resize';
                        } else {
                            this.canvas.style.cursor = 'default';
                        }
                    } else {
                        this.canvas.style.cursor = 'default';
                    }
                } else {
                    // Normal mode - check for resize handles
                    const selectedElement = this.globalManager.getSelectedElement();
                    
                    // First check if we're over a resize handle (even if outside element bounds)
                    if (selectedElement) {
                        const handle = this.getResizeHandle(localPoint, selectedElement);
                        if (handle) {
                            this.canvas.style.cursor = this.getCursorForHandle(handle);
                            return;
                        }
                    }
                    
                    // If not over a handle, check if over an element
                    const element = this.globalManager.getElementAtPoint(globalPoint.x, globalPoint.y);
                    this.canvas.style.cursor = element ? 'move' : 'default';
                }
            }
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const currentLocalPoint = {
            x: (e.clientX - rect.left) / this.scale,
            y: (e.clientY - rect.top) / this.scale
        };
        const currentGlobalPoint = this.localToGlobal(currentLocalPoint.x, currentLocalPoint.y);
        
        if (this.resizeState.isResizing && this.resizeState.element) {
            this.handleResize(currentGlobalPoint);
        } else if (this.dragState.isDragging && this.dragState.element) {
            const dx = currentGlobalPoint.x - this.dragState.startPoint.x;
            const dy = currentGlobalPoint.y - this.dragState.startPoint.y;
            
            // Check if we're moving multiple selected elements
            const selectedElements = this.globalManager.getSelectedElements();
            if (selectedElements.length > 1) {
                // Move all selected elements together
                selectedElements.forEach(element => {
                    // Calculate new position for each element
                    const originalPos = this.originalPositions.get(element.id) || { x: element.x, y: element.y };
                    let newX = originalPos.x + dx;
                    let newY = originalPos.y + dy;
                    
                    // If linking is disabled, allow partial hiding but prevent complete loss
                    if (!this.isLinkingEnabled()) {
                        const minVisible = 50; // Minimum pixels that must remain visible
                        
                        // Ensure at least minVisible pixels remain on canvas
                        newX = Math.max(this.offsetX - element.width + minVisible, 
                                       Math.min(newX, this.offsetX + this.canvas.width - minVisible));
                        newY = Math.max(this.offsetY - element.height + minVisible, 
                                       Math.min(newY, this.offsetY + this.canvas.height - minVisible));
                    }
                    
                    // Update element's global position
                    this.globalManager.updateElement(element.id, {
                        x: newX,
                        y: newY
                    });
                });
            } else {
                // Single element drag (original logic)
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
            }
            
            // Trigger re-render on all canvases
            document.dispatchEvent(new CustomEvent('element-moved'));
        } else {
            // Check for resize handles first
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement) {
                const handle = this.getResizeHandle(localPoint, selectedElement);
                if (handle) {
                    this.canvas.style.cursor = this.getCursorForHandle(handle);
                    this.render();
                    return;
                }
            }
            
            // Then check if over an element
            const element = this.globalManager.getElementAtPoint(globalPoint.x, globalPoint.y);
            this.canvas.style.cursor = element ? 'move' : 'default';
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
        // Increased detection area to 20 pixels for easier clicking
        const handleSize = 20 / this.scale;
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
            // Calculate distance from point to handle center (circular detection)
            const distance = Math.sqrt(
                Math.pow(localPoint.x - h.x, 2) + 
                Math.pow(localPoint.y - h.y, 2)
            );
            if (distance <= handleSize) {
                return h.handle;
            }
        }
        
        return null;
    }

    private handleMouseUp(e: MouseEvent): void {
        // Reset crop states
        if (this.cropDragging || this.cropResizing || this.cropHandle) {
            this.cropDragging = false;
            this.cropResizing = false;
            this.cropResizeHandle = '';
            this.cropHandle = null; // Reset crop handle
            this.render();
            return;
        }
        
        // Reset selection dragging
        if (this.isSelectionDragging) {
            this.isSelectionDragging = false;
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
            this.originalPositions.clear();
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
            if (element.type === 'text' && !this.cropMode) {
                this.startInlineEditing(element);
            } else if (element.type === 'image') {
                // Toggle crop mode on double-click for images
                if (!this.cropMode) {
                    this.globalManager.setSelectedElement(element.id);
                    this.toggleCropMode();
                }
            }
        }
    }
    
    private startSimpleCropMode(element: CanvasElement): void {
        if (element.type !== 'image') return;
        
        this.cropMode = true;
        this.globalManager.setSelectedElement(element.id);
        
        // Store original dimensions if not already stored
        if (!element.originalWidth) {
            this.globalManager.updateElement(element.id, {
                originalWidth: element.width,
                originalHeight: element.height,
                originalImageElement: element.imageElement
            });
        }
        
        // Initialize crop bounds to full image (user will drag edges inward)
        this.cropBounds = {
            left: 0,
            top: 0,
            right: element.width,
            bottom: element.height
        };
        
        // If element has previous crop, use those bounds
        if (element.cropX !== undefined && element.cropWidth !== undefined) {
            this.cropBounds = {
                left: element.cropX,
                top: element.cropY || 0,
                right: element.cropX + element.cropWidth,
                bottom: (element.cropY || 0) + (element.cropHeight || 0)
            };
        }
        
        this.cropOriginalBounds = { ...this.cropBounds };
        
        // Update element with initial crop values
        this.globalManager.updateElement(element.id, {
            cropX: this.cropBounds.left,
            cropY: this.cropBounds.top,
            cropWidth: this.cropBounds.right - this.cropBounds.left,
            cropHeight: this.cropBounds.bottom - this.cropBounds.top
        });
        
        // Show crop toolbar
        this.showCropToolbar();
        this.render();
    }
    
    private updateCropInfo(): void {
        const infoElement = document.querySelector('.crop-info');
        if (infoElement && this.cropBounds) {
            const width = Math.round(this.cropBounds.right - this.cropBounds.left);
            const height = Math.round(this.cropBounds.bottom - this.cropBounds.top);
            infoElement.textContent = `${width} × ${height}px`;
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

    public startCropMode(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (selectedElement && selectedElement.type === 'image') {
            // Only start crop if not already in crop mode
            if (!this.cropMode) {
                this.toggleCropMode();
            }
        }
    }
    
    public deleteSelected(): void {
        // Delete all selected elements (supports multi-selection)
        const selectedElements = this.globalManager.getSelectedElements();
        if (selectedElements.length > 0) {
            selectedElements.forEach(element => {
                this.globalManager.removeElement(element.id);
            });
            this.globalManager.clearSelection();
            this.updateTextToolbar();
            this.render();
        } else {
            // Fallback to single selection
            const selectedElement = this.globalManager.getSelectedElement();
            if (selectedElement) {
                this.globalManager.removeElement(selectedElement.id);
                this.updateTextToolbar();
                this.render();
            }
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
            // Check if element should be rendered based on directional link states
            if (element.canvasId && element.canvasId !== this.canvas.id) {
                // Element is from another canvas - check directional link
                const multiCanvasManager = (window as any).multiCanvasManager;
                if (multiCanvasManager) {
                    // Check if the directional link from element's canvas to this canvas is enabled
                    const isLinkEnabled = multiCanvasManager.isDirectionalLinkEnabled(element.canvasId, this.canvas.id);
                    
                    if (!isLinkEnabled) {
                        // Skip rendering if link is disabled
                        // Exception: allow rendering if this element is being dragged
                        if (!this.dragState.isDragging || this.dragState.element?.id !== element.id) {
                            continue;
                        }
                    }
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
            
            // Render selection if this element is selected (either single or multi-selection)
            if (this.globalManager.isSelected(element.id)) {
                this.renderSelection(localElement);
                // Only render resize handles for single selection AND not in crop mode
                const selectedElements = this.globalManager.getSelectedElements();
                if (!this.cropMode && (selectedElements.length === 1 || 
                    (this.globalManager.getSelectedElement()?.id === element.id))) {
                    this.renderResizeHandles(localElement);
                }
            }
            
            this.ctx.restore();
        }
        
        // Render selection rectangle if dragging
        if (this.isSelectionDragging) {
            this.renderSelectionRectangle();
        }
    }
    
    private renderSelectionRectangle(): void {
        const localStart = this.globalToLocal(this.selectionStartPoint.x, this.selectionStartPoint.y);
        const localEnd = this.globalToLocal(this.selectionEndPoint.x, this.selectionEndPoint.y);
        
        const x = Math.min(localStart.x, localEnd.x);
        const y = Math.min(localStart.y, localEnd.y);
        const width = Math.abs(localEnd.x - localStart.x);
        const height = Math.abs(localEnd.y - localStart.y);
        
        this.ctx.save();
        this.ctx.strokeStyle = '#0066ff';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);
        this.ctx.strokeRect(x, y, width, height);
        
        // Draw a semi-transparent fill
        this.ctx.fillStyle = 'rgba(0, 102, 255, 0.1)';
        this.ctx.fillRect(x, y, width, height);
        this.ctx.restore();
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
            const selected = this.globalManager.getSelectedElement();
            const isBeingCropped = this.cropMode && selected?.id === element.id;
            
            // In crop mode, always show the full image; otherwise show cropped if crop is applied
            if (!isBeingCropped && element.cropX !== undefined && element.cropY !== undefined && 
                element.cropWidth !== undefined && element.cropHeight !== undefined) {
                // Apply clipping mask to show only cropped area
                this.ctx.save();
                
                // Create clipping rectangle for the cropped area
                this.ctx.beginPath();
                this.ctx.rect(
                    element.x + element.cropX,
                    element.y + element.cropY,
                    element.cropWidth,
                    element.cropHeight
                );
                this.ctx.clip();
                
                // Draw the full image (but only cropped area will be visible due to clipping)
                this.ctx.drawImage(
                    element.imageElement,
                    element.x,
                    element.y,
                    element.width,
                    element.height
                );
                
                this.ctx.restore();
            } else {
                // Render full image (always in crop mode, or when no crop is set)
                this.ctx.drawImage(
                    element.imageElement,
                    element.x,
                    element.y,
                    element.width,
                    element.height
                );
            }
            
            // Render crop overlay if in crop mode
            if (isBeingCropped) {
                this.renderCropOverlay(element);
            }
        }
    }
    
    private renderCropOverlay(element: CanvasElement): void {
        if (!this.cropMode || element.type !== 'image' || !this.cropBounds) {
            return;
        }
        
        const localX = element.x - this.offsetX;
        const localY = element.y - this.offsetY;
        
        // Save context state
        this.ctx.save();
        
        // Draw dark overlay outside crop area
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        
        // Draw overlay in four parts around crop area
        const cropX = this.cropBounds.left;
        const cropY = this.cropBounds.top;
        const cropWidth = this.cropBounds.right - this.cropBounds.left;
        const cropHeight = this.cropBounds.bottom - this.cropBounds.top;
        
        // Top overlay
        this.ctx.fillRect(localX, localY, element.width, cropY);
        // Bottom overlay  
        this.ctx.fillRect(localX, localY + cropY + cropHeight, element.width, element.height - cropY - cropHeight);
        // Left overlay
        this.ctx.fillRect(localX, localY + cropY, cropX, cropHeight);
        // Right overlay
        this.ctx.fillRect(localX + cropX + cropWidth, localY + cropY, element.width - cropX - cropWidth, cropHeight);
        
        // Draw crop area border with white solid line
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(localX + cropX, localY + cropY, cropWidth, cropHeight);
        
        // Draw rule of thirds grid
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1;
        // Vertical lines
        for (let i = 1; i <= 2; i++) {
            const x = localX + cropX + (cropWidth * i / 3);
            this.ctx.beginPath();
            this.ctx.moveTo(x, localY + cropY);
            this.ctx.lineTo(x, localY + cropY + cropHeight);
            this.ctx.stroke();
        }
        // Horizontal lines
        for (let i = 1; i <= 2; i++) {
            const y = localY + cropY + (cropHeight * i / 3);
            this.ctx.beginPath();
            this.ctx.moveTo(localX + cropX, y);
            this.ctx.lineTo(localX + cropX + cropWidth, y);
            this.ctx.stroke();
        }
        
        // Draw crop handles on edges and corners
        this.drawCropHandles(localX + cropX, localY + cropY, cropWidth, cropHeight);
        
        // Draw crop dimensions
        const cropText = `${Math.round(cropWidth)} × ${Math.round(cropHeight)}px`;
        this.ctx.font = 'bold 12px Arial';
        const textMetrics = this.ctx.measureText(cropText);
        const padding = 6;
        const textX = localX + cropX + cropWidth/2;
        const textY = localY + cropY + cropHeight + 25;
        
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
        // Draw clear edge bars for crop mode
        const edgeThickness = 6;  // Thick bars for edges
        const edgeLength = 50;    // Length of edge handles
        const cornerSize = 25;    // Size of corner L-shapes
        const cornerThickness = 4; // Thickness of corner lines
        
        // Corner L-shapes (like cropperjs)
        this.ctx.strokeStyle = '#39f';
        this.ctx.lineWidth = cornerThickness;
        
        // Top-left corner
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + cornerSize);
        this.ctx.lineTo(x, y);
        this.ctx.lineTo(x + cornerSize, y);
        this.ctx.stroke();
        
        // Top-right corner
        this.ctx.beginPath();
        this.ctx.moveTo(x + width - cornerSize, y);
        this.ctx.lineTo(x + width, y);
        this.ctx.lineTo(x + width, y + cornerSize);
        this.ctx.stroke();
        
        // Bottom-right corner
        this.ctx.beginPath();
        this.ctx.moveTo(x + width, y + height - cornerSize);
        this.ctx.lineTo(x + width, y + height);
        this.ctx.lineTo(x + width - cornerSize, y + height);
        this.ctx.stroke();
        
        // Bottom-left corner
        this.ctx.beginPath();
        this.ctx.moveTo(x + cornerSize, y + height);
        this.ctx.lineTo(x, y + height);
        this.ctx.lineTo(x, y + height - cornerSize);
        this.ctx.stroke();
        
        // Edge handles - thick bars in the middle of each edge
        this.ctx.fillStyle = '#39f';
        
        // Top edge bar
        this.ctx.fillRect(
            x + width/2 - edgeLength/2,
            y - edgeThickness/2,
            edgeLength,
            edgeThickness
        );
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(
            x + width/2 - edgeLength/2,
            y - edgeThickness/2,
            edgeLength,
            edgeThickness
        );
        
        // Right edge bar
        this.ctx.fillStyle = '#39f';
        this.ctx.fillRect(
            x + width - edgeThickness/2,
            y + height/2 - edgeLength/2,
            edgeThickness,
            edgeLength
        );
        this.ctx.strokeRect(
            x + width - edgeThickness/2,
            y + height/2 - edgeLength/2,
            edgeThickness,
            edgeLength
        );
        
        // Bottom edge bar
        this.ctx.fillStyle = '#39f';
        this.ctx.fillRect(
            x + width/2 - edgeLength/2,
            y + height - edgeThickness/2,
            edgeLength,
            edgeThickness
        );
        this.ctx.strokeRect(
            x + width/2 - edgeLength/2,
            y + height - edgeThickness/2,
            edgeLength,
            edgeThickness
        );
        
        // Left edge bar
        this.ctx.fillStyle = '#39f';
        this.ctx.fillRect(
            x - edgeThickness/2,
            y + height/2 - edgeLength/2,
            edgeThickness,
            edgeLength
        );
        this.ctx.strokeRect(
            x - edgeThickness/2,
            y + height/2 - edgeLength/2,
            edgeThickness,
            edgeLength
        );
    }

    private renderSelection(element: CanvasElement): void {
        // Different selection style for crop mode
        if (this.cropMode) {
            this.ctx.strokeStyle = '#39f';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([]);
            this.ctx.strokeRect(element.x - 1, element.y - 1, element.width + 2, element.height + 2);
        } else {
            // For cropped images, show selection only around visible area
            if (element.cropX !== undefined && element.cropY !== undefined &&
                element.cropWidth !== undefined && element.cropHeight !== undefined) {
                this.ctx.strokeStyle = '#3182ce';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([5, 5]);
                this.ctx.strokeRect(
                    element.x + element.cropX,
                    element.y + element.cropY,
                    element.cropWidth,
                    element.cropHeight
                );
                this.ctx.setLineDash([]);
            } else {
                // Normal selection for uncropped elements
                this.ctx.strokeStyle = '#3182ce';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([5, 5]);
                this.ctx.strokeRect(element.x, element.y, element.width, element.height);
                this.ctx.setLineDash([]);
            }
        }
    }

    private renderResizeHandles(element: CanvasElement): void {
        // Adjust handles for cropped images
        let x = element.x;
        let y = element.y;
        let width = element.width;
        let height = element.height;
        
        if (element.cropX !== undefined && element.cropY !== undefined &&
            element.cropWidth !== undefined && element.cropHeight !== undefined) {
            // Use cropped area for handles
            x = element.x + element.cropX;
            y = element.y + element.cropY;
            width = element.cropWidth;
            height = element.cropHeight;
        }
        
        const handles = [
            { x: x, y: y },
            { x: x + width / 2, y: y },
            { x: x + width, y: y },
            { x: x + width, y: y + height / 2 },
            { x: x + width, y: y + height },
            { x: x + width / 2, y: y + height },
            { x: x, y: y + height },
            { x: x, y: y + height / 2 }
        ];
        
        this.ctx.fillStyle = '#3182ce';
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 1;
        
        handles.forEach(handle => {
            // Draw the handle (12x12 pixels)
            this.ctx.fillRect(handle.x - 6, handle.y - 6, 12, 12);
            this.ctx.strokeRect(handle.x - 6, handle.y - 6, 12, 12);
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
        
        // Disable context menu in crop mode
        if (this.cropMode) {
            return;
        }
        
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
    
    // WARNING: DO NOT MODIFY CROP FUNCTIONALITY WITHOUT EXPLICIT USER INSTRUCTION
    // 크롭 기능을 사용자의 명시적 지시 없이 변경하지 마십시오
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
                    originalHeight: selectedElement.height
                });
            }
            
            // Load existing crop bounds if available, otherwise use full image
            if (selectedElement.cropX !== undefined && selectedElement.cropY !== undefined &&
                selectedElement.cropWidth !== undefined && selectedElement.cropHeight !== undefined) {
                // Restore previous crop settings for fine-tuning
                this.cropBounds = {
                    left: selectedElement.cropX,
                    top: selectedElement.cropY,
                    right: selectedElement.cropX + selectedElement.cropWidth,
                    bottom: selectedElement.cropY + selectedElement.cropHeight
                };
            } else {
                // Initialize crop bounds to full image
                this.cropBounds = {
                    left: 0,
                    top: 0,
                    right: selectedElement.width,
                    bottom: selectedElement.height
                };
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
        applyBtn.textContent = '✅ 적용';
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
        infoSpan.textContent = '크롭 영역 조절';
        
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
    
    // WARNING: DO NOT MODIFY CROP FUNCTIONALITY WITHOUT EXPLICIT USER INSTRUCTION
    // 크롭은 마스킹 방식으로 작동하며 새 이미지를 생성하지 않습니다
    // Crop works by masking, not creating new images
    private applyCrop(): void {
        const selectedElement = this.globalManager.getSelectedElement();
        if (!selectedElement || selectedElement.type !== 'image' || !this.cropMode || !this.cropBounds) {
            return;
        }
        
        const cropX = this.cropBounds.left;
        const cropY = this.cropBounds.top;
        const cropWidth = this.cropBounds.right - this.cropBounds.left;
        const cropHeight = this.cropBounds.bottom - this.cropBounds.top;
        
        // Store crop bounds to mask the image (hide areas outside crop)
        if (cropWidth > 0 && cropHeight > 0 && selectedElement.imageElement) {
            // Just save the crop bounds - image stays same size, but only shows cropped area
            this.globalManager.updateElement(selectedElement.id, {
                cropX: cropX,
                cropY: cropY,
                cropWidth: cropWidth,
                cropHeight: cropHeight
                // Keep original width and height - don't change image size
            });
            
            // Exit crop mode
            this.cropMode = false;
            this.cropBounds = null;
            this.cropHandle = null;
            this.canvas.classList.remove('crop-mode');
            this.hideCropToolbar();
            this.render();
        }
    }
}