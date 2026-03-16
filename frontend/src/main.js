import { ethers } from "ethers";

const ABI = [
  "function iconCount() view returns (uint256)",
  "function icons(uint256) view returns (uint256 id, string name, uint256 price, address seller, string encryptedIconURL, bool sold, uint256 totalSales, bool active)",
  "function hasUserPurchased(uint256 iconId, address user) view returns (bool)",
  "function addIcon(string name, uint256 price, string encryptedIconURL)",
  "function buyIcon(uint256 iconId) payable",
  "function setIconActive(uint256 iconId, bool active)",
  "event IconAdded(uint256 indexed id, string name, uint256 price, address indexed seller)",
  "event IconPurchased(uint256 indexed id, address indexed buyer, address indexed seller, uint256 price, uint256 totalSales)"
];

const LOCAL_CHAIN_IDS = new Set([31337, 1337]);
const API_BASE = "/api";

const $ = (id) => document.getElementById(id);

const state = {
  provider: null,
  signer: null,
  account: "",
  contract: null,
  chainId: null,
  txPending: false
};

const setStatus = (text, cls = "muted") => {
  const el = $("status");
  el.className = cls;
  el.textContent = text;
};

const setTxStatus = ({ stage, hash = "", chainId = null, error = "" }) => {
  const txEl = $("txStatus");

  if (error) {
    txEl.innerHTML = `<b>TX Error:</b> ${error}`;
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

  txEl.innerHTML = `<b>${stage}</b><br/>Hash: <code>${hash}</code>${
    explorer ? `<br/><a href="${explorer}" target="_blank" rel="noreferrer">View on Explorer</a>` : ""
  }`;
};

const shortAddr = (v) => (v ? `${v.slice(0, 6)}...${v.slice(-4)}` : "-");

const explainError = (error, fallback) => {
  const raw = String(
    error?.info?.error?.message ||
      error?.shortMessage ||
      error?.reason ||
      error?.message ||
      fallback ||
      "Unknown error"
  );

  if (/failed to fetch|networkerror|missing response|could not connect|econnrefused|disconnected/i.test(raw)) {
    return "RPC/API unreachable. Start `npx hardhat node` and `npm run api`, then switch MetaMask to 127.0.0.1:8545 (31337).";
  }
  return raw;
};

const setConnectedDot = (connected) => {
  const dot = $("statusDot");
  if (!dot) return;
  dot.className = connected ? "status-dot connected" : "status-dot";
};

function lockActions(locked) {
  state.txPending = locked;
  ["addBtn", "refreshBtn", "loadBtn"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = locked;
  });
}

function setupEventListeners() {
  if (!window.ethereum) return;

  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}

async function ensureLocalNetwork() {
  if (!state.provider) return;
  try {
    const network = await state.provider.getNetwork();
    const chainId = Number(network.chainId);
    state.chainId = chainId;

    if (!LOCAL_CHAIN_IDS.has(chainId)) {
      setStatus(`Wrong network (chainId ${chainId}). Use Localhost 127.0.0.1:8545 (31337).`, "err");
    }
  } catch (error) {
    setStatus(explainError(error, "Network check failed"), "err");
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

    $("wallet").textContent = `Connected: ${shortAddr(state.account)}`;
    setConnectedDot(true);
    setStatus("Wallet connected", "ok");

    await ensureLocalNetwork();
    setupEventListeners();
  } catch (error) {
    setStatus(explainError(error, "Connection rejected or failed"), "err");
  }
}

function loadContract() {
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

  state.contract = new ethers.Contract(address, ABI, providerOrSigner);
  localStorage.setItem("icon-marketplace-address", address);
  setStatus("Contract loaded", "ok");
  loadAllData();
}

async function encryptURL(url) {
  const response = await fetch(`${API_BASE}/encrypt-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || "URL encryption failed");
  }
  return payload.encryptedURL;
}

async function revealURL(iconId) {
  if (!state.signer || !state.account) {
    setStatus("Connect wallet first", "err");
    return;
  }

  try {
    const nonceRes = await fetch(`${API_BASE}/nonce?address=${state.account}`);
    const noncePayload = await nonceRes.json();
    if (!nonceRes.ok) {
      throw new Error(noncePayload?.error || "Failed to get nonce");
    }

    const message = `Reveal icon URL:${iconId}:${noncePayload.nonce}`;
    const signature = await state.signer.signMessage(message);

    const revealRes = await fetch(`${API_BASE}/reveal-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iconId, address: state.account, signature })
    });

    const revealPayload = await revealRes.json();
    if (!revealRes.ok) {
      throw new Error(revealPayload?.error || "Reveal failed");
    }

    setStatus(`Download URL: ${revealPayload.downloadURL}`, "ok");
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
  const url = $("url").value.trim();

  if (!name || !priceInput || !url) {
    setStatus("Please fill in all fields", "err");
    return;
  }

  if (isNaN(priceInput) || Number(priceInput) <= 0) {
    setStatus("Invalid price format", "err");
    return;
  }

  lockActions(true);
  try {
    const price = ethers.parseEther(priceInput);
    const encryptedURL = await encryptURL(url);

    const tx = await state.contract.addIcon(name, price, encryptedURL);
    setTxStatus({ stage: "Pending addIcon", hash: tx.hash, chainId: state.chainId });
    setStatus("Transaction pending: Adding icon...", "muted");

    const receipt = await tx.wait();
    setTxStatus({ stage: `Confirmed in block ${receipt.blockNumber}`, hash: tx.hash, chainId: state.chainId });

    setStatus("Icon added successfully", "ok");
    $("name").value = "";
    $("price").value = "";
    $("url").value = "";

    await loadAllData();
  } catch (error) {
    setStatus(`Add failed: ${explainError(error, "Add transaction failed")}`, "err");
    setTxStatus({ stage: "Add failed", error: explainError(error, "Add failed") });
  } finally {
    lockActions(false);
  }
}

async function buyIcon(iconId, price) {
  if (state.txPending) return;
  if (!state.contract || !state.signer) {
    setStatus("Connect wallet and load contract", "err");
    return;
  }

  lockActions(true);
  try {
    const tx = await state.contract.buyIcon(iconId, { value: price });
    setTxStatus({ stage: "Pending buyIcon", hash: tx.hash, chainId: state.chainId });
    setStatus("Transaction pending: Purchasing icon...", "muted");

    const receipt = await tx.wait();
    setTxStatus({ stage: `Confirmed in block ${receipt.blockNumber}`, hash: tx.hash, chainId: state.chainId });

    setStatus("Purchase successful", "ok");
    await loadAllData();
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
    container.innerHTML = '<div class="muted">No icons listed yet.</div>';
    return;
  }

  items.forEach(({ index, icon, isBuyer }) => {
    const card = document.createElement("div");
    card.className = "card";

    const isSelf = state.account && icon.seller.toLowerCase() === state.account.toLowerCase();
    const isActive = Boolean(icon.active);

    card.innerHTML = `
      <div style="font-size: 1.06rem; margin-bottom: 8px;"><b>${icon.name}</b> (#${icon.id})</div>
      <div class="muted">Seller: ${shortAddr(icon.seller)}</div>
      <div>Price: ${ethers.formatEther(icon.price)} ETH</div>
      <div>Total Sales: ${icon.totalSales}</div>
      <div>Status: ${isActive ? "Active" : "Inactive"}</div>
    `;

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "10px";
    actions.style.flexWrap = "wrap";

    if (isActive && !isSelf && !isBuyer) {
      const buyBtn = document.createElement("button");
      buyBtn.textContent = "Buy";
      buyBtn.disabled = state.txPending;
      buyBtn.onclick = () => buyIcon(index, icon.price);
      actions.appendChild(buyBtn);
    }

    if (isSelf) {
      const toggleBtn = document.createElement("button");
      toggleBtn.className = "secondary";
      toggleBtn.textContent = isActive ? "Disable" : "Enable";
      toggleBtn.disabled = state.txPending;
      toggleBtn.onclick = async () => {
        lockActions(true);
        try {
          const tx = await state.contract.setIconActive(index, !isActive);
          setTxStatus({ stage: "Pending setIconActive", hash: tx.hash, chainId: state.chainId });
          await tx.wait();
          setStatus("Icon status updated", "ok");
          await loadAllData();
        } catch (error) {
          setStatus(`Update failed: ${explainError(error, "Update failed")}`, "err");
        } finally {
          lockActions(false);
        }
      };
      actions.appendChild(toggleBtn);
    }

    if (isBuyer) {
      const revealBtn = document.createElement("button");
      revealBtn.className = "secondary";
      revealBtn.textContent = "Reveal URL";
      revealBtn.disabled = state.txPending;
      revealBtn.onclick = () => revealURL(index);
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
    container.innerHTML = '<div class="muted">You have not purchased any icons yet.</div>';
    return;
  }

  container.innerHTML = "";
  mine.forEach(({ index, icon }) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div><b>${icon.name}</b> (#${icon.id})</div>
      <div class="muted">Seller: ${shortAddr(icon.seller)}</div>
      <div>Price Paid: ${ethers.formatEther(icon.price)} ETH</div>
    `;

    const revealBtn = document.createElement("button");
    revealBtn.className = "secondary";
    revealBtn.style.marginTop = "10px";
    revealBtn.textContent = "Reveal Download URL";
    revealBtn.disabled = state.txPending;
    revealBtn.onclick = () => revealURL(index);

    card.appendChild(revealBtn);
    container.appendChild(card);
  });
}

async function loadAllData() {
  if (!state.contract) return;

  try {
    const count = Number(await state.contract.iconCount());

    if (!count) {
      renderMarketplace([]);
      renderMyPurchases([]);
      return;
    }

    const items = await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        const icon = await state.contract.icons(i);
        const isBuyer = state.account
          ? await state.contract.hasUserPurchased(i, state.account)
          : false;
        return { index: i, icon, isBuyer };
      })
    );

    renderMarketplace(items);
    renderMyPurchases(items);
  } catch (error) {
    setStatus(`Load failed: ${explainError(error, "Load failed")}`, "err");
  }
}

$("connectBtn").onclick = connectWallet;
$("loadBtn").onclick = loadContract;
$("addBtn").onclick = addIcon;
$("refreshBtn").onclick = loadAllData;

const defaultAddress = import.meta.env?.VITE_DEFAULT_CONTRACT_ADDRESS || "";
const savedAddress = localStorage.getItem("icon-marketplace-address");
if (savedAddress || defaultAddress) {
  $("contractAddress").value = savedAddress || defaultAddress;
}
