// eas-build-summary.mjs: the install link and the APK come out of `eas build --json`'s output (an array) or
// `eas build:view --json`'s (one build), and anything short of a finished build with an APK fails. node:test, no deps.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarize } from '../eas-build-summary.mjs';

const build = {
  id: 'b1',
  status: 'FINISHED',
  app: { slug: 'mood-read', ownerAccount: { name: 'owner' } },
  artifacts: { buildUrl: 'https://expo.dev/artifacts/eas/x.apk' },
  expirationDate: '2027-01-21T00:00:00.000Z',
};

describe('summarize', () => {
  it('prints the build page and the APK for a finished build, from an array or one build', () => {
    for (const input of [JSON.stringify([build]), build]) {
      const { ok, lines } = summarize(input);
      assert.equal(ok, true);
      assert.ok(lines.includes('- Install (open on the Android phone): https://expo.dev/accounts/owner/projects/mood-read/builds/b1'));
      assert.ok(lines.includes('- APK: https://expo.dev/artifacts/eas/x.apk'));
      assert.ok(lines.includes('- Expires: 2027-01-21T00:00:00.000Z'));
    }
  });

  it('fails a build that did not finish or has no APK', () => {
    assert.equal(summarize([{ ...build, status: 'ERRORED' }]).ok, false);
    assert.equal(summarize([{ ...build, artifacts: {} }]).ok, false);
    assert.ok(summarize([{ ...build, artifacts: {} }]).lines.includes('- APK: none'));
  });

  it('fails empty output', () => {
    assert.equal(summarize('[]').ok, false);
    assert.equal(summarize({}).ok, false);
  });
});
