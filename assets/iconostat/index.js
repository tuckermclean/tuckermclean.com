import { IconostatDesktop } from './desktop.js';
import { IconostatWindow } from './window.js';
import { IconostatMenu } from './menu.js';
import { IconostatTaskbar } from './taskbar.js';

if (!customElements.get('iconostat-desktop')) {
    customElements.define('iconostat-desktop', IconostatDesktop);
}
if (!customElements.get('iconostat-window')) {
    customElements.define('iconostat-window', IconostatWindow);
}
if (!customElements.get('iconostat-menu')) customElements.define('iconostat-menu', IconostatMenu);
if (!customElements.get('iconostat-taskbar')) customElements.define('iconostat-taskbar', IconostatTaskbar);

export function getDesktop() { return document.querySelector('iconostat-desktop'); }
export { IconostatDesktop, IconostatWindow, IconostatMenu, IconostatTaskbar };
