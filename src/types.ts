export interface CanvasElement {
    id: string;
    type: 'text' | 'image';
    x: number;  // Global X position (relative to all canvases)
    y: number;  // Global Y position
    width: number;
    height: number;
    content: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    textAlign?: 'left' | 'center' | 'right';
    color?: string;
    imageElement?: HTMLImageElement;
    rotation?: number;
    canvasId?: string; // Original canvas where element was created
    // Crop properties for images
    cropX?: number;
    cropY?: number;
    cropWidth?: number;
    cropHeight?: number;
    originalWidth?: number;
    originalHeight?: number;
}

export interface CanvasData {
    id: string;
    name: string;
    width: number;
    height: number;
    offsetX: number; // Canvas position in the global coordinate system
    offsetY: number;
    thumbnail?: string;
}

export interface Point {
    x: number;
    y: number;
}

export interface DragState {
    isDragging: boolean;
    element: CanvasElement | null;
    startPoint: Point;
    elementStartPoint: Point;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface ResizeState {
    isResizing: boolean;
    element: CanvasElement | null;
    handle: ResizeHandle | null;
    startPoint: Point;
    originalBounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}