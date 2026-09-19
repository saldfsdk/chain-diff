# chain-diff

Git diff for onchain state.

`chain-diff` is a CLI for explaining how lending protocol state changed over time — not just what changed, but why.

Currently supports:

- Aave V3 / Ethereum / USDC
- Morpho Blue / Ethereum / USDC / wstETH
- Generic Morpho Blue USDC markets by Market ID

## Features

- Compare current and historical onchain state
- Explain liquidity and debt changes
- Attribute changes to supply, withdrawals, borrowing, repayments, and interest
- Compare protocols over the same Ethereum block window
- Normalize changes by protocol size
- Continuously watch markets for new changes
- Filter watch output by liquidity/debt thresholds
- JSON / JSONL output for automation

## Requirements

- Node.js 20+
- Ethereum RPC access

`chain-diff` can use its default RPC transport, or you can provide your own endpoint:

```powershell
$env:ETH_RPC_URL="https://your-ethereum-rpc.example"
```

## Install

From the project directory:

```bash
npm install
npm run build
npm link
```

Then:

```bash
chain-diff --help
```

## Targets

```bash
chain-diff targets
```

Example:

```text
aave:usdc
morpho:wsteth-usdc
```

A generic Morpho Blue market can also be addressed with:

```text
morpho:<market-id>
```

## Diff

Inspect how a market changed over a time window:

```bash
chain-diff diff aave:usdc --since 1h
```

## Why

Explain the causes behind a state change:

```bash
chain-diff why aave:usdc --since 24h
```

JSON output:

```bash
chain-diff why aave:usdc --since 24h --json
```

Compact JSON without the full event list:

```bash
chain-diff why aave:usdc --since 24h --json --summary
```

## Compare

Compare two markets using the exact same Ethereum block window:

```bash
chain-diff compare aave:usdc morpho:wsteth-usdc --since 24h
```

The comparison includes:

- Liquidity change
- Debt change
- Relative percentage change
- Utilization
- Supply APR
- Borrow APR
- Gross activity
- Activity relative to starting supply
- Causal attribution
- Interest model
- Confidence

JSON output:

```bash
chain-diff compare aave:usdc morpho:wsteth-usdc --since 24h --json
```

## Watch

Continuously monitor new onchain changes:

```bash
chain-diff watch aave:usdc --interval 30s
```

Run one interval only:

```bash
chain-diff watch aave:usdc --interval 15s --once
```

Only show intervals with at least $100,000 of liquidity movement:

```bash
chain-diff watch aave:usdc --interval 30s --min-liquidity 100000
```

Debt threshold:

```bash
chain-diff watch aave:usdc --interval 30s --min-debt 100000
```

## JSONL Watch

`watch --json` emits machine-readable JSON Lines.

```bash
chain-diff watch aave:usdc --interval 30s --json
```

This can be piped into other tools, databases, webhooks, or monitoring systems.

PowerShell example:

```powershell
chain-diff watch aave:usdc --interval 15s --once --json 2>$null |
  ConvertFrom-Json |
  Select-Object type, status, target
```

## Analysis model

For liquidity, `chain-diff` attributes observed changes to normalized protocol events such as:

- Supply
- Withdraw
- Borrow
- Repay

For debt, it separates:

- Principal changes from borrow/repay activity
- Accrued interest

Aave V3 currently uses its variable debt index for interest attribution.

Morpho Blue currently uses an average-APR approximation.

Residual unexplained change is used as part of the confidence calculation.

## Development

Type check:

```bash
npx tsc --noEmit
```

Tests:

```bash
npm test
```

Build:

```bash
npm run build
```

Current automated tests cover causal analysis, interest models, normalized metrics, and numerical noise handling.

## Status

Early MVP.

The current focus is lending-market state semantics and causal explanation. The longer-term direction is a reusable semantic layer for answering:

> What changed onchain, and why?
