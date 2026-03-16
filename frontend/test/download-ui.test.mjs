import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDownloadMeta, formatFileSize, isUnsafeDirectAssetUrl } from '../src/utils/download-ui.mjs';

test('extractDownloadMeta derives filename and extension label from url', () => {
  const meta = extractDownloadMeta('http://localhost:4315/api/download-asset/photo.jpg?exp=1&sig=abc');
  assert.equal(meta.fileName, 'photo.jpg');
  assert.equal(meta.fileType, 'JPG image');
});

test('extractDownloadMeta handles urls without extension', () => {
  const meta = extractDownloadMeta('http://localhost:4315/api/download-asset/download?exp=1&sig=abc');
  assert.equal(meta.fileName, 'download');
  assert.equal(meta.fileType, 'File');
});

test('formatFileSize formats bytes to human-readable value', () => {
  assert.equal(formatFileSize(600), '600 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(3145728), '3.0 MB');
});

test('isUnsafeDirectAssetUrl flags direct uploads asset urls', () => {
  assert.equal(isUnsafeDirectAssetUrl('/uploads/assets/file.jpg'), true);
  assert.equal(isUnsafeDirectAssetUrl('http://localhost:8080/uploads/assets/file.jpg'), true);
  assert.equal(isUnsafeDirectAssetUrl('http://127.0.0.1:4315/api/download-asset/file.jpg?exp=1&sig=x'), false);
});
