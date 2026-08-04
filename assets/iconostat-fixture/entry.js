// Dev-only fixture bootstrap (see layouts/_default/iconostat-fixture.html).
// Not part of the Iconostat library; it only calls the library's public API.
// This must be a separate leaf module (not assets/iconostat/index.js itself)
// because Hugo's js.Build pipes the entry resource in as esbuild `stdin`,
// which is a distinct module identity from the same file reached via a real
// on-disk relative import. window.js legitimately imports back from
// `./index.js` (for getDesktop()); if index.js were the build entry, esbuild
// would bundle it twice (once as stdin, once as the disk-resolved import)
// and hit a temporal-dead-zone crash on customElements.define. Routing the
// entry through this file sidesteps the collision while still bundling only
// the library.
import { getDesktop } from '../iconostat/index.js';

const d = getDesktop();
const w = d.createWindow({ name: 'fixture', title: 'Fixture', icon: '🧪' });
w.setContent('<p id="fixture-body">standalone</p>');
w.bringToFront();
