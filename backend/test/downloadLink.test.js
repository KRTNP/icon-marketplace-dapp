const { expect } = require('chai');
const { toSignedDownloadURL } = require('../lib/downloadLink');

describe('downloadLink', function () {
  const options = {
    apiPublicBaseUrl: 'http://127.0.0.1:4315',
    secret: 'test-secret',
    ttlSeconds: 300,
    nowSec: 1000
  };

  it('signs relative local uploads asset path', function () {
    const out = toSignedDownloadURL('/uploads/assets/file.jpg', options);
    expect(out.downloadURL).to.match(/^http:\/\/127\.0\.0\.1:4315\/api\/download-asset\/file\.jpg\?exp=1300&sig=/);
    expect(out.fileMeta.fileName).to.equal('file.jpg');
  });

  it('signs absolute local uploads asset url', function () {
    const out = toSignedDownloadURL('http://localhost:4315/uploads/assets/file.jpg', options);
    expect(out.downloadURL).to.match(/^http:\/\/127\.0\.0\.1:4315\/api\/download-asset\/file\.jpg\?exp=1300&sig=/);
    expect(out.fileMeta.fileName).to.equal('file.jpg');
  });

  it('keeps non-local urls unchanged', function () {
    const out = toSignedDownloadURL('https://cdn.example.com/file.jpg', options);
    expect(out.downloadURL).to.equal('https://cdn.example.com/file.jpg');
    expect(out.fileMeta).to.equal(null);
  });
});
