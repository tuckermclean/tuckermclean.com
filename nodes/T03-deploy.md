# T03 — deploy

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | none | T05 | S |

**Owns:** `.github/workflows/deploy-to-s3.yml`

## Purpose

The deploy workflow, "Deploy Frontend to S3": it builds the site with a pinned, checksum-verified Hugo, publishes
an SBOM, syncs the build to AWS S3 and attests the build's provenance (`SPEC.md` principle 2). The move to
Cloudflare Workers (issue #2) changes this file.

## Tests

No test covers the workflow; it runs only on the forge, with the repository's secrets.

## Changes

none: imported

## Gate

- **T03-AC-1** — The workflow runs on pushes to `master` and by hand (`workflow_dispatch`), as one job with the permissions `contents: read`, `id-token: write` and `attestations: write`. *Verify:* superseded by T05-AC-2 (the permissions are kept by T05-AC-3).
- **T03-AC-2** — It installs Hugo extended `0.164.0` (`HUGO_VERSION`) from Hugo's GitHub release and checks the tarball against the release's published SHA-256 checksums; a mismatch fails the job before the build. *Verify:* `CI=true npx vitest run tests/unit/deploy-config.test.js -t "T03-AC-2"`.
- **T03-AC-3** — It builds the site with `hugo --minify` into `dist/` and lists the built files. *Verify:* `CI=true npx vitest run tests/unit/deploy-config.test.js -t "T03-AC-3"`.
- **T03-AC-4** — It generates an SPDX SBOM of `dist/` (`anchore/sbom-action`), copies it to `dist/.well-known/sbom.spdx.json`, warns when it lists more than 10 packages and uploads it as the artifact `sbom-spdx`; each of these steps has `continue-on-error`, so none fails the job, and without an SBOM the site deploys without it. *Verify:* `CI=true npx vitest run tests/unit/deploy-config.test.js -t "T03-AC-4"`.
- **T03-AC-5** — It deploys with `aws s3 sync ./dist s3://<S3_BUCKET_NAME>`, using the secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` and `S3_BUCKET_NAME`. *Verify:* superseded by T05-AC-2.
- **T03-AC-6** — Only after the sync, it packs `dist/` as `dist.tgz`, attests its build provenance (`actions/attest-build-provenance`) and uploads it as the artifact `site-dist`. *Verify:* superseded by T05-AC-3.

## Risks

- The default branch is now `main`, so the push trigger on `master` never fires; issue #2 switches it to `main`.
- The AWS accounts the site ran on are closed: the AWS steps fail, and the site is down until issue #2 moves it to
  Cloudflare Workers.
- The attestation steps have no `continue-on-error`: after a completed sync they cannot undo the deploy, but a
  failure there still marks the job failed.
- The comment on the trigger says "the main branch" next to `master`.
