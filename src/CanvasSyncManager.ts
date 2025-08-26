// Simple and robust canvas synchronization manager
export class CanvasSyncManager {
    private static instance: CanvasSyncManager;
    private syncEnabled: boolean = false;
    private listeners: Map<string, () => void> = new Map();
    
    private constructor() {
        console.log('[SYNC] Canvas Sync Manager initialized');
    }
    
    public static getInstance(): CanvasSyncManager {
        if (!CanvasSyncManager.instance) {
            CanvasSyncManager.instance = new CanvasSyncManager();
        }
        return CanvasSyncManager.instance;
    }
    
    // Toggle synchronization globally
    public toggleSync(): boolean {
        this.syncEnabled = !this.syncEnabled;
        console.log(`[SYNC] Synchronization ${this.syncEnabled ? 'ENABLED' : 'DISABLED'}`);
        
        // Notify all canvases about sync state change
        this.notifyAll();
        
        return this.syncEnabled;
    }
    
    public isSyncEnabled(): boolean {
        return this.syncEnabled;
    }
    
    // Register a canvas for sync updates
    public registerCanvas(canvasId: string, updateCallback: () => void): void {
        this.listeners.set(canvasId, updateCallback);
        console.log(`[SYNC] Canvas ${canvasId} registered for sync`);
    }
    
    // Unregister a canvas
    public unregisterCanvas(canvasId: string): void {
        this.listeners.delete(canvasId);
        console.log(`[SYNC] Canvas ${canvasId} unregistered from sync`);
    }
    
    // Notify all canvases to update (except the source)
    public notifyCanvasUpdate(sourceCanvasId?: string): void {
        if (!this.syncEnabled) return;
        
        console.log(`[SYNC] Notifying all canvases of update from ${sourceCanvasId || 'system'}`);
        
        this.listeners.forEach((callback, canvasId) => {
            // Don't notify the source canvas
            if (canvasId !== sourceCanvasId) {
                callback();
            }
        });
    }
    
    // Force update all canvases
    private notifyAll(): void {
        console.log(`[SYNC] Force updating all canvases`);
        this.listeners.forEach(callback => callback());
    }
    
    // Get sync status for UI
    public getSyncStatus(): string {
        return this.syncEnabled ? 'Sync: ON' : 'Sync: OFF';
    }
}