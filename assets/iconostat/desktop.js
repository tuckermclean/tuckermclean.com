import { pickTopIndex } from './geometry.js';

// Owns the window registry, z-order, focus/.front handling, rubber-band
// selection, and resize->cascade reflow. Windows are <iconostat-window>
// elements, created by this.createWindow() and appended to document.body
// (not to this element — <iconostat-desktop> is `display:contents`, and
// existing e2e assertions use the `body > #window-X` child combinator).
// Windows are not DOM descendants of <iconostat-desktop>, so coordination
// happens via `iconostat-*` CustomEvents observed at the document level,
// not via listeners on `this`.
export class IconostatDesktop extends HTMLElement {
    connectedCallback() {
        this._windows = this._windows || [];
        this._z = this._z || 100; // Starting point for z-index values
        this._suppressHistory = this._suppressHistory || false;
        this._installSelection();
        this._installReflow();
        this._loadingCount = this._loadingCount || 0;
        this._installSpinner();
        document.addEventListener('iconostat-content-loading', () => this._loadingStart());
        document.addEventListener('iconostat-content-loaded',  () => this._loadingEnd());

        document.addEventListener('iconostat-focus',    e => this.bringToFront(e.target));
        document.addEventListener('iconostat-close',    e => this.unregister(e.target));
        document.addEventListener('iconostat-minimize', () => this.promoteTop());
        document.addEventListener('iconostat-maximize', () => this.promoteTop());
        // iconostat-shade: no desktop action (old toggleShade never called promoteTop)
    }

    get windows() { return this._windows; }

    get zIndex() { return this._z; }

    // True during cascade()/tile()/reflow (i.e. whenever history/focus
    // announcements are suppressed) -- exposed so the fx layer never needs to
    // poke the private `_suppressHistory` field directly.
    get fxSuppressed() { return this._suppressHistory; }

    registerTaskbar(el) { this._taskbar = el; }

    get taskbar() { return this._taskbar || document.getElementById('tasks'); }

    // Build an <iconostat-window>, append it to document.body, and register
    // it with the desktop. Returns the element; callers (site glue) still
    // set its content.
    createWindow({ name, title, icon = '⚙️', classes = [] }) {
        const el = document.createElement('iconostat-window');
        el.classList.add('building');          // hidden until positioned (double-buffer)
        el.name = name;
        el.windowTitle = title;
        el.icon = icon;
        classes.forEach(c => el.classList.add(c));
        document.body.appendChild(el);
        this.register(el);
        el.reset(true, false);                 // build DOM + bake geometry (still measurable while hidden)
        el.classList.remove('building');       // reveal, now correctly positioned
        return el;
    }

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
            }
        }
        // Announce the outcome for the site-side router to translate into
        // history transitions. Emitted unconditionally, after the
        // not-minimized branch (which itself emits 'iconostat-focused' via
        // bringToFront) so the router sees both the focus and the promotion
        // outcome without double-handling the not-minimized case here.
        const top = this.getTop();
        if (!this._suppressHistory) {
            document.dispatchEvent(new CustomEvent('iconostat-promoted', { detail: {
                empty: top === undefined,
                minimized: top ? top.classList.contains('minimized') : false,
            } }));
        }
    }

    bringToFront(windowElement, changeHash = true) {
        if (typeof(windowElement) === 'undefined') return;
        // If window is already visible and up front, stop function
        if (windowElement.classList.contains('front')) return;
        // If window is minimized, un-minimize it
        if (windowElement.classList.contains('minimized')) {
            windowElement.minimize(false, { userGesture: false });
        }
        this._z++; // Increment global counter
        windowElement.style.zIndex = this._z; // Assign new z-index to the element
        // Remove 'front' class from all windows
        this._windows.forEach(w => w.classList.remove('front'));
        // Add 'front' class to the clicked window
        windowElement.classList.add('front');
        if (changeHash && !this._suppressHistory) {
            // Announce focus for the site-side router to translate into a
            // history transition. The library itself performs no browser
            // history calls; changeHash=false (image-zoom windows, initial
            // load) suppresses this announcement, preserving the old
            // suppression behavior. _suppressHistory additionally silences
            // this during bulk layout ops (cascade/tile) so a viewport
            // resize or Cascade/Tile command never pollutes browser
            // history -- see cascade()/tile().
            document.dispatchEvent(new CustomEvent('iconostat-focused', { detail: { name: windowElement.name } }));
        }
    }

    cascade({ keepMinimized = false } = {}) {
        // Cascade is a layout operation, not a navigation: bringing every
        // window to front must not push a browser history entry per
        // window. Suppress iconostat-focused/iconostat-promoted for the
        // duration (see bringToFront()/promoteTop()).
        this._suppressHistory = true;
        try {
            this._windows.forEach((windowElement, i) => {
                const isMinimized = windowElement.classList.contains('minimized');
                // The automatic reflow cascade (resize/orientationchange)
                // passes keepMinimized so it never disturbs a window the
                // user deliberately minimized -- leave it alone entirely.
                // The explicit "Cascade Windows" menu command omits the
                // option and still un-minimizes everything, as intended.
                if (keepMinimized && isMinimized) {
                    return;
                }
                // If window is minimized, un-minimize it
                if (isMinimized) {
                    windowElement.minimize(false, { userGesture: false });
                }
                windowElement.reset();
                this.bringToFront(windowElement);
            });
        } finally {
            this._suppressHistory = false;
        }
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

        // Tile is a layout operation, not a navigation: bringing every
        // window to front must not push a browser history entry per
        // window. Suppress iconostat-focused/iconostat-promoted for the
        // duration (see bringToFront()/promoteTop()).
        this._suppressHistory = true;
        try {
            // Position each window in the grid
            this._windows.forEach((windowElement, index) => {
                // If window is minimized, un-minimize it
                if (windowElement.classList.contains('minimized')) {
                    windowElement.minimize(false, { userGesture: false });
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
        } finally {
            this._suppressHistory = false;
        }
    }

    minimizeAll() {
        this._windows.forEach(windowElement => {
            if (windowElement.classList.contains('minimized')) return;
            windowElement.minimize();
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

    // Floating loading spinner. The IMAGE is site-supplied via
    // --iconostat-spinner-image (the library ships no image); if unset the
    // spinner renders nothing. Follows the cursor on fine-pointer devices,
    // centers on touch. Shown while >=1 content load is in flight.
    _installSpinner() {
        const spinner = document.createElement('div');
        spinner.className = 'iconostat-spinner';
        const eye = document.createElement('div');
        eye.className = 'iconostat-spinner-eye';
        spinner.appendChild(eye);
        document.body.appendChild(spinner);
        this._spinner = spinner;
        if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
            document.addEventListener('mousemove', e => {
                spinner.style.left = `${e.clientX}px`;
                spinner.style.top = `${e.clientY}px`;
            });
        } else {
            spinner.classList.add('centered');
        }
    }

    _loadingStart() {
        this._loadingCount++;
        this._spinner.classList.add('active');
        document.body.classList.add('iconostat-loading');
    }

    _loadingEnd() {
        this._loadingCount = Math.max(0, this._loadingCount - 1);
        if (this._loadingCount === 0) {
            this._spinner.classList.remove('active');
            document.body.classList.remove('iconostat-loading');
        }
    }

    // Cascade windows after viewport resize or orientation change
    _installReflow() {
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.cascade({ keepMinimized: true }), 300);
        });
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.cascade({ keepMinimized: true }), 100);
        });
    }
}
