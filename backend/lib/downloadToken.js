const crypto = require('node:crypto');

const createDownloadToken = ({ fileName, exp, secret }) => {
  const payload = `${String(fileName)}:${Number(exp)}`;
  return crypto.createHmac('sha256', String(secret || ''))
    .update(payload)
    .digest('hex');
};

const timingSafeEqual = (a, b) => {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
};

const verifyDownloadToken = ({ fileName, exp, sig, secret, nowSec = Math.floor(Date.now() / 1000) }) => {
  const expSec = Number(exp);
  if (!Number.isFinite(expSec) || expSec <= 0) return false;
  if (expSec < Number(nowSec)) return false;

  const expected = createDownloadToken({ fileName, exp: expSec, secret });
  return timingSafeEqual(sig, expected);
};

module.exports = {
  createDownloadToken,
  verifyDownloadToken
};
