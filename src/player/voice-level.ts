// The narration's level, for duck under voice (01.5, A11). Measured on the device from expo-audio's own sampling of
// the narration player and handed straight to src/lib/mix.ts's detector: nothing is kept, recorded or sent
// (agents.md rule 6).
//
// - Web: expo-audio routes the narration element through a Web Audio AnalyserNode and reports a block of samples
//   on every animation frame while it plays (a hidden tab pauses the frames, so the duck holds where it was).
// - iOS: expo-audio installs an audio tap on the player; no permission is involved.
// - Android: expo-audio samples through the Visualizer, which needs the RECORD_AUDIO permission. Mood Read does not
//   ask for the microphone (app.json sets recordAudioAndroid false), so here duck under voice is a no-op: the bed
//   stays at the mix's level, un-ducked.
import type { AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

/** Whether this platform can measure the narration for the duck. */
export const VOICE_LEVEL_SUPPORTED = Platform.OS !== "android";

/** Starts sampling the narration and calls `onFrames` with each block; returns the unsubscribe. */
export function listenToVoice(player: AudioPlayer, onFrames: (frames: ArrayLike<number>) => void): () => void {
  if (!VOICE_LEVEL_SUPPORTED) return () => {};
  try {
    player.setAudioSamplingEnabled(true);
  } catch {
    return () => {};
  }
  const sub = player.addListener("audioSampleUpdate", (sample) => {
    const frames = sample.channels[0]?.frames;
    if (frames) onFrames(frames);
  });
  return () => sub.remove();
}

/** Stops sampling the narration (duck turned off). */
export function stopVoice(player: AudioPlayer): void {
  if (!VOICE_LEVEL_SUPPORTED) return;
  try {
    player.setAudioSamplingEnabled(false);
  } catch {
    // Never sampling is the same as stopped.
  }
}
