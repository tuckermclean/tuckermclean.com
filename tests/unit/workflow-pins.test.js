// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(__dirname, '../../.github/workflows');
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
const workflows = Object.fromEntries(
  files.map((f) => [f, readFileSync(resolve(dir, f), 'utf8')]),
);

const USES_LINE = /^\s*(?:-\s+)?uses:\s*(.*?)\s*$/;
const PINNED = /^([^\s@]+)@([0-9a-f]{40})\s+#\s*v(\d+(?:\.\d+)*)$/;

// Check one `uses:` line. Returns { ok, action, major } or { ok: false }.
function checkUses(line) {
  const m = USES_LINE.exec(line);
  if (!m) return { ok: false };
  const p = PINNED.exec(m[1]);
  if (!p) return { ok: false };
  return { ok: true, action: p[1], major: p[3].split('.')[0] };
}

function usesLines(text) {
  return text
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => USES_LINE.test(line));
}

// Split the steps into chunks on list-item lines at the steps' indentation.
function steps(text) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^\s*steps:\s*$/.test(l));
  if (at < 0) return [];
  const first = lines.slice(at + 1).find((l) => /^\s*- /.test(l));
  const indent = /^(\s*)- /.exec(first)[1];
  const out = [];
  for (const l of lines.slice(at + 1)) {
    if (l.startsWith(indent + '- ')) out.push([l]);
    else if (out.length) out[out.length - 1].push(l);
  }
  return out.map((c) => c.join('\n'));
}

const EXPECTED = {
  'test.yml': {
    'actions/checkout': '4',
    'actions/setup-node': '4',
    'actions/upload-artifact': '4',
  },
  'deploy-to-s3.yml': {
    'actions/checkout': '4',
    'anchore/sbom-action': '0',
    'actions/upload-artifact': '7',
    'actions/setup-node': '4',
    'cloudflare/wrangler-action': '3',
    'actions/attest-build-provenance': '4',
  },
};

const SHA = 'a'.repeat(40);

describe('T07 workflow action pins', () => {
  it('T07-AC-1: both workflow files are present', () => {
    expect(files).toContain('test.yml');
    expect(files).toContain('deploy-to-s3.yml');
  });

  for (const [file, expected] of Object.entries(EXPECTED)) {
    it(`T07-AC-1: ${file} uses exactly the expected actions, at the expected majors`, () => {
      const found = {};
      for (const { line } of usesLines(workflows[file])) {
        const r = checkUses(line);
        if (r.ok) found[r.action] = r.major;
      }
      expect(found).toEqual(expected);
    });
  }

  for (const file of Object.keys(EXPECTED)) {
    it(`T07-AC-3: every uses: in ${file} is a 40-char SHA with a # v<version> comment`, () => {
      const lines = usesLines(workflows[file]);
      expect(lines.length).toBeGreaterThan(0);
      for (const { line, n } of lines) {
        expect(checkUses(line).ok, `${file}:${n}: ${line.trim()}`).toBe(true);
      }
    });
  }

  it('T07-AC-3: every uses: in every .yml/.yaml file in .github/workflows/ is pinned', () => {
    for (const file of files) {
      for (const { line, n } of usesLines(workflows[file])) {
        expect(checkUses(line).ok, `${file}:${n}: ${line.trim()}`).toBe(true);
      }
    }
  });

  it('T07-AC-3: the checker rejects tags, branches, short SHAs and a SHA without a comment', () => {
    for (const line of [
      '      - uses: actions/checkout@v4',
      '      uses: anchore/sbom-action@v0.24.0',
      '      uses: actions/checkout@main',
      '      uses: actions/checkout@' + SHA.slice(0, 7) + ' # v4',
      '      uses: actions/checkout@' + SHA,
    ]) {
      expect(checkUses(line).ok, line).toBe(false);
    }
  });

  it('T07-AC-3: the checker accepts a full SHA with a # v<version> comment', () => {
    const r = checkUses(`      uses: actions/checkout@${SHA} # v4.2.1`);
    expect(r).toEqual({ ok: true, action: 'actions/checkout', major: '4' });
    expect(checkUses(`      - uses: actions/checkout@${SHA} # v4`).ok).toBe(true);
  });

  for (const file of Object.keys(EXPECTED)) {
    it(`T07-AC-5: every actions/checkout step in ${file} sets persist-credentials: false`, () => {
      const checkouts = steps(workflows[file]).filter((s) =>
        /^\s*(?:- )?uses:\s*actions\/checkout@/m.test(s),
      );
      expect(checkouts.length).toBeGreaterThan(0);
      for (const s of checkouts) {
        expect(s, `${file}: ${s.split('\n')[0].trim()}`).toMatch(
          /^\s+with:\s*\n(?:\s+.*\n)*?\s+persist-credentials:\s*false\s*(?:#.*)?$/m,
        );
      }
    });

    it(`T07-AC-5: no step in ${file} runs a git command that needs the checkout's credentials`, () => {
      const re = /\bgit\s+(?:-\S+\s+)*(push|fetch|pull|clone|ls-remote|submodule)\b/;
      for (const s of steps(workflows[file])) {
        for (const l of s.split('\n')) {
          if (/^\s*#/.test(l)) continue;
          expect(re.test(l), `${file}: ${l.trim()}`).toBe(false);
        }
      }
    });
  }

  for (const [file, expected] of Object.entries(EXPECTED)) {
    it(`T07-AC-1: every uses: line in ${file} is an expected action at its expected major`, () => {
      const lines = usesLines(workflows[file]);
      expect(lines.length).toBeGreaterThan(0);
      for (const { line, n } of lines) {
        const r = checkUses(line);
        const where = `${file}:${n}: ${line.trim()}`;
        expect(r.ok, where).toBe(true);
        expect(Object.keys(expected), where).toContain(r.action);
        expect(r.major, where).toBe(expected[r.action]);
      }
    });
  }

  // The lines of a step's `with:` block: those after the `with:` line that are
  // indented deeper than it, up to the first non-blank line that is not.
  function withBlock(step) {
    const lines = step.split('\n');
    const at = lines.findIndex((l) => /^\s*with:\s*$/.test(l));
    if (at < 0) return [];
    const indent = /^(\s*)/.exec(lines[at])[1].length;
    const out = [];
    for (const l of lines.slice(at + 1)) {
      if (l.trim() === '') continue;
      if (/^(\s*)/.exec(l)[1].length <= indent) break;
      out.push(l);
    }
    return out;
  }

  for (const file of Object.keys(EXPECTED)) {
    it(`T07-AC-5: persist-credentials: false is inside the with: block of every actions/checkout step in ${file}`, () => {
      const checkouts = steps(workflows[file]).filter((s) =>
        /^\s*(?:- )?uses:\s*actions\/checkout@/m.test(s),
      );
      expect(checkouts.length).toBeGreaterThan(0);
      for (const s of checkouts) {
        const block = withBlock(s);
        expect(
          block.some((l) => /^\s*persist-credentials:\s*false\s*(?:#.*)?$/.test(l)),
          `${file}: ${s.split('\n')[0].trim()}`,
        ).toBe(true);
      }
    });
  }

  const GIT_NET = /\bgit\b.*\b(push|fetch|pull|clone|ls-remote|submodule)\b/;

  it('T07-AC-5: the git command regex matches git with options before the subcommand', () => {
    for (const l of ['git push', 'git -C . push origin HEAD', 'git -c k=v fetch']) {
      expect(GIT_NET.test(l), l).toBe(true);
    }
    expect(GIT_NET.test('hugo --minify')).toBe(false);
  });

  for (const file of Object.keys(EXPECTED)) {
    it(`T07-AC-5: no step in ${file} runs git push, fetch, pull, clone, ls-remote or submodule, with or without options`, () => {
      for (const s of steps(workflows[file])) {
        for (const l of s.split('\n')) {
          if (/^\s*#/.test(l)) continue;
          expect(GIT_NET.test(l), `${file}: ${l.trim()}`).toBe(false);
        }
      }
    });
  }
});
