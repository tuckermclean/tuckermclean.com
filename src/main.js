import "@fontsource/fira-code";
import "@fontsource/fira-sans";
import './style.css'
import { openPage, toggleMode, createWindow, cascadeWindows, tileWindows, minimizeWindows } from './window.js'
import { envVars } from './env.js'

envVars(false).then((ENV_VARS) => {
    // Replace the text in the page title with the name (using regex)
    const pageTitle = document.querySelector('head title');
    pageTitle.textContent = pageTitle.textContent.replace('Tucker McLean', ENV_VARS.NAME);
});

// Remove class 'not-loaded' from html
document.documentElement.classList.remove('not-loaded')

window.openPage = openPage
window.toggleMode = toggleMode
window.cascadeWindows = cascadeWindows
window.tileWindows = tileWindows
window.minimizeWindows = minimizeWindows
window.createWindow = createWindow

window.intervals = {}
window.windowCleanup = {}
