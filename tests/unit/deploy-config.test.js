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

// ---- T05: Cloudflare Workers configuration (read lazily, so a missing file fails its case only) ----
const root = resolve(__dirname, '../../');
const readRoot = (p) => readFileSync(resolve(root, p), 'utf8');

// Strip // and /* */ comments outside strings, then parse.
const parseJsonc = (src) => {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
};

describe('T05 wrangler config and redirects', () => {
  it('T05-AC-1: wrangler.jsonc names a Worker with a compatibility_date', () => {
    const cfg = parseJsonc(readRoot('wrangler.jsonc'));
    expect(typeof cfg.name).toBe('string');
    expect(cfg.name.length).toBeGreaterThan(0);
    expect(cfg.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('T05-AC-1: wrangler.jsonc serves ./dist with html_handling none and not_found_handling 404-page', () => {
    const cfg = parseJsonc(readRoot('wrangler.jsonc'));
    expect(cfg.assets).toBeDefined();
    expect(['./dist', 'dist', './dist/']).toContain(cfg.assets.directory);
    expect(cfg.assets.html_handling).toBe('none');
    expect(cfg.assets.not_found_handling).toBe('404-page');
  });

  it('T05-AC-1: wrangler.jsonc declares no routes or custom domain', () => {
    const cfg = parseJsonc(readRoot('wrangler.jsonc'));
    expect(cfg).not.toHaveProperty('routes');
    expect(cfg).not.toHaveProperty('route');
    expect(cfg).not.toHaveProperty('custom_domain');
    expect(JSON.stringify(cfg)).not.toMatch(/custom_domain/);
  });

  it('T05-AC-1: static/_redirects holds the rule "/ /index.html 200"', () => {
    const rules = readRoot('static/_redirects')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(rules.some((l) => l.split(/\s+/).join(' ') === '/ /index.html 200')).toBe(true);
  });

  it('T05-AC-1: static/_redirects has no placeholder (:name) or splat (*) rule', () => {
    const rules = readRoot('static/_redirects')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r).not.toMatch(/:[A-Za-z_]/);
      expect(r).not.toContain('*');
    }
  });
});

describe('T05 deploy workflow (Cloudflare)', () => {
  const wf = () => {
    const t = readRoot('.github/workflows/deploy-to-s3.yml');
    return { t, st: t.split(/^(?=    - name:)/m).slice(1) };
  };
  const idx = (st, re) => st.findIndex((s) => re.test(s));

  it('T05-AC-2: runs on pushes to main (not master) and on workflow_dispatch', () => {
    const { t } = wf();
    const on = t.slice(t.indexOf('\non:'), t.indexOf('\njobs:'));
    expect(on).toMatch(/push:/);
    expect(on).toMatch(/^\s+-\s*main\b/m);
    expect(on).not.toMatch(/^\s+-\s*master\b/m);
    expect(on).toMatch(/workflow_dispatch:/);
  });

  it('T05-AC-2: deploys with cloudflare/wrangler-action@v3, command deploy, token and account from secrets', () => {
    const { st } = wf();
    const i = idx(st, /uses:\s*cloudflare\/wrangler-action@[0-9a-f]{40}\s+#\s*v3(?:\.\d+\.\d+)?\s*$/m);
    expect(i).toBeGreaterThan(-1);
    expect(st[i]).toMatch(/^\s+command:\s*deploy\s*$/m);
    expect(st[i]).toMatch(/^\s+apiToken:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}\s*$/m);
    expect(st[i]).toMatch(/^\s+accountId:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}\s*$/m);
  });

  it('T05-AC-2: has no AWS credentials step, no aws s3 sync, no AWS_* or S3_BUCKET_NAME secret', () => {
    const { t } = wf();
    expect(t).not.toContain('aws-actions/configure-aws-credentials');
    expect(t).not.toMatch(/aws s3 sync/);
    expect(t).not.toMatch(/secrets\.AWS_/);
    expect(t).not.toContain('S3_BUCKET_NAME');
  });

  it('T05-AC-3: keeps the Hugo install, build, listing and SBOM steps in order, then the deploy, then the attestation steps', () => {
    const { st } = wf();
    const install = idx(st, /hugo_extended_\$\{HUGO_VERSION\}/);
    const sha = idx(st, /sha256sum -c/);
    const build = idx(st, /^\s+run: hugo --minify\s*$/m);
    const list = idx(st, /^\s+run: find dist\s*$/m);
    const gen = idx(st, /anchore\/sbom-action@/);
    const pub = idx(st, /dist\/\.well-known\/sbom\.spdx\.json/);
    const up = idx(st, /name: sbom-spdx/);
    const deploy = idx(st, /uses:\s*cloudflare\/wrangler-action@[0-9a-f]{40}\s+#\s*v3(?:\.\d+\.\d+)?\s*$/m);
    const pack = idx(st, /tar -czf dist\.tgz/);
    const attest = idx(st, /actions\/attest-build-provenance@/);
    const site = idx(st, /name: site-dist/);
    const order = [install, sha, build, list, gen, pub, up, deploy, pack, attest, site];
    for (const n of order) expect(n).toBeGreaterThan(-1);
    expect(install).toBeLessThanOrEqual(sha);
    for (let k = 1; k < order.length; k++) {
      if (order[k - 1] === install && order[k] === sha) continue;
      expect(order[k]).toBeGreaterThan(order[k - 1]);
    }
    for (const n of [gen, pub, up]) expect(st[n]).toMatch(/^\s+continue-on-error: true\s*$/m);
  });

  it('T05-AC-3: permissions stay contents: read, id-token: write, attestations: write', () => {
    const { t } = wf();
    const perm = t.slice(t.indexOf('    permissions:'), t.indexOf('    steps:'));
    expect(perm).toMatch(/^\s+contents:\s*read\s*$/m);
    expect(perm).toMatch(/^\s+id-token:\s*write\s*$/m);
    expect(perm).toMatch(/^\s+attestations:\s*write\s*$/m);
  });
});

describe('T05 deploy workflow pins a Wrangler that reads wrangler.jsonc', () => {
  const wf2 = () => {
    const t = readRoot('.github/workflows/deploy-to-s3.yml');
    return t.split(/^(?=    - name:)/m).slice(1);
  };

  it('T05-AC-2: the deploy step pins wranglerVersion to an exact version >= 3.91.0, which reads wrangler.jsonc', () => {
    const st = wf2();
    const i = st.findIndex((s) => /uses:\s*cloudflare\/wrangler-action@[0-9a-f]{40}\s+#\s*v3(?:\.\d+\.\d+)?\s*$/m.test(s));
    expect(i).toBeGreaterThan(-1);
    const m = st[i].match(/^\s+wranglerVersion:\s*["']?(\d+)\.(\d+)\.(\d+)["']?\s*(#.*)?$/m);
    expect(m).not.toBeNull();
    const [maj, min] = [Number(m[1]), Number(m[2])];
    expect(maj > 3 || (maj === 3 && min >= 91)).toBe(true);
  });

  it('T05-AC-2: an actions/setup-node step with Node >= 22 runs before the deploy step', () => {
    const st = wf2();
    const deploy = st.findIndex((s) => /uses:\s*cloudflare\/wrangler-action@[0-9a-f]{40}\s+#\s*v3(?:\.\d+\.\d+)?\s*$/m.test(s));
    expect(deploy).toBeGreaterThan(-1);
    const node = st.findIndex((s) => /uses:\s*actions\/setup-node@[0-9a-f]{40}\b/.test(s));
    expect(node).toBeGreaterThan(-1);
    expect(node).toBeLessThan(deploy);
    const m = st[node].match(/^\s+node-version:\s*["']?v?(\d+)/m);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(22);
  });
});
