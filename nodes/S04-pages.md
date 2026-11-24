# S04 — pages

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01, S02 | none | S |

**Owns:** `layouts/pages/`, `layouts/partials/`, `layouts/shortcodes/`, `content/intro.md`, `content/resume.md`,
`content/welcome.md`

## Purpose

The site's three pages and the templates that render them as fragments, which the desktop page (S02) loads into
windows. `content/welcome.md`, `content/intro.md` and `content/resume.md` are of type `pages`; their front matter
picks the layout (`greeting` for Welcome and Intro, `resume` for the résumé), the window's icon and, for the
greetings, a subtitle and the navigation links. Their text is the owner's (`SPEC.md` principle 6).

Each layout in `layouts/pages/` starts with the hidden `.page-icon` and `.page-title` spans that S02's loader
copies into the window's header:

- `greeting.html`: the navigation links (each an `openPage()` call), then "Hi, I'm <name>." with a blinking
  cursor, the subtitle and the content;
- `resume.html`: a header with the name, location, phone, email, domain, GitHub and LinkedIn (the
  `partials/linkedin.html` icon) from `hugo.toml`'s parameters, and the role, then the content in
  `.resume-content`;
- `single.html`: a title and the content, for a page that names no layout.

The name is a `.name` span and the email and domain are `a.email` and `a.domain` links, which S02's loader
rewrites with S01's identity for the hostname. The shortcodes give the content `date` (a `p.date`) and
`projectlinks` (a `p.date` with "github" and "live" links), which the résumé uses, and `domain`, `email`,
`initials` and `openpage`, which no page uses now.

## Tests

No test file of this node's own. The desktop page's specs (S02) open these pages: `tests/e2e/boot.spec.js` cold
boots into Welcome and deep-links to the résumé, `tests/e2e/windows.spec.js` and most other specs open the résumé,
and `tests/e2e/boot.spec.js:35` opens Intro.

## Changes

none: imported

## Gate

- **S04-AC-1** — `greeting.html` writes the page's title into the hidden `.page-title`, so the Welcome window's title becomes "Welcome" once loaded. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:4`.
- **S04-AC-2** — `resume.html` writes the page's `icon` into the hidden `.page-icon`, so the résumé window opened by a deep link shows 📜. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:18`.
- **S04-AC-3** — `content/resume.md` is a `pages` page with the icon 📜 whose content has a Summary section. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:18`.
- **S04-AC-4** — `content/welcome.md` is a page titled "Welcome" built to `welcome.html` (its `slug`). *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:4`.
- **S04-AC-5** — `content/intro.md` builds to `intro.html` (its `slug`), which the Intro menu item opens. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:35`.
- **S04-AC-6** — The résumé uses the `resume` layout and Welcome and Intro the `greeting` layout. *Verify:* unpinned: `tests/e2e/boot.spec.js:4` and `:18` pass with the layouts swapped, since every layout writes the same `.page-icon` and `.page-title`.
- **S04-AC-7** — `greeting.html` renders the front matter's `navLinks` as links to `#/<page>` that call `openPage()` with the link's title and icon, then "Hi, I'm" with the author in a `.name` span, the subtitle and the content. *Verify:* unpinned: no test reads the greeting's header or clicks its links.
- **S04-AC-8** — `resume.html`'s header shows the location, a `tel:` link, the email (`a.email`), the domain (`a.domain`), the GitHub and LinkedIn links and the role, all from `hugo.toml`'s parameters. *Verify:* unpinned: `tests/e2e/chrome.spec.js:27` also passes on the content's own GitHub links, and no test reads the header.
- **S04-AC-9** — The `date` shortcode wraps its content in a `p.date`, and `projectlinks` writes a `p.date` with a "github" link and, when given, a "live" link. *Verify:* unpinned: no test reads them.
- **S04-AC-10** — The `domain`, `email`, `initials` and `openpage` shortcodes and `pages/single.html` exist for content that uses them; no page does now. *Verify:* unpinned: unused.

## Risks

- None of this node's criteria has a test of its own: they rest on S02's specs, which open these pages to test
  the desktop. A change to those specs can drop this node's evidence.
- The `openpage` shortcode and the greeting's links put their arguments into the `onclick` JavaScript through
  `safeJS`, which skips Go's escaping, so a title with a `'` breaks the link.
- The résumé's front matter and the greetings' `navLinks` carry the window titles and icons that the menu also
  passes (`layouts/home.html`, S02), so the two can drift apart.
- The owner's text in `content/` must not be changed by a node (`SPEC.md` principle 6); only markup and front
  matter may be.
