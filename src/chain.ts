import { erc20Abi, zeroAddress, type Address, type Hex } from "viem";
import { CONTRACTS, publicClient, DEPLOYMENT_BLOCK } from "./config";
import { factoryAbi, hookAbi, tokenAbi } from "./contracts/abis";

export async function verifyInfrastructure() {
  const [chain, implementation, manager] = await Promise.all([
    publicClient.getChainId(),
    publicClient.readContract({
      address: CONTRACTS.factory,
      abi: factoryAbi,
      functionName: "implementation",
    }),
    publicClient.readContract({
      address: CONTRACTS.hook,
      abi: hookAbi,
      functionName: "poolManager",
    }),
  ]);
  if (
    chain !== 1 ||
    implementation.toLowerCase() !== CONTRACTS.implementation ||
    manager.toLowerCase() !== CONTRACTS.poolManager
  )
    throw new Error(
      "Deployment verification failed. Check that your RPC serves Ethereum mainnet.",
    );
}
export async function readBase(address: Address) {
  if (address === zeroAddress)
    return { address, symbol: "ETH", decimals: 18, kind: "Native ether" };
  const [symbol, decimals, status] = await Promise.all([
    publicClient.readContract({
      address,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    publicClient.readContract({
      address,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    publicClient.readContract({
      address: CONTRACTS.hook,
      abi: hookAbi,
      functionName: "externalBases",
      args: [address],
    }),
  ]);
  if (decimals > 36)
    throw new Error("This interface supports bases with up to 36 decimals.");
  if (status[0]) {
    if (!status[1])
      throw new Error(
        "This base is currently disabled by the hook owner. Choose another base.",
      );
    return { address, symbol, decimals, kind: "Registered base" };
  }
  const [hook, quote, pairing, initialized, manager] = await Promise.all([
    publicClient.readContract({ address, abi: tokenAbi, functionName: "hook" }),
    publicClient.readContract({
      address,
      abi: tokenAbi,
      functionName: "quoteToken",
    }),
    publicClient.readContract({
      address,
      abi: tokenAbi,
      functionName: "pairingEnabled",
    }),
    publicClient.readContract({
      address: CONTRACTS.hook,
      abi: hookAbi,
      functionName: "poolInitialized",
      args: [address],
    }),
    publicClient.readContract({
      address,
      abi: tokenAbi,
      functionName: "poolManager",
    }),
  ]);
  if (
    hook.toLowerCase() !== CONTRACTS.hook ||
    quote !== zeroAddress ||
    !pairing ||
    !initialized ||
    manager.toLowerCase() !== CONTRACTS.poolManager
  )
    throw new Error(
      "This token is not an eligible base. It needs an initialized ETH pool and pairing permission on the shared hook.",
    );
  return { address, symbol, decimals, kind: "Eligible ERC20T base" };
}

export async function readToken(address: Address) {
  const code = await publicClient.getCode({ address });
  if (
    !code ||
    code.length !== 292 ||
    code.slice(22, 62).toLowerCase() !== CONTRACTS.implementation.slice(2) ||
    code.slice(92, 132).toLowerCase() !== CONTRACTS.hook.slice(2)
  )
    throw new Error(
      "This address is not an ERC20T clone using the supplied implementation and hook.",
    );
  const block = await publicClient.getBlock();
  const read = <N extends (typeof tokenAbi)[number]["name"]>(functionName: N) =>
    publicClient.readContract({
      address,
      abi: tokenAbi,
      functionName,
      blockNumber: block.number,
    } as never);
  const [
    name,
    symbol,
    owner,
    supply,
    quote,
    restingTax,
    tax,
    launchTax,
    launchedAt,
    launched,
    decayActive,
    interval,
    recipient,
    decayRecipient,
    pairing,
    externalLiquidity,
    globalDistributors,
    locked,
  ] = await Promise.all([
    read("name"),
    read("symbol"),
    read("owner"),
    read("totalSupply"),
    read("quoteToken"),
    read("restingTaxBps"),
    read("taxBps"),
    read("launchTaxBps"),
    read("launchedAt"),
    read("launched"),
    read("taxDecayActive"),
    read("taxDecayIntervalSeconds"),
    read("feeRecipient"),
    read("feeDecayRecipient"),
    read("pairingEnabled"),
    read("externalLiquidityEnabled"),
    read("useGlobalDistributors"),
    publicClient.readContract({
      address,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [address],
      blockNumber: block.number,
    }),
  ]);
  return {
    address,
    name: name as string,
    symbol: symbol as string,
    owner: owner as Address,
    supply: supply as bigint,
    quote: quote as Address,
    restingTax: restingTax as number,
    tax: tax as number,
    launchTax: launchTax as number,
    launchedAt: launchedAt as bigint,
    launched: launched as boolean,
    decayActive: decayActive as boolean,
    interval: interval as number,
    recipient: recipient as Address,
    decayRecipient: decayRecipient as Address,
    pairing: pairing as boolean,
    externalLiquidity: externalLiquidity as boolean,
    globalDistributors: globalDistributors as boolean,
    locked,
    block: block.number,
    timestamp: block.timestamp,
    fetchedAt: Date.now(),
  };
}
export type TokenInfo = Awaited<ReturnType<typeof readToken>>;
export async function discover(toBlock?: bigint) {
  const latest = toBlock ?? (await publicClient.getBlockNumber());
  const fromBlock =
    latest - 4999n < DEPLOYMENT_BLOCK ? DEPLOYMENT_BLOCK : latest - 4999n;
  if (latest < DEPLOYMENT_BLOCK)
    throw new Error(
      "The RPC is behind this deployment. Choose a current Ethereum mainnet RPC.",
    );
  const logs = await publicClient.getContractEvents({
    address: CONTRACTS.factory,
    abi: factoryAbi,
    eventName: "TokenCreated",
    fromBlock,
    toBlock: latest,
    strict: true,
  });
  const addresses = [...new Set(logs.map((log) => log.args.token))].reverse();
  // Bound metadata reads; the UI explicitly reports omitted entries and supports address lookup.
  const results = await Promise.allSettled(
    addresses.slice(0, 30).map(readToken),
  );
  return {
    tokens: results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    failed: results.filter((r) => r.status === "rejected").length,
    omitted: Math.max(0, addresses.length - 30),
    fromBlock,
    toBlock: latest,
    next: fromBlock > DEPLOYMENT_BLOCK ? fromBlock - 1n : undefined,
  };
}
export async function launchPreview(
  supply: bigint,
  creatorBps: number,
  price: bigint,
  tokenIsCurrency0: boolean,
) {
  return publicClient.readContract({
    address: CONTRACTS.factory,
    abi: factoryAbi,
    functionName: "previewQuotedLaunch",
    args: [supply, creatorBps, price, tokenIsCurrency0],
  });
}
export type LaunchPreview = Awaited<ReturnType<typeof launchPreview>>;
export type TransactionCall = {
  address: Address;
  abi: typeof factoryAbi | typeof tokenAbi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
};
export type TransactionHash = Hex;
