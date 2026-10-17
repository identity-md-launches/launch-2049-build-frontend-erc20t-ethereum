# ERC20T

A static Ethereum mainnet launchpad for the supplied ERC20T factory, token implementation and shared Uniswap v4 tax hook. The complete production website is included in `dist/`.

## Run locally

Use Node.js 22.12 or newer and npm. No environment file, API key, server, WalletConnect relay or project ID is required.

```sh
npm ci
npm run dev
```

Build and preview the production website:

```sh
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

To preview the included export without installing dependencies, run `node scripts/serve.mjs 4173` and open `http://127.0.0.1:4173/preview/`. Serve the entire `dist/` directory through HTTP(S). Vite uses `base: './'`; routes use URL hashes, so a gateway subpath needs no rewrite rules. All fonts, wallet marks, favicon and share artwork are local. Share metadata uses relative image URLs because a public hosting origin was not supplied.

## What works

- **Create:** enter token details, choose ETH, IMD, FWA or an eligible custom base, then configure creator allocation, starting price, resting tax, optional launch decay and recipients. The review calls the factory's actual price preview, explains rounding and permanent liquidity locking, and requires acknowledgement before signing.
- **Deploy now or later:** atomic deployment uses `createAndLaunchAtPrice`; deployment without launching uses `create`. Owners can launch an existing unlaunched token from its management page.
- **Discover:** real factory events, name/symbol search, launched/unlaunched filters, token address lookup and earlier block windows. Token details show current contract tax, fee split, decay timing, permissions and block freshness.
- **Manage:** authenticated token owners can change both fee recipients, resting tax when permitted, local distributors, global distributor use, external liquidity and pairing permissions. Every write has a concrete confirmation and simulation before the wallet request.
- **Wallets:** one connect control offers EIP-6963 browser wallets, a legacy injected fallback, four phone wallet browser links and Coinbase Smart Wallet. Wrong-network connections can switch to Ethereum. Rejected requests can be retried. Submitted transaction tracking survives a closed dialog or page reload in the same tab.

The UI never requests a base-token approval or deposit. ETH is still needed for gas. The native ETH zero currency identifier is used only where the verified ABI requires it; it is rejected as a fee recipient. Default recipients are the connected owner's actual address, with an explicit override for each recipient.

## Contracts and reads

| Role | Ethereum mainnet address |
| --- | --- |
| Shared hook | `0xed9a04fa6693e754661a22502524df9b1857e544` |
| Factory | `0x801411c6acec4fa80c75c5d3c0eae13c84f8a173` |
| Implementation | `0x2df7dcf4d19a7924e00ae96629cc1d1261670eee` |

Complete verified ABIs are included in `src/contracts/`. [Deployment research](artifacts/deployment-research.md) explains provenance, launch math, eligible bases and transaction mappings. The app checks chain identity, the factory implementation and the hook's PoolManager before writes. Token lookup checks the deployed clone implementation and immutable hook.

Reads default to public Ethereum RPC endpoints in `src/config.ts`. Network settings accept a user-provided public HTTPS RPC, verify chain ID 1 and save it in that browser's local storage. Do not put secret-bearing endpoints into a public frontend. RPC failures have retry and settings actions; the static guide remains available offline. Live discovery, simulations, wallets and transactions need network access.

Discovery scans 5,000-block windows starting from the most recent block, reads at most 30 tokens per window, and reports failures or omitted entries. It is not a global indexed analytics service. Direct address lookup remains available. Token detail reads refresh every 15 seconds and report their sampled block; a failed refresh marks retained data as stale.

## Validation

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:browser
```

Browser validation serves the production export at a nested path. It uses explicit local RPC and wallet fixtures to test form validation, filters, owner writes, transaction calldata, wallet failures, network switching, pending/reverted receipts, keyboard behavior, axe accessibility and responsive reflow. It never signs or broadcasts a real transaction. Browser evidence is written to disposable `test/scratch/browser-checks/`.

For this assignment, dependencies were installed in an external temporary build workspace so no repository `node_modules/` was created. Source and the locked manifest were copied there, the commands above were run, and the complete resulting `dist/` was copied back. Chromium and WebKit were exercised. The final results are **typecheck passed, production build passed, 7 unit tests passed, 15 browser validation groups passed, and all 16 pinned design-probe checks passed**. The worker also used real mainnet reads to discover six tokens and obtain ETH, IMD and FWA launch previews.

The pinned review command was:

```sh
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

That input is removed from the delivered repository; its result is preserved under `artifacts/`. See [validation and six-domain review](artifacts/validation.md) for actual evidence, repaired findings, environment details and limitations. No real transaction, installed phone wallet handoff or Coinbase passkey account creation was performed. Automated checks and source research do not constitute a contract audit.

## Source map

`src/Launch.tsx`, `Discover.tsx` and `Manage.tsx` implement the main flows. `domain.ts` owns integer arithmetic and validation; `chain.ts` owns RPC reads; `Transaction.tsx` owns simulation, signing and receipt state. `Wallet.tsx` owns connector presentation, and `ui.tsx` contains shared accessible primitives. [DESIGN.md](DESIGN.md) records the implemented visual system. [Third-party notices](THIRD_PARTY_NOTICES.md) cover included assets and review references.

The submission contains no dependency directories, caches, source maps, vendored registry or submodule. The export is required and intentionally not ignored. The explicit path allocation is in [artifacts/path-budget.md](artifacts/path-budget.md).
