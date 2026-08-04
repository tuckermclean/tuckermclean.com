import { getDesktop } from './index.js';

export class IconostatMenu extends HTMLElement {
  connectedCallback() {
    if (this._wired) return;
    this._wired = true;
    this.classList.add('menu');

    // Open on request (start button dispatches this; see taskbar/Task 2).
    document.addEventListener('iconostat-menu-open', e => {
      const { x, y, offset } = e.detail;
      if (this.classList.contains('active')) this.classList.remove('active');
      this._openAt(x, y, offset);
    });

    // Right-click context menu (suppressed inside a window body).
    document.addEventListener('contextmenu', e => {
      if (e.target.closest('.window-body')) return;
      e.preventDefault();
      if (this.classList.contains('active')) this.classList.remove('active');
      this._openAt(e.clientX, e.clientY, false);
    });

    // Close when clicking outside the menu / start button.
    document.addEventListener('click', e => {
      if (e.target.closest('.menu')) return;
      if (e.target.closest('.start-button')) return;
      this.classList.remove('active');
    });

    // Close when clicking a menu item.
    this.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', () => this.classList.remove('active'));
    });
  }

  // Mirrors the old toggleMenu(): toggle active, position, raise z-index.
  _openAt(x, y, offset = false) {
    this.classList.toggle('active');
    this.style.top = `${y}px`;
    if (offset) {
      this.style.left = `${x - this.offsetWidth}px`;
    } else {
      this.style.left = `${x}px`;
    }
    this.style.zIndex = getDesktop().zIndex + 1;
  }
}
