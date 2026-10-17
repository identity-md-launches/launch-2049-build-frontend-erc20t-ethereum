import { createConfig, http, fallback } from "wagmi";
import { mainnet } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { createPublicClient, zeroAddress, type Address } from "viem";

export const CONTRACTS = {
  hook: "0xed9a04fa6693e754661a22502524df9b1857e544",
  factory: "0x801411c6acec4fa80c75c5d3c0eae13c84f8a173",
  implementation: "0x2df7dcf4d19a7924e00ae96629cc1d1261670eee",
  poolManager: "0x000000000004444c5dc75cb358380d2e3de08a90",
  positionManager: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
} as const;
// Ethereum represents native ETH as the zero currency, never as a recipient.
export const BASES = [
  { symbol: "ETH", name: "Ether", address: zeroAddress },
  {
    symbol: "IMD",
    name: "IdentityMD",
    address: "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7",
  },
  {
    symbol: "FWA",
    name: "Fake World Assets",
    address: "0xa0df17b5ac76ababa36e1450e2cbcd18a620c845",
  },
] as const;
export const DEPLOYMENT_BLOCK = 26208074n;
export const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
];
export function getCustomRpc(): string {
  try {
    return localStorage.getItem("erc20t:rpc") || "";
  } catch {
    return "";
  }
}
const urls = getCustomRpc() ? [getCustomRpc()] : RPC_URLS;
const transport = () =>
  fallback(
    urls.map((url) => http(url, { timeout: 9_000, retryCount: 0 })),
    { retryCount: 0 },
  );
export const publicClient = createPublicClient({
  chain: mainnet,
  transport: transport(),
});
export const config = createConfig({
  chains: [mainnet],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    coinbaseWallet({ appName: "ERC20T", preference: { options: "all" } }),
  ],
  transports: { [mainnet.id]: transport() },
});
export const explorer = (address: string, type = "address") =>
  `https://etherscan.io/${type}/${address}`;
export const baseName = (address: Address) =>
  BASES.find((b) => b.address.toLowerCase() === address.toLowerCase())
    ?.symbol || "Custom base";
export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
