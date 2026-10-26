// scripts/web-export-paths.mjs (the build step that keeps package assets out of node_modules paths, which Pages never
// uploads): files move to assets/vendor/<name>/, every reference follows, other assets stay, a leftover is an error.
// node:test, no deps.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { flattenPackageAssets, rewritePath } from '../web-export-paths.mjs';

const PKG = 'assets/node_modules/.pnpm/expo-router@58.0.25_abc/node_modules/expo-router/assets';
const roots = [];
const make = (files) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'web-export-'));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), body);
  }
  return root;
};
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

describe('rewriting a path', () => {
  it('maps a pnpm package path, a scoped one and a plain one to assets/vendor', () => {
    assert.equal(rewritePath(`/${PKG}/error.png`), '/assets/vendor/expo-router/assets/error.png');
    assert.equal(
      rewritePath('assets/node_modules/.pnpm/@scope+p@1_h/node_modules/@scope/p/img/a.png'),
      'assets/vendor/@scope/p/img/a.png',
    );
    assert.equal(rewritePath('assets/node_modules/pkg/a.png'), 'assets/vendor/pkg/a.png');
  });

  it('leaves the app own assets alone', () => {
    assert.equal(rewritePath('/assets/assets/fonts/x.ttf'), '/assets/assets/fonts/x.ttf');
  });
});

describe('flattening an export', () => {
  it('moves the files, rewrites the references, and leaves the rest', () => {
    const dist = make({
      [`${PKG}/error.d1.png`]: 'png',
      [`${PKG}/react-navigation/elements/back-icon.35.png`]: 'icon',
      'assets/assets/fonts/f.ttf': 'font',
      '_expo/static/js/web/entry.js': `a:"/${PKG}/error.d1.png",b:"/${PKG}/react-navigation/elements/back-icon.35.png",c:"/assets/assets/fonts/f.ttf"`,
      'index.html': '<html></html>',
    });
    assert.equal(flattenPackageAssets(dist), 2);
    assert.equal(readFileSync(path.join(dist, 'assets/vendor/expo-router/assets/error.d1.png'), 'utf8'), 'png');
    assert.equal(readFileSync(path.join(dist, 'assets/vendor/expo-router/assets/react-navigation/elements/back-icon.35.png'), 'utf8'), 'icon');
    assert.ok(!existsSync(path.join(dist, 'assets/node_modules')));
    assert.ok(existsSync(path.join(dist, 'assets/assets/fonts/f.ttf')));
    const js = readFileSync(path.join(dist, '_expo/static/js/web/entry.js'), 'utf8');
    assert.ok(!js.includes('node_modules'));
    assert.ok(js.includes('/assets/vendor/expo-router/assets/error.d1.png'));
    assert.ok(js.includes('/assets/assets/fonts/f.ttf'));
  });

  it('is a no-op on an export with no package assets', () => {
    const dist = make({ 'index.html': 'x', 'assets/assets/a.wav': 'w' });
    assert.equal(flattenPackageAssets(dist), 0);
  });

  it('fails when a node_modules path is still there afterwards', () => {
    const dist = make({ 'index.html': 'x', 'other/node_modules/p/a.png': 'x' });
    assert.throws(() => flattenPackageAssets(dist), /node_modules still in the web export/);
    const named = make({ 'index.html': 'x', '_expo/e.js': 'u:"/assets/node_modules/"' });
    assert.throws(() => flattenPackageAssets(named), /node_modules still in the web export/);
  });
});
