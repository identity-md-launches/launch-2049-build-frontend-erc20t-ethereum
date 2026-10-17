import {
  ArrowUpRight,
  Coins,
  LockKeyhole,
  Route,
  ShieldCheck,
} from "lucide-react";
import { CONTRACTS, explorer } from "./config";
import { Address, External } from "./ui";

export function Guide() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>A clearer way to launch.</h1>
          <p>
            Token-only liquidity, transparent taxes and control where it
            matters.
          </p>
        </div>
        <a className="button primary" href="#/launch">
          Create a token
          <ArrowUpRight size={17} />
        </a>
      </div>
      <div className="guide-layout">
        <article className="guide-content">
          <section id="launch-mechanics">
            <LockKeyhole size={26} />
            <h2>Start with your token.</h2>
            <p>
              ERC20T creates a fixed-supply token and its canonical Uniswap v4
              pool on Ethereum mainnet. Keep 0–20% of the supply. The remaining
              80–100% seeds a token-only liquidity position, with no ETH or
              other base deposit required. You still pay Ethereum gas.
            </p>
            <p>
              The initial position is permanently locked by the contract.
              Rounding dust stays in the token contract. The starting price is a
              pool initialization parameter, not a guaranteed sale price or a
              valuation.
            </p>
          </section>
          <section id="deployment">
            <Route size={26} />
            <h2>Launch now. Or launch later.</h2>
            <p>
              <strong>Deploy & launch</strong> creates the token and opens
              trading in a single transaction. <strong>Deploy first</strong>{" "}
              fixes your metadata, supply, base, allocation and launch-decay
              configuration, while keeping the liquidity reserve inside the
              token. Its owner can choose a starting price and launch later.
            </p>
            <p>
              Choose ETH, a currently enabled registered base such as IMD or
              FWA, or an eligible ERC20T. An ERC20T base must have an
              initialized ETH pool on this hook and pairing enabled. The
              interface checks current eligibility before submission.
            </p>
          </section>
          <section id="tax">
            <Coins size={26} />
            <h2>One tax. Three destinations.</h2>
            <p>
              The resting buy and sell tax is 0.3–5%. An optional launch
              schedule begins at 99%, drops one percentage point every selected
              interval, and clamps to the resting rate. The clock starts at
              launch, not deployment.
            </p>
            <div className="guide-table">
              <div>
                <strong>Component</strong>
                <strong>Destination</strong>
              </div>
              <div>
                <span>0.15%, included</span>
                <span>Protocol recipient</span>
              </div>
              <div>
                <span>Resting tax minus 0.15%</span>
                <span>Regular fee recipient</span>
              </div>
              <div>
                <span>Current tax above resting</span>
                <span>Decay fee recipient</span>
              </div>
            </div>
            <p>
              Taxes apply to swap output. The hook converts fees to ETH and
              distributes the proceeds proportionally. Actual ETH proceeds
              depend on conversion prices and rounding. The token owner can
              change each recipient independently, and change the resting tax
              outside active decay.
            </p>
            <p>
              A 99% initial tax leaves 1% of swap output before other costs.
              Review the live rate before trading. Token detail rates are read
              from Ethereum every 15 seconds and include the block number.
            </p>
          </section>
          <section id="permissions">
            <ShieldCheck size={26} />
            <h2>Understand the boundaries.</h2>
            <p>
              Ordinary direct transfers between wallets without code are
              untaxed. Contract-mediated transfers, delegated accounts and other
              transfers are restricted except for owner or approved-distributor
              paths. Smart wallets can connect to this site; that does not make
              their token transfers exempt.
            </p>
            <p>
              Swaps support <strong>exact input only</strong>. Exact-output
              swaps are rejected. Distributor approval does not remove swap
              taxes. This launchpad does not include a swap router or trading
              interface.
            </p>
            <p>
              Owners can approve local distribution contracts, opt into shared
              distributors, enable external liquidity in the canonical pool, and
              permit an ETH-paired token to become a base for new pairs.
              Disabling pairing stops new pairs; existing pairs remain usable.
              Enabling external liquidity never unlocks the initial position.
            </p>
          </section>
          <section id="contracts">
            <h2>Verify the contracts.</h2>
            <p>
              These are the supplied Ethereum mainnet deployments. Launches are
              simulated before a wallet is asked to sign.
            </p>
            <Address value={CONTRACTS.factory} label="Token factory" />
            <Address value={CONTRACTS.hook} label="Shared tax hook" />
            <Address
              value={CONTRACTS.implementation}
              label="Token implementation"
            />
            <div className="button-row">
              <External
                href={`https://sourcify.dev/server/v2/contract/1/${CONTRACTS.factory}?fields=abi,sources`}
              >
                Verified factory source
              </External>
              <External href={explorer(CONTRACTS.hook)}>
                Hook on Etherscan
              </External>
            </div>
          </section>
        </article>
        <aside className="guide-nav">
          <h3>In this guide</h3>
          <a
            href="#/guide"
            onClick={() =>
              document.getElementById("launch-mechanics")?.scrollIntoView()
            }
          >
            Liquidity & supply
          </a>
          <a
            href="#/guide"
            onClick={() =>
              document.getElementById("deployment")?.scrollIntoView()
            }
          >
            Deployment options
          </a>
          <a
            href="#/guide"
            onClick={() => document.getElementById("tax")?.scrollIntoView()}
          >
            Taxes & fee recipients
          </a>
          <a
            href="#/guide"
            onClick={() =>
              document.getElementById("permissions")?.scrollIntoView()
            }
          >
            Owner permissions
          </a>
          <a
            href="#/guide"
            onClick={() =>
              document.getElementById("contracts")?.scrollIntoView()
            }
          >
            Contract addresses
          </a>
        </aside>
      </div>
    </>
  );
}
