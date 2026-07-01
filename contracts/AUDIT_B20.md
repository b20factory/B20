# B20factory contracts — security audit

## Mainnet-readiness re-verification (2026-07-01)

Fresh full manual pass of the current source (B20TokenFactory, B20FeeHook,
B20FeeSplitter, B20Vesting, B20SwapRouter) + Slither re-run, ahead of the clean
mainnet redeploy. Result: **no new critical/high/medium findings**; all prior fixes
(H-1, M-1, M-2, L-1, L-2, L-3, I-1, I-2) confirmed still present in source. Slither
raw hits are the same benign classes previously triaged (guarded reentrancy,
by-design ETH pushes, intentional tick math).

Branding: `OriginSwapRouter` renamed to `B20SwapRouter` (new file, identical logic,
zero ABI change); OriginPad/Recom interface names + comments in B20 files neutralized.
`deployB20.ts` now deploys `B20SwapRouter`.

New informational notes (no action required for mainnet):
- N-4 (Info): `retrySeed()` covers direct launches only; a bonding-path (`deployToken`)
  seeding failure has no retry and would strand the pool slice. The product only uses
  the direct `launch()` path, so exposure is nil unless the NFT-bonding flow is revived.
- N-5 (Info): if the owner sets `distBps` summing to exactly 10000, `poolAmount` is 0
  and seeding fails silently (token launches poolless). Owner-only configuration.
- N-6 (Info): in `B20FeeSplitter._distribute`, if `creator == platform` AND that address
  has a parked `pending` balance, the double subtraction can underflow and brick
  `distribute()` until `withdraw()` is called. Only reachable for the owner's own
  launches where creator == treasury; public launches unaffected.
- N-7 (Trust, restated): owner can re-point `setRouter` for FUTURE launches' splitters
  (buyback path). Immutable per token once launched; owner-trust only, same class as N-1.

Mainnet checklist:
1. Deploy fresh stack from the clean deployer via `deployB20.ts --network base`
   (hook address re-mined for flags 0x20CC on the mainnet CREATE2 factory).
2. `setFactory` on the hook, `setRouter` on the factory (B20SwapRouter address).
3. CANARY LAUNCH: the B20 precompile on mainnet is probe-verified (getB20Address)
   but no mainnet `createB20` launch has been executed yet — do one real launch +
   buy + sell round-trip before promoting the site to mainnet.
4. Verify hook/factory/launchpad/router on Basescan (the B20 token itself is a
   precompile-minted native asset and does not verify like a normal contract).


Scope: `B20TokenFactory.sol`, `B20FeeHook.sol`, `B20FeeSplitter.sol`, `B20Vesting.sol`
Method: manual review + Slither 0.11.5 (Base Sepolia deployment).
Date: 2026-06-26

## Independent re-audit (2026-06-27) — CONFIRMED CLEAN

A fresh independent pass (full manual read of all 4 contracts + Slither 0.11.5 re-run on
the current source) was done to verify the 2026-06-26 fixes actually landed and to look
for new issues. Result: all prior findings confirmed resolved in the present code; no new
critical/high issues.

Fixes verified in current source:
- H-1: `B20TokenFactory.sol:222` (deployToken) & `:542` (launch) pin
  `beneficiary = (creator == owner() && vestBeneficiary != 0) ? vestBeneficiary : creator`
  — a public creator can never have their vesting redirected.
- M-1: `B20FeeHook.sol:146` `_beforeInitialize` reverts unless `sender == factory`.
- M-2: `B20TokenFactory.sol:122` `MIN_CREATOR_FEE_BPS = 50`, enforced at `:447`
  (`setCreatorFeeBps` requires `>= 50 && <= 100`) — platform can't zero a creator's split.
- L-1: `B20FeeSplitter.sol:57` `pending` pull-balance + `withdraw()`; pushes use
  `call{gas:30000}` and park on failure (one bad recipient can't lock the other's funds).
- L-2: `B20TokenFactory.sol:592` `retrySeed()` (permissionless, idempotent).
- L-3: `B20TokenFactory.sol:638` `_clampTick()`; `startMcWei` clamped before price calc.
- I-2: `B20FeeHook.sol:47` `owner` is `immutable`.

Slither triage (34 raw findings on B20 files): all benign/mitigated —
- "reentrancy" on splitter/factory/hook: every public entry is `nonReentrant`; pushes are
  gas-capped (30000); `creator`/`platform`/`router` are immutable trusted config; the
  V4 `unlockCallback` is gated to `msg.sender == poolManager`.
- "sends eth to arbitrary user" / "dangerous strict equality (== 0)" / "ignores return
  value (swapExactIn in try/catch, V4 initialize/modifyLiquidity)": standard-pattern false
  positives.

New informational notes (not fixed, low impact, recorded for awareness):
- N-1 (Info, trust): `B20FeeHook.setFactory` has no `factory == address(0)` guard, so the
  owner can re-point `factory` at any time. It cannot retroactively alter already-registered
  pools (keyed by poolId), but a new factory could register new pools. Owner-trust only.
- N-2 (Info): the dynamic fee reads LAGGING realized volatility (`lastTickDelta` from the
  previous swap). A trader can pay base fee on a large swap (their own prior tiny swap set a
  low delta) and push the high fee onto the next trader. By design (Clanker-style) and capped
  at 5%, so low impact; just not a hard anti-sniper guarantee.
- N-3 (Info): no automated unit-test suite for the B20 contracts; verification to date is
  Slither + manual review + on-chain E2E on Base Sepolia. Adding unit tests is recommended
  before mainnet promotion for regression safety.

Verdict: contracts are sound for the stated design (admin-less capped token, locked
single-sided pool, fee <= 5% in ETH, no transfer tax, immutable per-token vesting/splitter).
This remains a level-2 review (tooling + manual), not a formal third-party audit (e.g.
CertiK / Trail of Bits) — recommended only if mainnet TVL grows large.

---

## Resolution (2026-06-26) — ALL FIXED + redeployed

All findings fixed and redeployed to Base Sepolia (new stack below), e2e + negative-tested.

- H-1: `launch()`/`deployToken()` now pin `beneficiary = creator`; `vestBeneficiary` can
  only redirect the OWNER's own launches. Verified on-chain: vesting beneficiary == creator.
- M-1: `B20FeeHook` now has a `beforeInitialize` hook (address re-mined to flags 0x20CC)
  that reverts unless `sender == factory`. Verified: a non-factory `initialize` reverts.
- M-2: added `MIN_CREATOR_FEE_BPS = 50` floor enforced in `setCreatorFeeBps`.
- L-1: `B20FeeSplitter.distribute()` now parks a failed push as a pull balance
  (`pending` + `withdraw()`, capped gas) instead of reverting the whole split.
- L-2: per-token seed params stored; permissionless idempotent `retrySeed(token)` re-seeds
  a poolless direct launch.
- L-3: `seedPoolDirect` clamps `startMcWei` to a sane band and clamps the boundary tick
  into the usable range (`_clampTick`), applied to `_createPool` too.
- I-1: exact-input-only kept (it blocks an exact-output fee bypass) + documented in code.
- I-2: `B20FeeHook.owner` is now `immutable`; `FactorySet` / `LaunchDefaultsUpdated`
  address params indexed.

New Base Sepolia deployment (2026-06-26):
- feeHook `0x0783bB68D3a3e4C2f061Da49669EC01f28cEE0CC` (flags 0x20CC)
- tokenFactory `0x30A904ED6D00384b93667d3293587Da4486602a0`
- launchpad `0x0e56e3e9C0C6209F10AdE0A3DED1daf252B7b309`
- swapRouter `0x7960d31705394094a4667ee3dB203455Ce7a1e7E`
- poolManager `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` (unchanged)
- create2Factory `0xA5AB86330F805f39616Bc831c7F32685eE0B663C`, hook salt 3046

E2E: launch (gas 1.45M) -> vesting beneficiary == creator, pool seeded, buy 0.01 ETH ->
3.2M tokens (tradeable). Negative: non-factory `initialize` reverts ("only factory init").

---

## Summary

The core anti-honeypot design holds: tokens are admin-less (initialAdmin = 0), supply
is capped and fully minted at creation, the pool slice is locked with no removal path,
and the only fee is the hook swap fee (<= 5%), paid in ETH. No transfer tax. Slither
found no critical automated issues (reentrancy-events flagged are the benign standard V4
take() pattern; vesting timestamp use is safe for a monthly schedule).

The real risks are centralization / trust footguns in the factory and a pool-seeding
griefing vector. None let a third party steal an existing token's locked liquidity.

| # | Severity | Issue |
|---|----------|-------|
| H-1 | High (trust) | Owner can divert every public creator's 20% vesting via `vestBeneficiary` |
| M-1 | Medium | Anyone can pre-initialize a launch's deterministic pool -> poolless launch (griefing/DoS) |
| M-2 | Medium (trust) | Owner controls `creatorFeeBps` at launch time; a creator can't pick or guarantee their split |
| L-1 | Low | `B20FeeSplitter`: a contract-creator that rejects ETH locks the platform's share too |
| L-2 | Low | Failed pool seeding strands the pool-slice tokens in the factory (poolless, no recovery) |
| L-3 | Low | Extreme `startMcWei` can push the start price out of TickMath range -> poolless launch |
| I-1 | Info | Exact-output swaps revert pool-wide (exact-input-only by design) |
| I-2 | Info | `B20FeeHook.owner` should be immutable; some events lack indexed address params |

---

## H-1 — Owner can divert all public creators' vesting (High, trust)

`launch()` (self-serve creator path) sets the vesting beneficiary from a GLOBAL owner
setting, not from the creator:

```solidity
address beneficiary = vestBeneficiary == address(0) ? creator : vestBeneficiary;
```

`vestBeneficiary` is owner-editable (`setVesting`). If the owner (or a leaked owner key)
sets it to any address, every subsequent public launch mints the 20% vesting slice to
that address instead of the creator. The creator calling `launch()` has no parameter to
override it and no on-call signal that their allocation was redirected. This breaks the
"fair vesting to the creator" guarantee and is a quiet value-diversion / rug vector.

Recommendation: in the public `launch()` path, hard-pin `beneficiary = creator` and do
NOT consult `vestBeneficiary`. Keep `vestBeneficiary` (if needed) only for the owner's
own `ownerDirect` launches, or drop it from the self-serve path entirely. This makes
creator vesting trustless regardless of owner state.

## M-1 — Pre-initializable pool griefing (Medium)

The pool key is fully deterministic (currency0 = ETH, currency1 = predicted token,
fee 0, tickSpacing 60, hooks = feeHook), and the token address is derivable in advance
(`getB20Address(ASSET, factory, keccak(synId, factory))`, `synId = keccak(creator, nonce,
factory)`). V4 `initialize` is permissionless and the hook does not set `beforeInitialize`.
An attacker who predicts a creator's next launch can call `poolManager.initialize` first;
the factory's `initialize` then reverts, is swallowed by the `try/catch`, and the token
launches with no seeded liquidity (untradeable). This is griefing/DoS, not theft.

Recommendation: add a `beforeInitialize` hook permission that reverts unless the caller
is the factory, or have the factory detect an existing pool and seed into it instead of
re-initializing. At minimum, surface the seeding failure to the UI (currently silent).

## M-2 — Owner-controlled fee split at launch (Medium, trust)

`creatorFeeBps` (creator vs platform split of swap fees) is read into the immutable
`B20FeeSplitter` at launch time from an owner-editable default. A creator cannot choose
their split and the owner could set it to 0 immediately before a creator launches,
sending 100% of swap fees to the platform. Per-token immutability protects already-
launched tokens, but not the token being launched.

Recommendation: let the creator pass their fee split (bounded), or enforce a creator
floor (e.g. >= 50%) in the contract so the platform default can't zero it out.

## L-1 — Splitter lock if creator rejects ETH (Low)

`B20FeeSplitter.distribute()` pays platform then creator; both via `require(ok)`. A
contract-creator that reverts on receive bricks the whole `distribute`, locking the
platform's share too. Creator mostly self-harms, but platform funds for that token are
stuck. Recommendation: pull-payment (per-recipient claimable balances) or skip-on-fail
with escrow.

## L-2 — Stranded tokens on failed seeding (Low)

If `seedPoolDirect` fails (see M-1 / L-3), `poolAmount` tokens stay in the factory with
no recovery path (the factory has no token-sweep). The token is poolless and those
tokens are stuck forever. No user-fund risk. Recommendation: an owner rescue for the
no-pool case, or re-seed retry.

## L-3 — Unbounded startMc -> out-of-range price (Low)

`seedPoolDirect` computes `sqrtPriceX96` from `startMcWei` with no range clamp. Extreme
values can push the price outside `TickMath`'s valid range and revert (caught -> poolless
launch). Recommendation: clamp `startMcWei` to a sane band before the price calc.

## I-1 — Exact-output swaps blocked (Info)

`_beforeSwap` does `require(params.amountSpecified < 0, "exact-input only")`, reverting
ALL exact-output swaps pool-wide. Intended, but aggregators/routers that quote exact-out
will fail to route. Document this for integrators.

## I-2 — Minor hygiene (Info)

- `B20FeeHook.owner` is never reassigned -> mark `immutable` (gas + clarity).
- `FactorySet`, `LaunchDefaultsUpdated` have address params but none indexed.
- `B20FeeHook` could `is IB20FeeHook` for type safety (Slither missing-inheritance).

---

## Not issues (verified)

- Locked liquidity: the seeded V4 position is owned by the factory with no
  `modifyLiquidity(negative)` path anywhere -> liquidity is genuinely locked. The owner
  has no function to pull it.
- Admin-less token: `initialAdmin = address(0)`, cap locked to TOTAL_SUPPLY, full supply
  minted at creation -> not mintable/pausable/freezable.
- Reentrancy: `launch`/`deployToken` are `nonReentrant`; `unlockCallback` is gated to
  `msg.sender == poolManager`; the self-call seeding pattern does not re-enter the guard.
- Per-token immutability: `setVesting/setCreatorFeeBps/setDynamicMaxFeeBps/updateAddresses`
  affect FUTURE launches only; already-launched tokens are frozen.
- `ownerDirect` distribution is gated to `creator == owner()`, so the owner cannot
  redirect other creators' supply via the recipient list.
