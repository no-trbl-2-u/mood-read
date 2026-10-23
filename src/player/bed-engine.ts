// The bed's players: two expo-audio decks, so a chapter change can crossfade from one loop into the next. It carries
// out src/lib/bed.ts's commands and decides nothing itself. Its rate is always BED_RATE: the narration's speed never
// reaches it (A9).
import { createAudioPlayer, type AudioPlayer, type AudioSource } from "expo-audio";

import { BED_RATE, crossfadeGains, CROSSFADE_MS, type BedCommand } from "@/lib/bed";

const FADE_STEP_MS = 50;
const LOAD_TIMEOUT_MS = 10000;

type Fade = { from: AudioPlayer; to: AudioPlayer | null; started: number; timer: ReturnType<typeof setInterval> };

export type BedEngine = { apply: (command: BedCommand) => void; dispose: () => void };

export function createBedEngine(source: (soundId: string) => AudioSource | undefined): BedEngine {
  const decks: [AudioPlayer, AudioPlayer] = [
    createAudioPlayer(null, { updateInterval: 1000 }),
    createAudioPlayer(null, { updateInterval: 1000 }),
  ];
  let active = 0;
  let fade: Fade | null = null;
  // While a deck loads, the latest play state and place wait here.
  let loading = 0;
  let wantPlay = false;
  let wantOffset = 0;

  const finishFade = () => {
    if (!fade) return;
    clearInterval(fade.timer);
    fade.from.pause();
    fade.from.volume = 1;
    if (fade.to) fade.to.volume = 1;
    fade = null;
  };

  const startFade = (from: AudioPlayer, to: AudioPlayer | null) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const g = crossfadeGains(Date.now() - started, CROSSFADE_MS);
      from.volume = g.out;
      if (to) to.volume = g.in;
      if (g.in >= 1) finishFade();
    }, FADE_STEP_MS);
    fade = { from, to, started, timer };
  };

  const change = (to: string | null, offset: number, play: boolean, withFade: boolean) => {
    finishFade();
    const out = decks[active];
    wantPlay = play;
    wantOffset = offset;
    const src = to ? source(to) : undefined;
    if (!src) {
      loading = 0;
      if (withFade && out.playing) startFade(out, null);
      else out.pause();
      return;
    }
    active = 1 - active;
    const inc = decks[active];
    const token = ++loading;
    if (!withFade) out.pause();
    inc.replace(src);
    inc.loop = true;
    inc.volume = withFade ? 0 : 1;
    const started = Date.now();
    const ready = () => {
      if (token !== loading) return;
      if (!inc.isLoaded) {
        if (Date.now() - started < LOAD_TIMEOUT_MS) setTimeout(ready, FADE_STEP_MS);
        else out.pause();
        return;
      }
      loading = 0;
      inc.setPlaybackRate(BED_RATE);
      inc.seekTo(wantOffset).catch(() => {});
      if (!wantPlay) {
        out.pause();
        inc.volume = 1;
        return;
      }
      inc.play();
      if (withFade && out.playing) startFade(out, inc);
      else {
        out.pause();
        inc.volume = 1;
      }
    };
    ready();
  };

  return {
    apply(command) {
      switch (command.type) {
        case "change":
          change(command.to, command.offset, command.play, command.fade);
          return;
        case "seek":
          wantOffset = command.offset;
          if (loading) return;
          finishFade();
          decks[active].seekTo(command.offset).catch(() => {});
          return;
        case "play":
          wantPlay = true;
          if (!loading) decks[active].play();
          return;
        case "pause":
          wantPlay = false;
          finishFade();
          decks.forEach((d) => d.pause());
          return;
      }
    },
    dispose() {
      finishFade();
      loading = 0;
      decks.forEach((d) => d.remove());
    },
  };
}
