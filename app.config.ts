// The app config: app.json, plus one switch it cannot hold (05.21). `extra.ownerTools` turns on Settings' "Owner tools"
// (spec 05, A23): on in local dev (`pnpm web`, where the Expo CLI runs the config with NODE_ENV=development) and in a
// build whose environment sets MOOD_READ_OWNER_TOOLS=1 (eas.json's preview profile; `pnpm e2e:owner`). A production
// web export (`pnpm build`, the deploy and the e2e gate) and a store build set neither, so they never show it.
import type { ConfigContext, ExpoConfig } from "expo/config";

export const ownerToolsFromEnv = (env: Record<string, string | undefined>): boolean =>
  env.MOOD_READ_OWNER_TOOLS === "1" || env.NODE_ENV === "development";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: { ...config.extra, ownerTools: ownerToolsFromEnv(process.env) },
});
