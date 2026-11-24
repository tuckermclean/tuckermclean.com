// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(__dirname, '../../.github/workflows');
const file = readdirSync(dir).find((f) => /^deploy-to-.*\.ya?ml$/.test(f));
const text = readFileSync(resolve(dir, file), 'utf8');

// Split the workflow into steps on lines starting `    - name:`.
const steps = text.split(/^(?=    - name:)/m).slice(1);

const stepIndex = (re) => steps.findIndex((s) => re.test(s));
const stepWith = (re) => steps[stepIndex(re)];

describe('T03 pins (deploy workflow, kept by T05)', () => {
  it('T03-AC-2: installs Hugo extended 0.164.0 from the GitHub release and checks the SHA-256 checksums before the build', () => {
    expect(text).toMatch(/^\s+HUGO_VERSION: 0\.164\.0\s*$/m);
    const install = stepWith(/hugo_extended_\$\{HUGO_VERSION\}/);
    expect(install).toBeDefined();
    expect(install).toContain('https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}');
    expect(install).toMatch(/checksums\.txt/);
    expect(install).toMatch(/sha256sum -c/);
    expect(install).toMatch(/set -euo pipefail/);
    const build = stepIndex(/hugo --minify/);
    expect(build).toBeGreaterThan(-1);
    expect(stepIndex(/sha256sum -c/)).toBeGreaterThan(-1);
    expect(stepIndex(/sha256sum -c/)).toBeLessThan(build);
  });

  it('T03-AC-3: builds with hugo --minify and then lists the built files', () => {
    const build = stepIndex(/^\s+run: hugo --minify\s*$/m);
    const list = stepIndex(/^\s+run: find dist\s*$/m);
    expect(build).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(build);
  });

  it('T03-AC-4: generates, publishes and uploads the SPDX SBOM, each step with continue-on-error', () => {
    const gen = stepWith(/anchore\/sbom-action@/);
    expect(gen).toBeDefined();
    expect(gen).toMatch(/format: spdx-json/);
    expect(gen).toMatch(/path: \.\/dist/);
    expect(gen).toMatch(/^\s+continue-on-error: true\s*$/m);

    const pub = stepWith(/dist\/\.well-known\/sbom\.spdx\.json/);
    expect(pub).toBeDefined();
    expect(pub).toMatch(/-gt 10/);
    expect(pub).toMatch(/::warning::/);
    expect(pub).toMatch(/^\s+continue-on-error: true\s*$/m);

    const up = stepWith(/name: sbom-spdx/);
    expect(up).toBeDefined();
    expect(up).toMatch(/actions\/upload-artifact@/);
    expect(up).toMatch(/^\s+continue-on-error: true\s*$/m);

    const build = stepIndex(/hugo --minify/);
    expect(stepIndex(/anchore\/sbom-action@/)).toBeGreaterThan(build);
  });
});
