// The real YouTube sign-in (01.11, spec 01 A24's playlist half), the thin Expo wiring that src/lib/youtube-playlist.ts
// stays free of (the scoring.ts / scoring-api.ts split, agents.md): not unit-tested directly, same as scoring.ts,
// because it reaches expo-constants, expo-auth-session and expo-web-browser, none of which load under plain
// `node --test` (no Metro, no React Native runtime). Only the app (src/app/book/[id].tsx) imports this file.
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";

// Completes the browser-based auth session on return (expo-auth-session's own contract); a no-op until a sign-in
// is actually started.
WebBrowser.maybeCompleteAuthSession();

/** The placeholder in app.json (`expo.extra.youtubeOAuthClientId`): resolves nowhere until the owner registers a
 *  real Google Cloud OAuth client (installed-app / PKCE, no client secret) and sets the real value — the same
 *  pattern 01.20 used for `scoringProxyUrl`. */
export const PLACEHOLDER_CLIENT_ID = "youtube-oauth-client.invalid";

export const YOUTUBE_OAUTH_CLIENT_ID: string =
  (Constants.expoConfig?.extra?.youtubeOAuthClientId as string | undefined) ?? PLACEHOLDER_CLIENT_ID;

/** False while the owner hasn't set a real client id yet; `saveAsYoutubePlaylist` reads this as `configured`. */
export const youtubeConfigured: boolean = YOUTUBE_OAUTH_CLIENT_ID !== PLACEHOLDER_CLIENT_ID;

/** Google's known OAuth 2.0 endpoints (accounts.google.com); fixed, so no discovery fetch is needed up front. */
const DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

const SCOPE = "https://www.googleapis.com/auth/youtube";

/**
 * Google's OAuth 2.0 Authorization Code flow with PKCE, no client secret (an installed app). `makeRedirectUri()`
 * already works for both the web build and the native "moodread" scheme declared in app.json. Resolves `null` on
 * cancel or dismiss, never throws for that — only for something actually broken.
 */
export async function googleSignIn(): Promise<string | null> {
  const redirectUri = AuthSession.makeRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId: YOUTUBE_OAUTH_CLIENT_ID,
    scopes: [SCOPE],
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== "success" || !result.params.code) return null;
  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId: YOUTUBE_OAUTH_CLIENT_ID,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? "" },
    },
    DISCOVERY,
  );
  return token.accessToken || null;
}
