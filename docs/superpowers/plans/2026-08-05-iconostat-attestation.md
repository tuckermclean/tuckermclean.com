# Supply-Chain Attestation (SP-D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin + checksum-verify the Hugo build, publish an SPDX SBOM of the deployed site at `/.well-known/sbom.spdx.json`, and attach SLSA build provenance — all in the existing deploy workflow, structured so the new steps can never break the live S3 deploy.

**Architecture:** All changes are in `.github/workflows/deploy-to-s3.yml` (+ a README section). The build is pinned/verified (deterministic, inherently required); the SBOM steps run before the `s3 sync` but are `continue-on-error`; the provenance steps run strictly after the `s3 sync`. So only the "you need Hugo to build" reality can affect whether a deploy happens — every attestation-specific step is either best-effort or post-deploy.

**Tech Stack:** GitHub Actions, Hugo (extended, pinned), syft (`anchore/sbom-action`), `actions/attest-build-provenance`, AWS S3.

## Global Constraints

- **Do NOT change the S3 deploy mechanism, bucket, or secrets** beyond adding the `id-token: write` / `attestations: write` permissions that provenance requires. The deploy command stays `aws s3 sync ./dist s3://${{ secrets.S3_BUCKET_NAME }}`.
- **No runtime / site-behavior / `assets/` change.** The only new file the site serves is `/.well-known/sbom.spdx.json`.
- **Deploy-safety is paramount:** new steps must be `continue-on-error` (if before the sync) or positioned after the sync. Never let SBOM/provenance tooling fail the deploy.
- **Pin Hugo to `0.164.0`** (current stable extended = what prod builds with today; freezing it is a no-op for prod output).
- Pin all third-party actions to a fixed version (no floating tags): `anchore/sbom-action@v0.24.0`, `actions/attest-build-provenance@v4.1.1`, `actions/upload-artifact@v7.0.1`, existing `actions/checkout@v4`, `aws-actions/configure-aws-credentials@v4`.
- CI cannot be run locally. Validate offline what is validatable; the first real run is the master deploy, deploy-safe by construction.

## Environment Prerequisites

- Worktree: `/home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix`, branch `feature/nice-phoenix`. Shell cwd RESETS to a master checkout between commands — begin EVERY Bash command with `cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix &&`, and verify `git rev-parse --abbrev-ref HEAD` = `feature/nice-phoenix` before committing. NEVER commit on master.
- This sub-project touches NO app code and needs NO browser. Local validation uses: `python3` (YAML parse + JSON), `curl`, `sha256sum`, `tar`, and syft (installed in Task 2).
- Offline YAML validation: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy-to-s3.yml')); print('yaml ok')"`. If `actionlint` is available (`which actionlint`), also run it; if not, the python parse suffices.

## File Structure

- Modify: `.github/workflows/deploy-to-s3.yml` — the single build+deploy pipeline (Tasks 1-3).
- Modify: `README.md` — add a "Supply chain" section (Task 4).

The current workflow's steps: checkout → `peaceiris/actions-hugo@v3` (extended, unpinned) → `hugo --minify` → `find dist` → configure AWS → `aws s3 sync ./dist s3://<bucket>`.

---

### Task 1: Pin Hugo + verify checksum

Replace the unpinned `peaceiris/actions-hugo@v3` install with a pinned, sha256-verified manual install. The build must still produce the same site.

**Files:**
- Modify: `.github/workflows/deploy-to-s3.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: `hugo` on PATH at exactly `0.164.0` extended; `env.HUGO_VERSION` for later reference.

- [ ] **Step 1: Add the pinned-version env and replace the install step**

At the `deploy` job level (above `steps:`), add:
```yaml
    env:
      HUGO_VERSION: 0.164.0
```
Replace the `- name: Install Hugo` (`peaceiris/actions-hugo@v3`) step with:
```yaml
    - name: Install Hugo (pinned + checksum-verified)
      run: |
        set -euo pipefail
        workdir="$(mktemp -d)"
        cd "$workdir"
        tarball="hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
        base="https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}"
        curl -fsSL -o "$tarball" "$base/$tarball"
        curl -fsSL -o checksums.txt "$base/hugo_${HUGO_VERSION}_checksums.txt"
        # Verify the downloaded tarball against Hugo's published checksum.
        # A mismatch aborts the job (a tampered binary must not build the site).
        grep " ${tarball}\$" checksums.txt | sha256sum -c -
        tar -xzf "$tarball" hugo
        sudo install -m 0755 hugo /usr/local/bin/hugo
        cd - >/dev/null
        hugo version
```
Leave the `- name: Build` (`hugo --minify`) and `- name: List built files for debugging` steps unchanged.

- [ ] **Step 2: Validate the download + checksum logic locally**

Run the verification exactly as CI will (this proves the URLs + checksum line format are correct):
```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && \
d="$(mktemp -d)" && cd "$d" && \
tarball="hugo_extended_0.164.0_linux-amd64.tar.gz" && \
base="https://github.com/gohugoio/hugo/releases/download/v0.164.0" && \
curl -fsSL -o "$tarball" "$base/$tarball" && \
curl -fsSL -o checksums.txt "$base/hugo_0.164.0_checksums.txt" && \
grep " ${tarball}\$" checksums.txt | sha256sum -c -
```
Expected: `hugo_extended_0.164.0_linux-amd64.tar.gz: OK`. (The published sha256 is `fea17b8c076f950bb2e9f9486667bdaa29422883888d509d63931c73e8a9b3a4`.)

- [ ] **Step 3: Confirm the pinned Hugo builds the site**

Extract the verified binary and build the site with it (parity check — 0.164.0 is the version prod already uses, so a clean build IS parity):
```bash
cd "$d" && tar -xzf "$tarball" hugo && \
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && \
"$d/hugo" --minify && \
test -f dist/index.html && grep -q "iconostat-desktop" dist/index.html && echo "BUILD OK: pinned 0.164.0 produced the expected site"
```
Expected: `BUILD OK…`. Then clean the local build if it dirties the tree: `rm -rf dist` (dist is gitignored; confirm `git status --porcelain` shows only the workflow file).

- [ ] **Step 4: Validate the workflow YAML**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && \
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-to-s3.yml')); print('yaml ok')" && \
(which actionlint >/dev/null 2>&1 && actionlint .github/workflows/deploy-to-s3.yml || echo "actionlint not installed; python yaml parse passed")
```
Expected: `yaml ok`.

- [ ] **Step 5: Commit**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && \
git add .github/workflows/deploy-to-s3.yml && \
git commit -m "ci: pin Hugo to 0.164.0 and verify its published checksum before build"
```

---

### Task 2: SBOM of dist/ + publish at /.well-known/sbom.spdx.json

After the build, generate an SPDX-JSON SBOM of `./dist`, publish it into the deployed artifact, upload it as a build artifact, and warn if the dependency count is unexpectedly large. All `continue-on-error` (pre-sync, must not block the deploy).

**Files:**
- Modify: `.github/workflows/deploy-to-s3.yml`

**Interfaces:**
- Consumes: `./dist` from the Build step.
- Produces: `sbom.spdx.json` (workspace) and `dist/.well-known/sbom.spdx.json` (deployed).

- [ ] **Step 1: Add the SBOM steps AFTER "List built files" and BEFORE "Configure AWS Credentials"**

```yaml
    - name: Generate SBOM (SPDX) of dist/
      id: sbom
      continue-on-error: true
      uses: anchore/sbom-action@v0.24.0
      with:
        path: ./dist
        format: spdx-json
        output-file: sbom.spdx.json
        upload-artifact: false

    - name: Publish SBOM into the deployed artifact + dependency-hygiene finding
      continue-on-error: true
      run: |
        set -euo pipefail
        if [ ! -f sbom.spdx.json ]; then
          echo "::warning::SBOM was not generated; deploying without /.well-known/sbom.spdx.json"
          exit 0
        fi
        mkdir -p dist/.well-known
        cp sbom.spdx.json dist/.well-known/sbom.spdx.json
        count=$(python3 -c "import json; print(len(json.load(open('sbom.spdx.json')).get('packages', [])))")
        echo "SBOM package count: $count"
        if [ "$count" -gt 10 ]; then
          echo "::warning::SBOM lists $count packages (>10) — unexpected for a static artifact; investigate the supply chain."
        fi

    - name: Upload SBOM artifact
      continue-on-error: true
      uses: actions/upload-artifact@v7.0.1
      with:
        name: sbom-spdx
        path: sbom.spdx.json
```

- [ ] **Step 2: Install syft and validate the SBOM command locally**

Install syft to a persistent local dir (NOT /tmp, which is wiped on eviction) and run it on a local dist build:
```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && \
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b "$HOME/.local/bin" && \
export PATH="$HOME/.local/bin:$PATH" && \
d="$(mktemp -d)" && base="https://github.com/gohugoio/hugo/releases/download/v0.164.0" && \
curl -fsSL -o "$d/h.tgz" "$base/hugo_extended_0.164.0_linux-amd64.tar.gz" && tar -xzf "$d/h.tgz" -C "$d" hugo && \
"$d/hugo" --minify >/dev/null && \
syft dir:./dist -o spdx-json > sbom.spdx.json && \
echo "SBOM package count: $(python3 -c "import json;print(len(json.load(open('sbom.spdx.json')).get('packages',[])))")" && \
python3 -c "import json; d=json.load(open('sbom.spdx.json')); print('spdx doc:', d.get('spdxVersion'), '| name:', d.get('name'))"
```
Expected: the command produces a valid SPDX-JSON file; the package count prints (should be small — likely 0-1 for a static site). Record the count in your report. If syft's flag interface differs from `dir:./dist -o spdx-json`, adapt to the installed syft's CLI and note it (the `anchore/sbom-action` inputs above are the CI source of truth regardless).

- [ ] **Step 3: Clean up local build artifacts**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && rm -rf dist sbom.spdx.json && git status --porcelain
```
Expected: only `.github/workflows/deploy-to-s3.yml` shown (sbom.spdx.json and dist are gitignored / removed — confirm sbom.spdx.json is NOT tracked; if `dist`/`sbom.spdx.json` are not in `.gitignore`, verify they don't show as untracked before committing, and do NOT commit them).

- [ ] **Step 4: Validate YAML**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && \
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-to-s3.yml')); print('yaml ok')"
```
Expected: `yaml ok`. Confirm by reading that all three new steps are `continue-on-error: true` and sit BEFORE the "Configure AWS Credentials" / "Deploy to S3" steps.

- [ ] **Step 5: Commit**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && \
git add .github/workflows/deploy-to-s3.yml && \
git commit -m "ci: generate SPDX SBOM of dist/ and publish it at /.well-known/sbom.spdx.json"
```

---

### Task 3: SLSA build provenance (after the deploy)

Attest the deployed artifact with `actions/attest-build-provenance`, running strictly after the `s3 sync` so it can never block a completed deploy.

**Files:**
- Modify: `.github/workflows/deploy-to-s3.yml`

**Interfaces:**
- Consumes: `./dist` (already deployed).
- Produces: a provenance attestation for `dist.tgz`; `dist.tgz` build artifact.

- [ ] **Step 1: Add job permissions**

At the `deploy` job level (alongside the `env:` block from Task 1), add:
```yaml
    permissions:
      contents: read
      id-token: write
      attestations: write
```
(GitHub defaults `contents: read`; declaring the block explicitly is required to grant `id-token`/`attestations`.)

- [ ] **Step 2: Add the provenance steps AFTER the "Deploy to S3" step (last in the job)**

```yaml
    - name: Package built artifact for attestation
      run: tar -czf dist.tgz -C dist .

    - name: Attest build provenance
      uses: actions/attest-build-provenance@v4.1.1
      with:
        subject-path: dist.tgz

    - name: Upload built artifact
      uses: actions/upload-artifact@v7.0.1
      with:
        name: site-dist
        path: dist.tgz
```
These run only after a successful `s3 sync`; a failure here fails the provenance/record, never the (already-completed) deploy.

- [ ] **Step 3: Validate YAML + ordering**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && \
python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/deploy-to-s3.yml')); s=[x['name'] for x in d['jobs']['deploy']['steps']]; print('\n'.join(s)); assert s.index('Deploy to S3') < s.index('Attest build provenance'), 'provenance must be AFTER deploy'; assert 'attestations' in d['jobs']['deploy']['permissions']; print('ORDER + PERMISSIONS OK')"
```
Expected: the step list prints and `ORDER + PERMISSIONS OK`. (If your step `name:` values differ slightly, adjust the assertion strings to match — the invariant is: provenance step index > Deploy-to-S3 step index.)

- [ ] **Step 4: Commit**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && \
git add .github/workflows/deploy-to-s3.yml && \
git commit -m "ci: attest SLSA build provenance of the deployed artifact (after deploy)"
```

---

### Task 4: README "Supply chain" section

Document the attestation pipeline as portfolio material.

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the workflow from Tasks 1-3.
- Produces: user-facing documentation.

- [ ] **Step 1: Read the current README to match its tone/structure**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && sed -n '1,60p' README.md && echo "..." && wc -l README.md
```

- [ ] **Step 2: Add a "Supply chain" section**

Append (or place near an existing architecture/deploy section) a section written as portfolio material, covering exactly what the pipeline does — accurate to Tasks 1-3:
```markdown
## Supply chain

Every deploy to production is built and attested so the shipped artifact is verifiable:

- **Pinned, checksum-verified toolchain.** The site is built with Hugo `0.164.0` (extended), whose release binary is verified against Hugo's published SHA-256 checksum before it is allowed to build — a tampered toolchain aborts the deploy.
- **Software Bill of Materials.** An SPDX SBOM of the built site is generated with [syft](https://github.com/anchore/syft) on every deploy and published at [`/.well-known/sbom.spdx.json`](/.well-known/sbom.spdx.json). It is deliberately near-empty: the site ships essentially zero third-party runtime code (no framework, no bundler, no runtime dependencies) — the SBOM is the receipt.
- **Build provenance.** The deployed artifact is attested with [SLSA build provenance](https://slsa.dev) via `actions/attest-build-provenance`, cryptographically linking the published site to the exact workflow run and commit that produced it.

The attestation steps are structured so they can never block a deploy: SBOM generation is best-effort, and provenance is attested after the artifact ships.
```
Keep the prose accurate — if any detail changed during Tasks 1-3 (version, path), match the code.

- [ ] **Step 3: Verify the site still builds (README is not a Hugo content page, but confirm nothing broke)**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && \
d="$(mktemp -d)" && base="https://github.com/gohugoio/hugo/releases/download/v0.164.0" && \
curl -fsSL -o "$d/h.tgz" "$base/hugo_extended_0.164.0_linux-amd64.tar.gz" && tar -xzf "$d/h.tgz" -C "$d" hugo && \
"$d/hugo" --minify >/dev/null && echo "build clean" && rm -rf dist
```
Expected: `build clean`.

- [ ] **Step 4: Commit**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && \
git add README.md && \
git commit -m "docs: document the supply-chain attestation pipeline (pinned build, SBOM, provenance)"
```

---

## Self-Review

**Spec coverage:**
- Pin Hugo + verify checksum → Task 1 (pin `0.164.0`, `sha256sum -c` against published checksums.txt, abort on mismatch). ✓
- SBOM (SPDX) of dist/ via syft, published at `/.well-known/sbom.spdx.json`, uploaded as artifact → Task 2. ✓
- Dependency-hygiene finding (warn if not small) → Task 2 Step 1 (`>10` → `::warning::`). ✓
- SLSA provenance via `actions/attest-build-provenance` → Task 3. ✓
- Deploy-safety (SBOM continue-on-error pre-sync; provenance after sync; permissions added) → Tasks 2 & 3, ordering asserted in Task 3 Step 3. ✓
- Don't change deploy mechanism/secrets beyond provenance permissions → deploy command untouched; only the Hugo install swapped + permissions/attestation steps added. ✓
- README "Supply chain" section → Task 4. ✓
- Actions pinned to fixed versions → Global Constraints + each task's `uses:`. ✓
- Offline validation + deploy-safe first run → each task's validation steps; the real run is the post-merge master deploy. ✓

**Placeholder scan:** every value is concrete (Hugo `0.164.0`, sha256 `fea17b8c…`, `anchore/sbom-action@v0.24.0`, `attest-build-provenance@v4.1.1`, `upload-artifact@v7.0.1`); full YAML shown; validation commands are runnable. No "TBD"/"similar to". ✓

**Type/consistency:** `env.HUGO_VERSION=0.164.0` (Task 1) reused in Task 3's tar/attest context; `sbom.spdx.json` filename consistent (Task 2); `dist.tgz` subject consistent (Task 3); step-ordering invariant (SBOM before sync, provenance after) consistent across Tasks 2-3. ✓

**Note on testing:** CI workflows have no local unit test; each task's "verification" is offline validation (checksum reproduction, syft run, YAML parse, ordering assertion) plus the deploy-safe first master run. This is appropriate for the artifact type — do not fabricate a test harness for a GitHub workflow.
