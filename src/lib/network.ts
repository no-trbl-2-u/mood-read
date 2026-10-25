// The device's network state, bound to expo-network: whether it is on Wi-Fi right now, and a way to hear it change.
// The rules (what counts as Wi-Fi, what a failed read means) live in ./network-watch.ts so tests run them; this file
// only supplies the platform reader and listener. The download queue (./downloads.ts) and the verdict sender
// (./verdicts.ts) read it for Wi-Fi-only (06.3). The web build's expo-network module reports UNKNOWN while online,
// which counts as Wi-Fi, so a browser is never held back.
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";

import { createNetworkWatch, type NetworkType } from "./network-watch";

export const network = createNetworkWatch({
  read: async () => {
    const state = await getNetworkStateAsync();
    return { type: state.type as NetworkType | undefined };
  },
  listen: (onChange) => {
    addNetworkStateListener((state) => onChange({ type: state.type as NetworkType | undefined }));
  },
});
