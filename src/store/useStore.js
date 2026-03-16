import { create } from "zustand";
import { ethers } from "ethers";
import {
  CONTRACT_ABI,
  LOCAL_CHAIN_IDS,
  MANUAL_DISCONNECT_KEY,
  CONTRACT_ADDRESS_KEY,
  API_BASE,
} from "@/lib/contract";

const shortAddr = (v) => (v ? `${v.slice(0, 6)}...${v.slice(-4)}` : "-");

const explainError = (error, fallback) => {
  const raw = String(
    error?.info?.error?.message ||
      error?.info?.error?.data?.message ||
      error?.error?.message ||
      error?.error?.data?.message ||
      error?.data?.message ||
      error?.shortMessage ||
      error?.reason ||
      error?.message ||
      fallback ||
      "Unknown error"
  );

  if (
    /failed to fetch|networkerror|missing response|could not connect|econnrefused|disconnected/i.test(
      raw
    )
  ) {
    return "RPC/API unreachable. Start `npx hardhat node` and `npm run api`, then switch MetaMask to 127.0.0.1:8545 (31337).";
  }
  if (/already purchased/i.test(raw)) return "You already purchased this item.";
  if (/cannot buy your own icon/i.test(raw))
    return "You cannot buy your own item.";
  if (/incorrect eth amount/i.test(raw)) return "Incorrect payment amount.";
  if (/icon is inactive/i.test(raw)) return "This item is inactive.";
  if (/icon does not exist/i.test(raw)) return "This item no longer exists.";
  return raw;
};

const useStore = create((set, get) => ({
  // Web3 State
  provider: null,
  signer: null,
  account: "",
  contract: null,
  chainId: null,
  isLocalNetwork: false,
  contractAddress: localStorage.getItem(CONTRACT_ADDRESS_KEY) || "",

  // UI State
  txPending: false,
  dataLoading: false,
  status: { text: "", type: "muted" },
  items: [],
  purchases: [],

  // Computed
  shortAccount: () => shortAddr(get().account),
  isConnected: () => Boolean(get().signer && get().account),
  canTransact: () =>
    Boolean(get().signer && get().account && get().contract && !get().txPending),

  // Actions
  setStatus: (text, type = "muted") => set({ status: { text, type } }),

  setContractAddress: (address) => {
    set({ contractAddress: address });
    if (address) {
      localStorage.setItem(CONTRACT_ADDRESS_KEY, address);
    }
  },

  connectWallet: async () => {
    if (!window.ethereum) {
      set({ status: { text: "MetaMask not found", type: "error" } });
      return false;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const account = accounts[0] || (await signer.getAddress());

      sessionStorage.removeItem(MANUAL_DISCONNECT_KEY);

      set({
        provider,
        signer,
        account,
        status: { text: "Wallet connected", type: "success" },
      });

      await get().checkNetwork();
      get().setupEventListeners();
      return true;
    } catch (error) {
      set({
        status: {
          text: explainError(error, "Connection rejected or failed"),
          type: "error",
        },
      });
      return false;
    }
  },

  disconnectWallet: async () => {
    if (window.ethereum) {
      try {
        await window.ethereum.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (_error) {
        // Some wallets reject or don't support revoke
      }
    }

    sessionStorage.setItem(MANUAL_DISCONNECT_KEY, "1");

    set({
      signer: null,
      account: "",
      contract: null,
      items: [],
      purchases: [],
      status: {
        text: "Wallet disconnected. Click Connect to reconnect.",
        type: "muted",
      },
    });
  },

  checkNetwork: async () => {
    const { provider } = get();
    if (!provider) return;

    try {
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      const isLocalNetwork = LOCAL_CHAIN_IDS.has(chainId);

      set({ chainId, isLocalNetwork });

      if (!isLocalNetwork) {
        set({
          status: {
            text: `Wrong network (chainId ${chainId}). Use Localhost 127.0.0.1:8545 (31337).`,
            type: "error",
          },
        });
      }
    } catch (error) {
      set({
        status: { text: explainError(error, "Network check failed"), type: "error" },
      });
    }
  },

  switchToLocalNetwork: async () => {
    if (!window.ethereum) {
      set({ status: { text: "MetaMask not found", type: "error" } });
      return;
    }

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x7a69" }], // 31337
      });
      await get().checkNetwork();
      set({ status: { text: "Switched to Localhost 31337", type: "success" } });
    } catch (error) {
      if (error?.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x7a69",
                chainName: "Hardhat Localhost",
                rpcUrls: ["http://127.0.0.1:8545"],
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              },
            ],
          });
          await get().checkNetwork();
          set({
            status: {
              text: "Added and switched to Localhost 31337",
              type: "success",
            },
          });
        } catch (addError) {
          set({
            status: {
              text: explainError(addError, "Failed to add localhost network"),
              type: "error",
            },
          });
        }
        return;
      }
      set({
        status: { text: explainError(error, "Network switch failed"), type: "error" },
      });
    }
  },

  loadContract: async (address) => {
    if (!address || !ethers.isAddress(address)) {
      set({ status: { text: "Invalid contract address", type: "error" } });
      return false;
    }

    const { signer, provider } = get();
    const providerOrSigner = signer || provider;

    if (!providerOrSigner) {
      set({ status: { text: "Connect wallet first", type: "error" } });
      return false;
    }

    try {
      const contract = new ethers.Contract(address, CONTRACT_ABI, providerOrSigner);

      // Validate contract compatibility
      await contract.iconCount();

      set({
        contract,
        contractAddress: address,
        status: { text: "Contract loaded", type: "success" },
      });
      localStorage.setItem(CONTRACT_ADDRESS_KEY, address);

      await get().loadAllData();
      return true;
    } catch (error) {
      set({
        contract: null,
        status: {
          text: explainError(
            error,
            "Selected address is not a compatible IconMarketplace contract"
          ),
          type: "error",
        },
      });
      return false;
    }
  },

  loadAllData: async () => {
    const { contract, account } = get();
    if (!contract) return;

    set({ dataLoading: true });

    try {
      const count = await contract.iconCount();
      const items = [];
      const purchases = [];

      for (let i = 0; i < Number(count); i++) {
        const icon = await contract.icons(i);
        const item = {
          id: Number(icon.id),
          name: icon.name,
          price: icon.price.toString(),
          priceEth: ethers.formatEther(icon.price),
          seller: icon.seller,
          encryptedIconURL: icon.encryptedIconURL,
          previewImageURL: icon.previewImageURL,
          sold: icon.sold,
          totalSales: Number(icon.totalSales),
          active: icon.active,
          purchased: false,
        };

        if (account && icon.active) {
          try {
            item.purchased = await contract.hasUserPurchased(i, account);
          } catch (_e) {
            item.purchased = false;
          }
        }

        if (item.active) {
          items.push(item);
        }

        if (item.purchased) {
          purchases.push(item);
        }
      }

      set({ items, purchases, dataLoading: false });
    } catch (error) {
      set({
        dataLoading: false,
        status: { text: explainError(error, "Failed to load data"), type: "error" },
      });
    }
  },

  buyIcon: async (iconId) => {
    const { contract, items } = get();
    if (!contract) return false;

    const item = items.find((i) => i.id === iconId);
    if (!item) return false;

    set({ txPending: true, status: { text: "Awaiting confirmation...", type: "muted" } });

    try {
      const tx = await contract.buyIcon(iconId, { value: item.price });
      set({ status: { text: "Transaction pending...", type: "muted" } });
      await tx.wait();

      set({
        txPending: false,
        status: { text: "Purchase successful!", type: "success" },
      });

      await get().loadAllData();
      return true;
    } catch (error) {
      set({
        txPending: false,
        status: { text: explainError(error, "Purchase failed"), type: "error" },
      });
      return false;
    }
  },

  addIcon: async (name, priceEth, encryptedIconURL, previewImageURL) => {
    const { contract } = get();
    if (!contract) return false;

    set({ txPending: true, status: { text: "Awaiting confirmation...", type: "muted" } });

    try {
      const price = ethers.parseEther(priceEth);
      const tx = await contract.addIcon(name, price, encryptedIconURL, previewImageURL);
      set({ status: { text: "Transaction pending...", type: "muted" } });
      await tx.wait();

      set({
        txPending: false,
        status: { text: "Icon added successfully!", type: "success" },
      });

      await get().loadAllData();
      return true;
    } catch (error) {
      set({
        txPending: false,
        status: { text: explainError(error, "Failed to add icon"), type: "error" },
      });
      return false;
    }
  },

  getDownloadUrl: async (iconId) => {
    const { contract, account } = get();
    if (!contract || !account) return null;

    try {
      const response = await fetch(`${API_BASE}/download-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iconId,
          buyer: account,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to get download link");
      }

      const { downloadLink } = await response.json();
      return downloadLink;
    } catch (error) {
      set({
        status: { text: explainError(error, "Failed to get download link"), type: "error" },
      });
      return null;
    }
  },

  setupEventListeners: () => {
    if (!window.ethereum) return;

    window.ethereum.on("accountsChanged", async (accounts) => {
      if (!accounts.length) {
        sessionStorage.setItem(MANUAL_DISCONNECT_KEY, "1");
        get().disconnectWallet();
        return;
      }

      sessionStorage.removeItem(MANUAL_DISCONNECT_KEY);
      const { provider, contractAddress } = get();
      const signer = await provider.getSigner();
      const account = accounts[0];

      set({ signer, account });

      if (contractAddress && ethers.isAddress(contractAddress)) {
        await get().loadContract(contractAddress);
      }
    });

    window.ethereum.on("chainChanged", async () => {
      await get().checkNetwork();
      if (get().contract) {
        await get().loadAllData();
      }
    });
  },

  restoreSession: async () => {
    if (!window.ethereum) return;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      set({ provider });

      if (sessionStorage.getItem(MANUAL_DISCONNECT_KEY) === "1") {
        await get().checkNetwork();
        get().setupEventListeners();
        return;
      }

      const accounts = await provider.send("eth_accounts", []);

      if (accounts.length) {
        const signer = await provider.getSigner();
        const account = accounts[0];

        set({
          signer,
          account,
          status: { text: "Wallet restored", type: "success" },
        });
      }

      await get().checkNetwork();
      get().setupEventListeners();

      const savedAddress = localStorage.getItem(CONTRACT_ADDRESS_KEY);
      if (accounts.length && savedAddress && ethers.isAddress(savedAddress)) {
        await get().loadContract(savedAddress);
      }
    } catch (error) {
      set({
        status: { text: explainError(error, "Session restore failed"), type: "error" },
      });
    }
  },

  // API Functions
  encryptURL: async (url) => {
    const response = await fetch(`${API_BASE}/encrypt-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Encryption failed");
    return data.encryptedURL;
  },

  uploadPreviewImage: async (file) => {
    const dataUrl = await fileToDataUrl(file);
    const response = await fetch(`${API_BASE}/upload-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        dataUrl,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed");
    return data.url;
  },

  uploadAssetFile: async (file) => {
    const dataUrl = await fileToDataUrl(file);
    const response = await fetch(`${API_BASE}/upload-asset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        dataUrl,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed");
    return data.encryptedURL;
  },
}));

// Helper function
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default useStore;
