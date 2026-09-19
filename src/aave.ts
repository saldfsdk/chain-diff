import {
  formatUnits,
  parseAbi,
  type Address,
} from 'viem'

import {
  client,
} from './ethereum.js'

import type {
  Snapshot,
} from './types.js'

export type {
  Snapshot,
} from './types.js'

const AAVE_POOL =
  '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' as Address

const DATA_PROVIDER =
  '0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD' as Address

const USDC =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

const A_USDC =
  '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c' as Address

const USDC_DECIMALS =
  6

const dataProviderAbi =
  parseAbi([
    'function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)',
    'function getReserveTokensAddresses(address asset) view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)',
  ])

const erc20Abi =
  parseAbi([
    'function balanceOf(address account) view returns (uint256)',
  ])

const poolAbi =
  parseAbi([
    'function getReserveNormalizedVariableDebt(address asset) view returns (uint256)',
  ])

const scaledDebtAbi =
  parseAbi([
    'function scaledTotalSupply() view returns (uint256)',
  ])

function toUsdc(
  value: bigint,
) {
  return Number(
    formatUnits(
      value,
      USDC_DECIMALS,
    )
  )
}

function rayToNumber(
  value: bigint,
) {
  return Number(
    formatUnits(
      value,
      27,
    )
  )
}

function rayToPercent(
  value: bigint,
) {
  return (
    rayToNumber(
      value
    ) * 100
  )
}

async function buildSnapshot(
  blockNumber: bigint,
  capturedAt: number,
): Promise<Snapshot> {
  const [
    reserve,
    availableRaw,
    tokenAddresses,
    normalizedDebtIndex,
  ] =
    await Promise.all([
      client.readContract({
        address:
          DATA_PROVIDER,

        abi:
          dataProviderAbi,

        functionName:
          'getReserveData',

        args: [
          USDC,
        ],

        blockNumber,
      }),

      client.readContract({
        address:
          USDC,

        abi:
          erc20Abi,

        functionName:
          'balanceOf',

        args: [
          A_USDC,
        ],

        blockNumber,
      }),

      client.readContract({
        address:
          DATA_PROVIDER,

        abi:
          dataProviderAbi,

        functionName:
          'getReserveTokensAddresses',

        args: [
          USDC,
        ],

        blockNumber,
      }),

      client.readContract({
        address:
          AAVE_POOL,

        abi:
          poolAbi,

        functionName:
          'getReserveNormalizedVariableDebt',

        args: [
          USDC,
        ],

        blockNumber,
      }),
    ])

  const variableDebtToken =
    tokenAddresses[2] as Address

  const scaledDebtRaw =
    await client.readContract({
      address:
        variableDebtToken,

      abi:
        scaledDebtAbi,

      functionName:
        'scaledTotalSupply',

      blockNumber,
    })

  const totalSupply =
    toUsdc(
      reserve[2]
    )

  const totalDebt =
    toUsdc(
      reserve[4]
    )

  const availableLiquidity =
    toUsdc(
      availableRaw
    )

  const utilization =
    totalSupply === 0
      ? 0
      : (
          totalDebt /
          totalSupply
        ) * 100

  return {
    target:
      'aave:usdc',

    capturedAt,

    blockNumber:
      Number(
        blockNumber
      ),

    availableLiquidity,
    totalSupply,
    totalDebt,
    utilization,

    supplyApr:
      rayToPercent(
        reserve[5]
      ),

    borrowApr:
      rayToPercent(
        reserve[6]
      ),

    interestIndex: {
      index:
        rayToNumber(
          normalizedDebtIndex
        ),

      scaledDebt:
        toUsdc(
          scaledDebtRaw
        ),
    },
  }
}

export async function fetchAaveUsdcSnapshot():
Promise<Snapshot> {
  const block =
    await client.getBlock({
      blockTag:
        'latest',
    })

  if (
    block.number === null
  ) {
    throw new Error(
      'Latest block has no block number.'
    )
  }

  return buildSnapshot(
    block.number,
    Number(
      block.timestamp
    ),
  )
}

export async function fetchAaveUsdcSnapshotAtBlock(
  blockNumber: bigint,
): Promise<Snapshot> {
  const block =
    await client.getBlock({
      blockNumber,
    })

  return buildSnapshot(
    blockNumber,
    Number(
      block.timestamp
    ),
  )
}
