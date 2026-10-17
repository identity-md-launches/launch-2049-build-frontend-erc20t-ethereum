import { useEffect, useRef, useState, type FormEvent } from "react";
import { useConnection } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, zeroAddress } from "viem";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Coins,
  LockKeyhole,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { BASES, CONTRACTS, explorer } from "./config";
import { factoryAbi } from "./contracts/abis";
import {
  allocation,
  bps,
  decayDuration,
  duration,
  errorMessage,
  feeSplit,
  INITIAL_DRAFT,
  makeConfig,
  quoteAddress,
  units,
  validateDraft,
  type Draft,
} from "./domain";
import { launchPreview, readBase, verifyInfrastructure } from "./chain";
import { Address, Field, Notice, Spinner, Toggle } from "./ui";
import { useOpenWallet } from "./Wallet";
import { TransactionStatus, useTransaction } from "./Transaction";

function loadDraft(): Draft {
  try {
    const value = JSON.parse(sessionStorage.getItem("erc20t:draft") || "null");
    return value && typeof value === "object"
      ? { ...INITIAL_DRAFT, ...value }
      : INITIAL_DRAFT;
  } catch {
    return INITIAL_DRAFT;
  }
}
const number = (n: number) =>
  new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
    notation: n >= 1e6 ? "compact" : "standard",
  }).format(n);

export function TaxChart({
  tax,
  decay,
  interval,
}: {
  tax: number;
  decay: boolean;
  interval: number;
}) {
  const rest = Number.isFinite(tax) ? Math.min(5, Math.max(0.3, tax)) : 3;
  const end = decayDuration(Math.round(rest * 100), Math.max(1, interval));
  const steps = Math.ceil(99 - rest);
  const path = decay
    ? Array.from(
        { length: steps + 1 },
        (_, i) =>
          `${i ? "H" : "M"} ${16 + (i * 300) / steps}${i ? ` V ${24 + Math.min(i, 99 - rest) * 1.22}` : " 24"}`,
      ).join(" ")
    : "M 16 140 H 316";
  return (
    <div className="tax-chart">
      <div className="chart-labels">
        <span>{decay ? "99% at launch" : `${rest}% fixed tax`}</span>
        <span>{rest}% resting</span>
      </div>
      <svg
        viewBox="0 0 332 174"
        role="img"
        aria-label={
          decay
            ? `Tax starts at 99 percent and drops one percentage point every ${interval} seconds to ${rest} percent after ${duration(end)}.`
            : `Tax remains at ${rest} percent. Launch decay is off.`
        }
      >
        <path d="M16 24H316 M16 82H316 M16 140H316" className="chart-grid" />
        <path d={path + " L316 156 H16 Z"} className="chart-area" />
        <path d={path} className="chart-line" />
      </svg>
      <div className="chart-axis">
        <span>Launch</span>
        <span>{decay ? duration(end) : "Over time"}</span>
      </div>
    </div>
  );
}
function Preview({ d }: { d: Draft }) {
  const tax = Number(d.tax) || 3;
  const split = feeSplit(
    Math.round(tax * 100),
    d.decay ? 9900 : Math.round(tax * 100),
  );
  return (
    <aside className="preview-column" aria-label="Launch preview">
      <div className="preview-head">
        <span className="inline">
          <span className="status-dot" />
          Launch preview
        </span>
        <span className="hint">Updates as you go</span>
      </div>
      <div className="token-identity">
        <div className="token-mark" aria-hidden="true">
          <Coins size={29} strokeWidth={1.5} />
        </div>
        <div>
          <h2>{d.name.trim() || "Your token"}</h2>
          <p>
            <span>{d.symbol.trim() || "Symbol"}</span>
            <span className="dot-separator">·</span>
            {d.base === "custom" ? "Custom base" : d.base} pair
          </p>
        </div>
      </div>
      <div className="supply-preview">
        <div className="row-between">
          <span>Total supply</span>
          <strong>{number(Number(d.supply) || 0)}</strong>
        </div>
        <div className="allocation-bar">
          <span style={{ width: `${100 - d.allocation}%` }} />
          <span style={{ width: `${d.allocation}%` }} />
        </div>
        <div className="allocation-legend">
          <span>
            <i />
            {100 - d.allocation}% liquidity
          </span>
          <span>
            <i />
            {d.allocation}% you keep
          </span>
        </div>
      </div>
      <div className="preview-divider" />
      <div className="row-between">
        <h3>Buy & sell tax</h3>
        <span className="quiet-badge">
          {d.decay ? "Launch decay" : "Fixed rate"}
        </span>
      </div>
      <TaxChart tax={tax} decay={d.decay} interval={Number(d.interval) || 60} />
      <div className="fee-rows">
        <div>
          <span>Protocol</span>
          <strong>0.15%</strong>
        </div>
        <div>
          <span>Regular recipient</span>
          <strong>{(split.regular / 100).toFixed(2)}%</strong>
        </div>
        {d.decay && (
          <div>
            <span>Decay recipient at launch</span>
            <strong>{(split.decay / 100).toFixed(2)}%</strong>
          </div>
        )}
      </div>
      <p className="hint conversion-note">
        All fees are included and converted to ETH.
      </p>
      <div className="preview-foot">
        <LockKeyhole size={17} />
        <span>Liquidity locked permanently</span>
      </div>
      <div className="preview-caption">
        <ShieldCheck size={17} />
        <span>Shared Uniswap v4 tax hook</span>
      </div>
    </aside>
  );
}
export function Launch() {
  const [d, setDraft] = useState<Draft>(loadDraft);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState(false);
  const { address, chainId } = useConnection();
  const openWallet = useOpenWallet();
  const tx = useTransaction();
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [submitError, setSubmitError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const preparingRef = useRef(false);
  useEffect(() => {
    try {
      sessionStorage.setItem("erc20t:draft", JSON.stringify(d));
    } catch {
      /* Draft storage is optional. */
    }
  }, [d]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
    setAgreed(false);
  };
  const review = useQuery({
    queryKey: ["launch-review", d],
    enabled: step === 3,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      await verifyInfrastructure();
      const base = await readBase(quoteAddress(d));
      if (d.mode === "deploy") return { base, ranges: [] };
      const supply = units(d.supply, 18),
        price = units(d.price, base.decimals);
      const ranges = await Promise.all(
        (base.address === zeroAddress ? [false] : [false, true]).map((order) =>
          launchPreview(supply, d.allocation * 100, price, order),
        ),
      );
      return { base, ranges };
    },
  });
  function move(next: number) {
    setStep(next);
    setTimeout(() => {
      titleRef.current?.focus();
      titleRef.current?.scrollIntoView({ block: "nearest" });
    }, 0);
  }
  function advance(e: FormEvent) {
    e.preventDefault();
    const errors = validateDraft(d, step);
    setErrors(errors);
    if (Object.keys(errors).length) {
      setTimeout(
        () =>
          formRef.current
            ?.querySelector<HTMLInputElement>('[aria-invalid="true"]')
            ?.focus(),
        0,
      );
      return;
    }
    move(step + 1);
  }
  async function submit() {
    if (!address) {
      openWallet();
      return;
    }
    if (
      !agreed ||
      !review.data ||
      chainId !== 1 ||
      preparingRef.current ||
      tx.busy ||
      preparing ||
      tx.submitted
    )
      return;
    preparingRef.current = true;
    setPreparing(true);
    setSubmitError("");
    try {
      // Re-read permissions and decimals immediately before simulation; preview data may be stale.
      const base = await readBase(quoteAddress(d));
      const config = makeConfig(d, address);
      await tx.send(
        d.mode === "launch"
          ? {
              address: CONTRACTS.factory,
              abi: factoryAbi,
              functionName: "createAndLaunchAtPrice",
              args: [config, d.allocation * 100, units(d.price, base.decimals)],
              value: 0n,
            }
          : {
              address: CONTRACTS.factory,
              abi: factoryAbi,
              functionName: "create",
              args: [config],
            },
      );
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  }
  let allocations;
  try {
    allocations = allocation(units(d.supply, 18), d.allocation);
  } catch {
    /* Invalid input is handled beside its field. */
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Launch your token.</h1>
          <p>Create an Ethereum token without a base-token deposit.</p>
        </div>
        <a className="text-link desktop-help" href="#/guide">
          <CircleHelp size={17} />
          How it works
        </a>
      </div>
      <div className="launch-layout">
        <section className="builder">
          <ol className="steps" aria-label="Launch progress">
            {["Token details", "Economics", "Review"].map((label, i) => (
              <li
                key={label}
                className={
                  step === i + 1 ? "active" : step > i + 1 ? "complete" : ""
                }
                aria-current={step === i + 1 ? "step" : undefined}
              >
                <button
                  type="button"
                  disabled={
                    i + 1 > step || tx.busy || preparing || tx.submitted
                  }
                  onClick={() => move(i + 1)}
                >
                  <span className="step-number">
                    {step > i + 1 ? <Check size={14} /> : i + 1}
                  </span>
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="builder-content">
            <div className="section-heading">
              <div>
                <h2 ref={titleRef} tabIndex={-1}>
                  {step === 1
                    ? "Make it yours"
                    : step === 2
                      ? "Shape your launch"
                      : "Review your token"}
                </h2>
                <p className="hint">
                  {step === 1
                    ? "Name your token and choose a base."
                    : step === 2
                      ? "Set the allocation, price and fee structure."
                      : "Check these details before approving in your wallet."}
                </p>
              </div>
              <span className="step-caption">{step} of 3</span>
            </div>
            {step < 3 ? (
              <form ref={formRef} onSubmit={advance} noValidate>
                {step === 1 ? (
                  <>
                    <div className="fields two">
                      <Field
                        id="token-name"
                        label="Token name"
                        placeholder="e.g. Moon Garden"
                        value={d.name}
                        onChange={(e) => set("name", e.target.value)}
                        error={errors.name}
                        maxLength={80}
                        autoComplete="off"
                      />
                      <Field
                        id="token-symbol"
                        label="Symbol"
                        placeholder="e.g. GARDEN"
                        value={d.symbol}
                        onChange={(e) => set("symbol", e.target.value)}
                        error={errors.symbol}
                        maxLength={16}
                        autoComplete="off"
                      />
                    </div>
                    <Field
                      id="token-supply"
                      label="Total supply"
                      value={d.supply}
                      onChange={(e) => set("supply", e.target.value)}
                      inputMode="decimal"
                      error={errors.supply}
                      hint="Fixed supply with 18 decimal places."
                    />
                    <fieldset className="base-field">
                      <legend>Pair with</legend>
                      <div className="base-options">
                        {BASES.map((base) => (
                          <button
                            key={base.symbol}
                            type="button"
                            className={`base-option ${d.base === base.symbol ? "selected" : ""}`}
                            aria-pressed={d.base === base.symbol}
                            onClick={() => set("base", base.symbol)}
                          >
                            <span
                              className={`base-icon ${base.symbol.toLowerCase()}`}
                              aria-hidden="true"
                            >
                              {base.symbol === "ETH" ? (
                                <svg viewBox="0 0 20 24" width="17" height="22">
                                  <path
                                    d="m10 0 8 12-8 5-8-5Z"
                                    fill="currentColor"
                                    opacity=".75"
                                  />
                                  <path
                                    d="m2 14 8 10 8-10-8 5Z"
                                    fill="currentColor"
                                  />
                                </svg>
                              ) : base.symbol === "IMD" ? (
                                <span className="imd-symbol">✳</span>
                              ) : (
                                <Coins size={18} />
                              )}
                            </span>
                            {base.symbol}
                            {d.base === base.symbol && (
                              <Check size={14} className="base-check" />
                            )}
                          </button>
                        ))}
                        <button
                          type="button"
                          className={`base-option custom ${d.base === "custom" ? "selected" : ""}`}
                          aria-pressed={d.base === "custom"}
                          onClick={() => set("base", "custom")}
                        >
                          Other
                          <ChevronDown size={16} />
                        </button>
                      </div>
                      <p className="hint">
                        Your token supplies the liquidity. No{" "}
                        {d.base === "custom" ? "base token" : d.base} deposit
                        needed.
                      </p>
                    </fieldset>
                    {d.base === "custom" && (
                      <Field
                        id="custom-base"
                        label="Base token address"
                        placeholder="0x…"
                        value={d.customBase}
                        onChange={(e) => set("customBase", e.target.value)}
                        error={errors.customBase}
                        hint="A registered base or an eligible ETH-paired ERC20T. Checked onchain before you launch."
                        autoComplete="off"
                        spellCheck={false}
                      />
                    )}
                    <div className="form-actions">
                      <span className="hint inline">
                        <LockKeyhole size={15} />
                        No wallet needed to preview
                      </span>
                      <button className="button primary" type="submit">
                        Continue
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <fieldset>
                      <legend>Deployment</legend>
                      <div className="segmented">
                        {(["launch", "deploy"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            aria-pressed={d.mode === mode}
                            className={d.mode === mode ? "selected" : ""}
                            onClick={() => set("mode", mode)}
                          >
                            {mode === "launch"
                              ? "Deploy & launch"
                              : "Deploy first"}
                          </button>
                        ))}
                      </div>
                      <p className="hint">
                        {d.mode === "launch"
                          ? "Create your token and launch its pool in one transaction."
                          : "Create now. The owner can set a price and launch later from Manage tokens."}
                      </p>
                    </fieldset>
                    {d.mode === "launch" && (
                      <Field
                        id="starting-price"
                        label="Starting price per token"
                        value={d.price}
                        inputMode="decimal"
                        suffix={d.base === "custom" ? "base units" : d.base}
                        onChange={(e) => set("price", e.target.value)}
                        error={errors.price}
                        hint="In whole base tokens, not wei. The pool price rounds to a valid tick."
                      />
                    )}
                    <div className="field">
                      <div className="row-between">
                        <label htmlFor="allocation">Your allocation</label>
                        <output htmlFor="allocation">{d.allocation}%</output>
                      </div>
                      <input
                        id="allocation"
                        type="range"
                        min="0"
                        max="20"
                        step="1"
                        value={d.allocation}
                        onChange={(e) =>
                          set("allocation", Number(e.target.value))
                        }
                      />
                      <div className="range-labels">
                        <span>0%</span>
                        <span>20% maximum</span>
                      </div>
                      <p className="hint">
                        {100 - d.allocation}% seeds permanently locked
                        liquidity.
                      </p>
                    </div>
                    <Field
                      id="resting-tax"
                      label="Resting buy & sell tax"
                      value={d.tax}
                      inputMode="decimal"
                      suffix="%"
                      onChange={(e) => set("tax", e.target.value)}
                      error={errors.tax}
                      hint="0.3–5%. Includes the 0.15% protocol fee."
                    />
                    <div className="setting-group">
                      <Toggle
                        label="Enable launch decay"
                        description="Start at 99%, dropping one percentage point each interval."
                        checked={d.decay}
                        onChange={(value) => set("decay", value)}
                      />
                      {d.decay && (
                        <>
                          <Field
                            id="decay-interval"
                            label="Seconds per drop"
                            value={d.interval}
                            inputMode="numeric"
                            suffix="seconds"
                            onChange={(e) => set("interval", e.target.value)}
                            error={errors.interval}
                          />
                          <p className="hint">
                            Reaches {d.tax}% after{" "}
                            {duration(
                              decayDuration(
                                Number(d.tax) * 100,
                                Number(d.interval),
                              ),
                            )}{" "}
                            from launch.
                          </p>
                        </>
                      )}
                    </div>
                    <div className="setting-group">
                      <Toggle
                        label="Use separate fee recipients"
                        description="Otherwise both fee streams go to your connected wallet."
                        checked={d.customRecipients}
                        onChange={(value) => set("customRecipients", value)}
                      />
                      {d.customRecipients && (
                        <>
                          <Field
                            id="fee-recipient"
                            label="Regular fee recipient"
                            value={d.recipient}
                            placeholder="0x…"
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(e) => set("recipient", e.target.value)}
                            error={errors.recipient}
                          />
                          <Field
                            id="decay-recipient"
                            label="Decay fee recipient"
                            value={d.decayRecipient}
                            placeholder="0x…"
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(e) =>
                              set("decayRecipient", e.target.value)
                            }
                            error={errors.decayRecipient}
                          />
                        </>
                      )}
                    </div>
                    <div className="form-actions">
                      <button
                        className="button text"
                        type="button"
                        onClick={() => move(1)}
                      >
                        <ArrowLeft size={16} />
                        Back
                      </button>
                      <button className="button primary" type="submit">
                        Review {d.mode === "launch" ? "launch" : "deployment"}
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  </>
                )}
              </form>
            ) : (
              <div className="review">
                <dl className="review-list">
                  <div>
                    <dt>Token</dt>
                    <dd>
                      {d.name} ({d.symbol})
                    </dd>
                  </div>
                  <div>
                    <dt>Total supply</dt>
                    <dd>{d.supply}</dd>
                  </div>
                  <div>
                    <dt>You keep</dt>
                    <dd>
                      {allocations ? formatUnits(allocations.creator, 18) : ""}{" "}
                      ({d.allocation}%)
                    </dd>
                  </div>
                  <div>
                    <dt>Locked reserve</dt>
                    <dd>
                      {allocations
                        ? formatUnits(allocations.liquidity, 18)
                        : ""}{" "}
                      ({100 - d.allocation}%)
                    </dd>
                  </div>
                  <div>
                    <dt>Action</dt>
                    <dd>
                      {d.mode === "launch"
                        ? "Deploy and launch"
                        : "Deploy only; launch later"}
                    </dd>
                  </div>
                  <div>
                    <dt>Base</dt>
                    <dd>{review.data?.base.symbol || d.base}</dd>
                  </div>
                  {d.mode === "launch" && (
                    <div>
                      <dt>Requested price</dt>
                      <dd>
                        {d.price} {review.data?.base.symbol || d.base}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Tax at launch</dt>
                    <dd>{d.decay ? "99%" : `${d.tax}%`}</dd>
                  </div>
                  <div>
                    <dt>Resting tax</dt>
                    <dd>{d.tax}%</dd>
                  </div>
                  {d.decay && (
                    <div>
                      <dt>Decay interval</dt>
                      <dd>{d.interval} seconds</dd>
                    </div>
                  )}
                  <div>
                    <dt>Base deposit</dt>
                    <dd>None · Gas paid in ETH</dd>
                  </div>
                </dl>
                {quoteAddress(d) !== zeroAddress && (
                  <Address value={quoteAddress(d)} label="Base contract" />
                )}
                <Address
                  value={CONTRACTS.factory}
                  label="Factory · Ethereum mainnet"
                />
                {address ? (
                  <>
                    <Address
                      value={address}
                      label="Owner and allocation recipient"
                    />
                    <Address
                      value={d.customRecipients ? d.recipient : address}
                      label="Regular fee recipient"
                    />
                    <Address
                      value={d.customRecipients ? d.decayRecipient : address}
                      label="Decay fee recipient"
                    />
                  </>
                ) : (
                  <Notice>
                    The connected wallet becomes the owner and receives your
                    allocation.
                    {!d.customRecipients &&
                      " It also receives both fee streams."}
                  </Notice>
                )}
                {d.customRecipients && !address && (
                  <>
                    <Address
                      value={d.recipient}
                      label="Regular fee recipient"
                    />
                    <Address
                      value={d.decayRecipient}
                      label="Decay fee recipient"
                    />
                  </>
                )}
                {review.isPending && (
                  <Notice>
                    <span className="inline">
                      <Spinner />
                      Verifying the base and launch parameters…
                    </span>
                  </Notice>
                )}
                {review.error && (
                  <Notice tone="error">
                    {errorMessage(review.error)}
                    <button
                      className="button secondary"
                      onClick={() => review.refetch()}
                    >
                      Retry verification
                    </button>
                  </Notice>
                )}
                {review.data && (
                  <Notice tone="success">
                    <span className="inline">
                      <ShieldCheck size={18} />
                      {review.data.base.kind} verified.
                    </span>
                    {review.data.ranges.length > 0 && (
                      <p>
                        Effective starting price:{" "}
                        {review.data.ranges
                          .map((p) =>
                            formatUnits(
                              p.effectivePriceWei,
                              review.data.base.decimals,
                            ),
                          )
                          .join(" or ")}{" "}
                        {review.data.base.symbol}.
                        {review.data.ranges.length > 1 &&
                          " Final address ordering selects the range at deployment."}
                      </p>
                    )}
                  </Notice>
                )}
                <div className="consequence">
                  <h3>
                    <LockKeyhole size={17} />
                    Before you {d.mode === "launch" ? "launch" : "deploy"}
                  </h3>
                  <p>
                    Supply, base and decay settings cannot be changed after
                    creation. The launch liquidity is permanently locked.{" "}
                    {d.mode === "deploy"
                      ? "The liquidity reserve stays in the token until its owner launches."
                      : "This transaction launches trading immediately."}
                  </p>
                  {d.decay && (
                    <p className="warning-text">
                      The initial 99% tax leaves only 1% of swap output before
                      other costs. Tax falls automatically; the owner cannot
                      change it during active decay.
                    </p>
                  )}
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      disabled={tx.busy || preparing || tx.submitted}
                    />
                    <span>
                      I understand the settings and permanent liquidity lock.
                    </span>
                  </label>
                </div>
                {chainId && chainId !== 1 && (
                  <Notice tone="warning">
                    Switch to Ethereum using the wallet control before
                    submitting.
                  </Notice>
                )}
                {submitError && <Notice tone="error">{submitError}</Notice>}
                <TransactionStatus tx={tx} />
                <div className="form-actions">
                  <button
                    className="button text"
                    disabled={tx.busy || preparing || tx.submitted}
                    onClick={() => move(2)}
                  >
                    <ArrowLeft size={16} />
                    Edit details
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      tx.busy ||
                      preparing ||
                      tx.submitted ||
                      (!!address &&
                        (!agreed ||
                          !review.data ||
                          chainId !== 1 ||
                          review.isFetching))
                    }
                    onClick={submit}
                  >
                    {tx.busy || preparing ? <Spinner /> : <Rocket size={17} />}
                    {!address
                      ? "Connect to continue"
                      : tx.state === "success"
                        ? "Confirmed"
                        : preparing
                          ? "Checking launch…"
                          : d.mode === "launch"
                            ? "Deploy & launch"
                            : "Deploy token"}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="builder-footer">
            <LockKeyhole size={15} />
            <span>Token-only liquidity is permanently locked at launch.</span>
          </div>
        </section>
        <Preview d={d} />
      </div>
      <div className="principles">
        <div>
          <LockKeyhole size={21} />
          <div>
            <h3>Locked from day one</h3>
            <p>Launch liquidity stays in the pool, permanently.</p>
          </div>
        </div>
        <div>
          <Coins size={21} />
          <div>
            <h3>Fees arrive as ETH</h3>
            <p>The hook converts and routes fees automatically.</p>
          </div>
        </div>
        <div>
          <ShieldCheck size={21} />
          <div>
            <h3>One shared hook</h3>
            <p>Each token has its own tax and owner controls.</p>
          </div>
        </div>
      </div>
      <div className="page-foot">
        <span>Powered by Uniswap v4</span>
        <a
          href={explorer(CONTRACTS.hook, "address")}
          target="_blank"
          rel="noreferrer"
        >
          View shared hook
          <ArrowRight size={14} />
        </a>
      </div>
    </>
  );
}
