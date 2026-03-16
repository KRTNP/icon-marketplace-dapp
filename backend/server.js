require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const { resolveSafeAssetExtension } = require("./lib/uploadUtils");
const { createDownloadToken, verifyDownloadToken } = require("./lib/downloadToken");
const { toSignedDownloadURL } = require("./lib/downloadLink");

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const PORT = Number(process.env.API_PORT || 4315);
const HOST = process.env.API_HOST || "127.0.0.1";
const API_PUBLIC_BASE_URL = process.env.API_PUBLIC_BASE_URL || `http://127.0.0.1:${PORT}`;
const RPC_URL = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = process.env.DEPLOYED_CONTRACT_ADDRESS || "";
const SECRET = process.env.ICON_URL_SECRET || "";
const PREVIEW_UPLOAD_MAX_BYTES = Number(process.env.PREVIEW_UPLOAD_MAX_BYTES || 5 * 1024 * 1024);
const ASSET_UPLOAD_MAX_BYTES = Number(process.env.ASSET_UPLOAD_MAX_BYTES || 20 * 1024 * 1024);
const DOWNLOAD_URL_TTL_SECONDS = Number(process.env.DOWNLOAD_URL_TTL_SECONDS || 300);

const UPLOAD_DIR = path.join(__dirname, "uploads");
const UPLOAD_PREVIEWS_DIR = path.join(UPLOAD_DIR, "previews");
fs.mkdirSync(UPLOAD_PREVIEWS_DIR, { recursive: true });

const ABI = [
  "function hasUserPurchased(uint256 iconId, address user) view returns (bool)",
  "function getEncryptedDownloadURL(uint256 iconId) view returns (string)"
];

const nonces = new Map();
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/pjpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);
const ALLOWED_ASSET_TYPES = new Map([
  ["application/zip", "zip"],
  ["application/x-zip-compressed", "zip"],
  ["application/pdf", "pdf"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["audio/mpeg", "mp3"],
  ["audio/wav", "wav"],
  ["video/mp4", "mp4"],
  ["application/json", "json"],
  ["text/plain", "txt"]
]);

const createRateLimiter = ({ windowMs, max }) => {
  const buckets = new Map();
  return (req, res, next) => {
    const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
    const now = Date.now();
    const row = buckets.get(ip) || { count: 0, resetAt: now + windowMs };

    if (now > row.resetAt) {
      row.count = 0;
      row.resetAt = now + windowMs;
    }

    row.count += 1;
    buckets.set(ip, row);

    if (row.count > max) {
      return res.status(429).json({ error: "Too many requests. Please retry shortly." });
    }
    return next();
  };
};

const uploadRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 30 });

const deriveKey = (secret) =>
  crypto.createHash("sha256").update(secret).digest();

const encryptUrl = (plain, secret) => {
  const iv = crypto.randomBytes(12);
  const key = deriveKey(secret);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  });
};

const decryptUrl = (payload, secret) => {
  const parsed = JSON.parse(payload);
  const iv = Buffer.from(parsed.iv, "base64");
  const tag = Buffer.from(parsed.tag, "base64");
  const data = Buffer.from(parsed.data, "base64");

  const key = deriveKey(secret);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
};

const getContract = () => {
  if (!ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error("Invalid DEPLOYED_CONTRACT_ADDRESS in .env");
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
};

app.use("/uploads", express.static(UPLOAD_DIR));

app.get("/api/download-asset/:fileName", (req, res) => {
  try {
    const fileName = String(req.params?.fileName || "").trim();
    const exp = Number(req.query?.exp);
    const sig = String(req.query?.sig || "").trim();

    if (!fileName) {
      return res.status(400).json({ error: "Missing fileName" });
    }
    if (!sig) {
      return res.status(400).json({ error: "Missing signature" });
    }
    if (!SECRET) {
      return res.status(500).json({ error: "ICON_URL_SECRET is not configured" });
    }

    const valid = verifyDownloadToken({
      fileName,
      exp,
      sig,
      secret: SECRET
    });
    if (!valid) {
      return res.status(403).json({ error: "Download link expired or invalid" });
    }

    const safeName = path.basename(fileName);
    const filePath = path.join(UPLOAD_DIR, "assets", safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    return res.download(filePath, safeName);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Download failed" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    rpc: RPC_URL,
    contractConfigured: ethers.isAddress(CONTRACT_ADDRESS),
    downloadSigningEnabled: true,
    downloadUrlTtlSeconds: DOWNLOAD_URL_TTL_SECONDS
  });
});

app.post("/api/encrypt-url", (req, res) => {
  try {
    if (!SECRET) {
      return res.status(500).json({ error: "ICON_URL_SECRET is not configured" });
    }
    const url = String(req.body?.url || "").trim();
    if (!url) {
      return res.status(400).json({ error: "url is required" });
    }
    const encryptedURL = encryptUrl(url, SECRET);
    return res.json({ encryptedURL });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Encryption failed" });
  }
});

app.post("/api/upload-preview", uploadRateLimit, (req, res) => {
  try {
    const fileName = String(req.body?.fileName || "preview").trim();
    const mimeType = String(req.body?.mimeType || "").trim().toLowerCase();
    const dataUrl = String(req.body?.dataUrl || "").trim();

    if (!dataUrl) {
      return res.status(400).json({ error: "dataUrl is required" });
    }

    const matched = dataUrl.match(/^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!matched) {
      return res.status(400).json({ error: "Invalid dataUrl format" });
    }

    const detectedMime = matched[1].toLowerCase();
    const base64 = matched[2];
    const preferredMimeType = mimeType || detectedMime;
    const effectiveMimeType = ALLOWED_IMAGE_TYPES.has(preferredMimeType) ? preferredMimeType : detectedMime;
    const extension = ALLOWED_IMAGE_TYPES.get(effectiveMimeType);
    if (!extension) {
      return res.status(400).json({ error: "Unsupported image type. Allowed: png, jpg, webp, gif" });
    }

    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length) {
      return res.status(400).json({ error: "Image payload is empty" });
    }
    if (buffer.length > PREVIEW_UPLOAD_MAX_BYTES) {
      return res.status(400).json({ error: `Image too large (max ${PREVIEW_UPLOAD_MAX_BYTES} bytes)` });
    }

    const safeBaseName = (fileName.replace(/\.[^.]+$/, "") || "preview")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 64);

    const generatedName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeBaseName}.${extension}`;
    const outputPath = path.join(UPLOAD_PREVIEWS_DIR, generatedName);
    fs.writeFileSync(outputPath, buffer);

    const publicURL = `${API_PUBLIC_BASE_URL}/uploads/previews/${generatedName}`;
    return res.json({ url: publicURL });
  } catch (error) {
    console.error("[upload-preview] failed:", error);
    return res.status(500).json({ error: error.message || "Upload failed" });
  }
});

app.post("/api/upload-asset", uploadRateLimit, (req, res) => {
  try {
    const fileName = String(req.body?.fileName || "asset").trim();
    const dataUrl = String(req.body?.dataUrl || "").trim();

    if (!dataUrl) {
      return res.status(400).json({ error: "dataUrl is required" });
    }

    const matched = dataUrl.match(/^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!matched) {
      return res.status(400).json({ error: "Invalid dataUrl format" });
    }

    const mimeType = matched[1].toLowerCase();
    if (!ALLOWED_ASSET_TYPES.has(mimeType)) {
      return res.status(400).json({ error: "Unsupported asset type. Allowed: zip, pdf, png, jpg, webp, mp3, wav, mp4, json, txt" });
    }
    const base64 = matched[2];
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length) {
      return res.status(400).json({ error: "Asset payload is empty" });
    }
    if (buffer.length > ASSET_UPLOAD_MAX_BYTES) {
      return res.status(400).json({ error: `Asset too large (max ${ASSET_UPLOAD_MAX_BYTES} bytes)` });
    }

    const UPLOAD_ASSETS_DIR = path.join(UPLOAD_DIR, "assets");
    fs.mkdirSync(UPLOAD_ASSETS_DIR, { recursive: true });

    const preferredExt = ALLOWED_ASSET_TYPES.get(mimeType) || "bin";
    const safeExt = resolveSafeAssetExtension(
      fileName,
      preferredExt,
      Array.from(new Set(ALLOWED_ASSET_TYPES.values()))
    );

    const safeBaseName = (fileName.replace(/\.[^.]+$/, "") || "asset")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 64);

    const generatedName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeBaseName}.${safeExt}`;
    const outputPath = path.join(UPLOAD_ASSETS_DIR, generatedName);
    fs.writeFileSync(outputPath, buffer);

    const publicURL = `${API_PUBLIC_BASE_URL}/uploads/assets/${generatedName}`;
    return res.json({ url: publicURL, mimeType });
  } catch (error) {
    console.error("[upload-asset] failed:", error);
    return res.status(500).json({ error: error.message || "Asset upload failed" });
  }
});

app.get("/api/nonce", (req, res) => {
  const address = String(req.query?.address || "").trim();
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }
  const nonce = crypto.randomBytes(16).toString("hex");
  nonces.set(address.toLowerCase(), nonce);
  return res.json({ nonce });
});

app.post("/api/reveal-url", async (req, res) => {
  try {
    if (!SECRET) {
      return res.status(500).json({ error: "ICON_URL_SECRET is not configured" });
    }

    const iconId = Number(req.body?.iconId);
    const address = String(req.body?.address || "").trim();
    const signature = String(req.body?.signature || "").trim();

    if (!Number.isInteger(iconId) || iconId < 0) {
      return res.status(400).json({ error: "Invalid iconId" });
    }
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }
    if (!signature) {
      return res.status(400).json({ error: "Missing signature" });
    }

    const lower = address.toLowerCase();
    const nonce = nonces.get(lower);
    if (!nonce) {
      return res.status(400).json({ error: "Missing nonce. Request /api/nonce first." });
    }

    const message = `Reveal icon URL:${iconId}:${nonce}`;
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== lower) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const contract = getContract();
    const purchased = await contract.hasUserPurchased(iconId, address);
    if (!purchased) {
      return res.status(403).json({ error: "Address has not purchased this icon" });
    }

    const encryptedURL = await contract.getEncryptedDownloadURL.staticCall(iconId, {
      from: address
    });

    const downloadURL = decryptUrl(encryptedURL, SECRET);
    const signed = toSignedDownloadURL(downloadURL, {
      apiPublicBaseUrl: API_PUBLIC_BASE_URL,
      secret: SECRET,
      ttlSeconds: DOWNLOAD_URL_TTL_SECONDS
    });
    const finalURL = signed.downloadURL;
    let fileMeta = signed.fileMeta;
    if (fileMeta?.fileName) {
      const filePath = path.join(UPLOAD_DIR, "assets", path.basename(fileMeta.fileName));
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        fileMeta.fileSizeBytes = Number(stat.size);
      }
    }
    nonces.delete(lower);
    return res.json({ downloadURL: finalURL, fileMeta });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Reveal failed" });
  }
});

app.use((error, req, res, next) => {
  if (!error) return next();

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      error: "Payload too large for API body limit (25mb)."
    });
  }

  return res.status(400).json({
    error: error.message || "Invalid request payload"
  });
});

app.listen(PORT, HOST, () => {
  console.log(`[icon-api] running at http://${HOST}:${PORT}`);
});
