export const computeOnboardingState = ({ hasWallet, hasContract, isLocalNetwork }) => {
  const walletDone = Boolean(hasWallet);
  const networkDone = Boolean(isLocalNetwork);
  const contractDone = Boolean(hasWallet && hasContract);

  let nextAction = 'connect_wallet';
  if (walletDone && !networkDone) {
    nextAction = 'switch_network';
  } else if (walletDone && networkDone && !contractDone) {
    nextAction = 'load_contract';
  } else if (walletDone && networkDone && contractDone) {
    nextAction = 'ready';
  }

  return {
    nextAction,
    steps: {
      wallet: walletDone ? 'done' : 'pending',
      network: networkDone ? 'done' : 'pending',
      contract: contractDone ? 'done' : 'pending'
    }
  };
};
