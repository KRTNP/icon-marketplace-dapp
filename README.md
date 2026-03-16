# Decentralized Icon Marketplace (Take-home)

Separate project implementation for the dApp take-home requirement.

## Structure

- `backend/` Hardhat + Solidity contract/tests/deploy
- `frontend/` Vite + vanilla JS dApp UI

## Quick Start

### Backend

```bash
cd backend
npm install
npx hardhat test
npx hardhat node
# in another terminal
npx hardhat run scripts/deploy.js --network localhost
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:3000` and set deployed contract address.
