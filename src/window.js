import { envVars } from './env.js';

// Dynamically manage multiple windows using a template
let zIndexCounter = 100; // Starting point for z-index values
let windows = Array(); // Store window elements

// Create and manage windows programmatically
function createWindow(name, title, content, icon = '⚙️', bringToFront_ = true, classes = []) {
    const id = windows.length;
    const template = document.getElementById('window-template');
    const windowClone = template.content.cloneNode(true);
    
    // Assign unique IDs and classes
    const windowElement = windowClone.querySelector('.window');
    windowElement.id = `window-${name}`;
    windowElement.name = name;
    windowElement.title = title;
    windowElement.classList.add(...classes);

    const header = windowElement.querySelector('.window-header');
    const body = windowElement.querySelector('.window-body');
    const closeBtn = windowElement.querySelector('.close');
    const minimizeBtn = windowElement.querySelector('.minimize');
    const maximizeBtn = windowElement.querySelector('.maximize');
    const grippy = windowElement.querySelector('.grippy');
    
    // Set window title and content
    header.querySelector('.window-title').textContent = title;
    header.querySelector('.window-icon').textContent = icon;
    body.innerHTML = content;
    
    // Add event listeners
    windowElement.addEventListener('mousedown', (e) => {
        // If clicking on a link, don't bring window to front
        if (e.target.tagName === 'A') return;
        bringToFront(windowElement)
    });
    windowElement.addEventListener('touchstart', (e) => {
        // If clicking on a link, don't bring window to front
        if (e.target.tagName === 'A') return;
        bringToFront(windowElement)
    });
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
    resetWindow(windowElement, true, bringToFront_);
    return windowElement;
}

// Export functions and variables
export { createWindow, zIndexCounter, windows, openPage, toggleMode, cascadeWindows, tileWindows, minimizeWindows };

// Function to determine the topmost window
function getTopWindow() {
    // Sort windows by z-index (descending) and return the first one
    try {
        return windows
        .map(w => ({ element: w, zIndex: parseInt(w.style.zIndex || 0, 10) }))
        .sort((a, b) => b.zIndex - a.zIndex)[0].element;
    } catch (e) {
        return undefined;
    }
}

function promoteTopWindow() {
    const topWindow = getTopWindow();
    if (typeof(topWindow) !== 'undefined') {
        if (!topWindow.classList.contains('minimized')) {
            bringToFront(topWindow);
        } else {
            history.pushState(null, null, '');
        }
    } else {
        history.pushState(null, null, '');
    }
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

function minimizeWindows() {
    windows.forEach(windowElement => {
        if (windowElement.classList.contains('minimized')) return;
        toggleMinimize(windowElement);
    });
}

function cascadeWindows() {
    windows.forEach((windowElement, i) => {
        // If window is minimized, un-minimize it
        if (windowElement.classList.contains('minimized')) {
            toggleMinimize(windowElement, false);
        }
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
        // If window is minimized, un-minimize it
        if (windowElement.classList.contains('minimized')) {
            toggleMinimize(windowElement, false);
        }
        windowElement.classList.remove('maximized', 'shaded');
        
        const row = Math.floor(index / columns);
        const column = index % columns;
        
        windowElement.style.position = 'absolute';
        windowElement.style.width = `${windowWidth}px`;
        windowElement.style.height = `${windowHeight}px`;
        windowElement.style.top = `${windowHeight / 2 + row * windowHeight}px`;
        windowElement.style.left = `${windowWidth / 2 + column * windowWidth}px`;
        bringToFront(windowElement);
    });
}

function bringToFront(windowElement, changeHash = true) {
    if (typeof(windowElement) === 'undefined') return;
    // If window is already visible and up front, stop function
    if (windowElement.classList.contains('front')) return;
    // If window is minimized, un-minimize it
    if (windowElement.classList.contains('minimized')) {
        toggleMinimize(windowElement, false);
    }
    zIndexCounter++; // Increment global counter
    windowElement.style.zIndex = zIndexCounter; // Assign new z-index to the element
    // Remove 'front' class from all windows
    windows.forEach(w => w.classList.remove('front'));
    // Add 'front' class to the clicked window
    windowElement.classList.add('front');
    if (changeHash) {
        // If new state does not match most recent history state, push new state
        if (windowElement.name !== window.location.hash.substring(2)) {
            history.pushState(null, null, '#/' + windowElement.name);
        } else if (window.location.hash === '') {
            history.replaceState(null, null, '/' + windowElement.name);
        }
    }
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
    if (window.windowCleanup[windowElement.name]) {
        if (typeof(window.windowCleanup[windowElement.name]) === 'object') {
            window.windowCleanup[windowElement.name].forEach((f) => { f() });
        } else {
            window.windowCleanup[windowElement.name]();
            console.warn('windowCleanup should be an object with an array of functions. Update the code.');
        }
        delete window.windowCleanup[windowElement.name];
    }
    windowElement.remove();
    windows = windows.filter(w => w !== windowElement);
    promoteTopWindow();
}

function toggleShade(e, windowElement, force = undefined) {
    if (typeof(e) === 'Event') {
        if (e.target.closest('.button')) return; // Prevent shading when clicking buttons
        if (windowElement.classList.contains('minimized')) return; // Prevent shading when minimized
        e.preventDefault();
    }
    
    let topDistance = windowElement.getBoundingClientRect().top;
    if (!windowElement.classList.contains('shaded') || (typeof(force) === 'boolean' && force === true)) {
        saveWindowState(windowElement);
        let headerHeight = windowElement.querySelector('.window-header').getBoundingClientRect().height;
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
    windowElement.lastZIndex = windowElement.style.zIndex;
    windowElement.maximized = windowElement.classList.contains('maximized');
    windowElement.minimized = windowElement.classList.contains('minimized');
    windowElement.shaded = windowElement.classList.contains('shaded');
}

function clearWindowState(windowElement) {
    windowElement.lastWidth = undefined;
    windowElement.lastHeight = undefined;
    windowElement.lastTop = undefined;
    windowElement.lastLeft = undefined;
    windowElement.lastZIndex = undefined;
    windowElement.maximized = undefined;
    windowElement.minimized = undefined;
    windowElement.shaded = undefined;
}

function windowHasState(windowElement) {
    return typeof(windowElement.lastWidth) !== 'undefined' &&
    typeof(windowElement.lastHeight) !== 'undefined' &&
    typeof(windowElement.lastTop) !== 'undefined' &&
    typeof(windowElement.lastLeft) !== 'undefined' &&
    typeof(windowElement.lastZIndex) !== 'undefined' &&
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
        windowElement.style.zIndex = windowElement.lastZIndex;
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
        resetWindow(windowElement, false, false);
        windowElement.classList.add('minimized');
        windowElement.classList.remove('front');
        document.body.removeChild(windowElement);
        document.getElementById('tasks').appendChild(windowElement);
    } else if (windowElement.classList.contains('minimized') || (typeof(force) === 'boolean' && force === false)) {
        restoreWindowState(windowElement);
        clearWindowState(windowElement);
        windowElement.classList.remove('minimized');
        document.getElementById('tasks').removeChild(document.getElementById(windowElement.id));
        document.body.appendChild(windowElement);
        bringToFront(windowElement);
    }
    promoteTopWindow();
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
    promoteTopWindow();
}

function resetWindow(windowElement, bake = true, bringToFront_ = true) {
    windowElement.style.width = '';
    windowElement.style.height = '';
    windowElement.style.top = '';
    windowElement.style.left = '';
    windowElement.style.zIndex = '';
    if (windowElement.classList.contains('minimized')) {
        document.getElementById('tasks').removeChild(document.getElementById(`window-${windowElement.id}`));
        document.body.appendChild(windowElement);
    }
    windowElement.classList.remove('maximized');
    windowElement.classList.remove('minimized');
    windowElement.classList.remove('shaded');
    if (bake) {
        if (window.innerWidth > 768) {
            windowElement.style.maxWidth = '1024px';
            windowElement.style.maxHeight = '768px';
        }
        bakeWindow(windowElement);
        windowElement.style.maxHeight = '';
        windowElement.style.maxWidth = '';
    }
    // Bring to front
    if (bringToFront_) {
        bringToFront(windowElement);
    }
    promoteTopWindow();
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
    if (document.body.classList.contains('toggled')) {
        localStorage.setItem('mode', 'light');
    } else {
        localStorage.setItem('mode', 'dark');
    }
}

// Load External HTML
function loadHTML(url, targetElementId, callback = () => {}, retries = 5) {
    fetch(url)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
    })
    .then(html => {
        let targetElement = document.getElementById(targetElementId);
        if (typeof(targetElement) !== 'undefined' && targetElement !== null) {
            targetElement.innerHTML = html;
            // Find and execute scripts
            const scripts = targetElement.querySelectorAll("script");
            scripts.forEach(script => {
                const newScript = document.createElement("script");
                if (script.src) {
                    // If the script has a `src` attribute, load it separately
                    newScript.src = `${script.src}?nocache=${new Date().getTime()}`;
                } else {
                    // Otherwise, execute the inline script content
                    newScript.textContent = script.textContent;
                }
                // If the script is a module, set the type attribute
                if (script.type && script.type === "module") {
                    newScript.type = "module";
                }
                const ancestor = targetElement.closest('.window');
                document.body.appendChild(newScript); // Append to DOM to execute
                window.windowCleanup[ancestor.name] = window.windowCleanup[ancestor.name] || [];
                window.windowCleanup[ancestor.name].push(() => {
                    document.body.removeChild(newScript); // Clean up after execution
                });
                //newScript.remove(); // Optional: Clean up after execution
            });

            envVars(false).then((ENV_VARS) => {
                // Find and replace name and initials
                const name = targetElement.querySelectorAll('.name');
                const initials = targetElement.querySelectorAll('.initials');
                const email_link = targetElement.querySelectorAll('a.email');
                const domain_link = targetElement.querySelectorAll('a.domain');

                if (typeof(name) !== 'undefined') {
                    name.forEach(n => {
                        n.textContent = ENV_VARS.NAME;
                    });
                }

                if (typeof(initials) !== 'undefined') {
                    initials.forEach(i => {
                        i.textContent = ENV_VARS.INITIALS;
                    });
                }

                if (typeof(email_link) !== 'undefined') {
                    email_link.forEach(e => {
                        e.href = `mailto:${ENV_VARS.EMAIL}`;
                        e.textContent = ENV_VARS.EMAIL;
                    });
                }

                if (typeof(domain_link) !== 'undefined') {
                    domain_link.forEach(d => {
                        d.href = ENV_VARS.BASE_URL;
                        d.textContent = ENV_VARS.DOMAIN_NAME;
                    });
                }
            });

            // Find ancestor window element
            const ancestor = targetElement.closest('.window');
            // Run callback function if provided
            if (typeof(callback) === 'function') {
                callback(ancestor);
            }
        } else {
            if (retries > 0) {
                loadHTML(url, targetElementId, callback, retries - 5);
            } else {
                callback(undefined);
            }
        }
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

function goTo(name, niceName, icon = '⚙️') {
    // Get top window
    const topWindow = getTopWindow();
    // If top window is not undefined, navigate to the page
    if (typeof(topWindow) !== 'undefined') {
        navigateToPage(topWindow.id, name, niceName, icon);
    } else {
        openPage(name, niceName, icon);
    }
}

function navigateToPage(targetWindowId, name, niceName, icon = '⚙️') {
    if (targetWindowId === `window-${name}`) return;
    const windowElement = windows.find(w => w.id === targetWindowId);
    const oldWindow = windows.find(w => w.id === `window-${name}`);
    if (typeof(oldWindow) !== 'undefined') {
        closeWindow(oldWindow);
    }
    if (typeof(windowElement) !== 'undefined') {
        windowElement.id = "window-" + name;
        windowElement.name = name;
        windowElement.title = niceName;
        windowElement.querySelector('.window-body').innerHTML = `<div id="${name}-container"></div>`;
        windowElement.querySelector('.window-title').textContent = niceName;
        windowElement.querySelector('.window-icon').textContent = icon;
        loadHTML(`${name}.html`, `${name}-container`, (windowEl) => {
            if (typeof(windowElement) !== 'undefined') {
                windowElement.classList.remove('front');
                bringToFront(windowElement);
            }
        });
    } else {
        openPage(name, niceName, icon, undefined, false, false);
    }
}

function openPage(name, niceName, icon = '⚙️', event = undefined, minimize = false, changeHash = true) {
    if (typeof(event) !== 'undefined') {
        event.preventDefault();
    }
    // If window with name already open, bring to front and then stop function
    let windowElement = windows.find(w => w.id === `window-${name}`);
    let windowExists = typeof(windowElement) !== 'undefined';
    if (windowExists) {
        bringToFront(windowElement, changeHash);
        return;
    } else {
        windowElement = createWindow(name, niceName, `<div id="${name}-container"></div>`, icon, false);
        loadHTML(`${name}.html`, `${name}-container`, (windowEl) => {
            if (typeof(windowElement) !== 'undefined') {
                if (minimize) {
                    toggleMinimize(windowElement);
                } else {
                    bringToFront(windowElement, changeHash);
                }
            }
        });
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

function getCurrentPage() {
    const url = new URL(window.location.href);
    window.fullWindowHash = url.hash;
    return (url.pathname + url.hash.split('/')[1]).split('/').slice(-1)[0]
}

// If the page name is in the URL anchor, open the page
function openPageFromUrl() {
    const page = getCurrentPage();
    switch (page) {
        case 'welcome':
        goTo('welcome', 'Welcome!', '👋');
        openPage('chat', 'Chat', '💬', undefined, true, false);
        history.replaceState(null, null, '/');
        break;
        case 'intro':
        goTo('intro', 'Intro', '🧠');
        openPage('chat', 'Chat', '💬', undefined, true, false);
        break;
        case 'resume':
        goTo('resume', 'Resume', '📜');
        openPage('chat', 'Chat', '💬', undefined, true, false);
        break;
        case 'chat':
        goTo('chat', 'Chat', '💬');
        break;
        case 'cloud-journey':
        goTo('cloud-journey', 'My Cloud Journey', '☁️');
        break;
        default:
        goTo('welcome', 'Welcome!', '👋');
        openPage('chat', 'Chat', '💬', undefined, true, false);
        bringToFront(windows[0], false);
        history.replaceState(null, null, '/');
        break;
    }
}

(function() {
    const startButton = document.getElementById('start-button');

    // If light/dark mode is set, toggle it
    if (localStorage.getItem('mode') === 'light') {
        document.body.classList.add('toggled');
    } else {
        document.body.classList.remove('toggled');
    }
    // When clicking on the start button, open the menu
    startButton.addEventListener('click', e => {
        if (document.getElementById('menu').classList.contains('active')) {
            document.getElementById('menu').classList.remove('active');
        }
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
    
    // Handle history back event
    window.addEventListener('popstate', e => {
        openPageFromUrl();
    });
    
    if (typeof(getTopWindow()) === 'undefined') {
        openPageFromUrl();
    }
})();