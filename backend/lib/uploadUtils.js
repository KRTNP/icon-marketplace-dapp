const sanitizeExt = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const resolveSafeAssetExtension = (fileName, preferredExt, allowedExts = []) => {
  const fallback = sanitizeExt(preferredExt) || "bin";
  const allowed = new Set([fallback, ...allowedExts.map(sanitizeExt).filter(Boolean)]);
  const extFromName = String(fileName || "").includes(".")
    ? sanitizeExt(String(fileName).split(".").pop())
    : "";

  if (extFromName && allowed.has(extFromName)) {
    return extFromName;
  }
  return fallback;
};

module.exports = {
  resolveSafeAssetExtension
};
