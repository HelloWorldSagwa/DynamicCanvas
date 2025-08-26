import './styles.css';
import { MultiCanvasManager } from './MultiCanvasManager';

class App {
    private multiCanvasManager: MultiCanvasManager;

    constructor() {
        this.multiCanvasManager = new MultiCanvasManager();
        // Make multiCanvasManager globally accessible for canvases
        (window as any).multiCanvasManager = this.multiCanvasManager;
        this.setupEventListeners();
        
        // Update thumbnails periodically
        setInterval(() => {
            this.multiCanvasManager.updateAllThumbnails();
        }, 1000);
    }

    private setupEventListeners(): void {
        const addTextBtn = document.getElementById('addTextBtn');
        const imageUpload = document.getElementById('imageUpload') as HTMLInputElement;
        const clearBtn = document.getElementById('clearBtn');
        const canvasContainer = document.getElementById('canvasContainer') as HTMLElement;
        const canvasWidth = document.getElementById('canvasWidth') as HTMLInputElement;
        const canvasHeight = document.getElementById('canvasHeight') as HTMLInputElement;
        const resolutionPreset = document.getElementById('resolutionPreset') as HTMLSelectElement;
        const zoomSlider = document.getElementById('zoomSlider') as HTMLInputElement;
        const zoomValue = document.getElementById('zoomValue') as HTMLSpanElement;

        addTextBtn?.addEventListener('click', () => {
            const activeCanvas = this.multiCanvasManager.getActiveCanvas();
            if (activeCanvas) {
                activeCanvas.addText();
            }
        });

        imageUpload?.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imageUrl = event.target?.result as string;
                    const activeCanvas = this.multiCanvasManager.getActiveCanvas();
                    if (activeCanvas) {
                        console.log(`[APP] Adding image to active canvas`);
                        activeCanvas.addImage(imageUrl);
                    } else {
                        console.error(`[APP] No active canvas to add image to`);
                    }
                };
                reader.readAsDataURL(file);
            }
        });

        clearBtn?.addEventListener('click', () => {
            if (confirm('모든 요소를 삭제하시겠습니까?')) {
                const activeCanvas = this.multiCanvasManager.getActiveCanvas();
                if (activeCanvas) {
                    activeCanvas.clear();
                }
            }
        });

        // Resolution change handlers
        const applyResolution = () => {
            const width = parseInt(canvasWidth.value);
            const height = parseInt(canvasHeight.value);
            if (width > 0 && height > 0) {
                // Set resolution for all canvases to maintain consistency
                this.multiCanvasManager.setResolutionForAll(width, height);
            }
        };

        canvasWidth?.addEventListener('input', () => {
            resolutionPreset.value = 'custom';
            applyResolution();
        });
        
        canvasHeight?.addEventListener('input', () => {
            resolutionPreset.value = 'custom';
            applyResolution();
        });

        resolutionPreset?.addEventListener('change', () => {
            const value = resolutionPreset.value;
            if (value !== 'custom') {
                const [width, height] = value.split('x').map(Number);
                canvasWidth.value = width.toString();
                canvasHeight.value = height.toString();
                applyResolution();
            }
        });

        // Zoom controls
        zoomSlider?.addEventListener('input', () => {
            const zoom = parseInt(zoomSlider.value);
            if (zoomValue) {
                zoomValue.textContent = `${zoom}%`;
            }
            this.multiCanvasManager.setZoom(zoom / 100);
        });

        // Crop button
        const cropBtn = document.getElementById('cropBtn') as HTMLButtonElement;
        cropBtn?.addEventListener('click', () => {
            const activeCanvas = this.multiCanvasManager.getActiveCanvas();
            if (activeCanvas) {
                activeCanvas.startCropMode();
            }
        });

        // Show/hide crop button when image is selected
        document.addEventListener('selection-changed', (e) => {
            const customEvent = e as CustomEvent;
            const selectedElement = customEvent.detail?.element;
            if (cropBtn) {
                cropBtn.style.display = selectedElement?.type === 'image' ? 'block' : 'none';
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // 텍스트 편집 중이면 삭제 이벤트 무시
                const textEditor = document.querySelector('.text-editor-active');
                if (textEditor) {
                    console.log('🚫 [Global Delete/Backspace] Text editor is active, ignoring delete');
                    return; // 편집 중이면 무시
                }
                
                const activeCanvas = this.multiCanvasManager.getActiveCanvas();
                if (activeCanvas) {
                    activeCanvas.deleteSelected();
                }
            }
        });

        // Drag and drop for images
        canvasContainer?.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            canvasContainer.classList.add('dragging');
            
            // Add visual feedback to the canvas being hovered
            const targetCanvas = this.multiCanvasManager.getCanvasAtPosition(e.clientX, e.clientY);
            
            // Remove drag-over class from all canvases
            document.querySelectorAll('.canvas-wrapper').forEach(wrapper => {
                wrapper.classList.remove('drag-over');
            });
            
            // Add drag-over class to target canvas
            if (targetCanvas) {
                const canvases = this.multiCanvasManager.getAllCanvases();
                for (const [id, canvas] of canvases) {
                    if (canvas === targetCanvas) {
                        const wrapper = document.getElementById(`wrapper-${id}`);
                        wrapper?.classList.add('drag-over');
                        break;
                    }
                }
            }
        });

        canvasContainer?.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Check if we're actually leaving the container
            const rect = canvasContainer.getBoundingClientRect();
            if (e.clientX <= rect.left || e.clientX >= rect.right ||
                e.clientY <= rect.top || e.clientY >= rect.bottom) {
                canvasContainer.classList.remove('dragging');
                document.querySelectorAll('.canvas-wrapper').forEach(wrapper => {
                    wrapper.classList.remove('drag-over');
                });
            }
        });

        canvasContainer?.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            canvasContainer.classList.remove('dragging');
            
            // Remove drag-over class from all canvases
            document.querySelectorAll('.canvas-wrapper').forEach(wrapper => {
                wrapper.classList.remove('drag-over');
            });

            const files = e.dataTransfer?.files;
            if (files) {
                // Find which canvas was dropped on
                const dropX = e.clientX;
                const dropY = e.clientY;
                const targetCanvas = this.multiCanvasManager.getCanvasAtPosition(dropX, dropY);
                
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const imageUrl = event.target?.result as string;
                            if (targetCanvas) {
                                targetCanvas.addImage(imageUrl);
                            } else {
                                // Fallback to active canvas if no specific canvas found
                                const activeCanvas = this.multiCanvasManager.getActiveCanvas();
                                if (activeCanvas) {
                                    activeCanvas.addImage(imageUrl);
                                }
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                }
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
});