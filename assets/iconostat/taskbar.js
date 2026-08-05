import { getDesktop } from './index.js';

// <iconostat-taskbar> — the host for minimized <iconostat-window> elements
// and the start button. Registers itself with <iconostat-desktop> so
// IconostatWindow.minimize()/reset() can relocate windows into it without
// depending on a hardcoded #tasks id.
export class IconostatTaskbar extends HTMLElement {
    connectedCallback() {
        if (this._wired) return;
        this._wired = true;
        this.classList.add('tasks');
        getDesktop().registerTaskbar(this);
        const startButton = this.querySelector('.start-button');
        if (startButton) {
            startButton.addEventListener('click', () => {
                const r = startButton.getBoundingClientRect();
                document.dispatchEvent(new CustomEvent('iconostat-menu-open', {
                    detail: { x: r.left + startButton.offsetWidth / 2, y: r.top, offset: true }
                }));
            });
        }
    }
}
