export const CONTRACT_ABI = [
  "function iconCount() view returns (uint256)",
  "function icons(uint256) view returns (uint256 id, string name, uint256 price, address seller, string encryptedIconURL, string previewImageURL, bool sold, uint256 totalSales, bool active)",
  "function hasUserPurchased(uint256 iconId, address user) view returns (bool)",
  "function addIcon(string name, uint256 price, string encryptedIconURL, string previewImageURL)",
  "function buyIcon(uint256 iconId) payable",
  "function setIconActive(uint256 iconId, bool active)",
  "function getEncryptedDownloadURL(uint256 iconId) view returns (string)",
  "event IconAdded(uint256 indexed id, string name, uint256 price, address indexed seller, string previewImageURL)",
  "event IconPurchased(uint256 indexed id, address indexed buyer, address indexed seller, uint256 price, uint256 totalSales)",
];

export const LOCAL_CHAIN_IDS = new Set([31337, 1337]);
export const API_BASE = "/api";
export const MANUAL_DISCONNECT_KEY = "icon-marketplace-manual-disconnect";
export const CONTRACT_ADDRESS_KEY = "icon-marketplace-address";
