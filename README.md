# mood-read

An audiobook player in the spirit of Audible that scores each chapter with music. See [plan/](plan/README.md).

Built with Expo (SDK 58, React Native, Expo Router): a phone app first, with the web build used for development.

## Develop

```sh
npm install
npm run web        # browser (fastest loop; books are kept in IndexedDB)
npm run ios        # needs a development build for background audio and lock-screen controls:
npm run android    #   npx expo run:ios | npx expo run:android
npm test           # pure logic tests (node --test)
npm run typecheck
npx expo lint
```

## Layout

- `src/app/`: screens (Expo Router). `index.tsx` is the library and `book/[id].tsx` is the player.
- `src/player/PlayerProvider.tsx`: the audio engine. One narration player runs on a book-wide clock and
  handles speed, the sleep timer, resume, and the lock screen.
- `src/lib/`: the library store (`library.ts`), book-timeline math (`timeline.ts`), and platform stores.
  `kv` is SQLite on devices and localStorage on web. `media` is the documents folder on devices and IndexedDB on web.
