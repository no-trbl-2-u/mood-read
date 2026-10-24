// The bed's players: two expo-audio decks, so a chapter change can crossfade from one loop into the next. It carries
// out src/lib/bed.ts's commands and decides nothing itself. Its rate is always BED_RATE: the narration's speed never
// reaches it (A9). Each deck's volume is its crossfade gain times the level the mixer sets (01.5: the bed's share of
// balance and master, times the duck), composed by src/lib/mix.ts.
//
// The enter-exit gain (07.3): while the bed plays, the engine samples the envelope it is given (src/lib/bed.ts
// bedEnvelope: the enter ramp, the quiet opening, the sleep fade) every FADE_STEP_MS and multiplies it into every
// deck, so a ramp moves smoothly between the clock's ticks. A pause with a fade (the book's end, a companion-mode
// pause) plays the bed on under the exit ramp (exitGain) and stops it once silent.
//
// Scenes (07.2, spec 07 A2): the provider plans the clock's scene (src/lib/bed.ts planScene) and hands the engine a
// scene command when it moves. Until 01.10 plays pieces the engine only logs it (sceneLogLine) and keeps the scene
// it is in (`scene()`): the decks, and so the soundscape heard, do not change at a scene boundary.
import { createAudioPlayer, type AudioPlayer, type AudioSource } from "expo-audio";

import { BED_RATE, crossfadeGains, CROSSFADE_MS, exitGain, sceneLogLine, type BedCommand, type SceneCommand } from "@/lib/bed";
import { bedVolume } from "@/lib/mix";

const FADE_STEP_MS = 50;
const LOAD_TIMEOUT_MS = 10000;

type Fade = { from: AudioPlayer; to: AudioPlayer | null; started: number; timer: ReturnType<typeof setInterval> };

export type BedEngine = {
  apply: (command: BedCommand) => void;
  /** The mixer's level for the bed (0 to 1): its share of balance and master; and the duck's gain. */
  setLevel: (level: number, duck?: number) => void;
  /** Where the enter-exit gain is read from while the bed plays (src/lib/bed.ts bedEnvelope). */
  setEnvelope: (read: () => number) => void;
  /** The last scene command carried out (07.2), or null: what 01.10 crossfades to. */
  scene: () => SceneCommand | null;
  dispose: () => void;
};

export function createBedEngine(source: (soundId: string) => AudioSource | undefined): BedEngine {
  const decks: [AudioPlayer, AudioPlayer] = [
    createAudioPlayer(null, { updateInterval: 1000 }),
    createAudioPlayer(null, { updateInterval: 1000 }),
  ];
  // Each deck's crossfade gain; its volume is that times the mixer's level, the duck and the enter-exit gain.
  const gains = new Map<AudioPlayer, number>(decks.map((d) => [d, 1]));
  let level = 1;
  let duck = 1;
  let envelope = 1;
  let exit = 1;
  let readEnvelope: () => number = () => 1;
  const volumeOf = (deck: AudioPlayer) => bedVolume(level, gains.get(deck) ?? 1, duck, envelope * exit);
  const applyVolumes = () => decks.forEach((d) => (d.volume = volumeOf(d)));
  const setGain = (deck: AudioPlayer, gain: number) => {
    gains.set(deck, gain);
    deck.volume = volumeOf(deck);
  };
  let active = 0;
  let fade: Fade | null = null;
  let lastScene: SceneCommand | null = null;
  // While a deck loads, the latest play state and place wait here.
  let loading = 0;
  let wantPlay = false;
  let wantOffset = 0;

  // The envelope's sampler, running while the bed plays or fades out.
  let ticker: ReturnType<typeof setInterval> | null = null;
  let exiting: { started: number; fadeMs: number } | null = null;
  const sample = () => {
    const before = envelope * exit;
    envelope = readEnvelope();
    if (exiting) exit = exitGain(Date.now() - exiting.started, exiting.fadeMs);
    // Held steady (the most of a listen), nothing is written: each write crosses to the native player.
    if (envelope * exit !== before) applyVolumes();
    if (exiting && exit <= 0) finishExit();
    else if (!wantPlay && !exiting) stopTicker();
  };
  const startTicker = () => {
    sample();
    if (!ticker && (wantPlay || exiting)) ticker = setInterval(sample, FADE_STEP_MS);
  };
  const stopTicker = () => {
    if (ticker) clearInterval(ticker);
    ticker = null;
  };
  // The exit ramp done (or cut short by a change): the bed stops, and the next entry starts from its own ramp.
  const finishExit = () => {
    if (!exiting) return;
    exiting = null;
    exit = 1;
    if (!wantPlay) {
      decks.forEach((d) => d.pause());
      stopTicker();
    }
    applyVolumes();
  };

  const finishFade = () => {
    if (!fade) return;
    clearInterval(fade.timer);
    fade.from.pause();
    setGain(fade.from, 1);
    if (fade.to) setGain(fade.to, 1);
    fade = null;
  };

  const startFade = (from: AudioPlayer, to: AudioPlayer | null) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const g = crossfadeGains(Date.now() - started, CROSSFADE_MS);
      setGain(from, g.out);
      if (to) setGain(to, g.in);
      if (g.in >= 1) finishFade();
    }, FADE_STEP_MS);
    fade = { from, to, started, timer };
  };

  const change = (to: string | null, offset: number, play: boolean, withFade: boolean) => {
    finishExit();
    finishFade();
    const out = decks[active];
    wantPlay = play;
    wantOffset = offset;
    if (play) startTicker();
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
    setGain(inc, withFade ? 0 : 1);
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
        setGain(inc, 1);
        return;
      }
      inc.play();
      if (withFade && out.playing) startFade(out, inc);
      else {
        out.pause();
        setGain(inc, 1);
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
          exiting = null;
          exit = 1;
          startTicker();
          if (!loading) decks[active].play();
          return;
        case "pause":
          wantPlay = false;
          finishFade();
          if (command.fadeMs && command.fadeMs > 0 && !loading && decks[active].playing) {
            // Play on under the exit ramp; the sampler stops the bed once it is silent.
            decks.forEach((d) => d !== decks[active] && d.pause());
            exiting = { started: Date.now(), fadeMs: command.fadeMs };
            startTicker();
            return;
          }
          exiting = null;
          exit = 1;
          decks.forEach((d) => d.pause());
          return;
        case "scene":
          // Until 01.10 plays pieces: logged, and the soundscape plays on unchanged.
          lastScene = command;
          console.info(sceneLogLine(command));
          return;
      }
    },
    setLevel(next, nextDuck = 1) {
      if (next === level && nextDuck === duck) return;
      level = next;
      duck = nextDuck;
      applyVolumes();
    },
    setEnvelope(read) {
      readEnvelope = read;
      if (wantPlay) sample();
    },
    scene: () => lastScene,
    dispose() {
      stopTicker();
      exiting = null;
      finishFade();
      loading = 0;
      decks.forEach((d) => d.remove());
    },
  };
}
