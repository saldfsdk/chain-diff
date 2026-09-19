import {
  formatUnits,
  parseAbiItem,
  type Address,
} from 'viem'

import {
  client,
} from './ethereum.js'

import type {
  Activity,
  ActivitySummary,
} from './types.js'

export type {
  Activity,
  ActivitySummary,
} from './types.js'

const AAVE_POOL =
  '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' as Address

const USDC =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

const supplyEvent =
  parseAbiItem(
    'event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)'
  )

const withdrawEvent =
  parseAbiItem(
    'event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)'
  )

const borrowEvent =
  parseAbiItem(
    'event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)'
  )

const repayEvent =
  parseAbiItem(
    'event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)'
  )

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

export async function fetchAaveUsdcActivity(
  fromBlockNumber: number,
  toBlockNumber: number,
): Promise<ActivitySummary> {
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
          AAVE_POOL,

        event:
          supplyEvent,

        args: {
          reserve:
            USDC,
        },

        fromBlock,
        toBlock,
      }),

      client.getLogs({
        address:
          AAVE_POOL,

        event:
          withdrawEvent,

        args: {
          reserve:
            USDC,
        },

        fromBlock,
        toBlock,
      }),

      client.getLogs({
        address:
          AAVE_POOL,

        event:
          borrowEvent,

        args: {
          reserve:
            USDC,
        },

        fromBlock,
        toBlock,
      }),

      client.getLogs({
        address:
          AAVE_POOL,

        event:
          repayEvent,

        args: {
          reserve:
            USDC,
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

  let repaidATokens =
    0

  for (
    const log of
    supplyLogs
  ) {
    const amountRaw =
      log.args.amount

    const user =
      log.args.user

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
      log.args.amount

    const user =
      log.args.user

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
      log.args.amount

    const user =
      log.args.user

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
      log.args.amount

    const repayer =
      log.args.repayer

    const useATokens =
      log.args.useATokens

    if (
      amountRaw ===
        undefined ||
      repayer ===
        undefined ||
      useATokens ===
        undefined
    ) {
      continue
    }

    const amount =
      toUsdc(
        amountRaw
      )

    if (
      useATokens
    ) {
      repaidATokens +=
        amount
    } else {
      repaidUnderlying +=
        amount
    }

    events.push({
      type:
        'REPAY',

      amount,

      address:
        repayer,

      txHash:
        log.transactionHash,

      blockNumber:
        Number(
          log.blockNumber
        ),

      useATokens,
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
