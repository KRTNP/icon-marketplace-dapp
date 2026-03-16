# Decentralized Icon Marketplace (Take-home)

Separate project implementation for the dApp take-home requirement.

## Structure

- `backend/` Hardhat + Solidity contract + tests + API server
- `frontend/` Vite + vanilla JS dApp UI

## Run (Local)

### Terminal 1: Local Blockchain

```bash
cd backend
npm install
npx hardhat node
```

### Terminal 2: Deploy Contract

```bash
cd backend
npx hardhat run scripts/deploy.js --network localhost
```

Update `backend/.env` and `frontend/.env` with the deployed address.

### Terminal 3: API Server (Encrypt / Reveal)

```bash
cd backend
npm run api
```

### Terminal 4: Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:3000`

## Verification

```bash
cd backend
npx hardhat test

cd ../frontend
npm run build
```
