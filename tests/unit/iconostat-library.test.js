// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join, isAbsolute } from 'node:path';

const root = resolve(__dirname, '../..');
const lib = resolve(root, 'assets/iconostat');

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const read = (name) => readFileSync(join(lib, name), 'utf8');

describe('T06 pin: I02-AC-53 the library imports nothing outside assets/iconostat/', () => {
  const files = jsFiles(lib);

  it('I02-AC-53: finds the library files, fx/ included', () => {
    const rel = files.map((f) => relative(lib, f));
    expect(rel).toContain('index.js');
    expect(rel).toContain('desktop.js');
    expect(rel.some((r) => r.startsWith('fx/'))).toBe(true);
  });

  for (const file of files) {
    const name = relative(root, file);
    it(`I02-AC-53: ${name} has only relative, computed-free imports that stay inside assets/iconostat/`, () => {
      const src = stripComments(readFileSync(file, 'utf8'));
      const specs = [];
      const fromRe = /\b(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])([^'"]+)\1/g;
      const bareRe = /\bimport\s*(['"])([^'"]+)\1/g;
      const dynRe = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
      for (const re of [fromRe, bareRe, dynRe]) {
        let m;
        while ((m = re.exec(src))) specs.push(m[2]);
      }
      // a computed dynamic import: import( not followed by a plain string literal
      const dynAll = (src.match(/\bimport\s*\(/g) || []).length;
      const dynLiteral = (src.match(dynRe) || []).length;
      expect(dynAll, `${name}: computed import(...)`).toBe(dynLiteral);

      for (const spec of specs) {
        expect(spec.startsWith('./') || spec.startsWith('../'), `${name}: bare specifier ${spec}`).toBe(true);
        const target = resolve(dirname(file), spec);
        const rel = relative(lib, target);
        expect(!rel.startsWith('..') && !isAbsolute(rel), `${name}: ${spec} resolves outside assets/iconostat/`).toBe(true);
      }
    });
  }
});

describe('T06 pin: I02-AC-54 README.md documents the library', () => {
  const readme = read('README.md');
  const code = (n) => stripComments(read(n));

  it('I02-AC-54: documents every custom element the library defines', () => {
    const tags = [...code('index.js').matchAll(/customElements\.define\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(tags.sort()).toEqual(['iconostat-desktop', 'iconostat-menu', 'iconostat-taskbar', 'iconostat-window']);
    for (const t of tags) expect(readme, t).toContain(`<${t}>`);
  });

  it('I02-AC-54: documents every public method and accessor of the desktop class', () => {
    const src = code('desktop.js');
    const names = new Set();
    for (const m of src.matchAll(/^    (?:get |set )?([a-zA-Z][A-Za-z0-9]*)\s*\(/gm)) names.add(m[1]);
    names.delete('connectedCallback');
    names.delete('disconnectedCallback');
    expect([...names]).toEqual(expect.arrayContaining(['createWindow', 'cascade', 'tile', 'minimizeAll', 'getTop',
      'register', 'unregister', 'bringToFront', 'promoteTop', 'windows', 'zIndex', 'fxSuppressed',
      'registerTaskbar', 'taskbar']));
    for (const n of names) expect(readme, `desktop.${n}`).toContain('`' + n);
  });

  it('I02-AC-54: documents the window methods', () => {
    const src = code('window.js');
    for (const n of ['setContent', 'bringToFront', 'minimize', 'maximize', 'shade', 'close']) {
      expect(src, `window.${n} defined`).toMatch(new RegExp(`^    ${n}\\(`, 'm'));
      expect(readme, `window.${n}`).toContain('`' + n + '(');
    }
  });

  it('I02-AC-54: documents every iconostat-* event the library dispatches, seam events included', () => {
    const events = new Set();
    for (const f of ['desktop.js', 'window.js', 'menu.js', 'taskbar.js', 'index.js']) {
      for (const m of code(f).matchAll(/new CustomEvent\(\s*'(iconostat-[a-z-]+)'/g)) events.add(m[1]);
    }
    expect(events.has('iconostat-before-layout')).toBe(true);
    expect(events.has('iconostat-drag-start')).toBe(true);
    expect(events.has('iconostat-menu-open')).toBe(true);
    for (const e of events) expect(readme, e).toContain('`' + e + '`');
    for (const e of ['iconostat-content-loading', 'iconostat-content-loaded', 'iconostat-fx-done']) {
      expect(readme, e).toContain('`' + e + '`');
    }
  });

  it('I02-AC-54: documents the site responsibilities and the taskbar requirement', () => {
    expect(readme).toContain('### Site responsibilities');
    expect(readme).toContain('### Taskbar host requirement');
    expect(readme).toContain('`.start-button`');
    expect(readme).toContain('document.getElementById(\'tasks\')');
  });

  it('I02-AC-54: documents every --iconostat-* theming property the CSS declares or reads', () => {
    const css = read('iconostat.css');
    const props = new Set([...css.matchAll(/--iconostat-[a-z0-9-]+/g)].map((m) => m[0]));
    expect(props.size).toBeGreaterThan(10);
    expect(readme).toContain('## Theming');
    for (const p of props) expect(readme, p).toContain('`' + p + '`');
  });

  it('I02-AC-54: documents the build entry rule', () => {
    expect(readme).toContain('## Build / packaging');
    expect(readme).toMatch(/never at `assets\/iconostat\/index\.js` itself/);
  });
});
