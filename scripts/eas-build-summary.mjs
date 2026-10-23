// The android-preview workflow's last word (chunk 04.1): reads the JSON `eas build --json --wait` printed, writes the
// build page and the APK link to stdout and the job summary, and fails unless the build finished with an APK.
// Usage: node scripts/eas-build-summary.mjs <build.json>
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// `eas build --json` prints an array of builds; `eas build:view --json` prints one. Either is accepted.
export function summarize(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const build = Array.isArray(data) ? data[0] : data;
  if (!build || !build.id) return { ok: false, lines: ['No EAS build in the output.'] };
  const owner = build.app?.ownerAccount?.name;
  const slug = build.app?.slug;
  const page = owner && slug ? `https://expo.dev/accounts/${owner}/projects/${slug}/builds/${build.id}` : null;
  const apk = build.artifacts?.buildUrl ?? null;
  const ok = build.status === 'FINISHED' && Boolean(apk);
  const lines = [
    '## Mood Read Android preview',
    '',
    `- Build: ${build.id} (${build.status})`,
    `- Install (open on the Android phone): ${page ?? 'unknown'}`,
    `- APK: ${apk ?? 'none'}`,
  ];
  if (build.expirationDate) lines.push(`- Expires: ${build.expirationDate}`);
  return { ok, lines };
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const file = argv[0];
  if (!file) {
    console.error('usage: node scripts/eas-build-summary.mjs <build.json>');
    return 2;
  }
  const { ok, lines } = summarize(fs.readFileSync(file, 'utf8'));
  const text = lines.join('\n') + '\n';
  process.stdout.write(text);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  return ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
