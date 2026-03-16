const path = require('node:path');
const { createDownloadToken } = require('./downloadToken');

const ASSET_EXT_TO_MIME = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['pdf', 'application/pdf'],
  ['zip', 'application/zip'],
  ['txt', 'text/plain'],
  ['json', 'application/json'],
  ['mp3', 'audio/mpeg'],
  ['wav', 'audio/wav'],
  ['mp4', 'video/mp4']
]);

const buildFileMeta = (fileName) => {
  const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  return {
    fileName,
    fileType: ext || 'file',
    mimeType: ASSET_EXT_TO_MIME.get(ext) || 'application/octet-stream',
    fileSizeBytes: null
  };
};

const isLocalUploadsAssetPath = (raw) => String(raw || '').startsWith('/uploads/assets/');

const toSignedDownloadURL = (downloadURL, {
  apiPublicBaseUrl,
  secret,
  ttlSeconds,
  nowSec = Math.floor(Date.now() / 1000)
}) => {
  const raw = String(downloadURL || '').trim();
  if (!raw) return { downloadURL: raw, fileMeta: null };

  let assetFileName = null;

  if (isLocalUploadsAssetPath(raw)) {
    assetFileName = path.basename(raw);
  } else {
    try {
      const parsed = new URL(raw);
      const localHosts = new Set(['127.0.0.1', 'localhost']);
      const isLocalAsset = localHosts.has(parsed.hostname) && parsed.pathname.startsWith('/uploads/assets/');
      if (isLocalAsset) {
        assetFileName = path.basename(parsed.pathname);
      }
    } catch (_error) {
      return { downloadURL: raw, fileMeta: null };
    }
  }

  if (!assetFileName) {
    return { downloadURL: raw, fileMeta: null };
  }

  const exp = Number(nowSec) + Number(ttlSeconds);
  const sig = createDownloadToken({ fileName: assetFileName, exp, secret });
  const signed = `${apiPublicBaseUrl}/api/download-asset/${encodeURIComponent(assetFileName)}?exp=${exp}&sig=${sig}`;
  return {
    downloadURL: signed,
    fileMeta: buildFileMeta(assetFileName)
  };
};

module.exports = {
  toSignedDownloadURL
};
