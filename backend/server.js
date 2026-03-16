require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.API_PORT || 4315);
const RPC_URL = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = process.env.DEPLOYED_CONTRACT_ADDRESS || "";
const SECRET = process.env.ICON_URL_SECRET || "";

const ABI = [
  "function hasUserPurchased(uint256 iconId, address user) view returns (bool)",
  "function getEncryptedDownloadURL(uint256 iconId) view returns (string)"
];

const nonces = new Map();

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

app.get("/api/health", (req, res) => {
  res.json({ ok: true, rpc: RPC_URL, contractConfigured: ethers.isAddress(CONTRACT_ADDRESS) });
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
    nonces.delete(lower);
    return res.json({ downloadURL });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Reveal failed" });
  }
});

app.listen(PORT, () => {
  console.log(`[icon-api] running at http://127.0.0.1:${PORT}`);
});
