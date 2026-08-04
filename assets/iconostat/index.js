import { IconostatDesktop } from './desktop.js';

if (!customElements.get('iconostat-desktop')) {
    customElements.define('iconostat-desktop', IconostatDesktop);
}

export function getDesktop() { return document.querySelector('iconostat-desktop'); }
export { IconostatDesktop };
