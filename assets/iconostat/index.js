import { IconostatDesktop } from './desktop.js';
import { IconostatWindow } from './window.js';

if (!customElements.get('iconostat-desktop')) {
    customElements.define('iconostat-desktop', IconostatDesktop);
}
if (!customElements.get('iconostat-window')) {
    customElements.define('iconostat-window', IconostatWindow);
}

export function getDesktop() { return document.querySelector('iconostat-desktop'); }
export { IconostatDesktop, IconostatWindow };
