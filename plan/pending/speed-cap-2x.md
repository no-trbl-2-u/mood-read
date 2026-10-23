---
date: 2026-10-23
---
## Edit plan/01-audiobook-player-app-similar-to-audible.md
~~~ old
- **A2** Speed runs 0.5× to 3× without pitch change; a sleep timer stops playback after N minutes or at chapter end.
~~~
~~~ new
- **A2** Speed runs 0.5× to 3× without pitch change (0.5× to 2× on Android and iOS, where the audio engine caps it);
  a sleep timer stops playback after N minutes or at chapter end.
~~~

## Edit plan/01-audiobook-player-app-similar-to-audible.md
~~~ old
    closes A4; A2's native 3x follows the owner's answer on the 2x cap (plan/AUDIT.md).
~~~
~~~ new
    closes A4, and its 0.5x to 2x speed with pitch kept closes A2 (native caps at 2x, D?native-speed-2x).
~~~

## Decisions
- **D?native-speed-2x** · 2026-10-23 · Native playback speed stops at 2x, where expo-audio clamps it on Android and iOS; the web build keeps 3x. No expo-audio patch and no engine switch for 3x. *Why:* the owner's call at the heads-down end gate: "2x is fine".
