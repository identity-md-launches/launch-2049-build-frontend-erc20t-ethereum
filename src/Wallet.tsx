import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  useConnection,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { ArrowUpRight, LogOut, Wallet } from "lucide-react";
import { getAddress } from "viem";
import { errorMessage } from "./domain";
import { shortAddress } from "./config";
import { Address, Modal, Notice, Spinner } from "./ui";

const WalletContext = createContext(() => {});
export const useOpenWallet = () => useContext(WalletContext);
const openIn = [
  {
    name: "MetaMask",
    icon: "metaMaskWallet",
    href: (u: string) =>
      `https://link.metamask.io/dapp/${u.replace(/^https?:\/\//, "")}`,
  },
  {
    name: "Coinbase Wallet",
    icon: "coinbase",
    href: (u: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(u)}`,
  },
  {
    name: "Rabby",
    icon: "rabbyWallet",
    href: (u: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(u)}`,
  },
  {
    name: "Phantom",
    icon: "phantomWallet",
    href: (u: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(new URL(u).origin)}`,
  },
];
export function WalletProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const [error, setError] = useState("");
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !named &&
    !("ethereum" in window);
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter((c) => !(c.id === "injected" && (named || mobile)));
  useEffect(() => {
    if (isConnected) setOpen(false);
  }, [isConnected]);
  return (
    <WalletContext.Provider
      value={() => {
        setError("");
        setOpen(true);
      }}
    >
      {children}
      {open && (
        <Modal
          title={isConnected ? "Your wallet" : "Connect a wallet"}
          onClose={() => setOpen(false)}
        >
          {isConnected && address ? (
            <>
              <Address value={getAddress(address)} label="Connected account" />
              <p className="hint">
                {chainId === 1
                  ? "Ethereum mainnet"
                  : "Switch to Ethereum to use this launchpad."}
              </p>
              {chainId !== 1 && (
                <button
                  className="button primary full"
                  disabled={switchChain.isPending}
                  onClick={() =>
                    switchChain.mutate(
                      { chainId: 1 },
                      { onError: (e) => setError(errorMessage(e)) },
                    )
                  }
                >
                  Switch to Ethereum
                </button>
              )}
              <button
                className="button secondary full"
                onClick={() => {
                  disconnect.mutate();
                  setOpen(false);
                }}
              >
                <LogOut size={17} /> Disconnect wallet
              </button>
            </>
          ) : (
            <>
              <p className="modal-description">
                Choose how to connect to Ethereum.
              </p>
              <div className="wallet-options">
                {mobile &&
                  openIn.map((w) => (
                    <a
                      className="wallet-row"
                      key={w.name}
                      href={w.href(location.href)}
                    >
                      <img
                        src={`./wallets/${w.icon}.svg`}
                        alt=""
                        width="28"
                        height="28"
                      />
                      <span>Open in {w.name}</span>
                      <ArrowUpRight size={18} />
                    </a>
                  ))}
                {listed.map((c) => (
                  <button
                    type="button"
                    className="wallet-row"
                    key={c.uid}
                    disabled={connect.isPending}
                    onClick={() => {
                      setError("");
                      connect.mutate(
                        { connector: c },
                        { onError: (e) => setError(errorMessage(e)) },
                      );
                    }}
                  >
                    {c.icon ? (
                      <img src={c.icon} alt="" width="28" height="28" />
                    ) : c.id === "coinbaseWalletSDK" ? (
                      <img
                        src="./wallets/coinbase.svg"
                        alt=""
                        width="28"
                        height="28"
                      />
                    ) : (
                      <Wallet size={26} />
                    )}
                    <span>
                      {c.id === "injected"
                        ? "Browser wallet"
                        : c.id === "coinbaseWalletSDK"
                          ? mobile
                            ? "Coinbase Smart Wallet"
                            : "Coinbase Wallet"
                          : c.name}
                    </span>
                    {connect.isPending && connect.variables?.connector === c ? (
                      <Spinner />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </button>
                ))}
              </div>
              <p className="hint wallet-note">
                Connecting is free. Every transaction needs your approval.
              </p>
            </>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </Modal>
      )}
    </WalletContext.Provider>
  );
}
export function WalletButton() {
  const { address, chainId, isConnected } = useConnection();
  const open = useOpenWallet();
  const switchChain = useSwitchChain();
  return (
    <button
      type="button"
      className="button wallet-button"
      onClick={() => {
        if (isConnected && chainId !== 1)
          switchChain.mutate({ chainId: 1 }, { onError: open });
        else open();
      }}
      disabled={switchChain.isPending}
    >
      <Wallet size={17} />
      <span>
        {switchChain.isPending
          ? "Switching…"
          : isConnected && chainId !== 1
            ? "Switch to Ethereum"
            : address
              ? shortAddress(getAddress(address))
              : "Connect wallet"}
      </span>
    </button>
  );
}
