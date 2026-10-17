# Third-party notices

The application uses React, React DOM, Vite, TypeScript, wagmi, viem, TanStack Query, Coinbase Wallet SDK and Lucide. Exact dependency versions are in `package-lock.json`. Selected runtime dependency licenses are preserved in `artifacts/licenses/`; dependencies installed from npm retain their own complete notices.

- Inter Variable by Rasmus Andersson is bundled locally through Fontsource under the SIL Open Font License. See `artifacts/licenses/inter.txt`.
- The MetaMask, Rabby and Phantom wallet marks were obtained from the RainbowKit 2.2.11 wallet assets. The Coinbase mark is used for the Coinbase wallet option. Marks identify their respective wallet providers; no endorsement is implied. RainbowKit's MIT license is preserved in `artifacts/licenses/rainbowkit.txt`; the app does not use RainbowKit's connector system.
- Lucide outline icons are bundled as React components. See `artifacts/licenses/lucide-react.txt`.
- The ERC20T symbol, favicon and share-card composition were created for this frontend with SVG/HTML/CSS. `scripts/share-card.mjs` reproduces the share PNG using Playwright.
- The pinned Better Interface reference supplied with this assignment was used for design and review. It incorporates Jakub Krehel's Better Interface (MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and the Impeccable documentation reference by Paul Bakaus (Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). The supplied combined license texts are preserved in `artifacts/licenses/better-interface.txt`. No guide text is included in the runtime website.
- Contract ABI files were derived from the verified Sourcify records linked in `artifacts/deployment-research.md`. No Solidity source is redistributed in the runtime export.
