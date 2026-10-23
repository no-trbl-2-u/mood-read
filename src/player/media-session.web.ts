// The browser's Media Session (media keys, the OS media overlay) on the book's own timeline. expo-audio's web
// player registers handlers that seek inside the current file only; these replace them so play, pause and the
// 30 s skips act on the whole book, across files. Call after every setActiveForLockScreen() and replace(),
// since expo-audio re-registers its own handlers on both.
import { SKIP_SECONDS } from "@/lib/timeline";

export type MediaSessionHandlers = {
  play: () => void;
  pause: () => void;
  skip: (deltaSeconds: number) => void;
};

export function bindMediaSession(h: MediaSessionHandlers): void {
  const session = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  if (!session) return;
  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // An action this browser does not support: leave it.
    }
  };
  set("play", () => h.play());
  set("pause", () => h.pause());
  set("seekbackward", (d) => h.skip(-(d.seekOffset ?? SKIP_SECONDS)));
  set("seekforward", (d) => h.skip(d.seekOffset ?? SKIP_SECONDS));
}
