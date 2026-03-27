# tuckermclean.com

A personal portfolio site that looks like a desktop OS — because why present yourself with a normal website when you can build a windowed environment in the browser instead.

Live at **[tuckermclean.com](https://tuckermclean.com)**

---

## What it is

A fully functional window manager running in the browser. Multiple draggable, resizable windows. Minimize, maximize, shade (roll-up). Z-order management. A taskbar, a start menu, a context menu, a rubber-band selection box. Dark/light mode. A status bar with idle Easter eggs. A chat interface backed by a real auth system.

Content is managed through Hugo and rendered as HTML fragments that get loaded into windows on demand — so the site is a single-page app where each "page" is a window, not a route.

No frameworks. No bundler. Vanilla JS ES modules, Hugo's built-in esbuild pipeline for minification, and CSS custom properties for theming.

## Stack

| Layer | Tech |
|---|---|
| Content & build | [Hugo](https://gohugo.io) (extended, uglyURLs) |
| JS | Vanilla ES modules — window manager, SPA routing, env interpolation |
| CSS | Hand-rolled with CSS custom properties, dark/light via class toggle |
| Fonts | Fira Code (UI chrome) + Fira Sans (body) |
| Deployment | GitHub Actions → `hugo --minify` → AWS S3 |

## Development

```bash
# Clone
git clone https://github.com/tuckermclean/tuckermclean.com.git
cd tuckermclean.com

# Start dev server (drafts included)
hugo server --buildDrafts --disableFastRender
# or
npm run dev
```

## Build & Deploy

```bash
# Build to dist/
hugo --minify
# or
npm run build

# Deploy (CI does this automatically on push to master)
aws s3 sync ./dist s3://your-bucket-name
```

Deployment is automated via GitHub Actions on push to `master`. Required secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`.

## Writing a post

Posts live in `content/posts/` as Markdown with standard Hugo frontmatter. They render into the Writings window and support categories, feature images, and full Markdown including code blocks and blockquotes.

## License

Blog content © Tucker McLean — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
Code © Tucker McLean — [MIT](./LICENSE)

---

Direct all love notes and hate mail to Tucker McLean; me@tuckermclean.com
