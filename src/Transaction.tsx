import { useEffect, useRef, useState } from "react";
import { useConnection, useWalletClient } from "wagmi";
import { decodeEventLog, type Hash, type TransactionReceipt } from "viem";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { CONTRACTS, explorer, publicClient } from "./config";
import { factoryAbi } from "./contracts/abis";
import { errorMessage } from "./domain";
import { verifyInfrastructure, type TransactionCall } from "./chain";
import { Modal, Notice, Spinner } from "./ui";

type Activity = {
  hash: Hash;
  status: "pending" | "success" | "reverted" | "replaced";
  action: string;
};
const ACTIVITY_KEY = "erc20t:transaction";
let memoryActivity: Activity | undefined;
function readActivity(): Activity | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(ACTIVITY_KEY) || "null");
    if (
      value &&
      /^0x[\da-f]{64}$/i.test(value.hash) &&
      ["pending", "success", "reverted", "replaced"].includes(value.status)
    )
      return value;
  } catch {
    /* Session storage is optional. */
  }
  return memoryActivity;
}
function saveActivity(activity: Activity | undefined) {
  memoryActivity = activity;
  try {
    if (activity)
      sessionStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
    else sessionStorage.removeItem(ACTIVITY_KEY);
  } catch {
    /* Retain in-memory status. */
  }
  window.dispatchEvent(new Event("erc20t:transaction"));
}

/** Keeps a submitted transaction visible even when its form or dialog is closed. */
export function TransactionActivity() {
  const [activity, setActivity] = useState(readActivity);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const [clear, setClear] = useState(false);
  useEffect(() => {
    const update = () => {
      setActivity(readActivity());
      setNote("");
    };
    window.addEventListener("erc20t:transaction", update);
    return () => window.removeEventListener("erc20t:transaction", update);
  }, []);
  if (!activity) return null;
  async function check() {
    if (!activity) return;
    setChecking(true);
    setNote("");
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: activity.hash,
      });
      if (readActivity()?.hash === activity.hash)
        saveActivity({
          ...activity,
          status: receipt.status === "success" ? "success" : "reverted",
        });
    } catch {
      setNote("Not confirmed by this RPC yet. Check Etherscan or retry.");
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <div className="activity-bar" role="status">
        <div>
          <strong>
            {activity.status === "pending"
              ? "Transaction submitted"
              : activity.status === "success"
                ? "Latest transaction confirmed"
                : activity.status === "replaced"
                  ? "Transaction replaced or cancelled"
                  : "Latest transaction reverted"}
          </strong>
          <a
            href={explorer(activity.hash, "tx")}
            target="_blank"
            rel="noreferrer"
          >
            View on Etherscan
            <ExternalLink size={13} />
          </a>
          {note && <p className="hint">{note}</p>}
        </div>
        {activity.status === "pending" ? (
          <div className="button-row">
            <button
              className="button secondary"
              disabled={checking}
              onClick={check}
            >
              {checking && <Spinner />}Check status
            </button>
            <button className="button text" onClick={() => setClear(true)}>
              Clear tracking
            </button>
          </div>
        ) : (
          <button
            className="button text"
            onClick={() => saveActivity(undefined)}
          >
            Dismiss
          </button>
        )}
      </div>
      {clear && (
        <Modal
          title="Clear transaction tracking?"
          onClose={() => setClear(false)}
        >
          <p>
            This does not cancel your transaction. It may still complete. Check
            its status in your wallet or on Etherscan before starting another
            action.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setClear(false)}
            >
              Keep tracking
            </button>
            <button
              className="button primary"
              onClick={() => {
                saveActivity(undefined);
                setClear(false);
              }}
            >
              Clear tracking
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function useTransaction() {
  const { address, chainId } = useConnection();
  const wallet = useWalletClient({
    chainId: 1,
    query: { enabled: !!address && chainId === 1 },
  });
  const lock = useRef(false);
  const [state, setState] = useState<
    | "idle"
    | "checking"
    | "wallet"
    | "pending"
    | "success"
    | "error"
    | "unconfirmed"
  >("idle");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<Hash>();
  const [receipt, setReceipt] = useState<TransactionReceipt>();
  async function wait(hash: Hash) {
    try {
      let replacedWithDifferentCall = false;
      let trackedHash = hash;
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
        onReplaced: (replacement) => {
          setHash(replacement.transaction.hash);
          const current = readActivity();
          if (current?.hash === trackedHash)
            saveActivity({
              ...current,
              hash: replacement.transaction.hash,
              status:
                replacement.reason === "repriced" ? "pending" : "replaced",
            });
          trackedHash = replacement.transaction.hash;
          if (replacement.reason !== "repriced")
            replacedWithDifferentCall = true;
        },
      });
      if (replacedWithDifferentCall) {
        setState("error");
        setError(
          "This transaction was cancelled or replaced with a different action. Review the replacement on Etherscan; the requested change is not confirmed.",
        );
        return;
      }
      setReceipt(receipt);
      const current = readActivity();
      if (current?.hash === trackedHash)
        saveActivity({
          ...current,
          status: receipt.status === "success" ? "success" : "reverted",
        });
      if (receipt.status !== "success") {
        setState("error");
        setError(
          "The transaction reverted. No requested changes were applied. Review the transaction on Etherscan before retrying.",
        );
        return;
      }
      setState("success");
    } catch {
      setState("unconfirmed");
      setError(
        "Confirmation is taking longer than expected. Check the submitted transaction before sending another.",
      );
    }
  }
  async function send(call: TransactionCall) {
    if (lock.current) return;
    lock.current = true;
    setError("");
    setHash(undefined);
    setReceipt(undefined);
    try {
      if (readActivity()?.status === "pending")
        throw new Error(
          "A transaction is already submitted. Check its status above before sending another.",
        );
      if (!address) throw new Error("Connect your wallet to continue.");
      if (chainId !== 1)
        throw new Error("Switch your wallet to Ethereum mainnet.");
      setState("checking");
      // Refresh after network/account changes instead of retaining a failed wrong-chain query.
      const currentWallet = await wallet.refetch();
      const client = currentWallet.data;
      if (!client)
        throw (
          currentWallet.error ||
          new Error(
            "The wallet connection is unavailable. Reconnect and retry.",
          )
        );
      if ((await client.getChainId()) !== 1)
        throw new Error("Switch your wallet to Ethereum mainnet.");
      await verifyInfrastructure();
      const { request } = await publicClient.simulateContract({
        ...call,
        account: address,
      } as never);
      if ((await client.getChainId()) !== 1)
        throw new Error(
          "Your wallet network changed. Switch back to Ethereum.",
        );
      const accounts = await client.getAddresses();
      if (!accounts.some((a) => a.toLowerCase() === address.toLowerCase()))
        throw new Error(
          "Your wallet account changed. Review the transaction again.",
        );
      setState("wallet");
      const tx = await client.writeContract(request as never);
      saveActivity({ hash: tx, status: "pending", action: call.functionName });
      setHash(tx);
      setState("pending");
      await wait(tx);
    } catch (e) {
      setState("error");
      setError(errorMessage(e));
    } finally {
      lock.current = false;
    }
  }
  let created: string | undefined;
  if (receipt?.status === "success")
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== CONTRACTS.factory) continue;
      try {
        const event = decodeEventLog({
          abi: factoryAbi,
          eventName: "TokenCreated",
          data: log.data,
          topics: log.topics,
        });
        created = event.args.token;
      } catch {
        /* Other factory events are not token creation. */
      }
    }
  return {
    state,
    error,
    hash,
    receipt,
    created,
    send,
    recheck: () => {
      if (hash) {
        setState("pending");
        void wait(hash);
      }
    },
    busy: ["checking", "wallet", "pending"].includes(state),
    submitted: !!hash && state !== "error",
    label:
      state === "checking"
        ? "Simulating transaction…"
        : state === "wallet"
          ? "Approve in your wallet…"
          : state === "pending"
            ? "Waiting for confirmation…"
            : "",
  };
}
export type TransactionState = ReturnType<typeof useTransaction>;
export function TransactionStatus({ tx }: { tx: TransactionState }) {
  return (
    <div className="transaction-status" aria-live="polite">
      {tx.busy && (
        <Notice>
          <span className="inline">
            <Spinner />
            {tx.label}
          </span>
        </Notice>
      )}
      {tx.error && (
        <Notice tone={tx.state === "unconfirmed" ? "warning" : "error"}>
          {tx.error}
        </Notice>
      )}
      {tx.state === "success" && (
        <Notice tone="success">
          <span className="inline">
            <CheckCircle2 size={19} />
            Transaction confirmed on Ethereum.
          </span>
        </Notice>
      )}
      {tx.hash && (
        <a
          className="external-link break"
          href={explorer(tx.hash, "tx")}
          target="_blank"
          rel="noreferrer"
        >
          View transaction on Etherscan
          <ExternalLink size={15} />
        </a>
      )}
      {tx.state === "unconfirmed" && (
        <button type="button" className="button secondary" onClick={tx.recheck}>
          Check confirmation
        </button>
      )}
      {tx.created && (
        <a className="button primary" href={`#/manage/${tx.created}`}>
          Manage your token
        </a>
      )}
    </div>
  );
}
