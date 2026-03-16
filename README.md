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

### Terminal 3: API Server

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

Open `http://127.0.0.1:8080`

## Seller Flow

### Add Icon

Required:
- `Icon Name`
- `Price (ETH)`

Preview image (choose one):
- `Use URL` (custom preview URL)
- `Upload File` (backend generates `/uploads/previews/...` URL)

Download asset (choose one):
- `Use URL` (custom downloadable URL)
- `Upload File` (backend generates `/uploads/assets/...` URL)

## Buyer Flow

1. Buyer clicks `Buy`
2. Buyer clicks `Reveal URL`
3. Frontend opens `/download.html?iconId=...`
4. `download.html` requests nonce + signature, calls `/api/reveal-url`, and shows final download link
5. If asset is local upload (`/uploads/assets/...`), backend returns a signed temporary URL (`/api/download-asset/...`) with expiry

## Env

### backend/.env

```env
LOCAL_RPC_URL=http://127.0.0.1:8545
DEPLOYED_CONTRACT_ADDRESS=
ICON_URL_SECRET=replace-with-long-secret
API_PORT=4315
API_HOST=127.0.0.1
API_PUBLIC_BASE_URL=http://127.0.0.1:4315
PREVIEW_UPLOAD_MAX_BYTES=5242880
ASSET_UPLOAD_MAX_BYTES=20971520
DOWNLOAD_URL_TTL_SECONDS=300
```

### frontend/.env

```env
VITE_DEFAULT_CONTRACT_ADDRESS=
```

## Verification

```bash
cd backend
npx hardhat test

cd ../frontend
npm run test
npm run build
```

## Troubleshooting

- `Wrong network (chainId ...)`:
  - click `Switch to Localhost`, or manually switch MetaMask to `31337`
- `ERR_CONNECTION_REFUSED` on `/uploads/...`:
  - ensure `backend` API is running (`npm run api`)
- `You already purchased this item`:
  - expected when same wallet buys same icon again
- Image preview fallback shown:
  - preview URL/file is missing or unreachable; re-upload preview in seller form

## Release Checklist

1. `npx hardhat test` passes
2. `npm run test` and `npm run build` pass in frontend
3. `.env.example` includes all required variables
4. `.gitignore` excludes `.env` and `backend/uploads/`
5. Local run tested end-to-end: add item -> buy -> reveal -> download
