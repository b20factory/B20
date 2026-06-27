# B20factory

A permissionless token launchpad on Base. Launch a B20 token in one transaction:
admin-less tokens, supply capped at birth, a single-sided liquidity pool locked
forever, and a dynamic swap fee that never goes past 5%. Built so it cannot rug
and is never honeypot-flagged.

Live: https://b20factory.xyz

## What makes a B20 launch clean

- One transaction to launch. No multi-step bonding.
- The token is admin-less (no mint, pause, or freeze authority). Supply is capped
  and fully minted at creation.
- The pool slice is seeded single-sided and locked, with no removal path.
- The only fee is the swap fee, charged in ETH by the hook, between 1% and 5%.
  It floats with realized volatility (calm market sits at the base, volatile
  market ramps toward the cap), so a simulator never sees a tax above 5%.
- No transfer tax on the token.
- Optional creator vesting (default 20% of supply, released monthly) and a
  creator/platform fee split.

## Structure

```
frontend/    Next.js 14 app (the b20factory.xyz site). wagmi v2 + viem, Tailwind.
contracts/   The B20 core contracts (Solidity 0.8.26, Hardhat) + audit + scripts.
```

### Contracts

| File | Role |
|---|---|
| `B20TokenFactory.sol` | `launch()` deploys an admin-less B20 token and seeds a single-sided V4 pool in one tx. Handles vesting and the fee splitter. |
| `B20FeeHook.sol` | Uniswap V4 hook. Charges the ETH swap fee with a Clanker-style dynamic rate (1% to 5%), gates pool init to the factory. |
| `B20FeeSplitter.sol` | One per token. Splits swap fees between creator and platform. Creator can receive ETH, the bought-back token, or both. Pull-payment fallback. |
| `B20Vesting.sol` | One per token. Immutable monthly vesting of the creator slice. No admin, no early release. |

The security review is in [`contracts/AUDIT_B20.md`](contracts/AUDIT_B20.md)
(manual review + Slither, level-2; not a formal third-party audit).

> Note: the contracts here depend on the Uniswap V4 and OpenZeppelin packages
> (installed via npm). They compile standalone; the broader app wiring
> (collection entrypoint, swap router) lives with the deployed stack.

## Running

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # fill in your values
npm install
npm run dev                        # http://localhost:3010
```

### Contracts

```bash
cd contracts
cp .env.example .env               # fill in keys (never commit .env)
npm install
npm run compile
```

## Deployed addresses (Base Sepolia testnet)

| Contract | Address |
|---|---|
| Launchpad | `0x0e56e3e9C0C6209F10AdE0A3DED1daf252B7b309` |
| TokenFactory | `0x35deBD09cA16f264DC37506C4A58a5b85AD9fD16` |
| FeeHook | `0x0783bB68D3a3e4C2f061Da49669EC01f28cEE0CC` |
| SwapRouter | `0x7960d31705394094a4667ee3dB203455Ce7a1e7E` |
| PoolManager | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |

## Disclaimer

Experimental software. Use at your own risk. Nothing here is financial advice.
