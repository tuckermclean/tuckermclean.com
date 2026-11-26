// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const agentsPath = resolve(here, '../../AGENTS.md');

// Mirrors spec_line() of check-spec-diff.py: the code spans of the first
// **Spec files:** line in the "Building a node" section, or null.
function specLine(text) {
  let on = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      if (on) break;
      on = line.slice(3).trim().toLowerCase().startsWith('building a node');
      continue;
    }
    if (on && line.includes('**Spec files:**')) {
      return { line, spans: [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]) };
    }
  }
  return null;
}

describe('T08 spec-line finder on sample text', () => {
  it('T08-AC-2: ignores a Spec files line outside the Building a node section', () => {
    const text = [
      '# Doc',
      '- **Spec files:** `OUT.md`',
      '## Other',
      '- **Spec files:** `OTHER.md`',
      '## Building a node',
      '- nothing here',
      '## After',
      '- **Spec files:** `AFTER.md`',
    ].join('\n');
    expect(specLine(text)).toBeNull();
  });

  it('T08-AC-2: takes the first Spec files line inside the section', () => {
    const text = [
      '- **Spec files:** `OUT.md`',
      '## building a node (heading is case-insensitive)',
      '- **Spec files:** `A.md`, `b/`',
      '- **Spec files:** `C.md`',
      '## Next',
    ].join('\n');
    expect(specLine(text).spans).toEqual(['A.md', 'b/']);
  });

  it('T08-AC-2: finds none in a section that has no such line', () => {
    const text = '## Building a node\n- **Roles.** x\n## Next\n- **Spec files:** `Z.md`\n';
    expect(specLine(text)).toBeNull();
  });
});

describe('AGENTS.md Spec files line', () => {
  const found = specLine(readFileSync(agentsPath, 'utf8'));

  it('T08-AC-1: the line exists in the Building a node section', () => {
    expect(found).not.toBeNull();
  });

  it('T08-AC-1: code spans are exactly SPEC.md, docs/graph.yaml, nodes/, AGENTS.md in order', () => {
    expect(found && found.spans).toEqual(['SPEC.md', 'docs/graph.yaml', 'nodes/', 'AGENTS.md']);
  });

  it('T08-AC-1: the line ends with the unchanged note', () => {
    expect(found && found.line.endsWith(
      '(a trailing slash marks a folder); spec PRs change only these.',
    )).toBe(true);
  });
});
