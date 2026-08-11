import { getDesktop } from './index.js';

// <iconostat-window> — a draggable/resizable/minimizable/maximizable/shadeable
// window. Builds its own light DOM (matching the old #window-template markup
// exactly, so existing CSS selectors keep matching) and owns drag, resize,
// minimize, maximize, shade, and geometry state.
//
// Coordination with <iconostat-desktop> (z-order, focus, registry) happens
// exclusively through bubbling `iconostat-*` CustomEvents — this file must
// never import or call site code (assets/js/*).
export class IconostatWindow extends HTMLElement {
    connectedCallback() {
        if (this._built) return;
        this._built = true;

        this.classList.add('window');
        this.innerHTML = `
            <div class="window-header">
                <div class="buttons">
                    <div class="button close" aria-label="Close"></div>
                    <div class="button minimize" aria-label="Minimize"></div>
                    <div class="button maximize" aria-label="Maximize"></div>
                </div>
                <div class="title">
                    <span class="window-icon">⚙️</span>
                    <span class="window-title">Window</span>
                </div>
            </div>
            <div class="window-body"></div>
            <div class="window-status-bar">Status: Ready to work!</div>
            <div class="grippy"></div>
        `;

        // Re-apply any values set on the element before it was connected
        // (e.g. `el.icon = icon; el.windowTitle = title;` in
        // IconostatDesktop.createWindow(), which runs before appendChild).
        if (this._icon !== undefined) this.icon = this._icon;
        if (this._title !== undefined) this.windowTitle = this._title;

        this._wireEvents();
    }

    // -- Attribute-backed properties -----------------------------------

    get name() { return this._name; }
    set name(value) {
        this._name = value;
        this.id = `window-${value}`;
    }

    get windowTitle() { return this._title; }
    set windowTitle(value) {
        this._title = value;
        this.setAttribute('aria-label', value);
        const span = this.querySelector('.window-title');
        if (span) span.textContent = value;
    }

    get icon() { return this._icon; }
    set icon(value) {
        this._icon = value;
        const span = this.querySelector('.window-icon');
        if (span) span.textContent = value;
    }

    // -- Content ----------------------------------------------------------

    setContent(html) {
        const body = this.querySelector('.window-body');
        if (body) body.innerHTML = html;
    }

    // -- Public API (standalone use; mirrors user-interaction effects) ----

    // `userGesture` (default false = programmatic) is threaded through to
    // `iconostat-focus`'s detail so `desktop.bringToFront()` can pass it on
    // to the `minimize(false, { userGesture })` call it makes when the
    // target is minimized -- see `_wireEvents` (direct mousedown/touchstart
    // pass true) and `desktop.js` (the `iconostat-focus` listener). Every
    // other caller here (reset(), the internal call inside minimize()
    // itself) omits the argument and stays programmatic, matching prior
    // behavior exactly.
    bringToFront(userGesture = false) {
        this.dispatchEvent(new CustomEvent('iconostat-focus', { bubbles: true, detail: { name: this.name, userGesture } }));
    }

    // `opts.silent` skips the cancelable before-event (used by the fx canceler
    // to re-invoke the real op after having already preventDefault()ed once --
    // without this, that re-invocation would dispatch a second before-event
    // and loop forever). `opts.userGesture`, when provided, overrides the
    // default userGesture computation below (used by internal callers --
    // bringToFront/cascade/tile -- that un-minimize/un-maximize
    // programmatically and must report userGesture:false regardless of
    // `_suppressHistory`'s current value at the call site).
    minimize(force = undefined, opts = {}) {
        // Captured before any mutation so the before-event (and the branch
        // below) see the exact same "entering vs restoring" outcome the
        // un-refactored if/else-if pair would have computed.
        const entering = !this.classList.contains('minimized') || (typeof(force) === 'boolean' && force === true);
        const userGesture = opts.userGesture !== undefined ? opts.userGesture : !getDesktop()._suppressHistory;
        if (!opts.silent) {
            const beforeEvent = new CustomEvent('iconostat-before-minimize', {
                cancelable: true,
                detail: { name: this.name, el: this, entering, userGesture },
            });
            document.dispatchEvent(beforeEvent);
            if (beforeEvent.defaultPrevented) return;
        }
        if (entering) {
            this.saveWindowState();
            this.reset(false, false);
            this.classList.add('minimized');
            this.classList.remove('front');
            document.body.removeChild(this);
            getDesktop().taskbar.appendChild(this);
        } else if (this.classList.contains('minimized') || (typeof(force) === 'boolean' && force === false)) {
            this.restoreWindowState();
            this.clearWindowState();
            this.classList.remove('minimized');
            getDesktop().taskbar.removeChild(document.getElementById(this.id));
            document.body.appendChild(this);
            this.bringToFront();
        }
        this.dispatchEvent(new CustomEvent('iconostat-minimize', { bubbles: true, detail: { name: this.name } }));
    }

    maximize(force = undefined, opts = {}) {
        const entering = !this.classList.contains('maximized') || (typeof(force) === 'boolean' && force === true);
        const userGesture = opts.userGesture !== undefined ? opts.userGesture : !getDesktop()._suppressHistory;
        if (!opts.silent) {
            const beforeEvent = new CustomEvent('iconostat-before-maximize', {
                cancelable: true,
                detail: { name: this.name, el: this, entering, userGesture },
            });
            document.dispatchEvent(beforeEvent);
            if (beforeEvent.defaultPrevented) return;
        }
        if (entering) {
            this.saveWindowState();
            this.classList.add('maximized');
        } else if (this.classList.contains('maximized') || (typeof(force) === 'boolean' && force === false)) {
            this.restoreWindowState();
            this.clearWindowState();
            this.classList.remove('maximized');
        }
        this.dispatchEvent(new CustomEvent('iconostat-maximize', { bubbles: true, detail: { name: this.name } }));
    }

    shade(force = undefined) {
        this._toggleShade(undefined, force);
    }

    close() {
        this.dispatchEvent(new CustomEvent('iconostat-close', { bubbles: true, detail: { name: this.name } }));
    }

    // -- Geometry / state (moved verbatim from assets/js/window.js) -------

    reset(bake = true, bringToFront_ = true) {
        this.style.width = '';
        this.style.height = '';
        this.style.top = '';
        this.style.left = '';
        this.style.zIndex = '';
        if (this.classList.contains('minimized')) {
            getDesktop().taskbar.removeChild(document.getElementById(this.id));
            document.body.appendChild(this);
        }
        this.classList.remove('maximized');
        this.classList.remove('minimized');
        this.classList.remove('shaded');
        if (bake) {
            if (window.innerWidth > 768) {
                this.style.maxWidth = '1024px';
                this.style.maxHeight = '768px';
            }
            this.bake();
            this.style.maxHeight = '';
            this.style.maxWidth = '';
        }
        // Bring to front
        if (bringToFront_) {
            this.bringToFront();
        }
        getDesktop().promoteTop();
    }

    bake() {
        // Get window's ordinal position
        const index = getDesktop().windows.indexOf(this);
        let offset = (this.querySelector('.window-header').getBoundingClientRect().height * index) + 1;
        // If on mobile, only offset by half the address bar height, and shrink the width by that amount
        if (window.innerWidth <= 768) {
            offset = offset / 2;
            this.style.width = `${this.offsetWidth - offset}px `;
        } else {
            this.style.width = `${this.offsetWidth}px`;
        }
        this.style.top = `${this.offsetTop + offset}px`;
        this.style.left = `${this.offsetLeft + offset}px`;
        this.style.height = `${this.offsetHeight}px`;

        // Save window state
        this.saveWindowState();
    }

    saveWindowState() {
        this.lastWidth = this.style.width;
        this.lastHeight = this.style.height;
        this.lastTop = this.style.top;
        this.lastLeft = this.style.left;
        this.lastZIndex = this.style.zIndex;
        this.maximized = this.classList.contains('maximized');
        this.minimized = this.classList.contains('minimized');
        this.shaded = this.classList.contains('shaded');
    }

    clearWindowState() {
        this.lastWidth = undefined;
        this.lastHeight = undefined;
        this.lastTop = undefined;
        this.lastLeft = undefined;
        this.lastZIndex = undefined;
        this.maximized = undefined;
        this.minimized = undefined;
        this.shaded = undefined;
    }

    windowHasState() {
        return typeof(this.lastWidth) !== 'undefined' &&
        typeof(this.lastHeight) !== 'undefined' &&
        typeof(this.lastTop) !== 'undefined' &&
        typeof(this.lastLeft) !== 'undefined' &&
        typeof(this.lastZIndex) !== 'undefined' &&
        typeof(this.maximized) !== 'undefined' &&
        typeof(this.minimized) !== 'undefined' &&
        typeof(this.shaded) !== 'undefined';
    }

    restoreWindowState() {
        if (this.windowHasState()) {
            this.style.width = this.lastWidth;
            this.style.height = this.lastHeight;
            this.style.top = this.lastTop;
            this.style.left = this.lastLeft;
            this.style.zIndex = this.lastZIndex;
            if (this.maximized) { this.classList.add('maximized') } else { this.classList.remove('maximized') };
            if (this.minimized) { this.classList.add('minimized') } else { this.classList.remove('minimized') };
            if (this.shaded) { this.classList.add('shaded') } else { this.classList.remove('shaded') };
        } else {
            console.error('Window state is not saved.');
        }
    }

    // -- Internal event handlers (moved verbatim, `windowElement` -> `this`) --

    _toggleShade(e, force = undefined) {
        // Guard is live: `e instanceof Event` correctly detects a real dblclick
        // event (as opposed to the programmatic `_toggleShade(undefined, force)`
        // call above), so header-button clicks and minimized windows are
        // excluded from shading, and the dblclick's default action is prevented.
        if (e instanceof Event) {
            if (e.target.closest('.button')) return; // Prevent shading when clicking buttons
            if (this.classList.contains('minimized')) return; // Prevent shading when minimized
            e.preventDefault();
        }

        let topDistance = this.getBoundingClientRect().top;
        if (!this.classList.contains('shaded') || (typeof(force) === 'boolean' && force === true)) {
            this.saveWindowState();
            let headerHeight = this.querySelector('.window-header').getBoundingClientRect().height;
            this.style.top = `${topDistance + headerHeight / 2}px`;
            this.classList.add('shaded');
        } else if (this.classList.contains('shaded') || (typeof(force) === 'boolean' && force === false)) {
            this.classList.remove('shaded');
            this.restoreWindowState();
        }
        this.dispatchEvent(new CustomEvent('iconostat-shade', { bubbles: true, detail: { name: this.name } }));
    }

    // Restoring a minimized chip is now owned entirely by the
    // mousedown/touchstart -> bringToFront(true) handlers in `_wireEvents`
    // (they thread userGesture:true through to the library's `minimize()`
    // call for the desktop to make, so the fx controller sees exactly one
    // userGesture:true `iconostat-before-minimize` per chip tap -- see the
    // fx design spec's `userGesture` contract). This handler no longer
    // restores; its only remaining job is to preventDefault() a minimized
    // chip's `touchstart` so the browser doesn't synthesize a trailing
    // mousedown/click afterward, which would otherwise fire
    // bringToFront(true) (and thus the restore) a SECOND time. By the time
    // the `click` listener below runs, the mousedown-triggered restore has
    // already un-minimized the element (synchronously at Tier 0, or via the
    // fx controller's own microtask at Tier 1+ -- either way strictly before
    // `click`, a separate later task), so this is a harmless no-op there;
    // kept wired on both events for symmetry rather than special-casing.
    _suppressMinimizedChipDefault(e) {
        if (e.target.closest('.button')) return; // Don't interfere with header-button clicks
        if (this.classList.contains('minimized')) {
            e.preventDefault();
        }
    }

    _startDrag(e) {
        if (e.target.closest('.button')) return; // Prevent dragging when clicking buttons
        if (e.target.closest('.minimized')) return; // Prevent dragging when minimized
        e.preventDefault();

        const windowElement = this;
        const isTouch = e.type === 'touchstart';
        const startX = isTouch ? e.touches[0].clientX : e.clientX;
        const startY = isTouch ? e.touches[0].clientY : e.clientY;
        const offsetX = startX - windowElement.offsetLeft;
        const offsetY = startY - windowElement.offsetTop;

        document.dispatchEvent(new CustomEvent('iconostat-drag-start', {
            detail: { name: windowElement.name, el: windowElement, x: startX, y: startY },
        }));

        function onMove(event) {
            const clientX = isTouch ? event.touches[0].clientX : event.clientX;
            const clientY = isTouch ? event.touches[0].clientY : event.clientY;

            if (!windowElement.classList.contains('minimized')) {
                if (clientY > windowElement.querySelector('.window-header').getBoundingClientRect().height / 2) {
                    windowElement.style.top = `${clientY - offsetY}px`;
                }
                windowElement.style.left = `${clientX - offsetX}px`;
            }
            document.dispatchEvent(new CustomEvent('iconostat-drag-move', {
                detail: {
                    name: windowElement.name,
                    el: windowElement,
                    x: clientX,
                    y: clientY,
                    left: windowElement.offsetLeft,
                    top: windowElement.offsetTop,
                },
            }));
        }

        function stopDrag() {
            document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
            document.removeEventListener(isTouch ? 'touchend' : 'mouseup', stopDrag);
            document.dispatchEvent(new CustomEvent('iconostat-drag-end', {
                detail: { name: windowElement.name, el: windowElement },
            }));
        }

        document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
        document.addEventListener(isTouch ? 'touchend' : 'mouseup', stopDrag);
    }

    _startResize(e) {
        e.preventDefault();
        const windowElement = this;
        const isTouch = e.type === 'touchstart';
        const startWidth = windowElement.offsetWidth;
        const startHeight = windowElement.offsetHeight;
        const startX = isTouch ? e.touches[0].clientX : e.clientX;
        const startY = isTouch ? e.touches[0].clientY : e.clientY;

        document.dispatchEvent(new CustomEvent('iconostat-resize-start', {
            detail: { name: windowElement.name, el: windowElement, x: startX, y: startY },
        }));

        function onResize(event) {
            const clientX = isTouch ? event.touches[0].clientX : event.clientX;
            const clientY = isTouch ? event.touches[0].clientY : event.clientY;

            windowElement.style.width = `${startWidth + (clientX - startX)}px`;
            windowElement.style.height = `${startHeight + (clientY - startY)}px`;

            document.dispatchEvent(new CustomEvent('iconostat-resize-move', {
                detail: {
                    name: windowElement.name,
                    el: windowElement,
                    x: clientX,
                    y: clientY,
                    width: windowElement.offsetWidth,
                    height: windowElement.offsetHeight,
                },
            }));
        }

        function stopResize() {
            document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onResize);
            document.removeEventListener(isTouch ? 'touchend' : 'mouseup', stopResize);
            document.dispatchEvent(new CustomEvent('iconostat-resize-end', {
                detail: { name: windowElement.name, el: windowElement },
            }));
        }

        document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onResize, { passive: false });
        document.addEventListener(isTouch ? 'touchend' : 'mouseup', stopResize);
    }

    _wireEvents() {
        const header = this.querySelector('.window-header');
        const closeBtn = this.querySelector('.close');
        const minimizeBtn = this.querySelector('.minimize');
        const maximizeBtn = this.querySelector('.maximize');
        const grippy = this.querySelector('.grippy');

        // Focus-worthy interaction -> desktop coordinates z-order/focus.
        // A direct mousedown/touchstart on the window (or its minimized
        // taskbar chip -- the chip IS this element, reparented) is a genuine
        // user pointer gesture, so this is the one true owner of a chip-tap
        // restore; pass userGesture:true through bringToFront() so the
        // desktop's un-minimize reports it accurately (see bringToFront()
        // above and desktop.js's `iconostat-focus` listener).
        this.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'A') return; // If clicking on a link, don't bring window to front
            this.bringToFront(true);
        });
        this.addEventListener('touchstart', (e) => {
            if (e.target.tagName === 'A') return;
            this.bringToFront(true);
        });
        this.addEventListener('click', (e) => this._suppressMinimizedChipDefault(e));
        this.addEventListener('touchstart', (e) => this._suppressMinimizedChipDefault(e), { passive: false });
        closeBtn.addEventListener('click', () => this.close());
        header.addEventListener('dblclick', (e) => this._toggleShade(e));
        minimizeBtn.addEventListener('click', () => this.minimize());
        maximizeBtn.addEventListener('click', () => this.maximize());
        header.addEventListener('mousedown', (e) => this._startDrag(e));
        header.addEventListener('touchstart', (e) => this._startDrag(e), { passive: false });
        grippy.addEventListener('mousedown', (e) => this._startResize(e));
        grippy.addEventListener('touchstart', (e) => this._startResize(e), { passive: false });
    }
}
