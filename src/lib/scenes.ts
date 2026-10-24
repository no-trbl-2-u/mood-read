// Reading a chapter's scenes (spec 07, 07.1). Scenes are optional in the contract so books scored before 07.1 keep
// reading: a scored chapter with no scenes is one scene, the whole chapter, and plays its own piece throughout.
import type { ChapterMood, ChapterPlaylist, Scene } from "./types.ts";

/**
 * A chapter's scenes in order: its own, else one scene equal to the chapter; none when it is unscored. A listener's
 * seed (07.6) is one scene, the whole chapter, so its matched piece plays throughout.
 */
export function scenesOf(mood: ChapterMood): Scene[] {
  if (mood.coverage === "too-little" || mood.emotions.length === 0) return [];
  if (mood.coverage === "listener") return [{ emotions: mood.emotions, span: 1 }];
  if (Array.isArray(mood.scenes) && mood.scenes.length > 0) return mood.scenes;
  return [{ emotions: mood.emotions, span: 1 }];
}

/**
 * The piece id for each of a chapter's `count` scenes: the listener's pick for all of them when they picked one (a
 * pick covers the chapter, D18), else the playlist's scene pieces when they match the scenes one for one, else the
 * chapter's piece for every scene.
 */
export function scenePiecesOf(playlist: ChapterPlaylist | null, count: number): string[] {
  if (!playlist) return [];
  if (playlist.pick !== "auto") return Array.from({ length: count }, () => playlist.pick);
  const own = playlist.scenePieces;
  if (Array.isArray(own) && own.length === count) return own;
  return Array.from({ length: count }, () => playlist.piece);
}
