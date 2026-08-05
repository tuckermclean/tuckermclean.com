# Supply-Chain Attestation (SP-D) — Design

**Date:** 2026-08-05
**Branch:** `feature/nice-phoenix`
**Status:** Approved for planning
**Predecessors:** SP-A (core) + SP-B (chrome) — both merged + deployed + live.

## Context

The Iconostat refactor's final piece is supply-chain attestation for the
build+deploy pipeline: prove the shipped site is built with a pinned,
checksum-verified toolchain, publish its (minimal) dependency surface as an SBOM,
and attach SLSA build provenance. This is CI/infra work — it does not touch the
window manager, the site runtime, or any `assets/` code.

The chat window (the brief's other "SP-C" item) is intentionally **out of scope**
for the whole Iconostat effort: per the user, chat is "dead and busted" and will
be removed/replaced, so its auth-heavy code is left untouched rather than
converted into a soon-to-be-replaced element.

## Current pipeline (`.github/workflows/deploy-to-s3.yml`, master push / manual)

checkout → `peaceiris/actions-hugo@v3` (extended, **unpinned = latest**) →
`hugo --minify` (→ `dist/`) → configure AWS → `aws s3 sync ./dist s3://<bucket>`.
No `static/.well-known`. Hugo copies `static/*` verbatim into `dist/*`.

## Hard constraints

- **Do not change the S3 deploy mechanism or secrets** beyond adding the
  `id-token`/`attestations` permissions that provenance requires.
- **No runtime / site-behavior / `assets/` change.** The deployed HTML/CSS/JS is
  unchanged (aside from the new `/.well-known/sbom.spdx.json` file).
- **Deploy-safety is paramount** (user chose "defensive design, first real run on
  master"): the new steps MUST be structured so they can never break the actual
  deploy. Verified offline where possible; the GitHub-action-specific steps are
  only truly exercised on the first master run, which is deploy-safe by
  construction (below).
- Pinned Hugo must produce the **same site** as today (verify build parity).

## Design

All changes live in `.github/workflows/deploy-to-s3.yml` plus a README section.

### 1. Pin Hugo + verify checksum

Replace the unpinned `peaceiris/actions-hugo@v3 (extended, latest)` with a pinned,
checksum-verified install:

- A workflow `env: HUGO_VERSION: <X.Y.Z>` pinned to a specific extended release.
  The exact version is chosen at implementation time as the current stable
  extended Hugo (so the pin matches what prod builds with today), and the
  implementer verifies a local build with that pinned version produces the same
  site output as the current build.
- Download the official release tarball AND Hugo's published `checksums.txt` for
  that version from `github.com/gohugoio/hugo/releases`, verify the tarball's
  sha256 against the published checksum (`sha256sum -c` / explicit compare), then
  extract and install the binary. A failed checksum aborts the job (correct — a
  compromised/altered binary must not build the site).
- This is the only "can block the deploy" change, and appropriately so: the build
  step is inherently required. Pinning makes it deterministic rather than
  drifting with upstream `latest`.

### 2. SBOM of `dist/` (SPDX-JSON) + publish at `/.well-known/`

After `hugo --minify`:

- Generate an **SPDX-JSON SBOM of `./dist`** with `anchore/sbom-action` (installs
  syft), `format: spdx-json`, output to a file.
- Copy it to `dist/.well-known/sbom.spdx.json` so the subsequent `aws s3 sync`
  publishes it at `https://<site>/.well-known/sbom.spdx.json` (s3 sync includes
  dotfiles/dirs; `.json` → `application/json` content-type).
- Also `actions/upload-artifact` the SBOM for the build record.
- **Dependency-hygiene finding:** a step parses the SBOM's package count; since
  `dist/` is a static artifact with ~zero runtime dependencies, the SBOM should be
  small — the step logs the count and emits a warning annotation if it exceeds a
  small threshold (the "if it isn't small, that's a finding" requirement).
- **Deploy-safety:** the SBOM generation + injection steps are
  `continue-on-error: true` — a syft/tooling hiccup logs and continues; worst case
  that run ships without the `.well-known` SBOM, but the site still deploys.

### 3. SLSA build provenance

After the `s3 sync` (so it can never block a completed deploy):

- Tar `dist/` → `dist.tgz`.
- `actions/attest-build-provenance` attests `dist.tgz` (requires job
  `permissions: contents: read, id-token: write, attestations: write`).
- `actions/upload-artifact` the tarball for the build record.
- These steps run last; a failure here leaves the site already deployed and only
  fails the provenance/record, never the deploy.

### 4. Step ordering (the deploy-safety contract)

```
checkout
→ install pinned+checksum-verified Hugo        (required; deterministic)
→ hugo --minify                                (required; unchanged output)
→ generate SBOM of dist/  [continue-on-error]  (best-effort)
→ inject dist/.well-known/sbom.spdx.json [c-o-e]
→ upload SBOM artifact [c-o-e]
→ configure AWS
→ aws s3 sync ./dist s3://<bucket>             (THE DEPLOY — unchanged command)
→ tar dist.tgz + attest-build-provenance       (after deploy; can't block it)
→ upload dist.tgz artifact
```

Only steps at or before the build can affect whether a deploy happens, and those
are the same "you need Hugo to build" reality as today. Everything attestation-
specific is either `continue-on-error` (SBOM, pre-sync) or positioned after the
sync (provenance).

### 5. README "Supply chain" section

Add a section (portfolio-grade prose) documenting: the pinned + checksum-verified
Hugo build, the SPDX SBOM published at `/.well-known/sbom.spdx.json` and what its
near-emptiness demonstrates (a site that ships ~zero third-party runtime code),
and the SLSA build-provenance attestation of the deployed artifact.

## Verification approach

- **Offline (local):** run the exact Hugo download + `checksums.txt` sha256
  verification for the pinned version; run `syft dir:./dist -o spdx-json` on a
  local `hugo --minify` build to confirm the command works and inspect the
  package count / size; lint the workflow YAML (actionlint if available, else a
  YAML parse). Confirm the pinned Hugo builds the same site.
- **First real run (master):** the GitHub-specific actions
  (`anchore/sbom-action`, `actions/attest-build-provenance`,
  `actions/upload-artifact`) are only exercised on GitHub. Per §4 the run is
  deploy-safe by construction. After merge, watch the Actions run and confirm:
  deploy succeeded, `/.well-known/sbom.spdx.json` is live, the provenance
  attestation and artifacts are attached.

## Task decomposition (for the plan)

1. Pin Hugo + checksum verification (replace peaceiris; verify build parity).
2. SBOM generation + `/.well-known/sbom.spdx.json` publish + artifact + hygiene finding (continue-on-error).
3. SLSA provenance (permissions + attest after sync) + tarball artifact.
4. README "Supply chain" section.

Each is largely one coherent edit to the single workflow file (+ README for task
4); they're sequenced so the workflow stays valid and deploy-safe after each.

## Out of scope

- The window manager / any `assets/` runtime code (unchanged).
- The chat window (deferred/left per the user).
- The S3 deploy mechanism, bucket, CDN, or secrets (untouched beyond the
  provenance permissions).
- Signing the SBOM, cosign, or a full SLSA L3 builder — YAGNI for a static
  portfolio site; `attest-build-provenance` provides the provenance the brief asks
  for.
