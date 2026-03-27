import { openPage, goTo, toggleMode, createWindow, cascadeWindows, tileWindows, minimizeWindows } from './window.js'
import { envVars } from './env.js'

envVars(false).then((ENV_VARS) => {
    // Replace the text in the page title with the name (using regex)
    const pageTitle = document.querySelector('head title');
    pageTitle.textContent = pageTitle.textContent.replace('Tucker McLean', ENV_VARS.NAME);
});

// Remove class 'not-loaded' from html
document.documentElement.classList.remove('not-loaded')

window.openPage = openPage
window.goTo = goTo
window.toggleMode = toggleMode
window.cascadeWindows = cascadeWindows
window.tileWindows = tileWindows
window.minimizeWindows = minimizeWindows
window.createWindow = createWindow

window.intervals = {};
window.windowCleanup = {};

// Idle status bar messages
(function() {
    const msgs = [
        'Status: It is now safe to turn off your computer.',
        'Status: General Protection Fault. Just kidding.',
        'Status: Press F1 for help. Press F2 to be confused.',
        'Status: Insert disk 2 of 47 to continue.',
        "Status: Error 418: I'm a teapot.",
        'Status: Have you tried turning it off and on again?',
        'Status: Searching for intelligent life... still searching...',
    ];
    let idleTimer;
    function resetIdle() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            const bar = document.querySelector('.window.front .window-status-bar');
            if (!bar) return;
            const msg = msgs[Math.floor(Math.random() * msgs.length)];
            bar.textContent = msg;
            setTimeout(() => { if (bar.textContent === msg) bar.textContent = 'Status: Ready to work!'; }, 8000);
        }, 45000);
    }
    ['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev =>
        document.addEventListener(ev, resetIdle, { passive: true })
    );
    resetIdle();
})();
