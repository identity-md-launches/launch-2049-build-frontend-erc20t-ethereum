import { useEffect, useRef, useState } from "react";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import {
  ArrowUpRight,
  BookOpen,
  Compass,
  Menu,
  Plus,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Discover } from "./Discover";
import { Launch } from "./Launch";
import { Manage } from "./Manage";
import { Guide } from "./Guide";
import { WalletButton } from "./Wallet";
import { Field, Logo, Modal, Notice, Spinner } from "./ui";
import { getCustomRpc, RPC_URLS } from "./config";
import { errorMessage } from "./domain";
import { TransactionActivity } from "./Transaction";

const navItems = [
  { id: "launch", label: "Create a token", Icon: Plus },
  { id: "discover", label: "Discover", Icon: Compass },
  { id: "manage", label: "Manage tokens", Icon: SlidersHorizontal },
];
function route() {
  const path = location.hash.replace(/^#\/?/, "").split("/");
  return { page: path[0] || "launch", address: path[1] };
}
export default function App() {
  const [current, setCurrent] = useState(route);
  const [menu, setMenu] = useState(false);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const change = () => {
      setCurrent(route());
      setMenu(false);
      window.scrollTo(0, 0);
      setTimeout(() => main.current?.focus(), 0);
    };
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  const active = current.page === "token" ? "discover" : current.page;
  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
          main.current?.scrollIntoView();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <Logo />
        <nav aria-label="Main navigation">
          <div className="nav-group">
            {navItems.map(({ id, label, Icon }) => (
              <a
                href={`#/${id}`}
                key={id}
                className={`nav-item ${active === id ? "active" : ""}`}
                aria-current={active === id ? "page" : undefined}
              >
                <Icon size={19} />
                <span>{label}</span>
                {active === id && <span className="nav-dot" />}
              </a>
            ))}
          </div>
          <a
            className={`nav-item ${active === "guide" ? "active" : ""}`}
            href="#/guide"
            aria-current={active === "guide" ? "page" : undefined}
          >
            <BookOpen size={19} />
            How it works
            <ArrowUpRight size={15} className="nav-end" />
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="network-side">
            <span className="ethereum-symbol" aria-hidden="true">
              ◇
            </span>
            <div>
              <strong>Ethereum</strong>
              <span>Mainnet</span>
            </div>
            <span className="status-dot" />
          </div>
          <a className="nav-item" href="#/settings">
            <Settings2 size={17} />
            Connection settings
          </a>
          <p>
            Built on Uniswap v4<span>Onchain token launches.</span>
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="mobile-logo">
            <Logo small />
          </div>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span>/</span>
            <strong>
              {navItems.find((n) => n.id === active)?.label ||
                (active === "guide" ? "How it works" : "Connection settings")}
            </strong>
          </div>
          <div className="header-utilities">
            <span className="chain-label">
              <span className="status-dot" />
              Ethereum mainnet
            </span>
            <WalletButton />
            <button
              type="button"
              className="icon-button mobile-menu"
              aria-label={menu ? "Close navigation" : "Open navigation"}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </header>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navItems.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`#/${id}`}
              aria-current={active === id ? "page" : undefined}
              className={active === id ? "active" : ""}
            >
              <Icon size={17} />
              <span>
                {id === "launch"
                  ? "Create"
                  : id === "manage"
                    ? "Manage"
                    : label}
              </span>
            </a>
          ))}
        </nav>
        {menu && (
          <div className="mobile-extra">
            <a href="#/guide">
              <BookOpen size={18} />
              How it works
            </a>
            <a href="#/settings">
              <Settings2 size={18} />
              Connection settings
            </a>
          </div>
        )}
        <main id="main-content" ref={main} tabIndex={-1}>
          <TransactionActivity />
          {current.page === "launch" || current.page === "settings" ? (
            <Launch />
          ) : current.page === "discover" ? (
            <Discover />
          ) : current.page === "manage" || current.page === "token" ? (
            <Manage
              tokenAddress={current.address}
              detail={current.page === "token"}
            />
          ) : current.page === "guide" ? (
            <Guide />
          ) : (
            <div className="empty-state">
              <h1>Page not found</h1>
              <a className="button primary" href="#/launch">
                Create a token
              </a>
            </div>
          )}
        </main>
      </div>
      {current.page === "settings" && (
        <ConnectionSettings
          close={() => {
            location.hash = "#/launch";
          }}
        />
      )}
    </div>
  );
}
function ConnectionSettings({ close }: { close: () => void }) {
  const [rpc, setRpc] = useState(getCustomRpc());
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  async function save() {
    setError("");
    setChecking(true);
    try {
      if (
        rpc &&
        (!rpc.startsWith("https://") ||
          new URL(rpc).username ||
          new URL(rpc).password)
      )
        throw new Error(
          "Use an HTTPS public RPC URL without embedded credentials.",
        );
      const client = createPublicClient({
        chain: mainnet,
        transport: http(rpc || RPC_URLS[0], { timeout: 10_000, retryCount: 0 }),
      });
      if ((await client.getChainId()) !== 1)
        throw new Error(
          "This RPC does not serve Ethereum mainnet (chain ID 1).",
        );
      if (rpc) localStorage.setItem("erc20t:rpc", rpc);
      else localStorage.removeItem("erc20t:rpc");
      location.hash = "#/launch";
      location.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }
  return (
    <Modal title="Connection settings" onClose={close}>
      <p>
        Choose a public Ethereum RPC for contract reads and transaction
        simulation. This setting stays in this browser.
      </p>
      <Field
        label="Custom public RPC URL"
        placeholder={RPC_URLS[0]}
        value={rpc}
        onChange={(e) => setRpc(e.target.value)}
        type="url"
        hint="Leave blank to use the default public providers. Do not enter a private API key."
      />
      <p className="hint">Default: PublicNode, with LlamaRPC as a fallback.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">
        <button className="button secondary" onClick={close}>
          Close
        </button>
        <button className="button primary" disabled={checking} onClick={save}>
          {checking && <Spinner />}Verify & save
        </button>
      </div>
    </Modal>
  );
}
