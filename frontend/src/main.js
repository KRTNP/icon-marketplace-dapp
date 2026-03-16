import { ethers } from "ethers";

const ABI = [
  "function iconCount() view returns (uint256)",
  "function icons(uint256) view returns (uint256 id, string name, uint256 price, address seller, string iconURL, bool sold)",
  "function iconBuyers(uint256) view returns (address)",
  "function addIcon(string name, uint256 price, string iconURL)",
  "function buyIcon(uint256 iconId) payable",
  "function getDownloadURL(uint256 iconId) view returns (string)",
  "event IconAdded(uint256 indexed id, string name, uint256 price, address indexed seller, string iconURL)",
  "event IconPurchased(uint256 indexed id, address indexed buyer, address indexed seller, uint256 price)"
];

const LOCAL_CHAIN_IDS = new Set([31337, 1337]);

const $ = (id) => document.getElementById(id);

const state = {
  provider: null,
  signer: null,
  account: "",
  contract: null
};

const setStatus = (text, cls = "muted") => {
  const el = $("status");
  el.className = cls;
  el.textContent = text;
};

const shortAddr = (v) => (v ? `${v.slice(0, 6)}...${v.slice(-4)}` : "-");

const explainError = (error, fallback) => {
  const raw = String(error?.info?.error?.message || error?.shortMessage || error?.message || fallback || "Unknown error");
  if (/failed to fetch|networkerror|network error|missing response|could not connect|ECONNREFUSED|disconnected/i.test(raw)) {
    return "RPC unreachable. Start `npx hardhat node` and switch MetaMask to Localhost 127.0.0.1:8545 (Chain ID 31337).";
  }
  return raw;
};

function setupEventListeners() {
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length > 0) {
        window.location.reload();
      } else {
        setStatus("Wallet disconnected", "err");
        $("wallet").textContent = "Not connected";
        state.account = "";
      }
    });

    window.ethereum.on("chainChanged", () => {
      window.location.reload();
    });
  }
}

async function ensureLocalNetwork() {
  if (!state.provider) return;
  try {
    const network = await state.provider.getNetwork();
    const chainId = Number(network.chainId);
    if (!LOCAL_CHAIN_IDS.has(chainId)) {
      setStatus(
        `Wrong network (chainId ${chainId}). Use Localhost 127.0.0.1:8545 (31337).`,
        "err"
      );
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
  loadIcons();
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

  if (isNaN(priceInput) || Number(priceInput) < 0) {
    setStatus("Invalid price format", "err");
    return;
  }

  try {
    const price = ethers.parseEther(priceInput);
    const tx = await state.contract.addIcon(name, price, url);
    setStatus("Transaction pending: Adding icon...", "muted");

    await tx.wait();

    setStatus("Icon added successfully", "ok");
    $("name").value = "";
    $("price").value = "";
    $("url").value = "";
    await loadIcons();
  } catch (error) {
    setStatus(`Add failed: ${explainError(error, "Add transaction failed")}`, "err");
  }
}

async function buyIcon(iconId, price) {
  if (!state.contract || !state.signer) {
    setStatus("Connect wallet and load contract", "err");
    return;
  }

  try {
    const tx = await state.contract.buyIcon(iconId, { value: price });
    setStatus("Transaction pending: Purchasing icon...", "muted");

    await tx.wait();

    setStatus("Purchase successful", "ok");
    await loadIcons();
  } catch (error) {
    setStatus(`Purchase failed: ${explainError(error, "Buy transaction failed")}`, "err");
  }
}

async function revealURL(iconId) {
  try {
    const url = await state.contract.getDownloadURL(iconId);
    setStatus(`Download URL: ${url}`, "ok");
  } catch (error) {
    setStatus(`Reveal failed: ${explainError(error, "Reveal failed")}`, "err");
  }
}

async function loadIcons() {
  if (!state.contract) return;

  const container = $("icons");
  container.innerHTML = '<div class="muted">Loading market data...</div>';

  try {
    const count = Number(await state.contract.iconCount());
    if (count === 0) {
      container.innerHTML = '<div class="muted">No icons listed yet.</div>';
      return;
    }

    const fetchPromises = Array.from({ length: count }, async (_, i) => {
      const icon = await state.contract.icons(i);
      let isBuyer = false;

      if (state.account) {
        try {
          const buyerAddress = await state.contract.iconBuyers(i);
          isBuyer = buyerAddress.toLowerCase() === state.account.toLowerCase();
        } catch (e) {
          isBuyer = false;
        }
      }

      return { index: i, icon, isBuyer };
    });

    const iconsData = await Promise.all(fetchPromises);
    container.innerHTML = "";

    iconsData.forEach(({ index, icon, isBuyer }) => {
      const card = document.createElement("div");
      card.style.border = "1px solid #e2e8f0";
      card.style.borderRadius = "8px";
      card.style.padding = "16px";
      card.style.backgroundColor = "#ffffff";

      const isSelf = state.account && icon.seller.toLowerCase() === state.account.toLowerCase();
      const statusText = icon.sold ? "Sold" : "Available";

      card.innerHTML = `
        <div style="font-size: 1.1rem; margin-bottom: 8px;">${icon.name} (#${icon.id})</div>
        <div class="muted" style="margin-bottom: 4px;">Seller: ${shortAddr(icon.seller)}</div>
        <div style="margin-bottom: 4px;">Price: ${ethers.formatEther(icon.price)} ETH</div>
        <div style="margin-bottom: 16px;">Status: ${statusText}</div>
      `;

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";
      actions.style.flexWrap = "wrap";

      if (!icon.sold && !isSelf) {
        const buyBtn = document.createElement("button");
        buyBtn.textContent = "Buy";
        buyBtn.onclick = () => buyIcon(index, icon.price);
        actions.appendChild(buyBtn);
      }

      const revealBtn = document.createElement("button");
      revealBtn.textContent = isBuyer ? "Reveal URL" : "Unlock after purchase";
      revealBtn.disabled = !isBuyer;
      if (!isBuyer) {
        revealBtn.className = "secondary";
      }
      revealBtn.onclick = () => revealURL(index);
      actions.appendChild(revealBtn);

      card.appendChild(actions);
      container.appendChild(card);
    });
  } catch (error) {
    setStatus(`Load failed: ${explainError(error, "Load failed")}`, "err");
  }
}

$("connectBtn").onclick = connectWallet;
$("loadBtn").onclick = loadContract;
$("addBtn").onclick = addIcon;
$("refreshBtn").onclick = loadIcons;

const defaultAddress = import.meta.env?.VITE_DEFAULT_CONTRACT_ADDRESS || "";
const savedAddress = localStorage.getItem("icon-marketplace-address");
if (savedAddress || defaultAddress) {
  $("contractAddress").value = savedAddress || defaultAddress;
}
