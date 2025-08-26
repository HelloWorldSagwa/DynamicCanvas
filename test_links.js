// Test script to verify multi-canvas dynamic links
console.log('Testing multi-canvas dynamic links...');

// Get the add canvas buttons
const addRightBtn = document.getElementById('addCanvasBtn');
const addBelowBtn = document.getElementById('addCanvasBelowBtn');

// Create a 2x2 grid of canvases
console.log('Creating 2x2 canvas grid...');

// Add first canvas (already exists at 0,0)
console.log('Canvas 1 at position (0,0)');

// Add canvas to the right (0,1)
setTimeout(() => {
    console.log('Adding canvas 2 to the right...');
    addRightBtn.click();
    
    // Add canvas below first one (1,0)
    setTimeout(() => {
        console.log('Selecting first canvas...');
        document.querySelector('.canvas-wrapper').click();
        
        setTimeout(() => {
            console.log('Adding canvas 3 below first canvas...');
            addBelowBtn.click();
            
            // Add canvas to the right of the third one (1,1)
            setTimeout(() => {
                console.log('Adding canvas 4 to the right of canvas 3...');
                addRightBtn.click();
                
                // Check for link buttons
                setTimeout(() => {
                    const linkButtons = document.querySelectorAll('.canvas-link-button');
                    console.log(`Found ${linkButtons.length} link buttons`);
                    
                    // Check for duplicates
                    const buttonIds = Array.from(linkButtons).map(btn => btn.id);
                    const uniqueIds = new Set(buttonIds);
                    
                    if (buttonIds.length !== uniqueIds.size) {
                        console.error('DUPLICATE LINK BUTTONS FOUND!');
                        console.log('Button IDs:', buttonIds);
                    } else {
                        console.log('✓ No duplicate link buttons');
                    }
                    
                    // Check link button positions
                    linkButtons.forEach(btn => {
                        const classes = Array.from(btn.classList);
                        const directionClass = classes.find(c => c.startsWith('link-'));
                        console.log(`Button ${btn.id}: ${directionClass || 'no direction'}`);
                    });
                    
                    // Test toggling a link
                    if (linkButtons.length > 0) {
                        console.log('Testing link toggle...');
                        const firstButton = linkButtons[0];
                        const wasActive = firstButton.classList.contains('active');
                        firstButton.click();
                        const isActive = firstButton.classList.contains('active');
                        console.log(`Link toggled: ${wasActive} -> ${isActive}`);
                    }
                    
                    console.log('Test complete!');
                }, 500);
            }, 500);
        }, 500);
    }, 500);
}, 100);