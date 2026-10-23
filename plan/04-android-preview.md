# 04 · Android preview APKs: Mood Read on a real phone before any store

> The owner installs Mood Read on an Android phone from a preview APK built from main, so background audio and
> lock-screen controls are tried where the web build can't prove them. iOS waits until after v1.

Agent-facing spec. Every judgment call is made below; a build that meets a new one decides it and records it in the
commit body.

## Why

From the owner (2026-10-23), asked when to join the Apple Developer Program: "Let's do an android release first
(preview APKs). Once we get past our v1 mvp, we'll revisit this." Spec 02 builds only the web target ("No EAS builds
in this spec: native builds are a later spec's call"). Spec 01's player promises background playback and
lock-screen controls (A4), which only a native build shows. The vault already names `EXPO_TOKEN` for EAS
(`plan/bearings.md`, External services 04).

## Design

- **EAS Build, `preview` profile, APK.** An `eas.json` with a `preview` profile that builds an installable APK
  (Android `buildType: apk`, internal distribution), from the Android package `com.moodread.app` spec 02 set. Read
  the installed `expo` major and the matching EAS docs before writing it (`plan/bearings.md`, "Expo moves fast").
- **On demand, never per push.** One command (`pnpm build:android:preview`) and a manual GitHub Actions run
  (`workflow_dispatch`) start a build from main through `EXPO_TOKEN`; neither runs in `pnpm verify` or on every
  push. The run prints the install link EAS returns.
- **No store.** No Google Play listing, no signing for the store, no iOS build and no Apple Developer Program in
  this spec (the owner's call, 2026-10-23: after v1).
- **Nothing new ships in the app.** No AI or search key, as everywhere (A22 in spec 01).

## Contracts

- `eas.json` (profile `preview`), the script `build:android:preview` in `package.json`, and
  `.github/workflows/android-preview.yml` (manual only).

## Acceptance

- **A1** One command, or a manual Actions run, builds an Android preview APK from main through EAS and prints a
  link the owner opens on an Android phone to install Mood Read.
- **A2** On a real Android phone the installed preview plays a book, keeps playing with the screen off, and answers
  the lock-screen controls (spec 01 A4), checked by the owner and recorded in the close.

## Open questions

- None now. The Play Store, iOS and the Apple Developer Program come back after v1 (`plan/AUDIT.md`).

## Chunks
Measure: 2 open · 0 closed · next A3

- [ ] **04.1** Android preview APKs through EAS Build, on demand from main · M · closes A1, A2 · needs 01.1 ·
  secrets EXPO_TOKEN
  - A2 needs the owner's phone: the build lands A1, then the close records the owner's check; under a loop with no
    one at hand, it parks A2's check in the `/oversight` queue and closes only when it is done.
