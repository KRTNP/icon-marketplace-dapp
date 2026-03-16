const { expect } = require('chai');
const { resolveSafeAssetExtension } = require('../lib/uploadUtils');

describe('uploadUtils', function () {
  it('falls back to preferred extension when filename extension is not allowed', function () {
    const ext = resolveSafeAssetExtension('payload.html', 'txt', ['txt', 'json', 'pdf']);
    expect(ext).to.equal('txt');
  });

  it('keeps filename extension when it is in the allow-list', function () {
    const ext = resolveSafeAssetExtension('report.pdf', 'pdf', ['txt', 'json', 'pdf']);
    expect(ext).to.equal('pdf');
  });

  it('falls back to preferred extension when filename has no extension', function () {
    const ext = resolveSafeAssetExtension('asset', 'zip', ['zip']);
    expect(ext).to.equal('zip');
  });
});
