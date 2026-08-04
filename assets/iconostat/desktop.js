import { pickTopIndex } from './geometry.js';
import { toggleMinimize, resetWindow } from '../js/window.js';

// Owns the window registry, z-order, focus/.front handling, rubber-band
// selection, and resize->cascade reflow. Windows are still created and
// appended to the DOM by window.js's createWindow(); this element only
// coordinates them once they exist.
export class IconostatDesktop extends HTMLElement {
    connectedCallback() {
        this._windows = this._windows || [];
        this._z = this._z || 100; // Starting point for z-index values
        this._installSelection();
        this._installReflow();
    }

    get windows() { return this._windows; }

    register(el) {
        this._windows.push(el);
    }

    unregister(el) {
        this._windows = this._windows.filter(w => w !== el);
        this.promoteTop();
    }

    // Determine the topmost window
    getTop() {
        const i = pickTopIndex(this._windows.map(w => parseInt(w.style.zIndex || 0, 10)));
        return i === -1 ? undefined : this._windows[i];
    }

    promoteTop() {
        const topWindow = this.getTop();
        if (typeof(topWindow) !== 'undefined') {
            if (!topWindow.classList.contains('minimized')) {
                this.bringToFront(topWindow);
            } else {
                history.pushState(null, null, '');
            }
        } else {
            history.replaceState(null, null, '/');
        }
    }

    bringToFront(windowElement, changeHash = true) {
        if (typeof(windowElement) === 'undefined') return;
        // If window is already visible and up front, stop function
        if (windowElement.classList.contains('front')) return;
        // If window is minimized, un-minimize it
        if (windowElement.classList.contains('minimized')) {
            toggleMinimize(windowElement, false);
        }
        this._z++; // Increment global counter
        windowElement.style.zIndex = this._z; // Assign new z-index to the element
        // Remove 'front' class from all windows
        this._windows.forEach(w => w.classList.remove('front'));
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

    cascade() {
        this._windows.forEach((windowElement, i) => {
            // If window is minimized, un-minimize it
            if (windowElement.classList.contains('minimized')) {
                toggleMinimize(windowElement, false);
            }
            resetWindow(windowElement);
            this.bringToFront(windowElement);
        });
    }

    tile() {
        const windowCount = this._windows.length;
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
        this._windows.forEach((windowElement, index) => {
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
            this.bringToFront(windowElement);
        });
    }

    minimizeAll() {
        this._windows.forEach(windowElement => {
            if (windowElement.classList.contains('minimized')) return;
            toggleMinimize(windowElement);
        });
    }

    // Rubber-band selection box
    _installSelection() {
        const selBox = document.createElement('div');
        selBox.id = 'desktop-select';
        document.body.appendChild(selBox);
        let selActive = false, selX, selY;

        document.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            if (e.target.closest('.window, .tasks, .menu, .start-button')) return;
            selActive = true;
            selX = e.clientX;
            selY = e.clientY;
            selBox.style.cssText = `left:${selX}px;top:${selY}px;width:0;height:0;display:block;`;
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!selActive) return;
            const x = Math.min(e.clientX, selX), y = Math.min(e.clientY, selY);
            const w = Math.abs(e.clientX - selX), h = Math.abs(e.clientY - selY);
            selBox.style.left = x + 'px';
            selBox.style.top = y + 'px';
            selBox.style.width = w + 'px';
            selBox.style.height = h + 'px';
            const r = selBox.getBoundingClientRect();
            this._windows.forEach(win => {
                const wr = win.getBoundingClientRect();
                win.classList.toggle('desktop-selected',
                    r.right > wr.left && r.left < wr.right &&
                    r.bottom > wr.top && r.top < wr.bottom);
            });
        });

        const endSelect = () => {
            if (!selActive) return;
            selActive = false;
            selBox.style.display = 'none';
            this._windows.forEach(win => win.classList.remove('desktop-selected'));
        };
        document.addEventListener('mouseup', endSelect);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') endSelect(); });
        window.addEventListener('blur', endSelect);
    }

    // Cascade windows after viewport resize or orientation change
    _installReflow() {
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.cascade(), 300);
        });
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.cascade(), 100);
        });
    }
}
