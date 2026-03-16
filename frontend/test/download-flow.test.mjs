import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/download.js', import.meta.url), 'utf8');

test('download flow is user-triggered (no auto prepareDownload call)', () => {
  assert.equal(/\nprepareDownload\(\);\s*$/m.test(source), false);
});

test('download flow binds reveal button click to prepareDownload', () => {
  assert.equal(/revealBtnEl\.onclick\s*=\s*prepareDownload/.test(source), true);
});
