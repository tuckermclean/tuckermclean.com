// Dynamically manage multiple windows using a template
let zIndexCounter = 100; // Starting point for z-index values

// Create and manage windows programmatically
function createWindow(id, title, content) {
    const template = document.getElementById('window-template');
    const windowClone = template.content.cloneNode(true);
    
    // Assign unique IDs and classes
    const windowElement = windowClone.querySelector('.window');
    windowElement.id = `window-${id}`;
    
    const header = windowElement.querySelector('.window-header');
    const body = windowElement.querySelector('.window-body');
    const closeBtn = windowElement.querySelector('.close');
    const minimizeBtn = windowElement.querySelector('.minimize');
    const maximizeBtn = windowElement.querySelector('.maximize');
    const grippy = windowElement.querySelector('.grippy');
    
    // Set window title and content
    header.querySelector('.window-title').textContent = title;
    body.innerHTML = content;
    
    // Add event listeners
    windowElement.addEventListener('mousedown', () => bringToFront(windowElement));
    windowElement.addEventListener('touchstart', () => bringToFront(windowElement));
    windowElement.addEventListener('click', (e) => restoreWindow(e, windowElement));
    windowElement.addEventListener('touchstart', (e) => restoreWindow(e, windowElement), { passive: false });
    closeBtn.addEventListener('click', () => closeWindow(windowElement));
    header.addEventListener('dblclick', (e) => toggleShade(e, windowElement));
    minimizeBtn.addEventListener('click', () => toggleMinimize(windowElement));
    maximizeBtn.addEventListener('click', () => toggleMaximize(windowElement));
    header.addEventListener('mousedown', (e) => startDrag(e, windowElement));
    header.addEventListener('touchstart', (e) => startDrag(e, windowElement), { passive: false });
    grippy.addEventListener('mousedown', (e) => startResize(e, windowElement));
    grippy.addEventListener('touchstart', (e) => startResize(e, windowElement), { passive: false });
    
    // Append to the DOM
    document.body.appendChild(windowElement);
    return windowElement;
}

function bringToFront(windowElement) {
    zIndexCounter++; // Increment global counter
    windowElement.style.zIndex = zIndexCounter; // Assign new z-index to the element
}

// Dragging Functionality
function startDrag(e, windowElement) {
    if (e.target.closest('.button')) return; // Prevent dragging when clicking buttons 
    if (e.target.closest('.minimized')) return; // Prevent dragging when minimized
    e.preventDefault();
    
    const isTouch = e.type === 'touchstart';
    const offsetX = (isTouch ? e.touches[0].clientX : e.clientX) - windowElement.offsetLeft;
    const offsetY = (isTouch ? e.touches[0].clientY : e.clientY) - windowElement.offsetTop;
    
    function onMove(event) {
        const clientX = isTouch ? event.touches[0].clientX : event.clientX;
        const clientY = isTouch ? event.touches[0].clientY : event.clientY;
        
        if (!windowElement.classList.contains('minimized')) {
            if (clientY > windowElement.querySelector('.window-header').getBoundingClientRect().height / 2) {
                windowElement.style.top = `${clientY - offsetY}px`;
            }
            windowElement.style.left = `${clientX - offsetX}px`;
        }
    }
    
    function stopDrag() {
        document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
        document.removeEventListener(isTouch ? 'touchend' : 'mouseup', stopDrag);
    }
    
    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
    document.addEventListener(isTouch ? 'touchend' : 'mouseup', stopDrag);
}

// Resizing Functionality
function startResize(e, windowElement) {
    e.preventDefault();
    const isTouch = e.type === 'touchstart';
    const startWidth = windowElement.offsetWidth;
    const startHeight = windowElement.offsetHeight;
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startY = isTouch ? e.touches[0].clientY : e.clientY;
    
    function onResize(event) {
        const clientX = isTouch ? event.touches[0].clientX : event.clientX;
        const clientY = isTouch ? event.touches[0].clientY : event.clientY;
        
        windowElement.style.width = `${startWidth + (clientX - startX)}px`;
        windowElement.style.height = `${startHeight + (clientY - startY)}px`;
    }
    
    function stopResize() {
        document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onResize);
        document.removeEventListener(isTouch ? 'touchend' : 'mouseup', stopResize);
    }
    
    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onResize, { passive: false });
    document.addEventListener(isTouch ? 'touchend' : 'mouseup', stopResize);
}

// Button Actions
function closeWindow(windowElement) {
    windowElement.remove();
}

function toggleShade(e, windowElement) {
    if (e.target.closest('.button')) return; // Prevent dragging when clicking buttons
    e.preventDefault();

    topDistance = windowElement.getBoundingClientRect().top;
    if (!windowElement.classList.contains('shaded')) {
        headerHeight = windowElement.querySelector('.window-header').getBoundingClientRect().height;
        windowElement.style.top = `${topDistance + headerHeight / 2}px`;
        windowElement.classList.toggle('shaded');
    } else {
        windowElement.classList.toggle('shaded');
        windowHeight = windowElement.getBoundingClientRect().height;
        windowElement.style.top = `${topDistance + windowHeight / 2}px`;
    }
    windowElement.classList.remove('maximized', 'minimized');
}

function toggleMinimize(windowElement) {
    windowElement.classList.toggle('minimized');
    windowElement.classList.remove('maximized', 'shaded');
}

function toggleMaximize(windowElement) {
    windowElement.classList.toggle('maximized');
    windowElement.classList.remove('minimized', 'shaded');
}

function restoreWindow(e, windowElement) {
    if (e.target.closest('.button')) return; // Prevent dragging when clicking buttons

    if (windowElement.classList.contains('minimized')) {
        e.preventDefault();
        windowElement.classList.remove('minimized');
    }
}

// Toggle Light/Dark Mode
function toggleMode() {
    document.body.classList.toggle('light-mode');
}

// Load External HTML
function loadHTML(url, targetElementId) {
    fetch(url)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
    })
    .then(html => {
        document.getElementById(targetElementId).innerHTML = html;
    })
    .catch(error => {
        console.error('Error loading HTML:', error);
    });
}

// Example Usage
createWindow(1, 'Resume', '<div id="resume-container">Loading resume...</div>');
//createWindow(2, 'Project Notes', '<p>Notes about ongoing projects...</p>');

// Initialize Resume Content
loadHTML('resume.html', 'resume-container');

