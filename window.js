// Dynamically manage multiple windows using a template
let zIndexCounter = 100; // Starting point for z-index values
let windows = Array(); // Store window elements

// Create and manage windows programmatically
function createWindow(name, title, content) {
    const id = windows.length;
    const template = document.getElementById('window-template');
    const windowClone = template.content.cloneNode(true);
    
    // Assign unique IDs and classes
    const windowElement = windowClone.querySelector('.window');
    windowElement.id = `window-${name}`;
    
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
    windows[id] = windowElement;
    // Reset the window
    resetWindow(windowElement);
    return windowElement;
}

// Bake the window
function bakeWindow(windowElement) {
    // Get window's ordinal position
    const index = windows.indexOf(windowElement);
    let offset = (windowElement.querySelector('.window-header').getBoundingClientRect().height * index ) + 1;
    // If on mobile, only offset by half the address bar height, and shrink the width by that amount
    if (window.innerWidth <= 768) {
        offset = offset / 2;
        windowElement.style.width = `${windowElement.offsetWidth - offset}px `;
    } else {
        windowElement.style.width = `${windowElement.offsetWidth}px`;
    }
    windowElement.style.top = `${windowElement.offsetTop + offset}px`;
    windowElement.style.left = `${windowElement.offsetLeft + offset}px`;
    windowElement.style.height = `${windowElement.offsetHeight}px`;

    // Save window state
    saveWindowState(windowElement);
}

function cascadeWindows() {
    windows.forEach((windowElement, i) => {
        resetWindow(windowElement);
        bringToFront(windowElement);
    });
}

function tileWindows() {
    const windowCount = windows.length;
    if (windowCount === 0) return;

    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate grid dimensions
    const columns = Math.ceil(Math.sqrt(windowCount));
    const rows = Math.ceil(windowCount / columns);

    // Calculate size of each window
    const windowWidth = Math.floor(viewportWidth / columns);
    const windowHeight = Math.floor(viewportHeight / rows);

    // Position each window in the grid
    windows.forEach((windowElement, index) => {
        windowElement.classList.remove('minimized', 'maximized', 'shaded');

        const row = Math.floor(index / columns);
        const column = index % columns;

        windowElement.style.position = 'absolute';
        windowElement.style.width = `${windowWidth}px`;
        windowElement.style.height = `${windowHeight}px`;
        windowElement.style.top = `${windowHeight / 2 + row * windowHeight}px`;
        windowElement.style.left = `${windowWidth / 2 + column * windowWidth}px`;
        windowElement.classList.remove('minimized', 'maximized', 'shaded'); // Reset states
        bringToFront(windowElement);
    });
}

function bringToFront(windowElement) {
    zIndexCounter++; // Increment global counter
    windowElement.style.zIndex = zIndexCounter; // Assign new z-index to the element
    // Remove 'front' class from all windows
    windows.forEach(w => w.classList.remove('front'));
    // Add 'front' class to the clicked window
    windowElement.classList.add('front');
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
    windows = windows.filter(w => w !== windowElement);
}

function toggleShade(e, windowElement, force = undefined) {
    if (typeof(e) === 'Event') {
        if (e.target.closest('.button')) return; // Prevent shading when clicking buttons
        if (windowElement.classList.contains('minimized')) return; // Prevent shading when minimized
        e.preventDefault();
    }

    topDistance = windowElement.getBoundingClientRect().top;
    if (!windowElement.classList.contains('shaded') || (typeof(force) === 'boolean' && force === true)) {
        saveWindowState(windowElement);
        headerHeight = windowElement.querySelector('.window-header').getBoundingClientRect().height;
        windowElement.style.top = `${topDistance + headerHeight / 2}px`;
        windowElement.classList.add('shaded');
    } else if (windowElement.classList.contains('shaded') || (typeof(force) === 'boolean' && force === false)) {
        windowElement.classList.remove('shaded');
        restoreWindowState(windowElement);
    }
}

function saveWindowState(windowElement) {
    windowElement.lastWidth = windowElement.style.width;
    windowElement.lastHeight = windowElement.style.height;
    windowElement.lastTop = windowElement.style.top;
    windowElement.lastLeft = windowElement.style.left;
    windowElement.maximized = windowElement.classList.contains('maximized');
    windowElement.minimized = windowElement.classList.contains('minimized');
    windowElement.shaded = windowElement.classList.contains('shaded');
}

function clearWindowState(windowElement) {
    windowElement.lastWidth = undefined;
    windowElement.lastHeight = undefined;
    windowElement.lastTop = undefined;
    windowElement.lastLeft = undefined;
    windowElement.maximized = undefined;
    windowElement.minimized = undefined;
    windowElement.shaded = undefined;
}

function windowHasState(windowElement) {
    return typeof(windowElement.lastWidth) !== 'undefined' &&
        typeof(windowElement.lastHeight) !== 'undefined' &&
        typeof(windowElement.lastTop) !== 'undefined' &&
        typeof(windowElement.lastLeft) !== 'undefined' &&
        typeof(windowElement.maximized) !== 'undefined' &&
        typeof(windowElement.minimized) !== 'undefined' &&
        typeof(windowElement.shaded) !== 'undefined';
}

function restoreWindowState(windowElement) {
    if (windowHasState(windowElement)) {
        windowElement.style.width = windowElement.lastWidth;
        windowElement.style.height = windowElement.lastHeight;
        windowElement.style.top = windowElement.lastTop;
        windowElement.style.left = windowElement.lastLeft;
        if (windowElement.maximized) { windowElement.classList.add('maximized') } else { windowElement.classList.remove('maximized')};
        if (windowElement.minimized) { windowElement.classList.add('minimized') } else { windowElement.classList.remove('minimized')};
        if (windowElement.shaded) { windowElement.classList.add('shaded') } else { windowElement.classList.remove('shaded')};
    } else {
        console.error('Window state is not saved.');
    }
}

function toggleMinimize(windowElement, force = undefined) {
   if (!windowElement.classList.contains('minimized') || (typeof(force) === 'boolean' && force === true)) {
        saveWindowState(windowElement);
        resetWindow(windowElement);
        windowElement.classList.add('minimized');
     } else if (windowElement.classList.contains('minimized') || (typeof(force) === 'boolean' && force === false)) {
        restoreWindowState(windowElement);
        clearWindowState(windowElement);
        windowElement.classList.remove('minimized');
    }
}

function toggleMaximize(windowElement, force = undefined) {
    if (!windowElement.classList.contains('maximized') || (typeof(force) === 'boolean' && force === true)) {
        saveWindowState(windowElement);
        windowElement.classList.add('maximized');
    } else if (windowElement.classList.contains('maximized') || (typeof(force) === 'boolean' && force === false)) {
        restoreWindowState(windowElement);
        clearWindowState(windowElement);
        windowElement.classList.remove('maximized');
    }
}

function resetWindow(windowElement) {
    windowElement.style.width = '';
    windowElement.style.height = '';
    windowElement.style.top = '';
    windowElement.style.left = '';
    windowElement.classList.remove('maximized');
    windowElement.classList.remove('minimized');
    windowElement.classList.remove('shaded');
    if (window.innerWidth > 768) {
        windowElement.style.maxHeight = '60vh';
        windowElement.style.maxWidth = '70vw';
    }
    bakeWindow(windowElement);
    windowElement.style.maxHeight = '';
    windowElement.style.maxWidth = '';
    // Bring to front
    bringToFront(windowElement);
}

function restoreWindow(e, windowElement) {
    if (e.target.closest('.button')) return; // Prevent dragging when clicking buttons

    if (windowElement.classList.contains('minimized')) {
        e.preventDefault();
        toggleMinimize(windowElement);
    }
}

// Toggle Light/Dark Mode
function toggleMode() {
    document.body.classList.toggle('toggled');
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

function getAddressBarHeight() {
    const totalScreenHeight = window.screen.height; // Total screen height
    const visibleViewportHeight = window.innerHeight; // Visible viewport height
    return totalScreenHeight - visibleViewportHeight; // Address bar height
}

function openPage(name, niceName) {
    // If window with name already open, bring to front and then stop function
    const windowExists = windows.some(w => w.id === `window-${name}`);
    if (windowExists) {
        bringToFront(windows.find(w => w.id === `window-${name}`));
        return;
    } else {
        // If window does not exist, create new window
        createWindow(name, niceName, `<div id="${name}-container">Loading ${niceName}...</div>`);
        loadHTML(`${name}.html`, `${name}-container`);
    }
}

// Toggle menu, and place it at the given coordinates
function toggleMenu(x, y, offset = false) {
    const contextMenu = document.getElementById('menu');
    contextMenu.classList.toggle('active');
    contextMenu.style.top = `${y}px`;
    // Subtract width of menu from x position to prevent overflow if offset === true
    if (offset) {
        contextMenu.style.left = `${x - contextMenu.offsetWidth}px`;
    } else {
        contextMenu.style.left = `${x}px`;
    }
    contextMenu.style.zIndex = zIndexCounter + 1;
}

const startButton = document.getElementById('start-button');

// When clicking on the start button, open the menu
startButton.addEventListener('click', e => {
    if (document.getElementById('menu').classList.contains('active')) {
        document.getElementById('menu').classList.remove('active');
    }
    console.log(e.clientX, e.clientY);
    // Set menu to open at the center of the start button
    toggleMenu(startButton.getBoundingClientRect().left + startButton.offsetWidth / 2, startButton.getBoundingClientRect().top, true);
});

document.addEventListener('contextmenu', e => {
    e.preventDefault();
    // If context menu element is not body, exit
    //if (e.target.tagName !== 'BODY')
    //    return;
    // If context menu is already open, kill it
    if (document.getElementById('menu').classList.contains('active')) {
        document.getElementById('menu').classList.remove('active');
    }
    console.log(e.clientX, e.clientY);
    toggleMenu(e.clientX, e.clientY);
});

// Make context menu go away when clicking outside of it
document.addEventListener('click', e => {
    const contextMenu = document.getElementById('menu');
    if (e.target.closest('.menu')) return;
    if (e.target.closest('.start-button')) return;
    contextMenu.classList.remove('active');
});

// Make context menu go away when clicking on a menu item
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        document.getElementById('menu').classList.remove('active');
    });
});

// Initialize Resume Content
openPage('welcome', 'Welcome!');
//loadHTML('resume.html', 'resume-container');
//loadHTML('intro.html', 'intro-container');
bringToFront(windows[0]);