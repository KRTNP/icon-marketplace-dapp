import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextFocusIndex, shouldReloadForWalletChange } from '../src/utils/ui-flow.mjs';

test('getNextFocusIndex wraps forward when at end', () => {
  assert.equal(getNextFocusIndex({ count: 3, currentIndex: 2, shiftKey: false }), 0);
});

test('getNextFocusIndex wraps backward when at start + shift', () => {
  assert.equal(getNextFocusIndex({ count: 3, currentIndex: 0, shiftKey: true }), 2);
});

test('getNextFocusIndex returns null when no wrap required', () => {
  assert.equal(getNextFocusIndex({ count: 3, currentIndex: 1, shiftKey: false }), null);
  assert.equal(getNextFocusIndex({ count: 3, currentIndex: 1, shiftKey: true }), null);
});

test('shouldReloadForWalletChange is false for same address different case', () => {
  assert.equal(
    shouldReloadForWalletChange({ currentAccount: '0xAbCDEF1234', nextAccounts: ['0xabcdef1234'] }),
    false
  );
});

test('shouldReloadForWalletChange detects disconnect and account switch', () => {
  assert.equal(
    shouldReloadForWalletChange({ currentAccount: '0xabcdef1234', nextAccounts: [] }),
    true
  );
  assert.equal(
    shouldReloadForWalletChange({ currentAccount: '0xabcdef1234', nextAccounts: ['0x9999999999'] }),
    true
  );
});
