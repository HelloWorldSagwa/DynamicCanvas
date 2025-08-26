// Grid-based canvas layout manager for dynamic linking between adjacent canvases
export interface GridPosition {
    row: number;
    col: number;
}

export interface CanvasLink {
    from: string;  // canvas ID
    to: string;    // canvas ID
    direction: 'horizontal' | 'vertical' | 'diagonal-tl' | 'diagonal-tr' | 'diagonal-bl' | 'diagonal-br';
    enabled: boolean;
}

export class CanvasGridManager {
    private grid: Map<string, string> = new Map(); // "row,col" -> canvasId
    private canvasPositions: Map<string, GridPosition> = new Map(); // canvasId -> position
    private links: Map<string, CanvasLink> = new Map(); // linkId -> CanvasLink
    private linkStates: Map<string, boolean> = new Map(); // "canvasId1-canvasId2" -> enabled
    
    constructor() {
        console.log('[GRID] Canvas Grid Manager initialized');
    }
    
    // Add canvas to grid at specific position
    public addCanvas(canvasId: string, row: number, col: number): void {
        const key = `${row},${col}`;
        this.grid.set(key, canvasId);
        this.canvasPositions.set(canvasId, { row, col });
        console.log(`[GRID] Added canvas ${canvasId} at position (${row}, ${col})`);
        
        // Automatically create links with adjacent canvases
        this.createAdjacentLinks(canvasId, row, col);
    }
    
    // Remove canvas from grid
    public removeCanvas(canvasId: string): void {
        const position = this.canvasPositions.get(canvasId);
        if (position) {
            const key = `${position.row},${position.col}`;
            this.grid.delete(key);
            this.canvasPositions.delete(canvasId);
            
            // Remove all links involving this canvas
            this.removeCanvasLinks(canvasId);
        }
    }
    
    // Get canvas at specific grid position
    public getCanvasAt(row: number, col: number): string | null {
        const key = `${row},${col}`;
        return this.grid.get(key) || null;
    }
    
    // Get all adjacent canvases (8 directions)
    public getAdjacentCanvases(canvasId: string): Map<string, string> {
        const position = this.canvasPositions.get(canvasId);
        if (!position) return new Map();
        
        const adjacent = new Map<string, string>();
        const directions = [
            { dir: 'top', dr: -1, dc: 0 },
            { dir: 'top-right', dr: -1, dc: 1 },
            { dir: 'right', dr: 0, dc: 1 },
            { dir: 'bottom-right', dr: 1, dc: 1 },
            { dir: 'bottom', dr: 1, dc: 0 },
            { dir: 'bottom-left', dr: 1, dc: -1 },
            { dir: 'left', dr: 0, dc: -1 },
            { dir: 'top-left', dr: -1, dc: -1 }
        ];
        
        for (const { dir, dr, dc } of directions) {
            const adjacentCanvas = this.getCanvasAt(position.row + dr, position.col + dc);
            if (adjacentCanvas) {
                adjacent.set(dir, adjacentCanvas);
            }
        }
        
        return adjacent;
    }
    
    // Create links with adjacent canvases
    private createAdjacentLinks(canvasId: string, row: number, col: number): void {
        const adjacent = this.getAdjacentCanvases(canvasId);
        
        adjacent.forEach((adjacentId, direction) => {
            const linkKey = this.getLinkKey(canvasId, adjacentId);
            
            // Check if link already exists
            if (!this.linkStates.has(linkKey)) {
                // Create new link (enabled by default)
                this.linkStates.set(linkKey, true);
                console.log(`[GRID] Created link between ${canvasId} and ${adjacentId} (${direction})`);
            }
        });
    }
    
    // Remove all links for a canvas
    private removeCanvasLinks(canvasId: string): void {
        const keysToRemove: string[] = [];
        
        this.linkStates.forEach((_, key) => {
            if (key.includes(canvasId)) {
                keysToRemove.push(key);
            }
        });
        
        keysToRemove.forEach(key => this.linkStates.delete(key));
    }
    
    // Toggle link between two canvases
    public toggleLink(canvas1: string, canvas2: string): boolean {
        const key = this.getLinkKey(canvas1, canvas2);
        const currentState = this.linkStates.get(key) || false;
        const newState = !currentState;
        this.linkStates.set(key, newState);
        
        console.log(`[GRID] Link between ${canvas1} and ${canvas2}: ${newState ? 'ENABLED' : 'DISABLED'}`);
        return newState;
    }
    
    // Set link state directly
    public setLinkState(canvas1: string, canvas2: string, enabled: boolean): void {
        const key = this.getLinkKey(canvas1, canvas2);
        this.linkStates.set(key, enabled);
        console.log(`[GRID] Link between ${canvas1} and ${canvas2} set to: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
    
    // Check if two canvases are linked
    public areCanvasesLinked(canvas1: string, canvas2: string): boolean {
        const key = this.getLinkKey(canvas1, canvas2);
        return this.linkStates.get(key) || false;
    }
    
    // Get a consistent key for a link between two canvases
    private getLinkKey(canvas1: string, canvas2: string): string {
        // Sort IDs to ensure consistent key regardless of order
        return [canvas1, canvas2].sort().join('-');
    }
    
    // Find next available position relative to a specific canvas
    public findNextPosition(direction: 'right' | 'bottom', relativeToCanvasId?: string): GridPosition {
        // If no relative canvas specified, use default behavior
        if (!relativeToCanvasId) {
            // For first canvas
            if (this.canvasPositions.size === 0) {
                return { row: 0, col: 0 };
            }
            // Find first available spot
            return this.findFirstAvailablePosition();
        }
        
        // Get position of reference canvas
        const refPosition = this.canvasPositions.get(relativeToCanvasId);
        if (!refPosition) {
            return this.findFirstAvailablePosition();
        }
        
        // Find position based on direction
        if (direction === 'right') {
            // Add to the right of reference canvas
            let col = refPosition.col + 1;
            let row = refPosition.row;
            
            // Check if position is available
            while (this.getCanvasAt(row, col)) {
                col++;
            }
            return { row, col };
        } else {
            // Add below reference canvas
            let row = refPosition.row + 1;
            let col = refPosition.col;
            
            // Check if position is available
            while (this.getCanvasAt(row, col)) {
                row++;
            }
            return { row, col };
        }
    }
    
    private findFirstAvailablePosition(): GridPosition {
        // Find first available position in grid
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                if (!this.getCanvasAt(row, col)) {
                    return { row, col };
                }
            }
        }
        return { row: 0, col: 0 };
    }
    
    // Get canvas position
    public getCanvasPosition(canvasId: string): GridPosition | null {
        return this.canvasPositions.get(canvasId) || null;
    }
    
    // Check if element can move between canvases
    public canElementMoveBetweenCanvases(fromCanvas: string, toCanvas: string): boolean {
        // Check if canvases are adjacent
        const fromPos = this.canvasPositions.get(fromCanvas);
        const toPos = this.canvasPositions.get(toCanvas);
        
        if (!fromPos || !toPos) return false;
        
        // Check if adjacent (within 1 cell distance)
        const rowDiff = Math.abs(fromPos.row - toPos.row);
        const colDiff = Math.abs(fromPos.col - toPos.col);
        
        if (rowDiff > 1 || colDiff > 1) return false;
        
        // Check if link is enabled
        return this.areCanvasesLinked(fromCanvas, toCanvas);
    }
}