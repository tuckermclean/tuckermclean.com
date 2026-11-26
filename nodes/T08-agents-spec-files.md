# T08 — agents-spec-files

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | T01 | none | S |

**Owns:** `tests/unit/agents-doc.test.js`

**Resolves:** #21

## Purpose

`AGENTS.md` holds the rules that node sessions work under. Today the plugin's role guard counts it as a spec path
from its own defaults (`SPEC.md`, `AGENTS.md`, `CLAUDE.md`, `docs/graph.yaml`, `nodes/**`), so a tester or an
implementer cannot write it. Under noodlebot R03 (spec PR noodlebot#260), the guard takes a repository's spec
paths from the **Spec files:** line of `AGENTS.md`'s "Building a node" section instead, as `check-spec-diff.py`
already does. This repository's line lists `SPEC.md`, `docs/graph.yaml` and `nodes/`, and not `AGENTS.md`, so once
R03 lands an implementer session could edit `AGENTS.md`. The owner chose to keep it guarded (issue #21,
2026-11-25), as bosnia's R04 did.

This node adds `AGENTS.md` to the **Spec files:** line. It then stays a spec file for the role guard, and
`check-spec-diff.py` accepts it in a spec PR, so later changes to `AGENTS.md` go through spec PRs. That agrees with
the **Authority order.** bullet, which already says a lower document "is fixed by a spec PR". Nothing else in
`AGENTS.md` changes. A unit test reads the line, the way T05's and T07's tests read the files they check.

No node owns `AGENTS.md`: it is one of the regime's own files, which a node may change without owning.

## Tests

- `tests/unit/agents-doc.test.js` (new, vitest, `// @vitest-environment node`). It reads `AGENTS.md` from the
  repository root, with the path resolved from the test file's own location. A function local to the test file
  returns the code spans of the **Spec files:** line the way `check-spec-diff.py` finds it: the first line
  containing `**Spec files:**` in the section whose `## ` heading starts with "Building a node" (case-insensitive),
  up to the next `## ` heading, or none. Its own cases run it on sample text: a **Spec files:** line outside that
  section is ignored, the first such line in the section is taken, and a section with no such line gives none.
  On the real `AGENTS.md`, the line's code spans are exactly `SPEC.md`, `docs/graph.yaml`, `nodes/` and
  `AGENTS.md`, in that order, and the line still ends with `(a trailing slash marks a folder); spec PRs change only
  these.` A failure names the expected and the actual spans.
- Red target: `CI=true npx vitest run tests/unit/agents-doc.test.js`. It fails before the change (the line has no
  `AGENTS.md` span) and passes after.

## Changes

1. Add `tests/unit/agents-doc.test.js` with the cases above. *T08-AC-1, T08-AC-2.*
2. In `AGENTS.md`, change the **Spec files:** line to
   ``- **Spec files:** `SPEC.md`, `docs/graph.yaml`, `nodes/`, `AGENTS.md` (a trailing slash marks a folder); spec PRs change only these.``,
   still one physical line. Change nothing else in `AGENTS.md`. *T08-AC-1, T08-AC-3, T08-AC-4.*
3. Record the `tests` run on the PR's head commit. *T08-AC-5.*

## Gate

- **T08-AC-1** — The **Spec files:** line of `AGENTS.md`'s "Building a node" section is one physical line whose code spans are exactly `SPEC.md`, `docs/graph.yaml`, `nodes/` and `AGENTS.md`, in that order, followed by the unchanged note `(a trailing slash marks a folder); spec PRs change only these.` *Verify:* `CI=true npx vitest run tests/unit/agents-doc.test.js`.
- **T08-AC-2** — The test's line finder agrees with `check-spec-diff.py` on sample text: it ignores a **Spec files:** line outside the "Building a node" section, takes the first one inside it, and finds none in a section that has no such line. *Verify:* `CI=true npx vitest run tests/unit/agents-doc.test.js`.
- **T08-AC-3** — `check-spec-diff.py` reads the new list: run on the node's head, `python3 -I <plugin dir>/skills/node/check-spec-diff.py HEAD HEAD` prints `spec files: SPEC.md docs/graph.yaml nodes/ AGENTS.md` and `from: AGENTS.md at HEAD`. *Verify:* that command's output, recorded in the node's PR.
- **T08-AC-4** — Apart from the **Spec files:** line, `AGENTS.md` is unchanged, and the node changes no file other than `AGENTS.md` and `tests/unit/agents-doc.test.js`. *Verify:* `git diff --numstat origin/main...HEAD -- AGENTS.md` prints `1	1	AGENTS.md`, and `git diff --name-only origin/main...HEAD` lists only `AGENTS.md` and `tests/unit/agents-doc.test.js`; the reviewer reads the `AGENTS.md` diff.
- **T08-AC-5** — The unit suite passes with the new test among its files. *Verify:* the unit step of the `tests` run on the node PR's head commit, recorded in the node's PR with its counts (the end-to-end step as `SPEC.md` §7 and D7 say).

## Risks

- The role guard counts `AGENTS.md` as a spec path today (its defaults; `.noodlebot/roles.yaml` sets no `specs:`),
  so the implementer cannot write it. bosnia's R04 hit the same: its orchestrator committed the implementer's
  `AGENTS.md` change unchanged under the owner's one-time approval, asked as a question on the issue. The session
  that builds T08 does not assume that approval; it asks the owner the same way.
- `check-spec-diff.py` reads the **Spec files:** line from the base commit, so the new entry takes effect for spec
  PRs only once T08 is on `main`. T08 itself is a node PR and needs no spec-diff exemption.
- Until R03 lands, the guard's behaviour does not change: its defaults already list `AGENTS.md`. The change keeps
  the line and the guard in agreement for when R03 lands, and can be built before or after it.
- With `AGENTS.md` a spec file, a later spec PR may change the **Spec files:** line, and this node's test then
  fails until a node updates it. The test pins only that line, not the rest of `AGENTS.md`.
