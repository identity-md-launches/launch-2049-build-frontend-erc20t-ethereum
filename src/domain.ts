import { isAddress, parseUnits, zeroAddress, type Address } from "viem";
import { BASES, CONTRACTS } from "./config";

export type Draft = {
  name: string;
  symbol: string;
  supply: string;
  base: string;
  customBase: string;
  price: string;
  allocation: number;
  tax: string;
  decay: boolean;
  interval: string;
  mode: "launch" | "deploy";
  customRecipients: boolean;
  recipient: string;
  decayRecipient: string;
};
export const INITIAL_DRAFT: Draft = {
  name: "",
  symbol: "",
  supply: "1000000000",
  base: "ETH",
  customBase: "",
  price: "0.000000001",
  allocation: 10,
  tax: "3",
  decay: false,
  interval: "60",
  mode: "launch",
  customRecipients: false,
  recipient: "",
  decayRecipient: "",
};
export const MAX_UINT128 = (1n << 128n) - 1n;
export function units(value: string, decimals: number): bigint {
  if (
    !/^\d+(\.\d+)?$/.test(value) ||
    (value.split(".")[1]?.length || 0) > decimals
  )
    throw new Error(
      `Use a positive decimal with at most ${decimals} decimal places.`,
    );
  const result = parseUnits(value, decimals);
  if (result <= 0n || result > (1n << 256n) - 1n)
    throw new Error("Enter a positive amount within the supported range.");
  return result;
}
export const bps = (percent: string) => Number(parseUnits(percent, 2));
export function allocation(supply: bigint, percent: number) {
  const creator = (supply * BigInt(Math.round(percent * 100))) / 10000n;
  return { creator, liquidity: supply - creator };
}
export function decayRate(
  restingBps: number,
  interval: number,
  elapsed: number,
  enabled = true,
) {
  return enabled
    ? Math.max(
        restingBps,
        9900 - Math.floor(Math.max(0, elapsed) / interval) * 100,
      )
    : restingBps;
}
export const decayDuration = (restingBps: number, interval: number) =>
  Math.ceil((9900 - restingBps) / 100) * interval;
export function duration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ""}`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h${seconds % 3600 ? ` ${Math.floor((seconds % 3600) / 60)}m` : ""}`;
  return `${(seconds / 86400).toFixed(1)} days`;
}
export function feeSplit(restingBps: number, currentBps: number) {
  return {
    protocol: 15,
    regular: restingBps - 15,
    decay: Math.max(0, currentBps - restingBps),
  };
}
export function validRecipient(value: string) {
  return (
    isAddress(value) &&
    value.toLowerCase() !== zeroAddress &&
    !Object.values(CONTRACTS).some(
      (a) => a.toLowerCase() === value.toLowerCase(),
    )
  );
}
export function quoteAddress(draft: Draft): Address {
  if (draft.base === "custom") {
    if (
      !isAddress(draft.customBase) ||
      draft.customBase.toLowerCase() === zeroAddress
    )
      throw new Error(
        "Enter an eligible ERC-20 contract address. Choose ETH for native ether.",
      );
    return draft.customBase as Address;
  }
  const base = BASES.find((b) => b.symbol === draft.base);
  if (!base) throw new Error("Choose a base token.");
  return base.address;
}
export function validateDraft(d: Draft, step = 3): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name.trim()) errors.name = "Enter a token name.";
  if (!d.symbol.trim()) errors.symbol = "Enter a token symbol.";
  try {
    if (units(d.supply, 18) > MAX_UINT128)
      errors.supply = "Supply exceeds the supported liquidity limit.";
  } catch {
    errors.supply = "Enter a positive supply with up to 18 decimal places.";
  }
  try {
    quoteAddress(d);
  } catch (e) {
    errors.customBase = (e as Error).message;
  }
  if (step < 2) return errors;
  if (
    d.mode === "launch" &&
    (!/^\d+(\.\d+)?$/.test(d.price) || Number(d.price) <= 0)
  )
    errors.price = "Enter a starting price greater than zero.";
  if (
    !Number.isInteger(d.allocation * 100) ||
    d.allocation < 0 ||
    d.allocation > 20
  )
    errors.allocation = "Keep between 0% and 20%.";
  if (
    !/^\d+(\.\d{1,2})?$/.test(d.tax) ||
    Number(d.tax) < 0.3 ||
    Number(d.tax) > 5
  )
    errors.tax = "Enter a tax from 0.30% to 5.00%, with up to two decimals.";
  if (
    d.decay &&
    (!/^\d+$/.test(d.interval) ||
      Number(d.interval) < 1 ||
      Number(d.interval) > 4294967295)
  )
    errors.interval =
      "Enter a whole number of seconds from 1 to 4,294,967,295.";
  if (d.customRecipients) {
    if (!validRecipient(d.recipient))
      errors.recipient =
        "Enter a valid fee recipient, excluding platform contracts and the zero address.";
    if (!validRecipient(d.decayRecipient))
      errors.decayRecipient =
        "Enter a valid decay recipient, excluding platform contracts and the zero address.";
  }
  return errors;
}
export function makeConfig(d: Draft, owner: Address) {
  const supply = units(d.supply, 18);
  if (!validRecipient(owner)) throw new Error("Connect a valid owner wallet.");
  const errors = validateDraft(d);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    name: d.name.trim(),
    symbol: d.symbol.trim(),
    supply,
    lpSupply: allocation(supply, d.allocation).liquidity,
    owner,
    hook: CONTRACTS.hook,
    quoteToken: quoteAddress(d),
    positionManager: CONTRACTS.positionManager,
    permit2: CONTRACTS.permit2,
    taxBps: bps(d.tax),
    feeRecipient: (d.customRecipients ? d.recipient : owner) as Address,
    launchTaxBps: d.decay ? 9900 : 0,
    taxDecayIntervalSeconds: d.decay ? Number(d.interval) : 0,
    feeDecayRecipient: (d.customRecipients
      ? d.decayRecipient
      : owner) as Address,
  };
}
export function errorMessage(error: unknown) {
  const e = error as {
    shortMessage?: string;
    message?: string;
    details?: string;
  };
  const msg = e.shortMessage || e.message || "Request failed.";
  if (/rejected|denied/i.test(msg))
    return "Request declined in your wallet. You can try again when ready.";
  if (/fetch|http request|timeout|network|timed out/i.test(msg))
    return "Ethereum could not be reached. Retry or choose another public RPC in Connection settings.";
  return msg.length > 500 ? msg.slice(0, 500) : msg;
}
