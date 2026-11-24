# Opus Pusillium

An offline-first PWA prototype for esoteric study: Latin, Biology, and Alchemy.

## Develop on NixOS

```sh
devenv shell
npm install
npm run dev
```

Build the production bundle with `npm run build`.

Run browser tests and create study-flow screenshots with:

```sh
npm run test:e2e
```

Chromium is supplied by `devenv`, so no separate browser download is needed on NixOS. Reports and screenshots are written below `test-results/`.

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
- Anki-inspired Again, Hard, Good, and Easy review ratings with day-scale intervals.
- Distinct unseen and due-card frames, plus three earned card-rank upgrades at 2, 5, and 9 failures.
- Rank-weighted experience, a 100-XP level meter, and session-local Momentum earned from Easy answers.

## Learning data

The bundled library currently contains Latin, Biology, Alchemy, Tamil, and Norwegian. Tamil includes 18 cards derived from flip-card and vowel matching material. Norwegian contains 496 two-way vocabulary cards. Ten-card sessions are shuffled and, whenever possible, mix roughly seven due reviews with three unseen cards. Ratings update day-scale review intervals.

Easy answers grant one Momentum. At the end of the initial hand, two Momentum can be exchanged for one optional bonus card. Again cards are reinserted behind the next two entries when possible; Hard cards return at the back of the current session.

Progress is intentionally browser-local in this phase. Clearing site data clears progress. A future release can add explicit JSON backup and restore.

## Notifications

The current release deliberately does not claim to deliver background notifications: browsers cannot reliably schedule several local PWA notifications after an app is closed. Dependable multi-device/background reminders require a push-notification backend (and a user subscription), or a native wrapper. This interface is ready to become the preferences screen for that phase.
