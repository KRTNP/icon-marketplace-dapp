const { expect } = require('chai');
const { createDownloadToken, verifyDownloadToken } = require('../lib/downloadToken');

describe('downloadToken', function () {
  it('creates and verifies token for asset file', function () {
    const secret = 'test-secret';
    const fileName = 'photo.jpg';
    const exp = Math.floor(Date.now() / 1000) + 300;

    const sig = createDownloadToken({ fileName, exp, secret });
    expect(sig).to.be.a('string');
    expect(sig.length).to.be.greaterThan(10);

    const ok = verifyDownloadToken({ fileName, exp, sig, secret, nowSec: exp - 1 });
    expect(ok).to.equal(true);
  });

  it('rejects expired token', function () {
    const secret = 'test-secret';
    const fileName = 'photo.jpg';
    const exp = Math.floor(Date.now() / 1000) - 1;
    const sig = createDownloadToken({ fileName, exp, secret });

    const ok = verifyDownloadToken({ fileName, exp, sig, secret, nowSec: exp + 1 });
    expect(ok).to.equal(false);
  });

  it('rejects tampered filename', function () {
    const secret = 'test-secret';
    const exp = Math.floor(Date.now() / 1000) + 300;
    const sig = createDownloadToken({ fileName: 'photo.jpg', exp, secret });

    const ok = verifyDownloadToken({ fileName: 'other.jpg', exp, sig, secret, nowSec: exp - 1 });
    expect(ok).to.equal(false);
  });
});
