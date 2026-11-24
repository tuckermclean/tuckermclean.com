# S01 — identity

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01 | S02, S03 | S |

**Owns:** `assets/js/env.js`, `tests/unit/env.test.js`

## Purpose

The site's identity by hostname. `env.js` exports `envVars(clientConfig = true)`, a promise of the site's
variables: the domain (the hostname's last two labels), the base, API and WebSocket URLs derived from it, and the
owner's name, initials and email, chosen by the domain (`alijamaluddin.com` and `technomantics.com` have identities
of their own, every other domain gets the Tucker McLean one). With `clientConfig` true it also fetches the API's
`clientConfig` and merges it over those variables; the chat (S03) uses that for its Cognito client id.

The desktop page (S02) uses it to put the name into the document title and into the loaded pages (the `.name`,
`.initials`, `a.email` and `a.domain` elements). `static/src/env.js` (S03) is a copy of this file for the chat's
sign-in pages.

## Tests

- `tests/unit/env.test.js` (vitest, jsdom): five identity tests, one URL test and one `clientConfig` merge test,
  with `window.location` stubbed and `fetch` stubbed for the merge.

## Changes

none: imported

## Gate

- **S01-AC-1** — `DOMAIN_NAME` is the hostname's last two labels, so `www.tuckermclean.com` gives `tuckermclean.com`. *Verify:* `CI=true npx vitest run tests/unit/env.test.js -t 'collapses'`.
- **S01-AC-2** — `BASE_URL` is `https://<domain>/`, `API_BASE_URL` is `https://api.<domain>/` and `API_WS_BASE_URL` is `wss://api-ws.<domain>/`. *Verify:* `CI=true npx vitest run tests/unit/env.test.js -t 'derives'`.
- **S01-AC-3** — The domain `alijamaluddin.com` gives the name `Ali Jamaluddin`, the initials `AJ` and the email `me@alijamaluddin.com`; `technomantics.com` gives `Developer McDev`, `DM` and `fakedev@technomantics.com`; every other domain gives `Tucker McLean`, `TM` and `me@tuckermclean.com`. *Verify:* `CI=true npx vitest run tests/unit/env.test.js`.
- **S01-AC-4** — `envVars(true)` fetches `<API_BASE_URL>clientConfig` and resolves with its JSON merged over the variables, the fetched values winning. *Verify:* `CI=true npx vitest run tests/unit/env.test.js -t 'merges'`.
- **S01-AC-5** — `envVars(false)` makes no request and resolves at once. *Verify:* unpinned: with the request made anyway, the file fails only because the request to `api.tuckermclean.com` fails in the test environment, so the result depends on the network.

## Risks

- `envVars(true)` has no error handling on the fetch: when the request fails or the response is not JSON, the
  promise never settles (the rejection escapes the `try`). The API's backend is gone (`SPEC.md` D1), so every
  `envVars(true)` call now hangs.
- The identities of two other people's domains are hard-coded here, next to the owner's.
- `static/src/env.js` (S03) is a byte-for-byte copy of this file, so a change here does not reach the chat's
  sign-in pages.
- A two-label public suffix (for example `example.co.uk`) would give `co.uk` as the domain.
