import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeAbiParameters,
  encodeEventTopics,
  zeroAddress,
} from "viem";
import factoryAbi from "../src/contracts/factory.json" with { type: "json" };
import tokenAbi from "../src/contracts/token.json" with { type: "json" };
import hookAbi from "../src/contracts/hook.json" with { type: "json" };
import { erc20Abi } from "viem";
import { serveExport } from "./serve.mjs";

// Synthetic providers and RPC replies are used only in this validation script.
// No signing, live writes, fixture data, or fixture accounts are shipped in the website.
const A = {
  factory: "0x801411c6acec4fa80c75c5d3c0eae13c84f8a173",
  hook: "0xed9a04fa6693e754661a22502524df9b1857e544",
  implementation: "0x2df7dcf4d19a7924e00ae96629cc1d1261670eee",
  pool: "0x000000000004444c5dc75cb358380d2e3de08a90",
  position: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
  permit: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  owner: "0x1234567890123456789012345678901234567890",
  token: "0x2345678901234567890123456789012345678901",
  token2: "0x3456789012345678901234567890123456789012",
  recipient: "0x4567890123456789012345678901234567890123",
  imd: "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7",
  fwa: "0xa0df17b5ac76ababa36e1450e2cbcd18a620c845",
};
const blockNumber = 26208100n,
  blockHash = `0x${"ab".repeat(32)}`,
  txHash = `0x${"cd".repeat(32)}`;
const out = "test/scratch/browser-checks";
await mkdir(out, { recursive: true });
const results = [],
  failures = [],
  limitations = [];
const { server, url } = await serveExport();
const block = {
  number: `0x${blockNumber.toString(16)}`,
  hash: blockHash,
  parentHash: blockHash,
  nonce: "0x0000000000000000",
  sha3Uncles: blockHash,
  logsBloom: `0x${"00".repeat(256)}`,
  transactionsRoot: blockHash,
  stateRoot: blockHash,
  receiptsRoot: blockHash,
  miner: A.owner,
  difficulty: "0x0",
  totalDifficulty: "0x0",
  extraData: "0x",
  size: "0x1",
  gasLimit: "0x1c9c380",
  gasUsed: "0x1000",
  timestamp: "0x6ad2e0e3",
  transactions: [],
  uncles: [],
  baseFeePerGas: "0x3b9aca00",
  mixHash: blockHash,
};
const callLog = [];
function makeState() {
  return {
    offline: false,
    revert: false,
    launched: true,
    decay: false,
    resting: 300,
    recipient: A.owner,
    decayRecipient: A.owner,
    pairing: false,
    external: false,
    global: true,
    receiptStatus: "0x1",
    pendingReceipt: false,
    lastCall: undefined,
  };
}
async function mockRpc(context, state) {
  await context.route(
    /https:\/\/(ethereum-rpc\.publicnode\.com|eth\.llamarpc\.com)/,
    async (route) => {
      if (state.offline) {
        await route.abort("failed");
        return;
      }
      const req = route.request().postDataJSON();
      function reply(r) {
        try {
          let result;
          const p = r.params || [];
          switch (r.method) {
            case "eth_chainId":
              result = "0x1";
              break;
            case "eth_blockNumber":
              result = `0x${blockNumber.toString(16)}`;
              break;
            case "eth_getBlockByNumber":
            case "eth_getBlockByHash":
              result = block;
              break;
            case "eth_getBalance":
              result = "0xde0b6b3a7640000";
              break;
            case "eth_getCode":
              result = `0x363d3d373d3d3d363d73${A.implementation.slice(2)}5af43d82803e903d91602b57fd5bf3${A.hook.slice(2)}${zeroAddress.slice(2)}${A.pool.slice(2)}${A.position.slice(2)}${A.permit.slice(2)}`;
              break;
            case "eth_getLogs":
              result = [A.token, A.token2].map((token, i) => ({
                address: A.factory,
                topics: encodeEventTopics({
                  abi: factoryAbi,
                  eventName: "TokenCreated",
                  args: { token, owner: A.owner, creator: A.owner },
                }),
                data: encodeAbiParameters([{ type: "address" }], [A.hook]),
                blockNumber: `0x${blockNumber.toString(16)}`,
                blockHash,
                transactionHash: txHash,
                transactionIndex: "0x0",
                logIndex: `0x${i}`,
                removed: false,
              }));
              break;
            case "eth_getTransactionReceipt":
              if (state.pendingReceipt) {
                result = null;
                break;
              }
              result = {
                transactionHash: txHash,
                transactionIndex: "0x0",
                blockHash,
                blockNumber: `0x${blockNumber.toString(16)}`,
                from: A.owner,
                to: state.lastCall?.to || A.factory,
                cumulativeGasUsed: "0x5208",
                gasUsed: "0x5208",
                effectiveGasPrice: "0x3b9aca00",
                contractAddress: null,
                logs: [],
                logsBloom: `0x${"00".repeat(256)}`,
                status: state.receiptStatus,
                type: "0x2",
              };
              break;
            case "eth_call": {
              const to = p[0].to.toLowerCase();
              const abi =
                to === A.factory
                  ? factoryAbi
                  : to === A.hook
                    ? hookAbi
                    : [...tokenAbi, ...erc20Abi];
              const { functionName: fn, args } = decodeFunctionData({
                abi,
                data: p[0].data,
              });
              callLog.push({ fn, args, to });
              const second = to === A.token2;
              let value;
              const values = {
                implementation: A.implementation,
                poolManager: A.pool,
                externalBases: [true, true],
                poolInitialized: true,
                PROTOCOL_FEE_BPS: 15,
                protocolFeeRecipient: A.owner,
                name: second ? "Waiting Garden" : "Test Garden",
                symbol: to === A.imd ? "IMD" : to === A.fwa ? "FWA" : "GARDEN",
                decimals: to === A.fwa ? 6 : 18,
                owner: A.owner,
                totalSupply: 1000000000n * 10n ** 18n,
                quoteToken: zeroAddress,
                hook: A.hook,
                restingTaxBps: state.resting,
                taxBps: state.decay ? 9800 : state.resting,
                launchTaxBps: state.decay ? 9900 : 0,
                launchedAt: 1792200000n,
                launched: second ? false : state.launched,
                taxDecayActive: state.decay,
                taxDecayIntervalSeconds: 60,
                feeRecipient: state.recipient,
                feeDecayRecipient: state.decayRecipient,
                pairingEnabled: state.pairing,
                externalLiquidityEnabled: state.external,
                useGlobalDistributors: state.global,
                balanceOf: 900000000n * 10n ** 18n,
                isLocalDistributor: false,
                isDistributor: false,
              };
              if (fn === "previewQuotedLaunch") {
                const [supply, bps, price] = args;
                value = {
                  creatorSupply: (supply * BigInt(bps)) / 10000n,
                  lpSupply: supply - (supply * BigInt(bps)) / 10000n,
                  sqrtPriceX96: 79228162514264337593543950336n,
                  tickLower: -887220,
                  tickUpper: 207240,
                  effectivePriceWei: price,
                };
              } else if (fn in values) value = values[fn];
              else {
                if (state.revert)
                  return {
                    jsonrpc: "2.0",
                    id: r.id,
                    error: {
                      code: 3,
                      message:
                        "execution reverted: validation fixture rejection",
                      data: "0x",
                    },
                  };
                value =
                  fn === "create" || fn === "createAndLaunchAtPrice"
                    ? A.token
                    : undefined;
              }
              result = encodeFunctionResult({
                abi,
                functionName: fn,
                result: value,
              });
              break;
            }
            default:
              throw new Error(`Unhandled mock RPC method: ${r.method}`);
          }
          return { jsonrpc: "2.0", id: r.id, result };
        } catch (e) {
          return {
            jsonrpc: "2.0",
            id: r.id,
            error: { code: -32000, message: String(e) },
          };
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(req) ? req.map(reply) : reply(req)),
      });
    },
  );
}
async function injectWallet(
  context,
  { chain = 1, rejectConnect = false } = {},
) {
  await context.addInitScript(
    ({ owner, chain, rejectConnect, hash }) => {
      const listeners = new Map();
      const state = {
        chain: Number(sessionStorage.getItem("test-wallet-chain") || chain),
        connected: sessionStorage.getItem("test-wallet-connected") === "true",
        rejectConnect,
        rejectSend: false,
        calls: [],
        added: false,
      };
      window.__testWallet = state;
      const provider = {
        on: (name, fn) => {
          if (!listeners.has(name)) listeners.set(name, new Set());
          listeners.get(name).add(fn);
        },
        removeListener: (name, fn) => listeners.get(name)?.delete(fn),
        request: async ({ method, params }) => {
          state.calls.push({ method, params });
          if (method === "eth_requestAccounts") {
            if (state.rejectConnect) {
              state.rejectConnect = false;
              throw { code: 4001, message: "User rejected the request" };
            }
            state.connected = true;
            sessionStorage.setItem("test-wallet-connected", "true");
            return [owner];
          }
          if (method === "eth_accounts") return state.connected ? [owner] : [];
          if (method === "eth_chainId") return `0x${state.chain.toString(16)}`;
          if (method === "wallet_switchEthereumChain") {
            if (!state.added) {
              throw { code: 4902, message: "Unknown chain" };
            }
            state.chain = parseInt(params[0].chainId, 16);
            sessionStorage.setItem("test-wallet-chain", String(state.chain));
            listeners
              .get("chainChanged")
              ?.forEach((fn) => fn(params[0].chainId));
            return null;
          }
          if (method === "wallet_addEthereumChain") {
            state.added = true;
            state.chain = 1;
            sessionStorage.setItem("test-wallet-chain", "1");
            listeners.get("chainChanged")?.forEach((fn) => fn("0x1"));
            return null;
          }
          if (
            method === "eth_sendTransaction" ||
            method === "wallet_sendTransaction"
          ) {
            if (state.rejectSend) {
              state.rejectSend = false;
              throw { code: 4001, message: "User rejected transaction" };
            }
            return hash;
          }
          if (method === "wallet_getCapabilities") return {};
          throw {
            code: 4200,
            message: `Unsupported test wallet method ${method}`,
          };
        },
      };
      window.ethereum = provider;
      const detail = {
        info: {
          uuid: "f092a81f-b1d2-48d0-8f6d-992e9a62c822",
          name: "Test browser wallet",
          icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"%3E%3Ccircle cx="14" cy="14" r="12" fill="%23174d3b"/%3E%3C/svg%3E',
          rdns: "test.erc20t.wallet",
        },
        provider,
      };
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", { detail }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { owner: A.owner, chain, rejectConnect, hash: txHash },
  );
}
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log("PASS", name);
  } catch (e) {
    failures.push({ name, error: String(e) });
    results.push({ name, passed: false, error: String(e) });
    console.log("FAIL", name, String(e));
    if (browser)
      for (const context of browser.contexts())
        for (const page of context.pages()) {
          await page
            .screenshot({
              path: `${out}/failure-${failures.length}.png`,
              fullPage: true,
            })
            .catch(() => {});
          await writeFile(
            `${out}/failure-${failures.length}.txt`,
            await page
              .locator("body")
              .innerText()
              .catch(() => ""),
          );
          console.log(
            "PAGE ERROR STATE",
            await page
              .locator(".transaction-status")
              .innerText()
              .catch(() => ""),
          );
        }
    throw e;
  }
}
async function overflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "No document overflow",
  );
}
async function axe(page, label) {
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  await writeFile(
    `${out}/axe-${label}.json`,
    JSON.stringify(scan.violations, null, 2),
  );
  assert.deepEqual(
    scan.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
  );
}
async function fillDetails(page) {
  await page.getByLabel("Token name", { exact: true }).fill("Moon Garden");
  await page.getByLabel("Symbol", { exact: true }).fill("GARDEN");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const state = makeState();
  await mockRpc(context, state);
  const page = await context.newPage();
  const pageErrors = [],
    localFailures = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.url().startsWith(url) && r.status() >= 400)
      localFailures.push(r.url());
  });
  await check(
    "Initial mobile screen, assets, share metadata and accessibility",
    async () => {
      await page.goto(url);
      await page.getByRole("heading", { name: "Launch your token." }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const action = await page
        .getByRole("button", { name: "Continue", exact: true })
        .boundingBox();
      assert.ok(
        action.y + action.height <= 844,
        "Continue is on the first 390px screen",
      );
      assert.equal(
        await page.locator('meta[property="og:image"]').getAttribute("content"),
        "./share.png",
      );
      assert.equal((await page.request.get(url + "share.png")).status(), 200);
      await overflow(page);
      await axe(page, "launch-mobile");
      await page.screenshot({ path: `${out}/launch-390.png` });
    },
  );
  await check(
    "Form validation, focus, custom base and economic controls",
    async () => {
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      assert.equal(
        await page.locator("#token-name").getAttribute("aria-invalid"),
        "true",
      );
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "token-name",
      );
      await page.getByRole("button", { name: "Other", exact: true }).click();
      await page.getByLabel("Base token address", { exact: true }).fill("bad");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      assert.equal(
        await page.locator("#custom-base").getAttribute("aria-invalid"),
        "true",
      );
      await page.getByRole("button", { name: "ETH", exact: true }).click();
      await fillDetails(page);
      await page
        .getByRole("button", { name: "Deploy first", exact: true })
        .click();
      assert.equal(await page.locator("#starting-price").count(), 0);
      await page
        .getByRole("button", { name: "Deploy & launch", exact: true })
        .click();
      await page
        .getByLabel("Resting buy & sell tax", { exact: true })
        .fill("0.2");
      await page
        .getByRole("button", { name: "Review launch", exact: true })
        .click();
      assert.equal(
        await page.locator("#resting-tax").getAttribute("aria-invalid"),
        "true",
      );
      await page
        .getByLabel("Resting buy & sell tax", { exact: true })
        .fill("3");
      await page.getByRole("switch", { name: /Enable launch decay/ }).check();
      await page.getByLabel("Seconds per drop", { exact: true }).fill("30");
      assert.ok(
        (await page.locator(".builder-content").innerText()).includes("48m"),
      );
      await page
        .getByRole("switch", { name: /Use separate fee recipients/ })
        .check();
      await page
        .getByRole("button", { name: "Review launch", exact: true })
        .click();
      assert.equal(
        await page.locator("#fee-recipient").getAttribute("aria-invalid"),
        "true",
      );
      await page
        .getByRole("switch", { name: /Use separate fee recipients/ })
        .uncheck();
      await page
        .getByRole("button", { name: "Review launch", exact: true })
        .click();
      await page.getByText("Native ether verified.", { exact: true }).waitFor();
      await page.getByRole("checkbox", { name: /I understand/ }).check();
      await overflow(page);
      await axe(page, "review-mobile");
      assert.ok((await page.locator(".review").innerText()).includes("99%"));
      await page.screenshot({ path: `${out}/review-390.png`, fullPage: true });
    },
  );
  await check(
    "Wallet sheet keyboard trap, dismissal and focus restoration",
    async () => {
      await page
        .getByRole("button", { name: "Connect to continue", exact: true })
        .click();
      await page.getByRole("dialog").waitFor();
      await axe(page, "wallet");
      for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => !!document.activeElement.closest("dialog")),
        true,
      );
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Connect to continue",
      );
    },
  );
  await check(
    "Discovery filtering, cached return, details and failed lookups",
    async () => {
      await page.goto(url + "#/discover");
      await page.getByRole("link", { name: /Test Garden/ }).waitFor();
      assert.equal(
        await page.locator(".token-row:not(.list-header)").count(),
        2,
      );
      await page
        .getByRole("button", { name: "Not launched", exact: true })
        .click();
      assert.equal(
        await page.locator(".token-row:not(.list-header)").count(),
        1,
      );
      await page
        .getByRole("button", { name: "All tokens", exact: true })
        .click();
      await page.getByRole("searchbox").fill("missing");
      await page.getByRole("heading", { name: "No matching tokens" }).waitFor();
      await page.getByRole("button", { name: "Clear filters" }).click();
      await page.getByRole("link", { name: /Test Garden/ }).click();
      await page.getByRole("heading", { name: /Test Garden/ }).waitFor();
      await axe(page, "token-mobile");
      await overflow(page);
      await page
        .getByRole("link", { name: "Discover tokens", exact: true })
        .click();
      await page.getByRole("link", { name: /Test Garden/ }).waitFor();
      assert.equal(
        await page.locator(".token-row:not(.list-header)").count(),
        2,
      );
      await page.goto(url + "#/manage/bad");
      await page.getByText(/This URL does not contain/).waitFor();
      await page
        .getByLabel("Token contract address", { exact: true })
        .fill("not an address");
      await page.getByRole("button", { name: "Load token" }).click();
      await page.getByText("Enter a valid Ethereum token address.").waitFor();
    },
  );
  await check(
    "RPC outage, actionable retry and static navigation",
    async () => {
      state.offline = true;
      await page.goto(url + "?offline#/launch");
      await fillDetails(page);
      await page.getByRole("button", { name: "Review launch" }).click();
      await page
        .getByRole("button", { name: "Retry verification" })
        .waitFor({ timeout: 25000 });
      state.offline = false;
      await page.getByRole("button", { name: "Retry verification" }).click();
      await page.getByText("Native ether verified.", { exact: true }).waitFor();
      await page.goto(url + "#/guide");
      await page
        .getByRole("heading", { name: "A clearer way to launch." })
        .waitFor();
      await axe(page, "guide-mobile");
    },
  );
  await check(
    "Responsive reflow, long content, text enlargement and RTL",
    async () => {
      for (const width of [320, 390, 768, 1020, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url + `?width=${width}#/launch`);
        await page
          .getByLabel("Token name", { exact: true })
          .fill(
            "A token with a very long name that should wrap without hiding important details",
          );
        await overflow(page);
        if (width === 1440) {
          await page.screenshot({
            path: `${out}/launch-1440.png`,
            fullPage: true,
          });
          await axe(page, "launch-desktop");
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "200%"),
      );
      await overflow(page);
      await page.screenshot({ path: `${out}/text-200.png`, fullPage: true });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
        document.documentElement.dir = "rtl";
      });
      await overflow(page);
      await page.evaluate(() => (document.documentElement.dir = "ltr"));
    },
  );
  await check("Phone wallet deep links and passkey option", async () => {
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    });
    await mockRpc(phone, makeState());
    const p = await phone.newPage();
    await p.goto(url);
    await p
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
      assert.equal(
        await p
          .getByRole("link", { name: `Open in ${name}`, exact: true })
          .count(),
        1,
      );
    assert.equal(
      await p
        .getByRole("button", { name: "Coinbase Smart Wallet", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await p
        .getByRole("button", { name: "Browser wallet", exact: true })
        .count(),
      0,
    );
    await p.screenshot({ path: `${out}/wallet-phone.png` });
    await phone.close();
  });
  await context.close();
  const signed = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const ownerState = makeState();
  await mockRpc(signed, ownerState);
  await injectWallet(signed, { chain: 137, rejectConnect: true });
  const p = await signed.newPage();
  await check(
    "EIP-6963 discovery, rejection recovery and unknown-chain fallback",
    async () => {
      await p.goto(url);
      await p
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      assert.equal(
        await p
          .getByRole("button", { name: "Browser wallet", exact: true })
          .count(),
        0,
      );
      await p
        .getByRole("button", { name: "Test browser wallet", exact: true })
        .click();
      await p
        .getByText(
          "Request declined in your wallet. You can try again when ready.",
        )
        .waitFor();
      await p
        .getByRole("button", { name: "Test browser wallet", exact: true })
        .click();
      await p.getByRole("dialog").waitFor({ state: "hidden" });
      await p
        .getByRole("banner")
        .getByRole("button", { name: "Switch to Ethereum", exact: true })
        .click();
      await p.getByRole("button", { name: /0x1234/ }).waitFor();
      const calls = await p.evaluate(() => window.__testWallet.calls);
      assert.ok(calls.some((c) => c.method === "wallet_switchEthereumChain"));
      assert.ok(calls.some((c) => c.method === "wallet_addEthereumChain"));
      assert.equal(
        calls.find((c) => c.method === "wallet_addEthereumChain").params[0]
          .chainId,
        "0x1",
      );
    },
  );
  await check(
    "Atomic launch calldata, quote decimals, rejected signature and receipt",
    async () => {
      await p.getByRole("button", { name: "FWA", exact: true }).click();
      await fillDetails(p);
      await p
        .getByLabel("Starting price per token", { exact: true })
        .fill("0.001");
      await p
        .getByRole("button", { name: "Review launch", exact: true })
        .click();
      await p.getByText("Registered base verified.", { exact: true }).waitFor();
      assert.equal(
        await p
          .getByRole("button", { name: "Deploy & launch", exact: true })
          .isEnabled(),
        false,
      );
      await p.getByRole("checkbox", { name: /I understand/ }).check();
      await p.evaluate(() => (window.__testWallet.rejectSend = true));
      await p
        .getByRole("button", { name: "Deploy & launch", exact: true })
        .click();
      await p
        .getByText(
          "Request declined in your wallet. You can try again when ready.",
        )
        .waitFor();
      await p
        .getByRole("button", { name: "Deploy & launch", exact: true })
        .click();
      await p
        .getByText("Transaction confirmed on Ethereum.", { exact: true })
        .waitFor();
      const sent = await p.evaluate(
        () =>
          window.__testWallet.calls
            .filter(
              (c) =>
                c.method === "eth_sendTransaction" ||
                c.method === "wallet_sendTransaction",
            )
            .at(-1).params[0],
      );
      const decoded = decodeFunctionData({ abi: factoryAbi, data: sent.data });
      assert.equal(decoded.functionName, "createAndLaunchAtPrice");
      assert.equal(decoded.args[2], 1000n);
      assert.equal(decoded.args[0].owner.toLowerCase(), A.owner);
      assert.equal(decoded.args[0].quoteToken.toLowerCase(), A.fwa);
      assert.ok(sent.value === "0x0" || sent.value === undefined);
      assert.equal(sent.to.toLowerCase(), A.factory);
      assert.equal(
        await p
          .getByRole("button", { name: "Confirmed", exact: true })
          .isEnabled(),
        false,
      );
    },
  );
  await check(
    "Deploy-only calldata contains the exact locked reserve",
    async () => {
      await p.goto(url + "?deploy#/launch");
      await fillDetails(p);
      await p
        .getByRole("button", { name: "Deploy first", exact: true })
        .click();
      await p.getByRole("button", { name: "Review deployment" }).click();
      await p.getByText("Registered base verified.", { exact: true }).waitFor();
      await p.getByRole("checkbox", { name: /I understand/ }).check();
      await p
        .getByRole("button", { name: "Deploy token", exact: true })
        .click();
      await p
        .getByText("Transaction confirmed on Ethereum.", { exact: true })
        .waitFor();
      const sent = await p.evaluate(
        () =>
          window.__testWallet.calls
            .filter(
              (c) =>
                c.method === "eth_sendTransaction" ||
                c.method === "wallet_sendTransaction",
            )
            .at(-1).params[0],
      );
      const decoded = decodeFunctionData({ abi: factoryAbi, data: sent.data });
      assert.equal(decoded.functionName, "create");
      assert.equal(decoded.args[0].lpSupply, 900000000n * 10n ** 18n);
    },
  );
  await check(
    "Owner controls, simulation failure, confirmations and launch later",
    async () => {
      ownerState.launched = false;
      await p.goto(url + `#/manage/${A.token}`);
      await p
        .getByRole("heading", { name: "Owner controls", exact: true })
        .waitFor();
      await axe(p, "owner-desktop");
      await p
        .getByLabel("Regular recipient address", { exact: true })
        .fill(A.recipient);
      await p.getByRole("button", { name: "Save regular recipient" }).click();
      ownerState.revert = true;
      const before = await p.evaluate(
        () =>
          window.__testWallet.calls.filter((c) =>
            c.method.includes("sendTransaction"),
          ).length,
      );
      await p.getByRole("button", { name: "Confirm in wallet" }).click();
      await p.getByRole("alert").waitFor();
      assert.equal(
        await p.evaluate(
          () =>
            window.__testWallet.calls.filter((c) =>
              c.method.includes("sendTransaction"),
            ).length,
        ),
        before,
      );
      ownerState.revert = false;
      await p.getByRole("button", { name: "Confirm in wallet" }).click();
      await p
        .getByText("Transaction confirmed on Ethereum.", { exact: true })
        .waitFor();
      await p.getByRole("button", { name: "Done", exact: true }).click();
      for (const label of [
        "Allow external liquidity",
        "Allow pairing as a base",
      ]) {
        await p
          .locator(".permission-row")
          .filter({ hasText: label })
          .getByRole("button", { name: "Enable", exact: true })
          .click();
        await p.getByRole("button", { name: "Confirm in wallet" }).click();
        await p
          .getByText("Transaction confirmed on Ethereum.", { exact: true })
          .waitFor();
        await p.getByRole("button", { name: "Done", exact: true }).click();
      }
      await p
        .getByLabel("Distributor contract addresses", { exact: true })
        .fill(A.recipient);
      await p
        .getByRole("button", { name: "Approve distributors", exact: true })
        .click();
      await p.getByRole("button", { name: "Confirm in wallet" }).click();
      await p
        .getByText("Transaction confirmed on Ethereum.", { exact: true })
        .waitFor();
      await p.getByRole("button", { name: "Done", exact: true }).click();
      await p
        .getByRole("button", { name: "Preview launch", exact: true })
        .click();
      await p.getByRole("dialog", { name: "Launch this token" }).waitFor();
      await p.getByRole("button", { name: "Confirm in wallet" }).click();
      await p
        .getByText("Transaction confirmed on Ethereum.", { exact: true })
        .waitFor();
      const transactions = await p.evaluate(() =>
        window.__testWallet.calls
          .filter(
            (c) =>
              c.method === "eth_sendTransaction" ||
              c.method === "wallet_sendTransaction",
          )
          .map((c) => c.params[0]),
      );
      const methods = transactions
        .filter((t) => t.to.toLowerCase() === A.token)
        .map(
          (t) =>
            decodeFunctionData({ abi: tokenAbi, data: t.data }).functionName,
        );
      for (const fn of [
        "setFeeRecipient",
        "setExternalLiquidityEnabled",
        "setPairingEnabled",
        "setDistributors",
        "launch",
      ])
        assert.ok(methods.includes(fn), fn);
      await p.getByRole("button", { name: "Done", exact: true }).click();
      ownerState.decay = true;
      await p.getByRole("button", { name: "Refresh", exact: true }).click();
      await p
        .getByText("Tax cannot be changed during active launch decay.")
        .waitFor();
      assert.equal(
        await p
          .getByRole("button", { name: "Update tax", exact: true })
          .isEnabled(),
        false,
      );
      await p.setViewportSize({ width: 320, height: 900 });
      await overflow(p);
      await p.screenshot({ path: `${out}/owner-320.png`, fullPage: true });
    },
  );
  await check(
    "Independent recipient, tax and distributor updates encode the intended methods",
    async () => {
      ownerState.decay = false;
      ownerState.launched = true;
      await p.setViewportSize({ width: 1440, height: 1000 });
      await p.getByRole("button", { name: "Refresh", exact: true }).click();
      await p
        .getByText("Choose 0.3–5%. Changing the tax does not restart decay.")
        .waitFor();
      const confirm = async () => {
        await p.getByRole("button", { name: "Confirm in wallet" }).click();
        await p
          .getByText("Transaction confirmed on Ethereum.", { exact: true })
          .waitFor();
        await p.getByRole("button", { name: "Done", exact: true }).click();
      };
      await p
        .getByLabel("Decay recipient address", { exact: true })
        .fill(A.recipient);
      await p
        .getByRole("button", { name: "Save decay recipient", exact: true })
        .click();
      await confirm();
      await p.getByLabel("New resting tax", { exact: true }).fill("4");
      await p.getByRole("button", { name: "Update tax", exact: true }).click();
      await confirm();
      await p
        .locator(".permission-row")
        .filter({ hasText: "Use global distributors" })
        .getByRole("button", { name: "Disable", exact: true })
        .click();
      await confirm();
      await p
        .getByRole("button", { name: "Remove distributors", exact: true })
        .click();
      await confirm();
      const transactions = await p.evaluate(() =>
        window.__testWallet.calls
          .filter(
            (c) =>
              c.method === "eth_sendTransaction" ||
              c.method === "wallet_sendTransaction",
          )
          .map((c) => c.params[0]),
      );
      const calls = transactions
        .filter((t) => t.to.toLowerCase() === A.token)
        .map((t) => decodeFunctionData({ abi: tokenAbi, data: t.data }));
      assert.equal(
        calls
          .find((c) => c.functionName === "setFeeDecayRecipient")
          .args[0].toLowerCase(),
        A.recipient,
      );
      assert.equal(
        calls.find((c) => c.functionName === "setTaxBps").args[0],
        400,
      );
      assert.equal(
        calls.find((c) => c.functionName === "setUseGlobalDistributors")
          .args[0],
        false,
      );
      assert.equal(
        calls.filter((c) => c.functionName === "setDistributors").at(-1)
          .args[1],
        false,
      );
    },
  );
  await check(
    "Reverted receipts never show success; pending transactions survive dialog close and reload",
    async () => {
      ownerState.receiptStatus = "0x0";
      await p
        .getByRole("button", { name: "Save regular recipient", exact: true })
        .click();
      await p.getByRole("button", { name: "Confirm in wallet" }).click();
      await p
        .getByText(
          /The transaction reverted. No requested changes were applied./,
        )
        .waitFor();
      assert.equal(
        await p
          .getByText("Transaction confirmed on Ethereum.", { exact: true })
          .count(),
        0,
      );
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      ownerState.receiptStatus = "0x1";
      ownerState.pendingReceipt = true;
      await p
        .getByRole("button", { name: "Save regular recipient", exact: true })
        .click();
      await p.getByRole("button", { name: "Confirm in wallet" }).click();
      await p.getByText("Transaction submitted", { exact: true }).waitFor();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Save decay recipient", exact: true })
        .click();
      const before = await p.evaluate(
        () =>
          window.__testWallet.calls.filter((c) =>
            c.method.includes("sendTransaction"),
          ).length,
      );
      await p.getByRole("button", { name: "Confirm in wallet" }).click();
      await p
        .getByText(
          "A transaction is already submitted. Check its status above before sending another.",
        )
        .waitFor();
      assert.equal(
        await p.evaluate(
          () =>
            window.__testWallet.calls.filter((c) =>
              c.method.includes("sendTransaction"),
            ).length,
        ),
        before,
      );
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await p.reload();
      await p.getByText("Transaction submitted", { exact: true }).waitFor();
      ownerState.pendingReceipt = false;
      await p
        .getByRole("button", { name: "Check status", exact: true })
        .click();
      await p
        .getByText("Latest transaction confirmed", { exact: true })
        .waitFor();
    },
  );
  await signed.close();
  await check("No application exceptions or failed local assets", async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(localFailures, []);
  });
  await browser.close();
  browser = undefined;
  try {
    const safari = await webkit.launch({
      headless: true,
      ...(process.env.ERC20T_WEBKIT_EXECUTABLE
        ? { executablePath: process.env.ERC20T_WEBKIT_EXECUTABLE }
        : {}),
    });
    const c = await safari.newContext({
      viewport: { width: 390, height: 844 },
    });
    await mockRpc(c, makeState());
    const p = await c.newPage();
    await check("WebKit: launch form, review and wallet sheet", async () => {
      await p.goto(url);
      await fillDetails(p);
      await p.getByRole("button", { name: "Review launch" }).click();
      await p.getByText("Native ether verified.", { exact: true }).waitFor();
      await overflow(p);
      await p.getByRole("button", { name: "Connect to continue" }).click();
      await p.getByRole("dialog").waitFor();
      await p.keyboard.press("Escape");
      assert.equal(await p.getByRole("dialog").count(), 0);
      await p.screenshot({
        path: `${out}/webkit-review-390.png`,
        fullPage: true,
      });
    });
    await safari.close();
  } catch (e) {
    limitations.push(`WebKit could not complete: ${String(e).slice(0, 2000)}`);
    console.log("LIMITATION", limitations.at(-1));
  }
} catch (e) {
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  const report = {
    results,
    failures,
    limitations,
    disclaimer:
      "RPC and wallet interactions in this script use explicit test fixtures. No transaction was signed or broadcast. Live read checks are documented separately.",
  };
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      passed: results.filter((r) => r.passed).length,
      failed: failures.length,
      limitations: limitations.length,
    }),
  );
}
