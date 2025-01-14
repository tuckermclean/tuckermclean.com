import "@fontsource/noto-sans-mono";
import './style.css'
import { openPage, toggleMode, cascadeWindows, tileWindows, minimizeWindows } from './window.js'

// Remove class 'not-loaded' from html
document.documentElement.classList.remove('not-loaded')

window.openPage = openPage
window.toggleMode = toggleMode
window.cascadeWindows = cascadeWindows
window.tileWindows = tileWindows
window.minimizeWindows = minimizeWindows

window.intervals = {}
window.windowCleanup = {}
