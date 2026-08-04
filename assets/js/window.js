import { envVars } from './env.js';
import { getDesktop } from '../iconostat/index.js';

// Dynamically manage multiple windows using a template
// (window registry, z-order, focus, rubber-band selection, and resize
// reflow now live on the <iconostat-desktop> element; see assets/iconostat/desktop.js)

// Create and manage windows programmatically
function createWindow(name, title, content, icon = '⚙️', bringToFront_ = true, classes = []) {
    const desktop = getDesktop();
    const template = document.getElementById('window-template');
    const windowClone = template.content.cloneNode(true);
    
    // Assign unique IDs and classes
    const windowElement = windowClone.querySelector('.window');
    windowElement.id = `window-${name}`;
    windowElement.name = name;
    windowElement.setAttribute('aria-label', title);
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
        desktop.bringToFront(windowElement)
    });
    windowElement.addEventListener('touchstart', (e) => {
        // If clicking on a link, don't bring window to front
        if (e.target.tagName === 'A') return;
        desktop.bringToFront(windowElement)
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
    
    // Append to the DOM. Windows stay direct children of <body> (unchanged
    // from the pre-refactor DOM shape); the desktop only tracks them.
    document.body.appendChild(windowElement);
    desktop.register(windowElement);
    // Reset the window
    resetWindow(windowElement, true, bringToFront_);
    return windowElement;
}

// Export functions and variables
export { createWindow, openPage, goTo, toggleMode, cascadeWindows, tileWindows, minimizeWindows, bringToFront, toggleMinimize, resetWindow };

// Bake the window
function bakeWindow(windowElement) {
    // Get window's ordinal position
    const index = getDesktop().windows.indexOf(windowElement);
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

// Thin delegators onto <iconostat-desktop>, which now owns the window
// registry, z-order, focus, rubber-band selection, and resize reflow.
function minimizeWindows() { getDesktop().minimizeAll(); }
function cascadeWindows() { getDesktop().cascade(); }
function tileWindows() { getDesktop().tile(); }
function bringToFront(windowElement, changeHash = true) { getDesktop().bringToFront(windowElement, changeHash); }

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
    getDesktop().unregister(windowElement);
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
    getDesktop().promoteTop();
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
    getDesktop().promoteTop();
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
    getDesktop().promoteTop();
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
            // Update window icon and title from page frontmatter spans
            const win = targetElement.closest('.window');
            if (win) {
                const pageIcon = targetElement.querySelector('.page-icon');
                if (pageIcon) win.querySelector('.window-icon').textContent = pageIcon.textContent;
                const pageTitle = targetElement.querySelector('.page-title');
                if (pageTitle) win.querySelector('.window-title').textContent = pageTitle.textContent;
            }
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

            // Wire up link tooltips and status bar (old-school browser behaviour)
            if (ancestor) {
                const statusBar = ancestor.querySelector('.window-status-bar');
                const defaultStatus = 'Status: Ready to work!';
                targetElement.querySelectorAll('a[href]').forEach(a => {
                    if (!a.title) a.title = a.href;
                    if (a.hostname && a.hostname !== window.location.hostname) {
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                    }
                });

                // Clickable images — open in own zoomable window
                targetElement.querySelectorAll('img').forEach(img => {
                    img.addEventListener('click', () => {
                        const slug = img.src.split('/').pop().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '-');
                        const winName = 'img-' + slug;
                        const existing = getDesktop().windows.find(w => w.id === `window-${winName}`);
                        if (existing) { bringToFront(existing); return; }
                        const imgAlt = (img.alt || slug).replace(/"/g, '&quot;');
                        const win = createWindow(winName, img.alt || slug, `<img src="${img.src}" alt="${imgAlt}" style="max-width:100%;height:auto;display:block;">`, '🖼️', false, ['image']);
                        bringToFront(win, false);
                        const imgEl = win.querySelector('.window-body img');
                        if (!imgEl) return;
                        let scale = 1;
                        function applyZoom(factor) {
                            const next = scale * factor;
                            if (next > 10 && factor > 1) return;
                            if (next < 0.25 && factor < 1) return;
                            scale = Math.min(Math.max(next, 0.25), 10);
                            imgEl.style.width = (imgEl.naturalWidth * scale) + 'px';
                            imgEl.style.height = 'auto';
                            imgEl.style.maxWidth = 'none';
                        }
                        // Wheel zoom
                        win.querySelector('.window-body').addEventListener('wheel', e => {
                            e.preventDefault();
                            applyZoom(e.deltaY < 0 ? 1.15 : 0.87);
                        }, { passive: false });
                        // Pinch zoom
                        let lastDist = 0;
                        win.querySelector('.window-body').addEventListener('touchstart', e => {
                            if (e.touches.length === 2)
                                lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                        });
                        win.querySelector('.window-body').addEventListener('touchmove', e => {
                            if (e.touches.length !== 2) return;
                            e.preventDefault();
                            const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                            applyZoom(dist / lastDist);
                            lastDist = dist;
                        }, { passive: false });
                    });
                });
                targetElement.addEventListener('mouseover', e => {
                    const a = e.target.closest('a[href]');
                    if (a && statusBar) statusBar.textContent = a.href;
                });
                targetElement.addEventListener('mouseout', e => {
                    const a = e.target.closest('a[href]');
                    if (a && statusBar) statusBar.textContent = defaultStatus;
                });
            }

            // Run callback function if provided
            if (typeof(callback) === 'function') {
                callback(ancestor);
            }
        } else {
            if (retries > 0) {
                setTimeout(() => loadHTML(url, targetElementId, callback, retries - 1), 100);
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
    const topWindow = getDesktop().getTop();
    // If top window is not undefined, navigate to the page
    if (typeof(topWindow) !== 'undefined') {
        navigateToPage(topWindow.id, name, niceName, icon);
    } else {
        openPage(name, niceName, icon);
    }
}

function navigateToPage(targetWindowId, name, niceName, icon = '⚙️') {
    if (targetWindowId === `window-${name}`) return;
    const windowElement = getDesktop().windows.find(w => w.id === targetWindowId);
    const oldWindow = getDesktop().windows.find(w => w.id === `window-${name}`);
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
    let windowElement = getDesktop().windows.find(w => w.id === `window-${name}`);
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
    contextMenu.style.zIndex = getDesktop()._z + 1;
}

function getCurrentPage() {
    const url = new URL(window.location.href);
    window.fullWindowHash = url.hash;
    if (url.hash.startsWith('#/')) {
        return url.hash.substring(2); // Everything after #/
    }
    return url.pathname.split('/').filter(Boolean).slice(-1)[0] || '';
}

// If the page name is in the URL anchor, open the page
function openPageFromUrl() {
    const page = getCurrentPage();
    if (!page) {
        goTo('welcome', 'Welcome!', '👋');
        bringToFront(getDesktop().windows[0], false);
        history.replaceState(null, null, '/');
    } else if (page === 'welcome') {
        goTo('welcome', 'Welcome!', '👋');
        history.replaceState(null, null, '/');
    } else {
        const slug = page.split('/').pop().replace(/-/g, ' ');
        const title = slug.charAt(0).toUpperCase() + slug.slice(1);
        const icon = page.startsWith('posts/') ? '✍️' : '⚙️';
        goTo(page, title, icon);
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
        if (e.target.closest('.window-body')) return;
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

    if (typeof(getDesktop().getTop()) === 'undefined') {
        openPageFromUrl();
    }
    // Resize/orientation reflow and rubber-band selection now live on
    // <iconostat-desktop> (see assets/iconostat/desktop.js).
})();