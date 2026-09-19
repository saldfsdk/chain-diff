import {
  formatUnits,
  parseAbi,
  type Address,
} from 'viem'

import {
  client,
  findBlockAtOrBeforeTimestamp,
} from './ethereum.js'

import {
  fetchAaveUsdcSnapshot,
  fetchAaveUsdcSnapshotAtBlock,
  type Snapshot,
} from './aave.js'

import {
  fetchAaveUsdcActivity,
} from './activity.js'

const AAVE_POOL =
  '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' as Address

const DATA_PROVIDER =
  '0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD' as Address

const USDC =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

const RAY =
  10n ** 27n

const dataProviderAbi =
  parseAbi([
    'function getReserveTokensAddresses(address asset) view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)',
  ])

const poolAbi =
  parseAbi([
    'function getReserveNormalizedVariableDebt(address asset) view returns (uint256)',
  ])

const scaledDebtAbi =
  parseAbi([
    'function scaledTotalSupply() view returns (uint256)',
  ])

async function readDebtIndexState(
  blockNumber: bigint,
) {
  const [
    tokenAddresses,
    normalizedIndex,
  ] =
    await Promise.all([
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

  const scaledTotalSupply =
    await client.readContract({
      address:
        variableDebtToken,

      abi:
        scaledDebtAbi,

      functionName:
        'scaledTotalSupply',

      blockNumber,
    })

  return {
    variableDebtToken,
    normalizedIndex,
    scaledTotalSupply,
  }
}

function currentAprEstimate(
  before: Snapshot,
  current: Snapshot,
) {
  const elapsedSeconds =
    current.capturedAt -
    before.capturedAt

  const averageBorrowApr =
    (
      before.borrowApr +
      current.borrowApr
    ) / 2

  return (
    before.totalDebt *
    (
      averageBorrowApr /
      100
    ) *
    (
      elapsedSeconds /
      (
        365 *
        24 *
        60 *
        60
      )
    )
  )
}

async function indexEstimate(
  before: Snapshot,
  current: Snapshot,
) {
  const [
    beforeState,
    currentState,
  ] =
    await Promise.all([
      readDebtIndexState(
        BigInt(
          before.blockNumber
        )
      ),

      readDebtIndexState(
        BigInt(
          current.blockNumber
        )
      ),
    ])

  const averageScaledDebt =
    (
      beforeState.scaledTotalSupply +
      currentState.scaledTotalSupply
    ) / 2n

  const indexChange =
    currentState.normalizedIndex -
    beforeState.normalizedIndex

  const accruedRaw =
    (
      averageScaledDebt *
      indexChange
    ) / RAY

  return {
    estimate:
      Number(
        formatUnits(
          accruedRaw,
          6,
        )
      ),

    beforeIndex:
      beforeState.normalizedIndex,

    currentIndex:
      currentState.normalizedIndex,

    beforeScaledDebt:
      beforeState.scaledTotalSupply,

    currentScaledDebt:
      currentState.scaledTotalSupply,
  }
}

function errorPercent(
  estimate: number,
  actual: number,
) {
  if (
    Math.abs(actual) <
    0.000001
  ) {
    return 0
  }

  return (
    Math.abs(
      estimate -
      actual
    ) /
    Math.abs(
      actual
    )
  ) * 100
}

function money(
  value: number,
) {
  return new Intl.NumberFormat(
    'en-US',
    {
      style:
        'currency',

      currency:
        'USD',

      maximumFractionDigits:
        2,
    },
  ).format(
    value
  )
}

async function testWindow(
  current: Snapshot,
  label: string,
  seconds: number,
) {
  const baselineBlock =
    await findBlockAtOrBeforeTimestamp(
      current.capturedAt -
      seconds
    )

  const before =
    await fetchAaveUsdcSnapshotAtBlock(
      baselineBlock
    )

  const activity =
    await fetchAaveUsdcActivity(
      before.blockNumber + 1,
      current.blockNumber,
    )

  const observedDebtChange =
    current.totalDebt -
    before.totalDebt

  const principalDebtChange =
    activity.borrowed -
    activity.repaidUnderlying -
    activity.repaidATokens

  const impliedNonPrincipalChange =
    observedDebtChange -
    principalDebtChange

  const aprModel =
    currentAprEstimate(
      before,
      current,
    )

  const indexModel =
    await indexEstimate(
      before,
      current,
    )

  console.log('')
  console.log(
    `=== ${label} ===`
  )

  console.log(
    `Blocks: ${before.blockNumber.toLocaleString()} → ${current.blockNumber.toLocaleString()}`
  )

  console.log(
    `Elapsed: ${current.capturedAt - before.capturedAt}s`
  )

  console.log('')

  console.log(
    `Observed debt change       ${money(
      observedDebtChange
    )}`
  )

  console.log(
    `Net principal change       ${money(
      principalDebtChange
    )}`
  )

  console.log(
    `Implied non-principal      ${money(
      impliedNonPrincipalChange
    )}`
  )

  console.log('')
  console.log(
    'CURRENT APR MODEL'
  )

  console.log(
    `Estimate                   ${money(
      aprModel
    )}`
  )

  console.log(
    `Error                      ${money(
      aprModel -
      impliedNonPrincipalChange
    )}`
  )

  console.log(
    `Error %                    ${errorPercent(
      aprModel,
      impliedNonPrincipalChange,
    ).toFixed(4)}%`
  )

  console.log('')
  console.log(
    'DEBT INDEX MODEL'
  )

  console.log(
    `Estimate                   ${money(
      indexModel.estimate
    )}`
  )

  console.log(
    `Error                      ${money(
      indexModel.estimate -
      impliedNonPrincipalChange
    )}`
  )

  console.log(
    `Error %                    ${errorPercent(
      indexModel.estimate,
      impliedNonPrincipalChange,
    ).toFixed(4)}%`
  )

  console.log('')
  console.log(
    `Index before: ${formatUnits(
      indexModel.beforeIndex,
      27,
    )}`
  )

  console.log(
    `Index after:  ${formatUnits(
      indexModel.currentIndex,
      27,
    )}`
  )

  console.log(
    `Scaled debt before: ${formatUnits(
      indexModel.beforeScaledDebt,
      6,
    )}`
  )

  console.log(
    `Scaled debt after:  ${formatUnits(
      indexModel.currentScaledDebt,
      6,
    )}`
  )
}

const current =
  await fetchAaveUsdcSnapshot()

console.log(
  'Aave USDC interest model comparison'
)

console.log(
  `Current block: ${current.blockNumber.toLocaleString()}`
)

await testWindow(
  current,
  '1 HOUR',
  60 * 60,
)

await testWindow(
  current,
  '24 HOURS',
  24 * 60 * 60,
)
