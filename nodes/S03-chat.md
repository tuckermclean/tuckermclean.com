# S03 — chat

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01, S01, S02 | none | M |

**Owns:** `assets/js/chat.js`, `static/chat.html`, `static/login.html`, `static/callback.html`, `static/src/`

## Purpose

The "Chat with Me" window: a visitor writes to the owner, and the owner, signed in, answers visitors. It is built
but does not work: its backend (the API at `api.<domain>`, the WebSocket at `api-ws.<domain>` and the Cognito
sign-in at `auth.<domain>`) ran on AWS accounts that are now closed. `SPEC.md` D1 keeps the menu item, known
broken, until an issue removes it or gives it a new backend.

- `static/chat.html` is the fragment the desktop page (S02) loads into the `chat` window: the message list
  (`#chat-messages`, with `#chat-users` for the signed-in owner's list of connections), the message box
  (`textarea#message`) and its Send button (`#message-send`), and the visitor's name, email and phone inputs. It
  loads `/js/chat.js`, which `layouts/home.html` (S02) builds from `assets/js/chat.js`.
- `assets/js/chat.js` gets S01's variables with the API's `clientConfig`, keeps the name, email and phone inputs
  in `localStorage`, connects the WebSocket (with the stored access token, refreshed every minute and on a close,
  when the owner is signed in), shows the server's messages, answers its pings, and sends a message by a POST to
  `message` (a visitor) or `adminMessage` (the owner, with the token) on Enter or Send. Signed in, it lists the
  connections (`listConnections`) and lets the owner pick the one to answer. It registers the WebSocket's close
  as the window's cleanup.
- `static/login.html` sends the browser to Cognito's Google sign-in, and `static/callback.html` exchanges the
  returned code for a token, stores the token and the user in `localStorage` and returns to `/#/chat`. Both
  import `static/src/env.js`, a copy of S01's `assets/js/env.js`.

## Tests

No test file of this node's own. `tests/e2e/desktop.spec.js:62` (S02) opens the window from the menu and sees the
message box; it asserts nothing of the messaging. No test runs `chat.js`'s connection, the sign-in pages or
`static/src/env.js`.

## Changes

none: imported

## Gate

- **S03-AC-1** — `chat.html` holds a `textarea#message`, so the chat window opened from the menu shows the message box. *Verify:* `CI=true npx playwright test tests/e2e/desktop.spec.js:62`.
- **S03-AC-2** — `chat.html` holds `#chat-messages` with `#chat-users`, the `#message-send` button, the name, email and phone inputs, and a module script `/js/chat.js`. *Verify:* unpinned: the only test reads `#message`.
- **S03-AC-3** — `chat.js` restores the name, email and phone inputs from `localStorage` and stores each on input. *Verify:* unpinned: its `init()` runs only after `envVars(true)` settles, which it never does without the backend.
- **S03-AC-4** — `chat.js` connects a WebSocket to `API_WS_BASE_URL`, with `?accessToken=<token>` when a token is stored, answers a `ping` with `{"ping":"pong"}` and shows the other messages with their timestamp and sender. *Verify:* unpinned: no backend, no test.
- **S03-AC-5** — Enter without Shift, Ctrl or Alt, or the Send button, POSTs the message with the stored name, email and phone and the connection ids to `<API_BASE_URL>message`, or to `adminMessage` with the bearer token when signed in as the owner; an empty message is refused with an alert. *Verify:* unpinned: no backend, no test.
- **S03-AC-6** — Signed in as the owner, `chat.js` lists the connections from `listConnections` and a click on one makes it the target of the next message. *Verify:* unpinned: no backend, no test.
- **S03-AC-7** — `chat.js` adds the abort of its connection to the front of `window.windowCleanup.chat`, so closing the window closes the WebSocket. *Verify:* unpinned: no backend, no test.
- **S03-AC-8** — `login.html` redirects to `https://auth.<domain>/oauth2/authorize` with Google as the identity provider and `callback.html` as the redirect; `callback.html` exchanges the code at `/oauth2/token`, stores the token with its `expires_at` and the user from `/oauth2/userInfo`, and returns to `/#/chat`. *Verify:* unpinned: no backend, no test.
- **S03-AC-9** — `static/src/env.js` is identical to `assets/js/env.js`. *Verify:* unpinned: no test compares them.

## Risks

- The backend is gone, so `envVars(true)` never settles (S01's risk) and `chat.js` never gets past its
  constructor: the window shows the form and nothing else.
- `chat.js` reads an undefined `connectionId` when the server answers "Forbidden" before a welcome, which throws
  a `ReferenceError`.
- The constructor's `reject` wrapper aborts the connection but never rejects the promise (`reject;` is not
  called).
- The minutely token check compares `expires_at` with the time a minute ago rather than a minute ahead, so a
  token is refreshed only a minute after it has expired.
- `static/src/env.js` is a copy that does not follow changes to S01's `env.js`.
- `layouts/home.html` (S02) builds and preloads `js/chat.js` on every page load, and the menu item that opens the
  window is S02's: removing the chat changes S02's files too.
