// On iOS and Android the lock screen and media keys are expo-audio's (setActiveForLockScreen with 30 s seek
// intervals, in PlayerProvider); there is nothing more to bind. The web binding is media-session.web.ts.
export type MediaSessionHandlers = {
  play: () => void;
  pause: () => void;
  skip: (deltaSeconds: number) => void;
};

export function bindMediaSession(_h: MediaSessionHandlers): void {}
