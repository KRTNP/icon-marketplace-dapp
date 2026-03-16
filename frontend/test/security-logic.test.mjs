import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, shouldIgnorePurchaseCheckError } from '../src/utils/security.mjs';

test('escapeHtml escapes dangerous characters', () => {
  const input = `\"><img src=x onerror=alert('xss')>`;
  const out = escapeHtml(input);
  assert.equal(out, '&quot;&gt;&lt;img src=x onerror=alert(&#39;xss&#39;)&gt;');
});

test('shouldIgnorePurchaseCheckError only ignores icon missing errors', () => {
  assert.equal(shouldIgnorePurchaseCheckError('execution reverted: Icon does not exist'), true);
  assert.equal(shouldIgnorePurchaseCheckError('missing revert data'), false);
  assert.equal(shouldIgnorePurchaseCheckError('execution reverted'), false);
});
