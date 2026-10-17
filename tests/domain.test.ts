import test from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, encodeFunctionData, zeroAddress } from "viem";
import {
  allocation,
  bps,
  decayDuration,
  decayRate,
  feeSplit,
  INITIAL_DRAFT,
  makeConfig,
  units,
  validateDraft,
  validRecipient,
} from "../src/domain.ts";
import { CONTRACTS } from "../src/config.ts";
import { factoryAbi } from "../src/contracts/abis.ts";
import fullFactoryAbi from "../src/contracts/factory.json" with { type: "json" };

test("one percentage point per completed interval, with fractional resting clamp", () => {
  assert.equal(decayRate(30, 60, 59), 9900);
  assert.equal(decayRate(30, 60, 60), 9800);
  assert.equal(decayRate(30, 60, 98 * 60), 100);
  assert.equal(decayRate(30, 60, 99 * 60), 30);
  assert.equal(decayRate(300, 60, 96 * 60), 300);
  assert.equal(decayDuration(30, 60), 5940);
  assert.equal(decayRate(300, 60, 100000, false), 300);
});
test("tax components include protocol, and sum exactly to current tax", () => {
  for (const resting of [30, 300, 500])
    for (const current of [resting, 9900]) {
      const split = feeSplit(resting, current);
      assert.equal(split.protocol, 15);
      assert.equal(split.protocol + split.regular + split.decay, current);
    }
});
test("supply allocation uses integers and rounds creator share down", () => {
  assert.deepEqual(allocation(101n, 20), { creator: 20n, liquidity: 81n });
  assert.deepEqual(allocation(101n, 0), { creator: 0n, liquidity: 101n });
});
test("prices respect quote decimals and never silently round excess precision", () => {
  assert.equal(units("1.25", 6), 1250000n);
  assert.equal(units("0.000000001", 18), 1000000000n);
  assert.throws(() => units("0.0000001", 6));
  for (const invalid of ["0", "-1", "Infinity", "1e3", "1,000", "NaN"])
    assert.throws(() => units(invalid, 18));
});
test("required fields and irreversible configuration bounds are enforced", () => {
  assert.equal(Object.keys(validateDraft(INITIAL_DRAFT)).length, 2);
  const valid = { ...INITIAL_DRAFT, name: "Test only", symbol: "TEST" };
  assert.deepEqual(validateDraft(valid), {});
  for (const tax of ["0.29", "5.01", "0.333", "NaN"])
    assert.ok(validateDraft({ ...valid, tax }).tax);
  assert.ok(validateDraft({ ...valid, allocation: 21 }).allocation);
  assert.ok(validateDraft({ ...valid, decay: true, interval: "0" }).interval);
  assert.ok(validateDraft({ ...valid, decay: true, interval: "1.5" }).interval);
  assert.ok(
    validateDraft({ ...valid, decay: true, interval: "4294967296" }).interval,
  );
  assert.ok(validateDraft({ ...valid, customRecipients: true }).recipient);
  assert.ok(
    validateDraft({ ...valid, base: "custom", customBase: zeroAddress })
      .customBase,
  );
});
test("platform contracts and the native-currency sentinel cannot receive fees", () => {
  assert.equal(validRecipient(zeroAddress), false);
  for (const address of Object.values(CONTRACTS))
    assert.equal(validRecipient(address), false);
});
test("launch calldata decodes against the complete verified factory ABI", () => {
  // Deterministic fixture address exists only in tests; no fixture is included in application data.
  const owner = "0x1234567890123456789012345678901234567890";
  const config = makeConfig(
    {
      ...INITIAL_DRAFT,
      name: "Test only",
      symbol: "TEST",
      decay: true,
      allocation: 20,
    },
    owner,
  );
  assert.equal(config.owner, owner);
  assert.equal(config.feeRecipient, owner);
  assert.equal(config.feeDecayRecipient, owner);
  assert.equal(config.lpSupply, 800000000n * 10n ** 18n);
  assert.equal(config.taxBps, 300);
  assert.equal(config.launchTaxBps, 9900);
  assert.equal(config.hook, CONTRACTS.hook);
  assert.equal(config.quoteToken, zeroAddress);
  const data = encodeFunctionData({
    abi: factoryAbi,
    functionName: "createAndLaunchAtPrice",
    args: [config, 2000, 1000000000n],
  });
  const decoded = decodeFunctionData({
    abi: fullFactoryAbi,
    functionName: "createAndLaunchAtPrice",
    data,
  });
  assert.equal(decoded.functionName, "createAndLaunchAtPrice");
  assert.equal(decoded.args?.[1], 2000);
  assert.equal(decoded.args?.[2], 1000000000n);
});
