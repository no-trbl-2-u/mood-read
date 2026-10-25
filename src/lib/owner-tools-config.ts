// Whether this build shows the owner tools (05.21): `expo.extra.ownerTools` as app.config.ts set it at build time.
import Constants from "expo-constants";

import { ownerToolsOn } from "./owner-tools";

export const OWNER_TOOLS: boolean = ownerToolsOn(Constants.expoConfig?.extra);
