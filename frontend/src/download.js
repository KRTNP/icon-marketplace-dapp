import { ethers } from "ethers";
import { toLocalUploadsPath } from "./utils/media.mjs";
import { extractDownloadMeta, formatFileSize, isUnsafeDirectAssetUrl } from "./utils/download-ui.mjs";

const API_BASE = "/api";

const params = new URLSearchParams(window.location.search);
const iconId = Number(params.get("iconId"));
const name = params.get("name") || "Icon";

const titleEl = document.getElementById("title");
const metaEl = document.getElementById("meta");
const statusEl = document.getElementById("status");
const btnEl = document.getElementById("downloadBtn");
const retryBtnEl = document.getElementById("retryBtn");
const revealBtnEl = document.getElementById("revealBtn");
const fileMetaEl = document.getElementById("fileMeta");
const fileNameEl = document.getElementById("fileName");
const fileTypeEl = document.getElementById("fileType");
const fileSizeRowEl = document.getElementById("fileSizeRow");
const fileSizeEl = document.getElementById("fileSize");

async function parseJsonSafe(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw new Error(`API returned non-JSON response (status ${response.status})`);
  }
}

const setError = (message) => {
  statusEl.textContent = message;
  btnEl.classList.add("hidden");
  revealBtnEl.classList.remove("hidden");
  revealBtnEl.disabled = false;
  retryBtnEl.classList.remove("hidden");
  fileMetaEl.classList.add("hidden");
  if (fileSizeRowEl) fileSizeRowEl.classList.add("hidden");
};

async function prepareDownload() {
  if (!revealBtnEl) return;
  revealBtnEl.disabled = true;
  revealBtnEl.textContent = "Verifying...";
  retryBtnEl.classList.add("hidden");
  btnEl.classList.add("hidden");
  statusEl.textContent = "Verifying purchase and preparing your download link...";
  fileMetaEl.classList.add("hidden");
  if (fileSizeRowEl) fileSizeRowEl.classList.add("hidden");
  titleEl.textContent = `Download: ${name}`;
  metaEl.textContent = Number.isInteger(iconId) && iconId >= 0 ? `Item #${iconId}` : "Invalid item";

  if (!Number.isInteger(iconId) || iconId < 0) {
    setError("Invalid icon id. Please reveal from Marketplace again.");
    return;
  }

  if (!window.ethereum) {
    setError("MetaMask not found. Open this page in your dApp browser with wallet connected.");
    return;
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_accounts", []);
    if (!accounts.length) {
      setError("Wallet is not connected. Connect wallet on Marketplace first.");
      return;
    }

    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    const nonceRes = await fetch(`${API_BASE}/nonce?address=${address}`);
    const noncePayload = await parseJsonSafe(nonceRes);
    if (!nonceRes.ok) {
      throw new Error(noncePayload?.error || "Failed to get nonce");
    }

    const message = `Reveal icon URL:${iconId}:${noncePayload.nonce}`;
    const signature = await signer.signMessage(message);

    const revealRes = await fetch(`${API_BASE}/reveal-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iconId, address, signature })
    });

    const revealPayload = await parseJsonSafe(revealRes);
    if (!revealRes.ok) {
      throw new Error(revealPayload?.error || "Reveal failed");
    }

    const finalUrl = toLocalUploadsPath(revealPayload.downloadURL);
    if (isUnsafeDirectAssetUrl(finalUrl)) {
      setError("Server returned an unsafe direct asset URL. Restart backend API and try again.");
      return;
    }
    const info = revealPayload?.fileMeta
      ? {
          fileName: String(revealPayload.fileMeta.fileName || "download"),
          fileType: String(revealPayload.fileMeta.fileType || "File").toUpperCase() + " file"
        }
      : extractDownloadMeta(finalUrl);
    fileNameEl.textContent = info.fileName;
    fileTypeEl.textContent = info.fileType;
    const sizeText = formatFileSize(revealPayload?.fileMeta?.fileSizeBytes);
    if (sizeText) {
      fileSizeEl.textContent = sizeText;
      fileSizeRowEl.classList.remove("hidden");
    } else {
      fileSizeRowEl.classList.add("hidden");
    }
    fileMetaEl.classList.remove("hidden");
    btnEl.href = finalUrl;
    btnEl.classList.remove("hidden");
    revealBtnEl.classList.add("hidden");
    retryBtnEl.classList.add("hidden");
    statusEl.textContent = "Purchase verified. Your secure download link is ready.";
  } catch (error) {
    setError(String(error?.message || "Reveal failed"));
  } finally {
    revealBtnEl.disabled = false;
    revealBtnEl.textContent = "Verify & Reveal";
  }
}

if (retryBtnEl) {
  retryBtnEl.onclick = prepareDownload;
}
if (revealBtnEl) {
  revealBtnEl.onclick = prepareDownload;
}
