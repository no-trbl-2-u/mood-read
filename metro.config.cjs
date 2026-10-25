// Metro, as Expo sets it up, with one change (05.21): the transform cache is keyed on the public app config. The
// web build inlines that config (expo.extra, owner tools included) into the bundle, and Metro's cache, shared by
// every checkout on the machine, does not see a config change on its own, so a production build after an owner-tools
// build (or another checkout's) could ship the stale config: `ownerTools: true` included.
const crypto = require("node:crypto");
const { getConfig } = require("expo/config");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const { exp } = getConfig(__dirname, { isPublicConfig: true, skipSDKVersionRequirement: true });
const appConfigKey = crypto.createHash("sha256").update(JSON.stringify(exp)).digest("hex").slice(0, 16);
config.cacheVersion = `${config.cacheVersion ?? ""}:app-config-${appConfigKey}`;

module.exports = config;
