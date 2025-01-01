import "@fontsource/noto-sans-mono";
import './style.css'
import { openPage, toggleMode, cascadeWindows, tileWindows, minimizeWindows } from './window.js'
import { v4 as uuidv4 } from 'uuid';

window.openPage = openPage
window.toggleMode = toggleMode
window.cascadeWindows = cascadeWindows
window.tileWindows = tileWindows
window.minimizeWindows = minimizeWindows
window.uuidv4 = uuidv4