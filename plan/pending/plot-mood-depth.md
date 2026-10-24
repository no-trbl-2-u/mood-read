---
date: 2026-10-24
---
## Edit plan/README.md
~~~ old
| 4 | Android preview APKs: Mood Read installed on a real phone from a preview APK built from main, before any store; iOS after v1 | [04-android-preview.md](04-android-preview.md) | planned | 1 left |
~~~
~~~ new
| 4 | Android preview APKs: Mood Read installed on a real phone from a preview APK built from main, before any store; iOS after v1 | [04-android-preview.md](04-android-preview.md) | planned | 1 left |
| 7 | Mood depth: scenes inside a chapter with their own pieces, a bed that fades in, fades out and holds for the narrator's opening, "Fits" / "Doesn't fit" verdicts that order alternates for every listener, a listener-seeded mood for unscored books, and a mood fingerprint and filter on the shelf with a Your soundtrack list | [07-mood-depth.md](07-mood-depth.md) | planned | 8 left |
~~~

## Decisions
- **D?scene-pick** · 2026-10-24 · A listener's pick covers the whole chapter: picking an alternate replaces every
  scene's piece with it. *Why:* a pick is "I want this under this chapter"; per-scene picks would mean four
  decisions per chapter and a card the listener has to manage.
- **D?verdicts-as-counts** · 2026-10-24 · Listener verdicts leave the device only as daily `{pieceId, emotions,
  verdict}` aggregates with no book, chapter, device or time, and the proxy stores counts only. *Why:* the proxy's
  promise is no listener data; counts per piece and emotion set are about the catalog, not the listener.
