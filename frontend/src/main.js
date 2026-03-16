import { ethers } from "ethers";
import { makeFallbackImage, normalizeMediaUrl, toLocalUploadsPath } from "./utils/media.mjs";
import { escapeHtml, shouldIgnorePurchaseCheckError } from "./utils/security.mjs";
import { getNextFocusIndex, shouldReloadForWalletChange } from "./utils/ui-flow.mjs";
import { computeOnboardingState } from "./utils/onboarding.mjs";

const ABI = [
  "function iconCount() view returns (uint256)",
  "function icons(uint256) view returns (uint256 id, string name, uint256 price, address seller, string encryptedIconURL, string previewImageURL, bool sold, uint256 totalSales, bool active)",
  "function hasUserPurchased(uint256 iconId, address user) view returns (bool)",
  "function addIcon(string name, uint256 price, string encryptedIconURL, string previewImageURL)",
  "function buyIcon(uint256 iconId) payable",
  "function setIconActive(uint256 iconId, bool active)",
  "event IconAdded(uint256 indexed id, string name, uint256 price, address indexed seller, string previewImageURL)",
  "event IconPurchased(uint256 indexed id, address indexed buyer, address indexed seller, uint256 price, uint256 totalSales)"
];

const LOCAL_CHAIN_IDS = new Set([31337, 1337]);
const API_BASE = "/api";
const MANUAL_DISCONNECT_KEY = "icon-marketplace-manual-disconnect";

const $ = (id) => document.getElementById(id);
let lastModalFocus = null;
const walletEvents = {
  bound: false
};

const state = {
  provider: null,
  signer: null,
  account: "",
  contract: null,
  chainId: null,
  txPending: false,
  dataLoading: false,
  isLocalNetwork: false,
  items: []
};

const setStatus = (text, cls = "muted") => {
  const el = $("status");
  el.className = cls;
  el.textContent = text;
};

const setApiStatus = (text = "", cls = "ok") => {
  const el = $("apiStatus");
  if (!el) return;
  el.className = cls;
  el.textContent = text;
};

const setTxStatus = ({ stage, hash = "", chainId = null, error = "" }) => {
  const txEl = $("txStatus");

  if (error) {
    txEl.innerHTML = `<b>TX Error:</b> ${escapeHtml(error)}`;
    return;
  }

  if (!hash) {
    txEl.textContent = stage || "No transaction yet.";
    return;
  }

  let explorer = "";
  if (chainId === 11155111) {
    explorer = `https://sepolia.etherscan.io/tx/${hash}`;
  } else if (chainId === 1) {
    explorer = `https://etherscan.io/tx/${hash}`;
  }

  txEl.innerHTML = `<b>${escapeHtml(stage)}</b><br/>Hash: <code>${escapeHtml(hash)}</code>${
    explorer
      ? `<br/><a href="${escapeHtml(explorer)}" target="_blank" rel="noreferrer">View on Explorer</a>`
      : ""
  }`;
};

async function parseJsonSafe(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw new Error(`API returned non-JSON response (status ${response.status})`);
  }
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    const msg = payload?.error || `API request failed (HTTP ${response.status})`;
    setApiStatus(msg, "err");
    throw new Error(msg);
  }
  setApiStatus("API ready", "ok");
  return payload;
}

const shortAddr = (v) => (v ? `${v.slice(0, 6)}...${v.slice(-4)}` : "-");


const explainError = (error, fallback) => {
  const rawJson = (() => {
    try {
      return JSON.stringify(error);
    } catch (_e) {
      return "";
    }
  })();

  const raw = String(
    error?.info?.error?.message ||
      error?.info?.error?.data?.message ||
      error?.error?.message ||
      error?.error?.data?.message ||
      error?.data?.message ||
      error?.shortMessage ||
      error?.reason ||
      error?.message ||
      rawJson ||
      fallback ||
      "Unknown error"
  );

  if (/failed to fetch|networkerror|missing response|could not connect|econnrefused|disconnected/i.test(raw)) {
    return "RPC/API unreachable. Start `npx hardhat node` and `npm run api`, then switch MetaMask to 127.0.0.1:8545 (31337).";
  }
  if (/already purchased/i.test(raw)) {
    return "You already purchased this item.";
  }
  if (/cannot buy your own icon/i.test(raw)) {
    return "You cannot buy your own item.";
  }
  if (/incorrect eth amount/i.test(raw)) {
    return "Incorrect payment amount.";
  }
  if (/icon is inactive/i.test(raw)) {
    return "This item is inactive.";
  }
  if (/icon does not exist/i.test(raw)) {
    return "This item no longer exists.";
  }
  return raw;
};

const setConnectedDot = (connected) => {
  const dot = $("statusDot");
  if (!dot) return;
  dot.className = connected ? "status-dot connected" : "status-dot";
};

const setConnectButtonState = (connected) => {
  const btn = $("connectBtn");
  if (!btn) return;
  if (connected) {
    btn.classList.add("hidden");
  } else {
    btn.textContent = "Connect MetaMask";
    btn.disabled = false;
    btn.classList.remove("hidden");
  }
};

const setDisconnectButtonState = (connected) => {
  const btn = $("disconnectBtn");
  if (!btn) return;
  btn.disabled = false;
  btn.classList.toggle("hidden", !connected);
};

function applyDisconnectedUi(statusText = "Wallet disconnected") {
  state.signer = null;
  state.account = "";
  state.contract = null;
  state.items = [];
  $("wallet").textContent = "Not connected";
  setConnectedDot(false);
  setConnectButtonState(false);
  setDisconnectButtonState(false);
  if ($("switchNetworkBtn")) $("switchNetworkBtn").classList.add("hidden");
  renderMarketplace([]);
  renderMyPurchases([]);
  if (statusText) {
    setStatus(statusText, "muted");
  }
  syncActionAvailability();
}

async function withButtonLoading(btn, loadingText, action) {
  if (!btn) return action();
  const originalText = btn.textContent;
  const originalDisabled = btn.disabled;
  btn.textContent = loadingText;
  btn.disabled = true;
  try {
    return await action();
  } finally {
    btn.textContent = originalText;
    btn.disabled = originalDisabled;
  }
}

function syncActionAvailability() {
  const hasWallet = Boolean(state.signer && state.account);
  const hasContract = Boolean(state.contract);
  const canTransact = hasWallet && hasContract && !state.txPending;
  const isBusy = state.txPending || state.dataLoading;

  const openAddModalBtn = $("openAddModalBtn");
  const addBtn = $("addBtn");
  const refreshBtn = $("refreshBtn");
  const loadBtn = $("loadBtn");

  if (openAddModalBtn) {
    openAddModalBtn.disabled = !canTransact;
  }
  if (addBtn) {
    addBtn.disabled = !canTransact;
  }
  if (refreshBtn) {
    refreshBtn.disabled = !hasContract || isBusy;
  }
  if (loadBtn) {
    loadBtn.disabled = isBusy;
  }
  renderOnboarding();
}

function setStepChip(el, done) {
  if (!el) return;
  el.classList.toggle("done", done);
  el.textContent = done ? "Done" : "Pending";
}

function renderOnboarding() {
  const view = computeOnboardingState({
    hasWallet: Boolean(state.signer && state.account),
    hasContract: Boolean(state.contract),
    isLocalNetwork: Boolean(state.isLocalNetwork)
  });

  setStepChip($("stepWallet"), view.steps.wallet === "done");
  setStepChip($("stepNetwork"), view.steps.network === "done");
  setStepChip($("stepContract"), view.steps.contract === "done");

  const primary = $("onboardingPrimaryBtn");
  const secondary = $("onboardingSecondaryBtn");
  if (!primary || !secondary) return;

  primary.disabled = state.txPending || state.dataLoading;
  secondary.classList.add("hidden");
  secondary.disabled = state.txPending || state.dataLoading;

  if (view.nextAction === "connect_wallet") {
    primary.textContent = "Connect Wallet";
    primary.onclick = connectWallet;
  } else if (view.nextAction === "switch_network") {
    primary.textContent = "Switch Network";
    primary.onclick = switchToLocalhostNetwork;
  } else if (view.nextAction === "load_contract") {
    primary.textContent = "Load Contract";
    primary.onclick = loadContract;
  } else {
    primary.textContent = "Refresh Marketplace";
    primary.onclick = loadAllData;
    secondary.classList.remove("hidden");
    secondary.textContent = "Open Add Icon Form";
    secondary.onclick = openAddModal;
  }
}

function getModalFocusableElements() {
  const modal = $("addIconModal");
  if (!modal) return [];
  return Array.from(
    modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]):not([type="hidden"]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.classList?.contains("hidden"));
}

function openAddModal() {
  if (!state.contract || !state.signer) {
    setStatus("Connect wallet and load contract first", "err");
    return;
  }
  const modal = $("addIconModal");
  if (!modal) return;
  lastModalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
  const firstField = $("name");
  if (firstField) firstField.focus();
}

function closeAddModal() {
  const modal = $("addIconModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("no-scroll");
  if (lastModalFocus && typeof lastModalFocus.focus === "function") {
    lastModalFocus.focus();
  }
}

function lockActions(locked) {
  state.txPending = locked;
  syncActionAvailability();
}

function setDataLoading(loading) {
  state.dataLoading = loading;
  const refreshBtn = $("refreshBtn");
  if (refreshBtn) {
    refreshBtn.textContent = loading ? "Refreshing..." : "Refresh Data";
  }
  syncActionAvailability();
}

function setToggleMode(kind, mode) {
  const isPreview = kind === "preview";
  const hiddenId = isPreview ? "previewMode" : "assetMode";
  const urlBtnId = isPreview ? "previewModeUrlBtn" : "assetModeUrlBtn";
  const fileBtnId = isPreview ? "previewModeFileBtn" : "assetModeFileBtn";
  const urlInputId = isPreview ? "imageUrl" : "url";
  const fileInputId = isPreview ? "imageFile" : "assetFile";

  const hidden = $(hiddenId);
  const urlBtn = $(urlBtnId);
  const fileBtn = $(fileBtnId);
  const urlInput = $(urlInputId);
  const fileInput = $(fileInputId);

  if (!hidden || !urlBtn || !fileBtn || !urlInput || !fileInput) return;

  hidden.value = mode;
  urlBtn.classList.toggle("active", mode === "url");
  fileBtn.classList.toggle("active", mode === "file");
  urlInput.classList.toggle("hidden", mode !== "url");
  fileInput.classList.toggle("hidden", mode !== "file");
}

function resetAddFormModes() {
  setToggleMode("preview", "url");
  setToggleMode("asset", "url");
}

async function checkUserPurchasedSafe(iconId) {
  if (!state.account) return false;
  try {
    return await state.contract.hasUserPurchased(iconId, state.account);
  } catch (error) {
    const raw = String(
      error?.info?.error?.message ||
        error?.shortMessage ||
        error?.reason ||
        error?.message ||
        ""
    ).toLowerCase();

    // Ignore only known non-critical "not found" reads.
    if (shouldIgnorePurchaseCheckError(raw)) {
      return false;
    }
    throw error;
  }
}

async function validateContractCompatibility(contract) {
  try {
    await contract.iconCount();
  } catch (error) {
    throw new Error("Selected address is not a compatible IconMarketplace contract (iconCount failed).");
  }

  try {
    await contract.hasUserPurchased(0, state.account || ethers.ZeroAddress);
    return;
  } catch (error) {
    const raw = String(
      error?.info?.error?.message ||
        error?.shortMessage ||
        error?.reason ||
        error?.message ||
        ""
    ).toLowerCase();

    // If iconCount is 0, compatible contract can revert with "Icon does not exist".
    if (raw.includes("icon does not exist")) {
      return;
    }

    throw new Error("Selected contract is not compatible with this frontend version.");
  }
}

function setupEventListeners() {
  if (!window.ethereum || walletEvents.bound) return;

  window.ethereum.on("accountsChanged", async (accounts) => {
    const changed = shouldReloadForWalletChange({
      currentAccount: state.account,
      nextAccounts: accounts
    });

    if (!accounts.length) {
      sessionStorage.setItem(MANUAL_DISCONNECT_KEY, "1");
      applyDisconnectedUi("Wallet disconnected");
      return;
    }

    sessionStorage.removeItem(MANUAL_DISCONNECT_KEY);
    state.signer = await state.provider.getSigner();
    state.account = accounts[0];
    $("wallet").textContent = `Connected: ${shortAddr(state.account)}`;
    setConnectedDot(true);
    setConnectButtonState(true);
    setDisconnectButtonState(true);
    if (changed) {
      setStatus("Wallet account changed. Refreshing marketplace data...", "muted");
    }
    const address = $("contractAddress")?.value?.trim() || "";
    if (ethers.isAddress(address)) {
      state.contract = new ethers.Contract(address, ABI, state.signer || state.provider);
      await loadAllData();
    }
    syncActionAvailability();
  });

  window.ethereum.on("chainChanged", async () => {
    await ensureLocalNetwork();
    if (state.contract) {
      setStatus("Network changed. Refreshing marketplace data...", "muted");
      await loadAllData();
    }
  });

  walletEvents.bound = true;
}

async function ensureLocalNetwork() {
  if (!state.provider) return;
  try {
    const network = await state.provider.getNetwork();
    const chainId = Number(network.chainId);
    state.chainId = chainId;
    state.isLocalNetwork = LOCAL_CHAIN_IDS.has(chainId);
    const switchBtn = $("switchNetworkBtn");

    if (!state.isLocalNetwork) {
      setStatus(`Wrong network (chainId ${chainId}). Use Localhost 127.0.0.1:8545 (31337).`, "err");
      if (switchBtn) switchBtn.classList.remove("hidden");
    } else if (switchBtn) {
      switchBtn.classList.add("hidden");
    }
    renderOnboarding();
  } catch (error) {
    setStatus(explainError(error, "Network check failed"), "err");
  }
}

async function switchToLocalhostNetwork() {
  if (!window.ethereum) {
    setStatus("MetaMask not found", "err");
    return;
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x7a69" }] // 31337
    });
    await ensureLocalNetwork();
    setStatus("Switched to Localhost 31337", "ok");
  } catch (error) {
    if (error?.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x7a69",
            chainName: "Hardhat Localhost",
            rpcUrls: ["http://127.0.0.1:8545"],
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }
          }]
        });
        await ensureLocalNetwork();
        setStatus("Added and switched to Localhost 31337", "ok");
      } catch (addError) {
        setStatus(explainError(addError, "Failed to add localhost network"), "err");
      }
      return;
    }
    setStatus(explainError(error, "Network switch failed"), "err");
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    setStatus("MetaMask not found", "err");
    return;
  }

  try {
    state.provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await state.provider.send("eth_requestAccounts", []);
    state.signer = await state.provider.getSigner();
    state.account = accounts[0] || (await state.signer.getAddress());
    sessionStorage.removeItem(MANUAL_DISCONNECT_KEY);

    $("wallet").textContent = `Connected: ${shortAddr(state.account)}`;
    setConnectedDot(true);
    setConnectButtonState(true);
    setDisconnectButtonState(true);
    setStatus("Wallet connected", "ok");
    syncActionAvailability();

    await ensureLocalNetwork();
    setupEventListeners();
  } catch (error) {
    setStatus(explainError(error, "Connection rejected or failed"), "err");
  }
}

async function disconnectWallet() {
  if (!window.ethereum) {
    applyDisconnectedUi("Wallet disconnected");
    return;
  }

  try {
    await window.ethereum.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }]
    });
  } catch (_error) {
    // Some wallets reject or don't support revoke; local disconnect still applies.
  }

  sessionStorage.setItem(MANUAL_DISCONNECT_KEY, "1");
  applyDisconnectedUi("Wallet disconnected. Click Connect MetaMask to reconnect.");
}

async function loadContract() {
  const address = $("contractAddress").value.trim();
  if (!ethers.isAddress(address)) {
    setStatus("Invalid contract address", "err");
    return;
  }

  const providerOrSigner = state.signer || state.provider;
  if (!providerOrSigner) {
    setStatus("Connect wallet first", "err");
    return;
  }

  const nextContract = new ethers.Contract(address, ABI, providerOrSigner);
  try {
    await withButtonLoading($("loadBtn"), "Loading...", async () => {
      await validateContractCompatibility(nextContract);
      state.contract = nextContract;
      localStorage.setItem("icon-marketplace-address", address);
      setStatus("Contract loaded", "ok");
      syncActionAvailability();
      await loadAllData();
    });
  } catch (error) {
    state.contract = null;
    setStatus(explainError(error, "Incompatible contract"), "err");
    syncActionAvailability();
  }
}

async function restoreSession() {
  if (!window.ethereum) return;

  try {
    state.provider = new ethers.BrowserProvider(window.ethereum);
    if (sessionStorage.getItem(MANUAL_DISCONNECT_KEY) === "1") {
      applyDisconnectedUi("Wallet disconnected. Click Connect MetaMask to reconnect.");
      await ensureLocalNetwork();
      setupEventListeners();
      return;
    }

    const accounts = await state.provider.send("eth_accounts", []);

    if (accounts.length) {
      state.signer = await state.provider.getSigner();
      state.account = accounts[0];
      $("wallet").textContent = `Connected: ${shortAddr(state.account)}`;
      setConnectedDot(true);
      setConnectButtonState(true);
      setDisconnectButtonState(true);
      setStatus("Wallet restored", "ok");
      syncActionAvailability();
    } else {
      $("wallet").textContent = "Not connected";
      setConnectedDot(false);
      setConnectButtonState(false);
      setDisconnectButtonState(false);
      if ($("switchNetworkBtn")) $("switchNetworkBtn").classList.add("hidden");
      syncActionAvailability();
    }

    await ensureLocalNetwork();
    setupEventListeners();

    const address = $("contractAddress").value.trim();
    if (ethers.isAddress(address)) {
      await loadContract();
    }
  } catch (error) {
    setStatus(explainError(error, "Session restore failed"), "err");
  }
}

async function encryptURL(url) {
  const payload = await apiFetch(`${API_BASE}/encrypt-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  return payload.encryptedURL;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read selected image file"));
    reader.readAsDataURL(file);
  });
}

async function uploadPreviewImage(file) {
  if (!file) {
    throw new Error("No image file selected");
  }
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Selected file must be an image");
  }

  const dataUrl = await fileToDataUrl(file);
  const payload = await apiFetch(`${API_BASE}/upload-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      dataUrl
    })
  });
  return String(payload.url || "").trim();
}

async function uploadAssetFile(file) {
  if (!file) {
    throw new Error("No asset file selected");
  }
  const dataUrl = await fileToDataUrl(file);
  const payload = await apiFetch(`${API_BASE}/upload-asset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      dataUrl
    })
  });
  return String(payload.url || "").trim();
}

async function revealURL(iconId, iconName = "Icon") {
  if (!state.signer || !state.account) {
    setStatus("Connect wallet first", "err");
    return;
  }

  try {
    const downloadPage = `/download.html?iconId=${encodeURIComponent(iconId)}&name=${encodeURIComponent(iconName)}`;
    window.location.href = downloadPage;
  } catch (error) {
    setStatus(`Reveal failed: ${explainError(error, "Reveal failed")}`, "err");
  }
}

async function addIcon() {
  if (!state.contract || !state.signer) {
    setStatus("Connect wallet and load contract", "err");
    return;
  }

  const name = $("name").value.trim();
  const priceInput = $("price").value.trim();
  const downloadUrlInput = $("url").value.trim();
  const imageUrlInput = $("imageUrl").value.trim();
  const imageFile = $("imageFile")?.files?.[0];
  const assetFile = $("assetFile")?.files?.[0];
  const previewMode = $("previewMode")?.value || "url";
  const assetMode = $("assetMode")?.value || "url";

  if (!name || !priceInput) {
    setStatus("Please fill in icon name and price", "err");
    return;
  }

  if (isNaN(priceInput) || Number(priceInput) <= 0) {
    setStatus("Invalid price format", "err");
    return;
  }

  lockActions(true);
  try {
    await withButtonLoading($("addBtn"), "Adding...", async () => {
      const price = ethers.parseEther(priceInput);
      let downloadURL = "";
      let previewImageURL = "";

      if (previewMode === "url") {
        if (!imageUrlInput) {
          setStatus("Please enter Preview Image URL", "err");
          return;
        }
        previewImageURL = imageUrlInput;
      } else {
        if (!imageFile) {
          setStatus("Please upload Preview Image file", "err");
          return;
        }
        setStatus("Uploading preview image...", "muted");
        previewImageURL = await uploadPreviewImage(imageFile);
      }
      previewImageURL = toLocalUploadsPath(previewImageURL);

      if (assetMode === "url") {
        if (!downloadUrlInput) {
          setStatus("Please enter Download Asset URL", "err");
          return;
        }
        downloadURL = downloadUrlInput;
      } else {
        if (!assetFile) {
          setStatus("Please upload asset file", "err");
          return;
        }
        setStatus("Uploading asset file...", "muted");
        downloadURL = await uploadAssetFile(assetFile);
      }
      downloadURL = toLocalUploadsPath(downloadURL);

      const encryptedURL = await encryptURL(downloadURL);
      const tx = await state.contract.addIcon(name, price, encryptedURL, previewImageURL);
      setTxStatus({ stage: "Pending addIcon", hash: tx.hash, chainId: state.chainId });
      setStatus("Transaction pending: Adding icon...", "muted");

      const receipt = await tx.wait();
      setTxStatus({ stage: `Confirmed in block ${receipt.blockNumber}`, hash: tx.hash, chainId: state.chainId });

      setStatus("Icon added successfully", "ok");
      $("name").value = "";
      $("price").value = "";
      $("url").value = "";
      $("imageUrl").value = "";
      if ($("imageFile")) $("imageFile").value = "";
      if ($("assetFile")) $("assetFile").value = "";
      resetAddFormModes();
      closeAddModal();

      // Unlock actions immediately after confirmation so seller can toggle active state right away.
      lockActions(false);
      await loadAllData();
    });
  } catch (error) {
    setStatus(`Add failed: ${explainError(error, "Add transaction failed")}`, "err");
    setTxStatus({ stage: "Add failed", error: explainError(error, "Add failed") });
  } finally {
    if (state.txPending) {
      lockActions(false);
    }
  }
}

async function buyIcon(iconId, price, clickedBtn = null) {
  if (state.txPending) return;
  if (!state.contract || !state.signer) {
    setStatus("Connect wallet and load contract", "err");
    return;
  }

  lockActions(true);
  try {
    // Prevent avoidable reverted tx when purchase status is already true.
    const alreadyPurchased = await checkUserPurchasedSafe(iconId);
    if (alreadyPurchased) {
      setStatus("You already purchased this item.", "err");
      return;
    }

    await withButtonLoading(clickedBtn, "Buying...", async () => {
      const tx = await state.contract.buyIcon(iconId, { value: price });
      setTxStatus({ stage: "Pending buyIcon", hash: tx.hash, chainId: state.chainId });
      setStatus("Transaction pending: Purchasing icon...", "muted");

      const receipt = await tx.wait();
      setTxStatus({ stage: `Confirmed in block ${receipt.blockNumber}`, hash: tx.hash, chainId: state.chainId });

      if (state.items[iconId]) {
        state.items[iconId].isBuyer = true;
        const currentSales = BigInt(state.items[iconId].icon.totalSales || 0);
        state.items[iconId].icon.totalSales = currentSales + 1n;
        renderMarketplace(state.items);
        renderMyPurchases(state.items);
      }

      setStatus("Purchase successful", "ok");
      await loadAllData();
    });
  } catch (error) {
    setStatus(`Purchase failed: ${explainError(error, "Buy transaction failed")}`, "err");
    setTxStatus({ stage: "Purchase failed", error: explainError(error, "Purchase failed") });
  } finally {
    lockActions(false);
  }
}

function renderMarketplace(items) {
  const container = $("icons");
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = `
      <div class="state-card">
        <div class="state-title">No items yet</div>
        <div class="state-desc">Add your first icon from the seller form.</div>
        <button id="emptyAddCta" class="secondary">Open Add Icon Form</button>
      </div>
    `;
    const emptyAddCta = $("emptyAddCta");
    if (emptyAddCta) {
      emptyAddCta.disabled = !state.contract || !state.signer || state.txPending || state.dataLoading;
      emptyAddCta.onclick = openAddModal;
    }
    return;
  }

  items.forEach(({ index, icon, isBuyer }) => {
    const card = document.createElement("div");
    card.className = "card";
    const previewUrl = normalizeMediaUrl(icon.previewImageURL, window.location.hostname);
    const fallbackUrl = makeFallbackImage(icon.name || "No Preview");
    const isSelf = state.account && icon.seller.toLowerCase() === state.account.toLowerCase();
    const isActive = Boolean(icon.active);
    const safePreviewUrl = escapeHtml(previewUrl || fallbackUrl);
    const safeName = escapeHtml(icon.name);
    const safeSeller = escapeHtml(shortAddr(icon.seller));
    const safePrice = escapeHtml(ethers.formatEther(icon.price));
    const safeId = escapeHtml(icon.id);
    const safeSales = escapeHtml(icon.totalSales);
    const safeStatus = escapeHtml(isActive ? "Active" : "Inactive");

    card.innerHTML = `
      <img src="${safePreviewUrl}" alt="${safeName}" style="width:100%;height:180px;object-fit:cover;border-radius:6px;margin-bottom:8px;" />
      <div style="font-size: 1.06rem; margin-bottom: 8px;"><b>${safeName}</b> (#${safeId})</div>
      ${isSelf ? '<div class="muted"><b>You are seller</b></div>' : ""}
      <div class="muted">Seller: ${safeSeller}</div>
      <div>Price: ${safePrice} ETH</div>
      <div>Total Sales: ${safeSales}</div>
      <div>Status: ${safeStatus}</div>
    `;
    const previewImg = card.querySelector("img");
    if (previewImg) {
      previewImg.onerror = () => {
        previewImg.onerror = null;
        previewImg.src = fallbackUrl;
      };
    }

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "10px";
    actions.style.flexWrap = "wrap";

    if (isActive && !isSelf && !isBuyer) {
      const buyBtn = document.createElement("button");
      buyBtn.textContent = "Buy";
      buyBtn.disabled = state.txPending;
      buyBtn.onclick = () => buyIcon(index, icon.price, buyBtn);
      actions.appendChild(buyBtn);
    } else if (!isSelf) {
      const disabledBuyBtn = document.createElement("button");
      disabledBuyBtn.className = "secondary";
      disabledBuyBtn.textContent = "Buy";
      disabledBuyBtn.disabled = true;
      if (!isActive) disabledBuyBtn.title = "Item is inactive";
      if (isBuyer) disabledBuyBtn.title = "You already purchased this item";
      actions.appendChild(disabledBuyBtn);
    }

    if (isSelf) {
      const toggleBtn = document.createElement("button");
      toggleBtn.className = "secondary";
      toggleBtn.textContent = isActive ? "Disable" : "Enable";
      toggleBtn.disabled = state.txPending;
      toggleBtn.onclick = async () => {
        lockActions(true);
        try {
          await withButtonLoading(toggleBtn, isActive ? "Disabling..." : "Enabling...", async () => {
            const tx = await state.contract.setIconActive(index, !isActive);
            setTxStatus({ stage: "Pending setIconActive", hash: tx.hash, chainId: state.chainId });
            await tx.wait();
            setStatus("Icon status updated", "ok");

            // Optimistic UI update so seller sees new status immediately without page refresh.
            if (state.items[index]) {
              state.items[index].icon.active = !isActive;
              renderMarketplace(state.items);
              renderMyPurchases(state.items);
            }

            // Unlock immediately after confirmation so seller can toggle back without waiting.
            lockActions(false);

            // Sync from chain in background to keep UI accurate.
            loadAllData().catch((error) => {
              setStatus(`Load failed: ${explainError(error, "Load failed")}`, "err");
            });
          });
        } catch (error) {
          setStatus(`Update failed: ${explainError(error, "Update failed")}`, "err");
        } finally {
          if (state.txPending) {
            lockActions(false);
          }
        }
      };
      actions.appendChild(toggleBtn);
    }

    if (isBuyer) {
      const revealBtn = document.createElement("button");
      revealBtn.className = "secondary";
      revealBtn.textContent = "Reveal URL";
      revealBtn.disabled = state.txPending;
      revealBtn.onclick = async () => {
        await withButtonLoading(revealBtn, "Revealing...", async () => {
          await revealURL(index, icon.name);
        });
      };
      actions.appendChild(revealBtn);
    }

    card.appendChild(actions);
    container.appendChild(card);
  });
}

function renderMyPurchases(items) {
  const container = $("myPurchases");
  const counter = $("purchaseCount");

  const mine = items.filter((entry) => entry.isBuyer);
  counter.textContent = `${mine.length} item(s)`;

  if (!mine.length) {
    container.innerHTML = `
      <div class="state-card">
        <div class="state-title">No purchases yet</div>
        <div class="state-desc">Buy an active item from Marketplace, then reveal its download URL.</div>
        <button id="emptyPurchaseRefreshCta" class="secondary">Refresh Data</button>
      </div>
    `;
    const emptyPurchaseRefreshCta = $("emptyPurchaseRefreshCta");
    if (emptyPurchaseRefreshCta) {
      emptyPurchaseRefreshCta.disabled = state.txPending || state.dataLoading || !state.contract;
      emptyPurchaseRefreshCta.onclick = loadAllData;
    }
    return;
  }

  container.innerHTML = "";
  mine.forEach(({ index, icon }) => {
    const card = document.createElement("div");
    card.className = "card";
    const previewUrl = normalizeMediaUrl(icon.previewImageURL, window.location.hostname);
    const fallbackUrl = makeFallbackImage(icon.name || "No Preview");
    const safePreviewUrl = escapeHtml(previewUrl || fallbackUrl);
    const safeName = escapeHtml(icon.name);
    const safeId = escapeHtml(icon.id);
    const safeSeller = escapeHtml(shortAddr(icon.seller));
    const safePrice = escapeHtml(ethers.formatEther(icon.price));
    card.innerHTML = `
      <img src="${safePreviewUrl}" alt="${safeName}" style="width:100%;height:160px;object-fit:cover;border-radius:6px;margin-bottom:8px;" />
      <div><b>${safeName}</b> (#${safeId})</div>
      <div class="muted">Seller: ${safeSeller}</div>
      <div>Price Paid: ${safePrice} ETH</div>
    `;
    const previewImg = card.querySelector("img");
    if (previewImg) {
      previewImg.onerror = () => {
        previewImg.onerror = null;
        previewImg.src = fallbackUrl;
      };
    }

    const revealBtn = document.createElement("button");
    revealBtn.className = "secondary";
    revealBtn.style.marginTop = "10px";
    revealBtn.textContent = "Reveal Download URL";
    revealBtn.disabled = state.txPending;
    revealBtn.onclick = async () => {
      await withButtonLoading(revealBtn, "Revealing...", async () => {
        await revealURL(index, icon.name);
      });
    };

    card.appendChild(revealBtn);
    container.appendChild(card);
  });
}

function renderLoadingSkeleton() {
  const skeletonCard = () => `
    <div class="card" style="opacity:0.8">
      <div style="height:180px;border-radius:6px;background:#e2e8f0;margin-bottom:8px;"></div>
      <div style="height:18px;width:60%;background:#e2e8f0;border-radius:6px;margin:8px 0;"></div>
      <div style="height:14px;width:80%;background:#e2e8f0;border-radius:6px;margin:6px 0;"></div>
      <div style="height:14px;width:50%;background:#e2e8f0;border-radius:6px;margin:6px 0;"></div>
    </div>
  `;
  $("icons").innerHTML = skeletonCard() + skeletonCard();
  $("myPurchases").innerHTML = `
    <div class="state-card">
      <div class="state-title">Loading your purchases...</div>
      <div class="state-desc">Fetching latest blockchain state.</div>
    </div>
  `;
}

function renderLoadErrorState(message) {
  const safeMessage = escapeHtml(message);
  const card = `
    <div class="state-card">
      <div class="state-title">Unable to load data</div>
      <div class="state-desc">${safeMessage}</div>
      <button class="secondary retry-load-btn">Retry</button>
    </div>
  `;
  $("icons").innerHTML = card;
  $("myPurchases").innerHTML = card;
  document.querySelectorAll(".retry-load-btn").forEach((btn) => {
    btn.disabled = state.txPending || state.dataLoading || !state.contract;
    btn.onclick = loadAllData;
  });
}

async function loadAllData() {
  if (!state.contract) return;

  try {
    setDataLoading(true);
    renderLoadingSkeleton();
    const count = Number(await state.contract.iconCount());

    if (!count) {
      state.items = [];
      renderMarketplace(state.items);
      renderMyPurchases(state.items);
      return;
    }

    const items = await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        const iconRaw = await state.contract.icons(i);
        const icon = {
          id: Number(iconRaw.id),
          name: iconRaw.name,
          price: iconRaw.price,
          seller: iconRaw.seller,
          previewImageURL: iconRaw.previewImageURL,
          totalSales: iconRaw.totalSales,
          active: Boolean(iconRaw.active)
        };
        const isBuyer = await checkUserPurchasedSafe(i);
        return { index: i, icon, isBuyer };
      })
    );

    state.items = items;
    renderMarketplace(state.items);
    renderMyPurchases(state.items);
  } catch (error) {
    const msg = explainError(error, "Load failed");
    setStatus(`Load failed: ${msg}`, "err");
    renderLoadErrorState(msg);
  } finally {
    setDataLoading(false);
  }
}

$("connectBtn").onclick = connectWallet;
if ($("disconnectBtn")) $("disconnectBtn").onclick = disconnectWallet;
$("loadBtn").onclick = loadContract;
$("addBtn").onclick = addIcon;
$("refreshBtn").onclick = loadAllData;
$("openAddModalBtn").onclick = openAddModal;
$("closeAddModalBtn").onclick = closeAddModal;
$("previewModeUrlBtn").onclick = () => setToggleMode("preview", "url");
$("previewModeFileBtn").onclick = () => setToggleMode("preview", "file");
$("assetModeUrlBtn").onclick = () => setToggleMode("asset", "url");
$("assetModeFileBtn").onclick = () => setToggleMode("asset", "file");
if ($("switchNetworkBtn")) $("switchNetworkBtn").onclick = switchToLocalhostNetwork;
if ($("onboardingPrimaryBtn")) $("onboardingPrimaryBtn").onclick = connectWallet;
if ($("onboardingSecondaryBtn")) $("onboardingSecondaryBtn").onclick = openAddModal;

if ($("addIconModal")) {
  $("addIconModal").addEventListener("click", (event) => {
    if (event.target === $("addIconModal")) {
      closeAddModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  const modal = $("addIconModal");
  if (!modal || !modal.classList.contains("open")) return;
  if (event.key === "Escape") {
    closeAddModal();
    return;
  }
  if (event.key !== "Tab") return;

  const focusables = getModalFocusableElements();
  if (!focusables.length) return;

  const activeIndex = focusables.indexOf(document.activeElement);
  const nextIndex = getNextFocusIndex({
    count: focusables.length,
    currentIndex: activeIndex,
    shiftKey: event.shiftKey
  });
  if (nextIndex === null) return;

  event.preventDefault();
  focusables[nextIndex].focus();
});

const defaultAddress = import.meta.env?.VITE_DEFAULT_CONTRACT_ADDRESS || "";
const savedAddress = localStorage.getItem("icon-marketplace-address");
if (savedAddress || defaultAddress) {
  $("contractAddress").value = savedAddress || defaultAddress;
}

resetAddFormModes();
syncActionAvailability();
restoreSession();
