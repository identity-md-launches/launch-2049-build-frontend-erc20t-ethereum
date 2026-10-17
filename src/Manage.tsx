import { useEffect, useState, type FormEvent } from "react";
import { useConnection } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  formatUnits,
  isAddress,
  zeroAddress,
  type Address as EthAddress,
} from "viem";
import {
  ArrowRight,
  ArrowUpRight,
  LockKeyhole,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { baseName } from "./config";
import { tokenAbi } from "./contracts/abis";
import {
  launchPreview,
  readBase,
  readToken,
  type TokenInfo,
  type TransactionCall,
} from "./chain";
import {
  bps,
  duration,
  errorMessage,
  feeSplit,
  units,
  validRecipient,
} from "./domain";
import { Address, Field, Modal, Notice, Spinner, Stat } from "./ui";
import { useOpenWallet } from "./Wallet";
import { TaxChart } from "./Launch";
import { TransactionStatus, useTransaction } from "./Transaction";

type Proposed = {
  title: string;
  description: string;
  call: TransactionCall;
  value: string;
};
export function Manage({
  tokenAddress,
  detail = false,
}: {
  tokenAddress?: string;
  detail?: boolean;
}) {
  const [input, setInput] = useState(tokenAddress || "");
  const [inputError, setInputError] = useState("");
  const query = useQuery({
    queryKey: ["token", tokenAddress],
    enabled: !!tokenAddress && isAddress(tokenAddress),
    retry: false,
    refetchInterval: 15_000,
    queryFn: () => readToken(tokenAddress as EthAddress),
  });
  function lookup(e: FormEvent) {
    e.preventDefault();
    if (!isAddress(input)) {
      setInputError("Enter a valid Ethereum token address.");
      return;
    }
    setInputError("");
    location.hash = `#/${detail ? "token" : "manage"}/${input}`;
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{detail ? "Token details." : "Manage your token."}</h1>
          <p>
            {detail
              ? "Live taxes, permissions and token information from Ethereum."
              : "Launch a deployed token or update its owner settings."}
          </p>
        </div>
        <a className="text-link" href="#/discover">
          Discover tokens
          <ArrowUpRight size={16} />
        </a>
      </div>
      <form className="lookup-form" onSubmit={lookup}>
        <Field
          label="Token contract address"
          id="manage-address"
          placeholder="0x…"
          value={input}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setInput(e.target.value)}
          error={inputError}
        />
        <button type="submit" className="button primary">
          Load token
          <ArrowRight size={17} />
        </button>
      </form>
      {!tokenAddress ? (
        <div className="empty-state manage-empty">
          <div className="empty-icon">
            <Settings2 size={30} />
          </div>
          <h2>Your token, your controls.</h2>
          <p>
            Enter an ERC20T address to read its settings. Connect the owner
            wallet to make changes.
          </p>
          <a href="#/launch" className="text-link">
            Create your first token
            <ArrowRight size={16} />
          </a>
        </div>
      ) : !isAddress(tokenAddress) ? (
        <Notice tone="error">
          This URL does not contain a valid Ethereum token address. Enter a
          valid address above.
        </Notice>
      ) : query.isPending ? (
        <div className="empty-state">
          <Spinner />
          <p>Reading token settings from Ethereum…</p>
        </div>
      ) : query.error && !query.data ? (
        <Notice tone="error">
          {errorMessage(query.error)}
          <button className="button secondary" onClick={() => query.refetch()}>
            Retry token read
          </button>
        </Notice>
      ) : (
        query.data && (
          <TokenPanel
            key={tokenAddress}
            token={query.data}
            refresh={() => query.refetch()}
            stale={query.isError}
          />
        )
      )}
    </>
  );
}
function TokenPanel({
  token: t,
  refresh,
  stale,
}: {
  token: TokenInfo;
  refresh: () => void;
  stale: boolean;
}) {
  const { address, chainId } = useConnection();
  const openWallet = useOpenWallet();
  const owner = !!address && address.toLowerCase() === t.owner.toLowerCase();
  const [proposed, setProposed] = useState<Proposed>();
  const [error, setError] = useState("");
  const [recipient, setRecipient] = useState(t.recipient);
  const [decayRecipient, setDecayRecipient] = useState(t.decayRecipient);
  const [tax, setTax] = useState(String(t.restingTax / 100));
  const [distributors, setDistributors] = useState("");
  const [price, setPrice] = useState("0.000000001");
  const [previewing, setPreviewing] = useState(false);
  const split = feeSplit(t.restingTax, t.tax);
  function propose(
    functionName: string,
    args: readonly unknown[],
    title: string,
    description: string,
    value: string,
  ) {
    setError("");
    setProposed({
      title,
      description,
      value,
      call: { address: t.address, abi: tokenAbi, functionName, args },
    });
  }
  function fee(kind: "regular" | "decay") {
    const value = kind === "regular" ? recipient : decayRecipient;
    if (
      !validRecipient(value) ||
      value.toLowerCase() === t.address.toLowerCase()
    ) {
      setError(
        "Enter a valid recipient address other than the token or platform contracts.",
      );
      return;
    }
    propose(
      kind === "regular" ? "setFeeRecipient" : "setFeeDecayRecipient",
      [value],
      `Change ${kind} recipient`,
      `Future ${kind} fees will be paid in ETH to this address. The other fee recipient stays independently configured.`,
      value,
    );
  }
  function distributor(allowed: boolean) {
    const accounts = distributors.trim().split(/[\s,]+/);
    if (
      accounts.length > 50 ||
      accounts.some(
        (a) =>
          !validRecipient(a) || a.toLowerCase() === t.address.toLowerCase(),
      )
    ) {
      setError(
        "Enter 1–50 valid contract addresses separated by commas or spaces.",
      );
      return;
    }
    propose(
      "setDistributors",
      [accounts, allowed],
      allowed ? "Approve distributors" : "Remove distributors",
      "Approved contracts can transfer tokens to or from wallets. Approval does not exempt swap taxes. Only approve contracts you trust.",
      accounts.join(", "),
    );
  }
  async function launch() {
    setError("");
    setPreviewing(true);
    try {
      const fresh = await readToken(t.address);
      if (fresh.launched)
        throw new Error(
          "This token is already launched. Refresh its settings.",
        );
      const base = await readBase(fresh.quote);
      const preview = await launchPreview(
        fresh.locked,
        0,
        units(price, base.decimals),
        BigInt(t.address) < BigInt(t.quote),
      );
      propose(
        "launch",
        [preview.sqrtPriceX96, preview.tickLower, preview.tickUpper],
        "Launch this token",
        `Trading starts immediately. The ${formatUnits(fresh.locked, 18)} tokens reserved in the contract seed permanently locked liquidity. No base deposit is sent.`,
        `Effective starting price: ${formatUnits(preview.effectivePriceWei, base.decimals)} ${base.symbol} per token. Initial tax: ${fresh.tax / 100}%.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPreviewing(false);
    }
  }
  return (
    <div className="token-detail">
      <div className="token-title">
        <div>
          <h2>
            {t.name} <span className="hint">{t.symbol}</span>
          </h2>
          <span className="quiet-badge green">
            {t.launched ? "Launched" : "Awaiting launch"}
          </span>
        </div>
        <button className="button secondary" onClick={refresh}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      <Address value={t.address} label="Token contract" />
      <div className="token-stats">
        <Stat
          label="Current buy & sell tax"
          value={`${t.tax / 100}%`}
          note={t.decayActive ? "Launch decay active" : "Resting rate"}
        />
        <Stat
          label="Resting tax"
          value={`${t.restingTax / 100}%`}
          note="Includes protocol fee"
        />
        <Stat
          label="Total supply"
          value={Number(formatUnits(t.supply, 18)).toLocaleString("en", {
            notation: "compact",
          })}
          note="18 decimals"
        />
        <Stat
          label="Base token"
          value={baseName(t.quote)}
          note="Exact-input swaps only"
        />
      </div>
      <p className="hint" role="status">
        Read at block {t.block.toLocaleString()} ·{" "}
        {new Date(Number(t.timestamp) * 1000).toLocaleTimeString()} · Refreshes
        every 15 seconds.
        {stale && " Latest refresh failed; displayed values may be stale."}
      </p>
      <div className="detail-grid">
        <section className="detail-section">
          <h3>Tax distribution</h3>
          <TaxChart
            tax={t.restingTax / 100}
            decay={!!t.launchTax}
            interval={t.interval || 1}
          />
          {t.launchTax > 0 && (
            <p className="hint">
              Schedule starts{" "}
              {t.launched
                ? `at ${new Date(Number(t.launchedAt) * 1000).toLocaleString()}`
                : "when the token launches"}
              . One percentage point per {duration(t.interval)}. Current tax is
              read from the contract above.
            </p>
          )}
          <dl className="review-list">
            <div>
              <dt>Protocol component</dt>
              <dd>0.15%</dd>
            </div>
            <div>
              <dt>Regular recipient</dt>
              <dd>{(split.regular / 100).toFixed(2)}%</dd>
            </div>
            <div>
              <dt>Decay recipient now</dt>
              <dd>{(split.decay / 100).toFixed(2)}%</dd>
            </div>
          </dl>
          <p className="hint">
            All components are included in the displayed tax and converted to
            ETH.
          </p>
        </section>
        <section className="detail-section">
          <h3>Permissions & recipients</h3>
          <dl className="review-list">
            <div>
              <dt>External liquidity</dt>
              <dd>{t.externalLiquidity ? "Enabled" : "Disabled"}</dd>
            </div>
            <div>
              <dt>Pairing as a base</dt>
              <dd>{t.pairing ? "Enabled" : "Disabled"}</dd>
            </div>
            <div>
              <dt>Global distributors</dt>
              <dd>{t.globalDistributors ? "Enabled" : "Disabled"}</dd>
            </div>
          </dl>
          <Address value={t.owner} label="Token owner" />
          <Address value={t.recipient} label="Regular fee recipient" />
          <Address value={t.decayRecipient} label="Decay fee recipient" />
        </section>
      </div>
      {!owner ? (
        <div className="callout">
          <ShieldCheck size={26} />
          <div>
            <h3>Owner controls</h3>
            <p>
              {address
                ? "Only the token owner can change these settings."
                : "Connect the owner wallet to launch or update this token."}
            </p>
          </div>
          {!address && (
            <button className="button secondary" onClick={openWallet}>
              Connect owner wallet
            </button>
          )}
        </div>
      ) : (
        <section className="owner-controls">
          <h2>Owner controls</h2>
          {chainId !== 1 && (
            <Notice tone="warning">
              Switch to Ethereum using the wallet control to make changes.
            </Notice>
          )}
          <fieldset
            disabled={chainId !== 1 || !!proposed}
            className="owner-fieldset"
          >
            {!t.launched && (
              <section className="owner-section">
                <div>
                  <h3>Launch your pool</h3>
                  <p>
                    {formatUnits(t.locked, 18)} {t.symbol} reserved for locked
                    liquidity.
                  </p>
                </div>
                <Field
                  label={`Starting price in ${baseName(t.quote)}`}
                  value={price}
                  inputMode="decimal"
                  onChange={(e) => setPrice(e.target.value)}
                />
                <button
                  className="button secondary"
                  disabled={previewing}
                  onClick={launch}
                >
                  {previewing && <Spinner />}Preview launch
                </button>
              </section>
            )}
            <section className="owner-section">
              <div>
                <h3>Fee recipients</h3>
                <p>Update either destination independently.</p>
              </div>
              <div className="owner-action">
                <Field
                  label="Regular recipient address"
                  value={recipient}
                  spellCheck={false}
                  onChange={(e) => setRecipient(e.target.value as EthAddress)}
                />
                <button
                  className="button secondary"
                  onClick={() => fee("regular")}
                >
                  Save regular recipient
                </button>
              </div>
              <div className="owner-action">
                <Field
                  label="Decay recipient address"
                  value={decayRecipient}
                  spellCheck={false}
                  onChange={(e) =>
                    setDecayRecipient(e.target.value as EthAddress)
                  }
                />
                <button
                  className="button secondary"
                  onClick={() => fee("decay")}
                >
                  Save decay recipient
                </button>
              </div>
            </section>
            <section className="owner-section">
              <div>
                <h3>Resting tax</h3>
                <p>
                  {t.decayActive
                    ? "Tax cannot be changed during active launch decay."
                    : "Choose 0.3–5%. Changing the tax does not restart decay."}
                </p>
              </div>
              <div className="owner-action">
                <Field
                  label="New resting tax"
                  value={tax}
                  suffix="%"
                  inputMode="decimal"
                  disabled={t.decayActive}
                  onChange={(e) => setTax(e.target.value)}
                />
                <button
                  className="button secondary"
                  disabled={t.decayActive}
                  onClick={() => {
                    if (
                      !/^\d+(\.\d{1,2})?$/.test(tax) ||
                      Number(tax) < 0.3 ||
                      Number(tax) > 5
                    ) {
                      setError("Enter a resting tax from 0.30% to 5.00%.");
                      return;
                    }
                    propose(
                      "setTaxBps",
                      [bps(tax)],
                      "Change resting tax",
                      "The buy and sell tax changes for future swaps. The protocol component remains included.",
                      `${tax}%`,
                    );
                  }}
                >
                  Update tax
                </button>
              </div>
            </section>
            <section className="owner-section">
              <div>
                <h3>Distributors</h3>
                <p>Approved contracts can transfer to and from wallets.</p>
              </div>
              <Field
                label="Distributor contract addresses"
                placeholder="Comma-separated contract addresses"
                value={distributors}
                onChange={(e) => setDistributors(e.target.value)}
              />
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={() => distributor(true)}
                >
                  Approve distributors
                </button>
                <button
                  className="button secondary"
                  onClick={() => distributor(false)}
                >
                  Remove distributors
                </button>
              </div>
              <Permission
                label="Use global distributors"
                text="Allow contracts approved by the shared hook owner."
                enabled={t.globalDistributors}
                onChange={() =>
                  propose(
                    "setUseGlobalDistributors",
                    [!t.globalDistributors],
                    `${t.globalDistributors ? "Disable" : "Enable"} global distributors`,
                    "This controls whether shared hook distributor permissions apply to your token. Local distributor permissions remain independent.",
                    String(!t.globalDistributors),
                  )
                }
              />
            </section>
            <section className="owner-section">
              <h3>Liquidity & pairing</h3>
              <Permission
                label="Allow external liquidity"
                text="Let anyone add liquidity to the canonical pool. The initial launch position stays locked."
                enabled={t.externalLiquidity}
                onChange={() =>
                  propose(
                    "setExternalLiquidityEnabled",
                    [!t.externalLiquidity],
                    `${t.externalLiquidity ? "Disable" : "Enable"} external liquidity`,
                    "This controls new liquidity deposits from others; it never unlocks your launch position.",
                    String(!t.externalLiquidity),
                  )
                }
              />
              <Permission
                label="Allow pairing as a base"
                text={
                  t.quote !== zeroAddress
                    ? "Only ETH-paired tokens can enable pairing."
                    : "Let new ERC20T tokens use this token as their base. Disabling does not affect existing pairs."
                }
                enabled={t.pairing}
                disabled={t.quote !== zeroAddress}
                onChange={() =>
                  propose(
                    "setPairingEnabled",
                    [!t.pairing],
                    `${t.pairing ? "Disable" : "Enable"} pairing`,
                    "This changes permission to create new pairs. Existing pairs remain usable.",
                    String(!t.pairing),
                  )
                }
              />
            </section>
          </fieldset>
          {error && <Notice tone="error">{error}</Notice>}
        </section>
      )}
      <Notice>
        <span className="inline">
          <LockKeyhole size={17} />
          Ordinary direct wallet transfers are untaxed.
        </span>
        <p>
          Contract-mediated and delegated-wallet transfers are restricted unless
          an owner or distributor exemption applies. Swaps must use exact input.
        </p>
      </Notice>
      {proposed && (
        <ConfirmChange
          proposed={proposed}
          close={() => setProposed(undefined)}
          refresh={refresh}
        />
      )}
    </div>
  );
}
function Permission({
  label,
  text,
  enabled,
  onChange,
  disabled = false,
}: {
  label: string;
  text: string;
  enabled: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="permission-row">
      <div>
        <h3>{label}</h3>
        <p className="hint">{text}</p>
        <span className="quiet-badge">{enabled ? "Enabled" : "Disabled"}</span>
      </div>
      <button
        className="button secondary"
        disabled={disabled}
        onClick={onChange}
      >
        {enabled ? "Disable" : "Enable"}
      </button>
    </div>
  );
}
function ConfirmChange({
  proposed,
  close,
  refresh,
}: {
  proposed: Proposed;
  close: () => void;
  refresh: () => void;
}) {
  const tx = useTransaction();
  useEffect(() => {
    if (tx.state === "success") refresh();
  }, [tx.state]);
  return (
    <Modal title={proposed.title} onClose={close}>
      <p>{proposed.description}</p>
      <div className="change-value break">{proposed.value}</div>
      <Address
        value={proposed.call.address}
        label="Token to update · Ethereum"
      />
      <p className="hint">
        Your wallet will show the gas cost before approval.
      </p>
      <TransactionStatus tx={tx} />
      <div className="modal-actions">
        <button className="button secondary" onClick={close}>
          {tx.state === "success" ? "Done" : "Close"}
        </button>
        {!tx.submitted && (
          <button
            className="button primary"
            disabled={tx.busy}
            onClick={() => tx.send(proposed.call)}
          >
            {tx.busy ? <Spinner /> : null}Confirm in wallet
          </button>
        )}
      </div>
    </Modal>
  );
}
