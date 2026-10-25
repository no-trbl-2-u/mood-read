// Whether the device is on Wi-Fi right now, for Wi-Fi-only (06.3): the download queue (05.6, ./download-queue.ts)
// and the verdict sender (07.5, ./verdict-sync.ts) hold back off Wi-Fi when the setting is on. Pure over a reader
// and a listener, so `node --test` runs the code the app runs; ./network.ts binds it to expo-network.
//
// Rules, each tested in ./network-watch.test.ts:
//   - Wi-Fi and Ethernet count as Wi-Fi; mobile data, Bluetooth, WiMAX, "other" and no network do not;
//   - a type the device cannot name (UNKNOWN, and VPN, which hides the link under it) counts as Wi-Fi: the web build
//     only ever reports UNKNOWN while online, and a browser is never held back on a guess;
//   - until the first reading arrives the answer is no, so nothing starts on mobile data in the moment after launch;
//     subscribers hear the first reading and every change, so a held-back download starts on its own.

/** expo-network's NetworkStateType values, as strings so this file needs no native import. */
export type NetworkType = "NONE" | "UNKNOWN" | "CELLULAR" | "WIFI" | "BLUETOOTH" | "ETHERNET" | "WIMAX" | "VPN" | "OTHER";

export function countsAsWifi(type: NetworkType | undefined): boolean {
  return type === "WIFI" || type === "ETHERNET" || type === "UNKNOWN" || type === "VPN";
}

export function createNetworkWatch(deps: {
  read: () => Promise<{ type?: NetworkType }>;
  listen: (onChange: (state: { type?: NetworkType }) => void) => void;
}) {
  let wifi = false;
  let heard = false; // a pushed change is newer than the first read, which must not overwrite it
  const listeners = new Set<() => void>();

  function update(state: { type?: NetworkType }): void {
    wifi = countsAsWifi(state.type);
    for (const fn of listeners) fn();
  }

  deps.listen((state) => {
    heard = true;
    update(state);
  });
  deps.read().then(
    (state) => void (heard || update(state)),
    () => void (heard || update({ type: "UNKNOWN" })),
  );

  return {
    onWifi: (): boolean => wifi,
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

export type NetworkWatch = ReturnType<typeof createNetworkWatch>;
