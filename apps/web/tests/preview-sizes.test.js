import test from 'node:test';
import assert from 'node:assert/strict';
import { previewProfiles, previewSpec, castGridSize } from '../preview-sizes.js';

test('versioned CUBE content sizes distinguish fixed web cards from conditional CAST', () => {
  assert.deepEqual(['compact', 'wide', 'cast', 'detail'].map(key => [previewProfiles[key].width, previewProfiles[key].height]), [[170, 170], [368, 170], [128, 128], [457, 900]]);
  assert.match(previewProfiles.cast.basis, /并非固定规格/);
  assert.equal(previewSpec('cast', new URLSearchParams('castHost=desktop16')).width, 136.375);
  assert.equal(previewSpec('cast', new URLSearchParams('castHost=phone375')).width, 113);
  assert.match(previewProfiles.detail.basis, /本地测试值/);
  assert.equal(castGridSize(912), 128);
  assert.equal(castGridSize(1283, 16), 136.375);
  assert.ok(Math.abs(castGridSize(375, 6, 16 * 375 / 750) - 113) < .001);
});

test('preview overrides preserve layout viewport independently of zoom and reject invalid input', () => {
  const custom = previewSpec('cast', new URLSearchParams('width=136.375&height=136.375&zoom=2'));
  assert.equal(custom.width, 136.375); assert.equal(custom.height, 136.375); assert.equal(custom.zoom, 2); assert.equal(custom.custom, true);
  const invalid = previewSpec('wide', new URLSearchParams('width=NaN&height=0&zoom=7'));
  assert.equal(invalid.width, 368); assert.equal(invalid.height, 170); assert.equal(invalid.zoom, 1);
});
