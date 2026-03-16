import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFallbackImage, toLocalUploadsPath, normalizeMediaUrl } from '../src/utils/media.mjs';

test('toLocalUploadsPath rewrites localhost uploads url to relative path', () => {
  const input = 'http://127.0.0.1:4315/uploads/previews/a.jpg?x=1';
  assert.equal(toLocalUploadsPath(input), '/uploads/previews/a.jpg?x=1');
});

test('normalizeMediaUrl keeps relative uploads path as-is', () => {
  assert.equal(normalizeMediaUrl('/uploads/previews/a.jpg', '192.168.1.8'), '/uploads/previews/a.jpg');
});

test('normalizeMediaUrl rewrites localhost host to current host for non-relative urls', () => {
  const input = 'http://localhost:4315/public/a.jpg';
  assert.equal(normalizeMediaUrl(input, '192.168.1.8'), 'http://192.168.1.8:4315/public/a.jpg');
});

test('makeFallbackImage returns inline svg data url', () => {
  const out = makeFallbackImage('Apple Icon');
  assert.match(out, /^data:image\/svg\+xml;utf8,/);
  assert.match(out, /Apple%20Icon/);
});
