import "@fontsource/noto-sans-mono";
import './style.css'
import { openPage, toggleMode, cascadeWindows, tileWindows, minimizeWindows } from './window.js'
import { ENV_VARS } from './env.js'

// Remove class 'not-loaded' from html
document.documentElement.classList.remove('not-loaded')

window.openPage = openPage
window.toggleMode = toggleMode
window.cascadeWindows = cascadeWindows
window.tileWindows = tileWindows
window.minimizeWindows = minimizeWindows

window.intervals = {}
window.windowCleanup = {}

window.ENV_VARS = ENV_VARS