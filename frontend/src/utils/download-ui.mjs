const EXT_LABELS = new Map([
  ['jpg', 'JPG image'],
  ['jpeg', 'JPEG image'],
  ['png', 'PNG image'],
  ['webp', 'WEBP image'],
  ['gif', 'GIF image'],
  ['pdf', 'PDF document'],
  ['zip', 'ZIP archive'],
  ['txt', 'Text file'],
  ['json', 'JSON file'],
  ['mp3', 'MP3 audio'],
  ['wav', 'WAV audio'],
  ['mp4', 'MP4 video']
]);

export const extractDownloadMeta = (rawUrl) => {
  const fallback = { fileName: 'download', fileType: 'File' };
  try {
    const parsed = new URL(String(rawUrl || ''), 'http://localhost');
    const segments = parsed.pathname.split('/').filter(Boolean);
    const fileName = decodeURIComponent(segments[segments.length - 1] || 'download');
    const dot = fileName.lastIndexOf('.');
    if (dot <= 0 || dot === fileName.length - 1) {
      return { fileName, fileType: 'File' };
    }
    const ext = fileName.slice(dot + 1).toLowerCase();
    return {
      fileName,
      fileType: EXT_LABELS.get(ext) || `${ext.toUpperCase()} file`
    };
  } catch (_error) {
    return fallback;
  }
};

export const isUnsafeDirectAssetUrl = (rawUrl) => {
  const value = String(rawUrl || "").trim();
  if (!value) return false;
  if (value.startsWith("/uploads/assets/")) return true;
  try {
    const parsed = new URL(value);
    const localHosts = new Set(["127.0.0.1", "localhost"]);
    return localHosts.has(parsed.hostname) && parsed.pathname.startsWith("/uploads/assets/");
  } catch (_error) {
    return false;
  }
};

export const formatFileSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};
