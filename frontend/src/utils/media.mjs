export const makeFallbackImage = (label = "No Preview") => {
  const text = encodeURIComponent(String(label).slice(0, 24));
  return `data:image/svg+xml;utf8,` +
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'>` +
    `<rect width='100%' height='100%' fill='%23e2e8f0'/>` +
    `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2364758b' font-size='28' font-family='Arial'>${text}</text>` +
    `</svg>`;
};

export const toLocalUploadsPath = (rawUrl) => {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (value.startsWith("/uploads/")) return value;
  try {
    const parsed = new URL(value);
    const localHosts = new Set(["127.0.0.1", "localhost"]);
    if (localHosts.has(parsed.hostname) && parsed.pathname.startsWith("/uploads/")) {
      return `${parsed.pathname}${parsed.search || ""}`;
    }
    return value;
  } catch (_error) {
    return value;
  }
};

export const normalizeMediaUrl = (rawUrl, currentHost = "") => {
  const value = toLocalUploadsPath(rawUrl);
  if (!value) return "";
  if (value.startsWith("/uploads/")) return value;

  try {
    const parsed = new URL(value);
    const localHosts = new Set(["127.0.0.1", "localhost"]);
    const sameMachineByName = localHosts.has(parsed.hostname);

    if (sameMachineByName && currentHost && !localHosts.has(currentHost)) {
      parsed.hostname = currentHost;
    }
    return parsed.toString();
  } catch (_error) {
    return value;
  }
};
