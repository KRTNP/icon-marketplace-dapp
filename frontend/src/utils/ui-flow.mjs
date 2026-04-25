export const getNextFocusIndex = ({ count, currentIndex, shiftKey }) => {
  const total = Number(count) || 0;
  if (total <= 1 || currentIndex < 0 || currentIndex >= total) {
    return null;
  }

  if (!shiftKey && currentIndex === total - 1) {
    return 0;
  }
  if (shiftKey && currentIndex === 0) {
    return total - 1;
  }
  return null;
};

export const shouldReloadForWalletChange = ({ currentAccount, nextAccounts }) => {
  const current = String(currentAccount || "").toLowerCase();
  const next = String((nextAccounts && nextAccounts[0]) || "").toLowerCase();

  if (!next) {
    return Boolean(current);
  }
  return Boolean(current && current !== next);
};
