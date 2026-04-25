import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('binds disconnect button click to disconnectWallet', () => {
  assert.equal(/\$\("disconnectBtn"\)\.onclick\s*=\s*disconnectWallet/.test(source), true);
});

test('implements disconnectWallet flow with best-effort metamask revoke', () => {
  assert.equal(/async function disconnectWallet\(\)/.test(source), true);
  assert.equal(/wallet_revokePermissions/.test(source), true);
});

test('updates disconnect button state in connect and restore paths', () => {
  assert.equal(/setDisconnectButtonState\(true\)/.test(source), true);
  assert.equal(/setDisconnectButtonState\(false\)/.test(source), true);
});
