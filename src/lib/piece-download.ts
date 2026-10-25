// Downloads a catalog piece onto the device (spec 05, 05.4, A4): the `Transfer` src/lib/downloads.ts hands the download
// queue for a "piece" target, as src/lib/librivox-download.ts is for a "book" one. The piece is looked up in the
// catalog this session read (src/lib/catalog-config.ts loadCatalog), must still be one the player may play (mayPlay,
// A18), and lands in its one shared file (media.ts pieceFile; the browser's store on the web build), whichever book
// asked for it. Its progress reports the catalog's file size until the server says otherwise.
import { pieceAudioUrl } from "./catalog-api";
import { CATALOG_BASE_URL, loadCatalog } from "./catalog-config";
import type { Transfer } from "./download-queue";
import { downloadPieceFile } from "./media";
import { mayPlay } from "./piece-source";

export const pieceTransfer: Transfer = async (download, onProgress, signal) => {
  if (download.target.kind !== "piece") throw new Error("This download is not a piece");
  const id = download.target.pieceId;
  const read = await loadCatalog();
  const piece = read.catalog.pieces.find((p) => p.id === id);
  if (!piece) throw new Error("This piece is no longer in the music catalog");
  if (!mayPlay(piece)) throw new Error("This piece may not play in Mood Read");
  const size = piece.file.bytes;
  await downloadPieceFile(piece.file.key, pieceAudioUrl(CATALOG_BASE_URL, piece), (bytes, total) => onProgress(bytes, total ?? size), signal);
};
