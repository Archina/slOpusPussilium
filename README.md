# Opus Pusillium

An offline-first PWA prototype for esoteric study: Latin, Mycology, and Alchemy.

## Develop on NixOS

```sh
devenv shell
npm install
devenv up
```

Alternatively, run `npm run dev` directly. The development server uses the fixed address `http://127.0.0.1:5173`. Service workers are disabled and automatically unregistered in development so cached PWA assets cannot interfere with Vite’s HMR WebSocket.

Build the production bundle with `npm run build`.

Run browser tests and create study-flow screenshots with:

```sh
npm run test:e2e
```

Chromium is supplied by `devenv`, so no separate browser download is needed on NixOS. Reports and screenshots are written below `test-results/`.

## Deploy to GitHub Pages

Pushes to `main` build and publish the app via `.github/workflows/deploy-pages.yml`. The workflow enables GitHub Pages with the **GitHub Actions** source automatically on its first successful run.

The site is served from `https://<user>.github.io/<repo>/`, so the build uses `BASE_PATH=/<repo>/`. Everything that must respect the subpath derives from it:

- `vite.config.ts` sets `base` from `BASE_PATH` (default `/`).
- Service worker registration and scope use `import.meta.env.BASE_URL`.
- `sw.js` reads `self.registration.scope` for its precache entry and its offline navigation fallback.
- `manifest.webmanifest` uses relative `start_url`, `scope`, and icon paths.

To reproduce the Pages build locally (also does a type-check):

```sh
BASE_PATH=/slOpusPussilium/ npm run build
BASE_PATH=/slOpusPussilium/ npm run preview
# → http://localhost:4173/slOpusPussilium/
```

The workflow also copies `dist/index.html` to `dist/404.html` so deep links fall back to the app shell. Plain `npm run build` without `BASE_PATH` still targets the domain root.

## Prototype scope

- Responsive phone and desktop interface inspired by the supplied visual reference.
- Home, decks, study-card, quests, and profile/reminder screens.
- A local service worker and web app manifest for installation and basic offline caching.
- Reminder settings and an in-app review prompt.
- Device-local progress, settings, daily session counts, points, streaks, and spaced-repetition scheduling through `localStorage`.
- Two approximately ten-minute sessions per active deck each day.
- Adventurer (no health), Scholar (5 hearts), and Adept (3 hearts) modes. Zero hearts never blocks learning.
- Tamil and Norwegian learning material imported from the supplied Quizard prototype data.
- A coherent editable SVG sigil library for language, Nordic language, life science, chemistry, physics, mathematics, astronomy, medicine, computing, engineering, history, philosophy, and arts.
- A local Library workshop for changing a deck’s name, domain, description, sigil, and individual cards.
- Reusable domain-tinted Three.js deck boxes with sharp geometry, real depth, lighting, texture-mapped esoteric linework, hinged lids, and visible card stacks. Hover/focus opens the lid; clicking the mesh starts study. The sigil medallion is part of the lid assembly and rotates with it.
- Anki-inspired Again, Hard, Good, and Easy review ratings with day-scale intervals.
- Distinct unseen and due-card frames, plus three earned card-rank upgrades at 2, 5, and 9 failures.
- Rank-weighted experience, a 100-XP level meter, and session-local Momentum earned from Easy answers.

## Learning data

The bundled library currently contains Latin, Mycology, Alchemy, Tamil, and Norwegian. The Mycology deck is distilled into focused flipcards from the course notes. Tamil includes 18 cards derived from flip-card and vowel matching material. Norwegian contains 496 two-way vocabulary cards. Ten-card sessions are shuffled and, whenever possible, mix roughly seven due reviews with three unseen cards. Ratings update day-scale review intervals.

The canonical sigil-free card back lives at `src/assets/card-back-template.svg`. The Draw screen renders that SVG directly, while Three.js rasterizes the same source for cards inside deck boxes. Each deck’s sigil is composited afterward so the shared frame cannot drift between renderers.

Easy answers grant one Momentum. At the end of the initial hand, two Momentum can be exchanged for one optional bonus card. Again cards are reinserted behind the next two entries when possible; Hard cards return at the back of the current session.

Progress is intentionally browser-local in this phase. Clearing site data clears progress. A future release can add explicit JSON backup and restore.

## LAN synchronization foundation

The first synchronization layer is under development on `feature/lan-sync-foundation`. On startup the app creates a stable device identity and an immutable bootstrap checkpoint in IndexedDB. Reviews, session completion, deck edits, activation changes, and difficulty changes now append timestamped local events while the existing learner state remains the materialized UI view.

The event foundation includes hybrid logical clocks, idempotent event-set merging, snapshot/event/device stores, and space reserved for transfers and conflicts. Deck Gift snapshots support digest validation, provenance, independent copies, and explicit replacement of a previous gift. The Library provides a complete LAN gift flow: QR display, camera scanning with paste fallback, direct WebRTC pairing, chunked transfer, import preview, and persistent custom decks.

Trusted Device Sync is available from Profile. Two devices enter the same passphrase, pair through offer/answer QR codes, and exchange AES-GCM-encrypted event bundles. No PWA installation is required: the browser build supports camera scanning on HTTPS. Pairing QRs are black-on-white with a quiet zone and can be enlarged; the full pairing code can also be copied and pasted if a camera cannot decode it.

The two codes are inherent to serverless WebRTC: the first device sends an offer, and the second returns an answer. There is no signaling server that could relay the answer automatically. If QR exchange succeeds but the connection times out, the problem is network reachability rather than scanning. Both devices must be on the same Wi-Fi, VPNs and guest-network client isolation must be off, and browsers that request local-network access need that permission. A STUN server is used only to discover a direct route; deck and progress data remain peer-to-peer. Reviews, sessions, XP, deck activation, deck edits, imported decks, and difficulty preferences merge deterministically from hybrid-timestamped events. Known devices are remembered for later passphrase-verified syncs. Cancelled or corrupted exchanges do not apply remote data.

Sync applies from the event log onward. Progress stored before the synchronization foundation was introduced is preserved as a baseline XP value but does not have reconstructable per-card review history on other devices.

## Notifications

The current release deliberately does not claim to deliver background notifications: browsers cannot reliably schedule several local PWA notifications after an app is closed. Dependable multi-device/background reminders require a push-notification backend (and a user subscription), or a native wrapper. This interface is ready to become the preferences screen for that phase.
