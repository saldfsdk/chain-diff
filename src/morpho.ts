import {
  formatUnits,
  parseAbiItem,
  type Address,
} from 'viem'

import type {
  MarketId,
} from '@morpho-org/blue-sdk'

import {
  fetchMarket,
  fetchMarketParams,
} from '@morpho-org/blue-sdk-viem'

import {
  client,
} from './ethereum.js'

import type {
  Activity,
  ActivitySummary,
  ProtocolAdapter,
  Snapshot,
} from './types.js'

const MORPHO_BLUE =
  '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as Address

const USDC =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

export const MORPHO_WSTETH_USDC_MARKET_ID =
  '0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc' as MarketId

const supplyEvent =
  parseAbiItem(
    'event Supply(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)'
  )

const withdrawEvent =
  parseAbiItem(
    'event Withdraw(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)'
  )

const borrowEvent =
  parseAbiItem(
    'event Borrow(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)'
  )

const repayEvent =
  parseAbiItem(
    'event Repay(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)'
  )

export function parseMorphoMarketId(
  value: string,
): MarketId {
  if (
    !/^0x[0-9a-fA-F]{64}$/.test(
      value
    )
  ) {
    throw new Error(
      `Invalid Morpho market ID: ${value}`
    )
  }

  return value as MarketId
}

function toUsdc(
  value: bigint,
) {
  return Number(
    formatUnits(
      value,
      6,
    )
  )
}

function wadPercent(
  value: bigint,
) {
  return (
    Number(
      formatUnits(
        value,
        18,
      )
    ) * 100
  )
}

/*
 * Morpho SDK exposes effective APY as a decimal:
 *
 * 0.05 = 5% APY
 *
 * Our common Snapshot currently uses APR-style
 * annual percentage rates, so convert the APY
 * to an equivalent per-second-compounded APR.
 */
function apyToAprPercent(
  apy: number,
) {
  if (apy === 0) {
    return 0
  }

  const secondsPerYear =
    365 * 24 * 60 * 60

  const ratePerSecond =
    Math.expm1(
      Math.log1p(apy) /
      secondsPerYear
    )

  return (
    ratePerSecond *
    secondsPerYear *
    100
  )
}

export function createMorphoUsdcAdapter(
  marketIdInput: string,
  targetOverride?: string,
  labelOverride?: string,
): ProtocolAdapter {
  const marketId =
    parseMorphoMarketId(
      marketIdInput
    )

  const target =
    targetOverride ??
    `morpho:${marketId.toLowerCase()}`

  const label =
    labelOverride ??
    `Morpho Blue / Ethereum / USDC / ${shortMarketId(
      marketId
    )}`

  let validation:
    Promise<void> |
    undefined

  async function ensureUsdcMarket() {
    validation ??=
      (async () => {
        const params =
          await fetchMarketParams(
            marketId,
            client,
          )

        if (
          params.loanToken
            .toLowerCase() !==
          USDC.toLowerCase()
        ) {
          throw new Error(
            [
              'This MVP currently supports',
              'only Morpho markets whose',
              'loan token is Ethereum USDC.',
              '',
              `Market: ${marketId}`,
              `Loan token: ${params.loanToken}`,
            ].join(' ')
          )
        }
      })()

    await validation
  }

  async function buildSnapshot(
    blockNumber: bigint,
  ): Promise<Snapshot> {
    await ensureUsdcMarket()

    const [
      block,
      market,
    ] =
      await Promise.all([
        client.getBlock({
          blockNumber,
        }),

        fetchMarket(
          marketId,
          client,
          {
            blockNumber,
          },
        ),
      ])

    /*
     * fetchMarket returns the stored market state.
     * Accrue it locally to the timestamp of the
     * requested historical block.
     */
    const accrued =
      market.accrueInterest(
        block.timestamp
      )

    return {
      target,

      capturedAt:
        Number(
          block.timestamp
        ),

      blockNumber:
        Number(
          blockNumber
        ),

      availableLiquidity:
        toUsdc(
          accrued.liquidity
        ),

      totalSupply:
        toUsdc(
          accrued.totalSupplyAssets
        ),

      totalDebt:
        toUsdc(
          accrued.totalBorrowAssets
        ),

      utilization:
        wadPercent(
          accrued.utilization
        ),

      supplyApr:
        apyToAprPercent(
          accrued.getSupplyApy(
            block.timestamp
          )
        ),

      borrowApr:
        apyToAprPercent(
          accrued.getBorrowApy(
            block.timestamp
          )
        ),
    }
  }

  async function fetchCurrentSnapshot() {
    const latest =
      await client.getBlock({
        blockTag:
          'latest',
      })

    if (
      latest.number === null
    ) {
      throw new Error(
        'Latest block has no number.'
      )
    }

    return buildSnapshot(
      latest.number
    )
  }

  async function fetchSnapshotAtBlock(
    blockNumber: bigint,
  ) {
    return buildSnapshot(
      blockNumber
    )
  }

  async function fetchActivity(
    fromBlockNumber: number,
    toBlockNumber: number,
  ): Promise<ActivitySummary> {
    await ensureUsdcMarket()

    const fromBlock =
      BigInt(
        fromBlockNumber
      )

    const toBlock =
      BigInt(
        toBlockNumber
      )

    const [
      supplyLogs,
      withdrawLogs,
      borrowLogs,
      repayLogs,
    ] =
      await Promise.all([
        client.getLogs({
          address:
            MORPHO_BLUE,

          event:
            supplyEvent,

          args: {
            id:
              marketId,
          },

          fromBlock,
          toBlock,
        }),

        client.getLogs({
          address:
            MORPHO_BLUE,

          event:
            withdrawEvent,

          args: {
            id:
              marketId,
          },

          fromBlock,
          toBlock,
        }),

        client.getLogs({
          address:
            MORPHO_BLUE,

          event:
            borrowEvent,

          args: {
            id:
              marketId,
          },

          fromBlock,
          toBlock,
        }),

        client.getLogs({
          address:
            MORPHO_BLUE,

          event:
            repayEvent,

          args: {
            id:
              marketId,
          },

          fromBlock,
          toBlock,
        }),
      ])

    const events:
      Activity[] =
      []

    let supplied =
      0

    let withdrawn =
      0

    let borrowed =
      0

    let repaidUnderlying =
      0

    for (
      const log of
      supplyLogs
    ) {
      const amountRaw =
        log.args.assets

      const user =
        log.args.onBehalf

      if (
        amountRaw ===
          undefined ||
        user ===
          undefined
      ) {
        continue
      }

      const amount =
        toUsdc(
          amountRaw
        )

      supplied +=
        amount

      events.push({
        type:
          'SUPPLY',

        amount,

        address:
          user,

        txHash:
          log.transactionHash,

        blockNumber:
          Number(
            log.blockNumber
          ),
      })
    }

    for (
      const log of
      withdrawLogs
    ) {
      const amountRaw =
        log.args.assets

      const user =
        log.args.onBehalf

      if (
        amountRaw ===
          undefined ||
        user ===
          undefined
      ) {
        continue
      }

      const amount =
        toUsdc(
          amountRaw
        )

      withdrawn +=
        amount

      events.push({
        type:
          'WITHDRAW',

        amount,

        address:
          user,

        txHash:
          log.transactionHash,

        blockNumber:
          Number(
            log.blockNumber
          ),
      })
    }

    for (
      const log of
      borrowLogs
    ) {
      const amountRaw =
        log.args.assets

      const user =
        log.args.onBehalf

      if (
        amountRaw ===
          undefined ||
        user ===
          undefined
      ) {
        continue
      }

      const amount =
        toUsdc(
          amountRaw
        )

      borrowed +=
        amount

      events.push({
        type:
          'BORROW',

        amount,

        address:
          user,

        txHash:
          log.transactionHash,

        blockNumber:
          Number(
            log.blockNumber
          ),
      })
    }

    for (
      const log of
      repayLogs
    ) {
      const amountRaw =
        log.args.assets

      const user =
        log.args.onBehalf

      if (
        amountRaw ===
          undefined ||
        user ===
          undefined
      ) {
        continue
      }

      const amount =
        toUsdc(
          amountRaw
        )

      repaidUnderlying +=
        amount

      events.push({
        type:
          'REPAY',

        amount,

        address:
          user,

        txHash:
          log.transactionHash,

        blockNumber:
          Number(
            log.blockNumber
          ),

        useATokens:
          false,
      })
    }

    events.sort(
      (
        a,
        b,
      ) =>
        b.amount -
        a.amount
    )

    const repaidATokens =
      0

    const netLiquidityFlow =
      supplied +
      repaidUnderlying -
      withdrawn -
      borrowed

    return {
      supplied,
      withdrawn,
      borrowed,
      repaidUnderlying,
      repaidATokens,
      netLiquidityFlow,
      events,
    }
  }

  return {
    target,
    label,
    fetchCurrentSnapshot,
    fetchSnapshotAtBlock,
    fetchActivity,
  }
}

function shortMarketId(
  id: string,
) {
  return `${id.slice(
    0,
    10
  )}...${id.slice(
    -6
  )}`
}
