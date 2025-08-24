import { CanvasElement } from './types';

export class GlobalElementManager {
    private elements: Map<string, CanvasElement> = new Map();
    private selectedElementId: string | null = null;
    
    constructor() {}
    
    public addElement(element: CanvasElement): void {
        this.elements.set(element.id, element);
    }
    
    public removeElement(elementId: string): void {
        this.elements.delete(elementId);
        if (this.selectedElementId === elementId) {
            this.selectedElementId = null;
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
        }
    }
    
    public getElementsForCanvas(canvasOffsetX: number, canvasOffsetY: number, canvasWidth: number, canvasHeight: number): CanvasElement[] {
        const visibleElements: CanvasElement[] = [];
        
        this.elements.forEach(element => {
            // Check if element intersects with this canvas
            const elementRight = element.x + element.width;
            const elementBottom = element.y + element.height;
            const canvasRight = canvasOffsetX + canvasWidth;
            const canvasBottom = canvasOffsetY + canvasHeight;
            
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
            if (globalX >= element.x && 
                globalX <= element.x + element.width &&
                globalY >= element.y && 
                globalY <= element.y + element.height) {
                return element;
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