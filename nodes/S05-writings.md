# S05 — writings

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01, S02 | none | S |

**Owns:** `layouts/writings/`, `layouts/posts/`, `content/writings.md`

## Purpose

The blog's two page fragments, which the desktop page (S02) loads into windows. `content/writings.md` (type
`writings`, icon ✍️) is rendered by `layouts/writings/single.html` into `writings.html`: every post (type `posts`,
the owner's writing in `content/posts/`, out of scope) newest first, each with its title linking to
`#/posts/<name>` through `goTo()`, its date, its categories and its summary, under a menu bar with one menu per
category listing up to five of its posts. An inline script in the fragment opens a category's menu on a click and
follows the pointer between menus while one is open. `layouts/posts/single.html` renders each post into
`posts/<name>.html`: a menu bar whose "Writings" item goes back to the list, then the title, the date, the feature
image (`feature_image` in the post's front matter, served from `/<feature_image>`) and the content. Both start
with the hidden `.page-icon` and `.page-title` spans that S02's loader copies into the window's header.

## Tests

No test file of this node's own. `tests/e2e/imagezoom.spec.js` (S02) opens `#/posts/my-cloud-journey` and clicks
its feature image. No test opens the Writings window or a post's menu bar.

## Changes

none: imported

## Gate

- **S05-AC-1** — A post with a `feature_image` renders it as `<img class="feature-image">` with the source `/<feature_image>` in the post's header. *Verify:* `CI=true npx playwright test tests/e2e/imagezoom.spec.js:7`.
- **S05-AC-2** — A post's fragment starts with the hidden `.page-icon` (the post's `icon`, ✍️ by default) and `.page-title` (its title), and has a "Writings" menu item that calls `goTo('writings', 'Writings', '✍️')`. *Verify:* unpinned: no test reads a post window's title or icon or clicks the menu item.
- **S05-AC-3** — The Writings fragment lists every post newest first, each with its title linked to `#/posts/<name>` (opened with `goTo()`), its date as "January 2, 2006", its categories and its summary. *Verify:* unpinned: no test opens the Writings window.
- **S05-AC-4** — The Writings menu bar has one menu per category (sorted, without duplicates), each listing up to five of its posts; a click opens a menu and closes the others, moving the pointer onto another menu while one is open opens that one, and a click elsewhere closes them. *Verify:* unpinned: no test opens the Writings window.
- **S05-AC-5** — `content/writings.md` is of type `writings` with the icon ✍️, so it builds to `writings.html`. *Verify:* unpinned: no test opens the Writings window.

## Risks

- The Writings fragment's inline script adds a `click` listener on `document` each time the fragment is loaded,
  and S02's loader re-runs the script on every load, so listeners pile up over a session (each clears the menus,
  so the effect is harmless but grows).
- The post titles and names are put into the `onclick` JavaScript through `safeJS`, which marks them as safe and so
  skips Go's escaping: a title with a `'` would break that link's `onclick`.
- A post's feature image source is `/<feature_image>` with no check that the file exists.
