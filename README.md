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

## Notifications

The current release deliberately does not claim to deliver background notifications: browsers cannot reliably schedule several local PWA notifications after an app is closed. Dependable multi-device/background reminders require a push-notification backend (and a user subscription), or a native wrapper. This interface is ready to become the preferences screen for that phase.
