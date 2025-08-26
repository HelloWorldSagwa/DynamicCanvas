import { CanvasElement } from './types';

export class GlobalElementManager {
    private elements: Map<string, CanvasElement> = new Map();
    private selectedElementId: string | null = null;
    private selectedElementIds: Set<string> = new Set(); // For multi-selection
    private changeListeners: Set<() => void> = new Set();
    
    constructor() {
        console.log('[GLOBAL] GlobalElementManager initialized');
    }
    
    public addElement(element: CanvasElement): void {
        console.log(`[GLOBAL] Adding element ${element.id} at global position (${element.x}, ${element.y})`);
        this.elements.set(element.id, element);
        this.notifyChange();
    }
    
    // Subscribe to element changes
    public subscribe(callback: () => void): void {
        this.changeListeners.add(callback);
    }
    
    // Unsubscribe from element changes
    public unsubscribe(callback: () => void): void {
        this.changeListeners.delete(callback);
    }
    
    // Notify all subscribers of changes
    private notifyChange(): void {
        console.log(`[GLOBAL] Notifying ${this.changeListeners.size} subscribers of change`);
        this.changeListeners.forEach(callback => callback());
        
        // Also notify sync manager if it exists
        const syncManager = (window as any).canvasSyncManager;
        if (syncManager) {
            syncManager.notifyCanvasUpdate();
        }
    }
    
    public removeElement(elementId: string): void {
        if (this.elements.delete(elementId)) {
            if (this.selectedElementId === elementId) {
                this.selectedElementId = null;
            }
            this.notifyChange();
        }
    }
    
    public getElement(elementId: string): CanvasElement | undefined {
        return this.elements.get(elementId);
    }
    
    public getAllElements(): CanvasElement[] {
        return Array.from(this.elements.values());
    }
    
    public updateElement(elementId: string, updates: Partial<CanvasElement>): void {
        const element = this.elements.get(elementId);
        if (element) {
            Object.assign(element, updates);
            this.notifyChange();
        }
    }
    
    public getElementsForCanvas(canvasOffsetX: number, canvasOffsetY: number, canvasWidth: number, canvasHeight: number): CanvasElement[] {
        // Return ALL elements when sync is enabled (handled by CanvasSyncManager)
        // Individual canvas will decide what to render based on sync state
        
        const visibleElements: CanvasElement[] = [];
        
        this.elements.forEach(element => {
            // Check if element intersects with this canvas
            const elementRight = element.x + element.width;
            const elementBottom = element.y + element.height;
            const canvasRight = canvasOffsetX + canvasWidth;
            const canvasBottom = canvasOffsetY + canvasHeight;
            
            // Simple intersection check without verbose logging
            
            // Check for intersection
            if (element.x < canvasRight && 
                elementRight > canvasOffsetX && 
                element.y < canvasBottom && 
                elementBottom > canvasOffsetY) {
                visibleElements.push(element);
            }
        });
        
        return visibleElements;
    }
    
    public setSelectedElement(elementId: string | null): void {
        this.selectedElementId = elementId;
    }
    
    public getSelectedElement(): CanvasElement | null {
        if (this.selectedElementId) {
            return this.elements.get(this.selectedElementId) || null;
        }
        return null;
    }
    
    // Multi-selection methods
    public addToSelection(elementId: string): void {
        this.selectedElementIds.add(elementId);
        this.notifyChange();
    }
    
    public removeFromSelection(elementId: string): void {
        this.selectedElementIds.delete(elementId);
        this.notifyChange();
    }
    
    public clearSelection(): void {
        this.selectedElementIds.clear();
        this.selectedElementId = null;
        this.notifyChange();
    }
    
    public getSelectedElements(): CanvasElement[] {
        return Array.from(this.selectedElementIds)
            .map(id => this.elements.get(id))
            .filter(el => el !== undefined) as CanvasElement[];
    }
    
    public isSelected(elementId: string): boolean {
        return this.selectedElementIds.has(elementId) || this.selectedElementId === elementId;
    }
    
    public getElementsInRectangle(x: number, y: number, width: number, height: number): CanvasElement[] {
        const result: CanvasElement[] = [];
        const rectRight = x + width;
        const rectBottom = y + height;
        
        this.elements.forEach(element => {
            const elementRight = element.x + element.width;
            const elementBottom = element.y + element.height;
            
            // Check if element intersects with selection rectangle
            if (!(element.x > rectRight || 
                  elementRight < x || 
                  element.y > rectBottom || 
                  elementBottom < y)) {
                result.push(element);
            }
        });
        
        return result;
    }
    
    public clearAll(): void {
        this.elements.clear();
        this.selectedElementId = null;
    }
    
    public duplicateElement(elementId: string, offsetX: number = 20, offsetY: number = 20): CanvasElement | null {
        const original = this.elements.get(elementId);
        if (!original) return null;
        
        const duplicate: CanvasElement = {
            ...original,
            id: `element-${Date.now()}`,
            x: original.x + offsetX,
            y: original.y + offsetY
        };
        
        // Clone image element if needed
        if (duplicate.type === 'image' && original.imageElement) {
            const img = new Image();
            img.src = original.imageElement.src;
            duplicate.imageElement = img;
        }
        
        this.addElement(duplicate);
        return duplicate;
    }
    
    public getElementAtPoint(globalX: number, globalY: number): CanvasElement | null {
        // Iterate in reverse to get topmost element
        const elementsArray = Array.from(this.elements.values());
        for (let i = elementsArray.length - 1; i >= 0; i--) {
            const element = elementsArray[i];
            
            // If element has crop, check if click is within cropped area
            if (element.cropX !== undefined && element.cropY !== undefined &&
                element.cropWidth !== undefined && element.cropHeight !== undefined) {
                // Check cropped area bounds
                const cropLeft = element.x + element.cropX;
                const cropTop = element.y + element.cropY;
                const cropRight = cropLeft + element.cropWidth;
                const cropBottom = cropTop + element.cropHeight;
                
                if (globalX >= cropLeft && globalX <= cropRight &&
                    globalY >= cropTop && globalY <= cropBottom) {
                    return element;
                }
            } else {
                // No crop - check normal bounds
                if (globalX >= element.x && 
                    globalX <= element.x + element.width &&
                    globalY >= element.y && 
                    globalY <= element.y + element.height) {
                    return element;
                }
            }
        }
        return null;
    }
    
    public moveElementToFront(elementId: string): void {
        const element = this.elements.get(elementId);
        if (element) {
            this.elements.delete(elementId);
            this.elements.set(elementId, element);
        }
    }
    
    public moveElementToBack(elementId: string): void {
        const element = this.elements.get(elementId);
        if (element) {
            const allElements = Array.from(this.elements.entries());
            this.elements.clear();
            this.elements.set(elementId, element);
            allElements.forEach(([id, el]) => {
                if (id !== elementId) {
                    this.elements.set(id, el);
                }
            });
        }
    }
}