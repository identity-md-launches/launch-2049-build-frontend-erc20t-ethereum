import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, formatUnits } from "viem";
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  RefreshCw,
  Search,
} from "lucide-react";
import { discover, readToken, type TokenInfo } from "./chain";
import { baseName } from "./config";
import { errorMessage } from "./domain";
import { Notice, Spinner } from "./ui";

export function Discover() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [olderBusy, setOlderBusy] = useState(false);
  const [next, setNext] = useState<bigint>();
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [range, setRange] = useState<{ from: bigint; to: bigint }>();
  const [lookupBusy, setLookupBusy] = useState(false);
  const query = useQuery({
    queryKey: ["discovery"],
    retry: false,
    staleTime: 30_000,
    queryFn: () => discover(),
  });
  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setTokens(data.tokens);
    setNext(data.next);
    setLoaded(true);
    setRange({ from: data.fromBlock, to: data.toBlock });
    setMessage(
      data.failed || data.omitted
        ? `${data.failed} token reads failed; ${data.omitted} additional entries exceeded the 30-token batch limit. Use address lookup for missing entries.`
        : "",
    );
  }, [query.data]);
  async function older() {
    if (!next) return;
    setOlderBusy(true);
    setMessage("");
    try {
      const data = await discover(next);
      setTokens((old) => [
        ...new Map(
          [...old, ...data.tokens].map((t) => [t.address, t]),
        ).values(),
      ]);
      setNext(data.next);
      setRange((old) => ({
        from: data.fromBlock,
        to: old?.to || data.toBlock,
      }));
      if (data.failed || data.omitted)
        setMessage(
          `${data.failed} token reads failed; ${data.omitted} entries exceeded this batch limit. Try an address lookup.`,
        );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setOlderBusy(false);
    }
  }
  async function lookup() {
    if (!isAddress(search.trim())) return;
    setLookupBusy(true);
    setMessage("");
    try {
      const token = await readToken(search.trim() as `0x${string}`);
      setTokens((old) => [
        token,
        ...old.filter((t) => t.address !== token.address),
      ]);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setLookupBusy(false);
    }
  }
  const shown = tokens.filter(
    (t) =>
      `${t.name} ${t.symbol} ${t.address}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()) &&
      (filter === "all" ||
        (filter === "live" && t.launched) ||
        (filter === "waiting" && !t.launched)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Discover tokens.</h1>
          <p>Explore launches using the shared ERC20T hook.</p>
        </div>
        <a className="button primary" href="#/launch">
          Create a token
          <ArrowUpRight size={17} />
        </a>
      </div>
      <section className="discovery-section">
        <div className="discovery-tools">
          <form
            className="search-field"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup();
            }}
          >
            <label className="sr-only" htmlFor="token-search">
              Search tokens by name, symbol or address
            </label>
            <Search size={19} />
            <input
              id="token-search"
              type="search"
              placeholder="Search name, symbol or address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {isAddress(search.trim()) && (
              <button
                type="submit"
                className="button secondary"
                disabled={lookupBusy}
              >
                {lookupBusy ? <Spinner /> : "Look up"}
              </button>
            )}
          </form>
          <button
            className="button secondary"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        <div className="list-toolbar">
          <div className="filter-tabs" aria-label="Filter token status">
            {[
              ["all", "All tokens"],
              ["live", "Launched"],
              ["waiting", "Not launched"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? "active" : ""}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="hint">
            {tokens.length ? `${shown.length} shown` : "Factory events"}
          </span>
        </div>
        {query.isPending && !loaded ? (
          <div className="empty-state">
            <Spinner />
            <h2>Reading Ethereum</h2>
            <p>Looking for tokens in the latest 5,000 blocks.</p>
          </div>
        ) : query.error && !loaded ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Compass size={30} />
            </div>
            <h2>Tokens are a connection away</h2>
            <p>
              Ethereum could not be reached. Retry the connection or look up a
              token address.
            </p>
            <button
              className="button secondary"
              onClick={() => query.refetch()}
            >
              Retry connection
              <RefreshCw size={16} />
            </button>
            <a className="text-link" href="#/settings">
              Connection settings
              <ArrowRight size={15} />
            </a>
          </div>
        ) : shown.length ? (
          <div className="token-list">
            <div className="token-row list-header">
              <span>Token</span>
              <span>Base</span>
              <span>Current tax</span>
              <span>Status</span>
              <span />
            </div>
            {shown.map((t) => (
              <a
                href={`#/token/${t.address}`}
                className="token-row"
                key={t.address}
              >
                <span className="token-list-identity">
                  <span className="mini-token" aria-hidden="true">
                    <Compass size={22} />
                  </span>
                  <span>
                    <strong>{t.name}</strong>
                    <span className="hint">
                      {t.symbol} ·{" "}
                      {Number(formatUnits(t.supply, 18)).toLocaleString("en", {
                        notation: "compact",
                      })}{" "}
                      supply
                    </span>
                  </span>
                </span>
                <span data-label="Base">{baseName(t.quote)}</span>
                <span data-label="Current tax">
                  {t.tax / 100}%
                  {t.decayActive && <span className="hint">Decaying</span>}
                </span>
                <span className="token-state" data-label="Status">
                  <span className={`quiet-badge ${t.launched ? "green" : ""}`}>
                    {t.launched ? "Launched" : "Not launched"}
                  </span>
                </span>
                <ArrowUpRight size={18} />
              </a>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Search size={28} />
            </div>
            <h2>
              {search || filter !== "all"
                ? "No matching tokens"
                : "No launches in this window"}
            </h2>
            <p>
              {search || filter !== "all"
                ? "Search another name or look up a full contract address."
                : "Load an earlier block window or search by token address."}
            </p>
            {(search || filter !== "all") && (
              <button
                className="button secondary"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        {query.error && loaded && (
          <Notice tone="warning">
            Refresh failed. Showing the last successful read. Use Refresh to try
            again.
          </Notice>
        )}
        {message && <Notice tone="warning">{message}</Notice>}
        {loaded && (
          <div className="discovery-footer">
            <span className="hint">
              {range &&
                `Blocks ${range.from.toLocaleString()}–${range.to.toLocaleString()}. Tax shown at last read.`}
            </span>
            {next && (
              <button
                className="button secondary"
                disabled={olderBusy}
                onClick={older}
              >
                {olderBusy ? <Spinner /> : null}Load earlier tokens
              </button>
            )}
          </div>
        )}
      </section>
      <div className="callout">
        <ShieldGraphic />
        <div>
          <h2>Know the token before you trade.</h2>
          <p>
            Check the current tax, recipients and owner permissions. Only
            exact-input swaps are supported.
          </p>
        </div>
        <a className="text-link" href="#/guide">
          Read the mechanics
          <ArrowRight size={16} />
        </a>
      </div>
    </>
  );
}
function ShieldGraphic() {
  return (
    <svg
      viewBox="0 0 60 60"
      width="52"
      height="52"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M30 5 50 13v17c0 14-20 23-20 23S10 44 10 30V13Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="m20 29 7 7 14-15" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
