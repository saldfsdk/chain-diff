import {
  client,
  findBlockAtOrBeforeTimestamp,
} from './ethereum.js'

import {
  getAdapter,
} from './adapters.js'

import {
  buildWhyAnalysis,
  type WhyAnalysis,
} from './analyze.js'

import type {
  ProtocolAdapter,
} from './types.js'

import {
  buildNormalizedMetrics,
} from './normalized.js'

export type TargetComparison = {
  target: string
  label: string

  current: {
    liquidity: number
    supply: number
    debt: number
    utilization: number
    supplyApr: number
    borrowApr: number
  }

  change: WhyAnalysis['stateChange']

  activity: Omit<
    WhyAnalysis['activity'],
    'events'
  >

  attribution:
    WhyAnalysis['attribution']

  normalized: {
    liquidityChangePct: number | null
    debtChangePct: number | null

    grossActivityVolume: number
    grossActivityPctOfStartingSupply: number | null

    liquidityResidualPct: number | null
    debtResidualPct: number | null
  }

  explanation:
    WhyAnalysis['explanation']
}

export type ComparisonResult = {
  requestedWindow: string

  from: {
    blockNumber: number
    timestamp: number
  }

  to: {
    blockNumber: number
    timestamp: number
  }

  elapsedSeconds: number

  targets: TargetComparison[]
}

function parseDuration(
  value: string,
) {
  const match =
    /^(\d+(?:\.\d+)?)(s|m|h|d)$/i.exec(
      value.trim()
    )

  if (!match) {
    throw new Error(
      [
        `Invalid duration: ${value}`,
        'Examples: 30s, 10m, 1h, 24h, 7d',
      ].join('\n')
    )
  }

  const amount =
    Number(
      match[1]
    )

  const unit =
    match[2].toLowerCase()

  const multiplier =
    unit === 's'
      ? 1
      : unit === 'm'
        ? 60
        : unit === 'h'
          ? 60 * 60
          : 24 * 60 * 60

  return Math.round(
    amount *
    multiplier
  )
}

function percentOf(
  value: number,
  base: number,
): number | null {
  if (
    Math.abs(base) <
    0.000001
  ) {
    return null
  }

  return (
    value /
    base
  ) * 100
}

function residualPercent(
  residual: number,
  observed: number,
): number | null {
  if (
    Math.abs(observed) <
    0.000001
  ) {
    return null
  }

  return (
    Math.abs(residual) /
    Math.abs(observed)
  ) * 100
}

async function analyzeTarget(
  adapter: ProtocolAdapter,
  beforeBlock: bigint,
  currentBlock: bigint,
  requestedWindow: string,
): Promise<TargetComparison> {
  const [
    before,
    current,
    activity,
  ] =
    await Promise.all([
      adapter.fetchSnapshotAtBlock(
        beforeBlock
      ),

      adapter.fetchSnapshotAtBlock(
        currentBlock
      ),

      adapter.fetchActivity(
        Number(
          beforeBlock
        ) + 1,

        Number(
          currentBlock
        ),
      ),
    ])

  const analysis =
    buildWhyAnalysis(
      before,
      current,
      activity,
      requestedWindow,
    )

  const {
    events: _events,
    ...activitySummary
  } =
    analysis.activity

  const normalized =
    buildNormalizedMetrics({
      startingLiquidity:
        before.availableLiquidity,

      startingDebt:
        before.totalDebt,

      startingSupply:
        before.totalSupply,

      liquidityChange:
        analysis.stateChange.liquidity,

      debtChange:
        analysis.stateChange.debt,

      grossSupplyWithdrawVolume:
        analysis.activity.grossSupplyWithdrawVolume,

      grossBorrowRepayVolume:
        analysis.activity.grossBorrowRepayVolume,

      liquidityResidual:
        analysis.attribution.liquidity.residual,

      debtResidual:
        analysis.attribution.debt.residual,
    })

  return {
    target:
      adapter.target,

    label:
      adapter.label,

    current: {
      liquidity:
        current.availableLiquidity,

      supply:
        current.totalSupply,

      debt:
        current.totalDebt,

      utilization:
        current.utilization,

      supplyApr:
        current.supplyApr,

      borrowApr:
        current.borrowApr,
    },

    change:
      analysis.stateChange,

    activity:
      activitySummary,

    attribution:
      analysis.attribution,

    normalized,

    explanation:
      analysis.explanation,
  }
}

export async function compareTargets(
  firstTarget: string,
  secondTarget: string,
  requestedWindow: string,
): Promise<ComparisonResult> {
  const seconds =
    parseDuration(
      requestedWindow
    )

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

  const currentBlock =
    latest.number

  const currentTimestamp =
    Number(
      latest.timestamp
    )

  const targetTimestamp =
    currentTimestamp -
    seconds

  console.error(
    'Finding shared historical Ethereum block...'
  )

  const beforeBlock =
    await findBlockAtOrBeforeTimestamp(
      targetTimestamp
    )

  const beforeBlockData =
    await client.getBlock({
      blockNumber:
        beforeBlock,
    })

  console.error(
    `Shared blocks: ${beforeBlock.toLocaleString()} → ${currentBlock.toLocaleString()}`
  )

  console.error(
    'Analyzing both protocols...'
  )

  const firstAdapter =
    getAdapter(
      firstTarget
    )

  const secondAdapter =
    getAdapter(
      secondTarget
    )

  const [
    first,
    second,
  ] =
    await Promise.all([
      analyzeTarget(
        firstAdapter,
        beforeBlock,
        currentBlock,
        requestedWindow,
      ),

      analyzeTarget(
        secondAdapter,
        beforeBlock,
        currentBlock,
        requestedWindow,
      ),
    ])

  return {
    requestedWindow,

    from: {
      blockNumber:
        Number(
          beforeBlock
        ),

      timestamp:
        Number(
          beforeBlockData.timestamp
        ),
    },

    to: {
      blockNumber:
        Number(
          currentBlock
        ),

      timestamp:
        currentTimestamp,
    },

    elapsedSeconds:
      currentTimestamp -
      Number(
        beforeBlockData.timestamp
      ),

    targets: [
      first,
      second,
    ],
  }
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

function signedMoney(
  value: number,
) {
  if (
    Math.abs(
      value
    ) < 0.005
  ) {
    return '$0.00'
  }

  return (
    (
      value > 0
        ? '+'
        : ''
    ) +
    money(
      value
    )
  )
}

function percent(
  value: number,
) {
  return (
    value.toFixed(
      2
    ) +
    '%'
  )
}

function signedPercent(
  value: number | null,
) {
  if (
    value === null
  ) {
    return 'n/a'
  }

  if (
    Math.abs(
      value
    ) < 0.005
  ) {
    return '0.00%'
  }

  const sign =
    value > 0
      ? '+'
      : ''

  return (
    sign +
    value.toFixed(
      2
    ) +
    '%'
  )
}

function plainPercent(
  value: number | null,
) {
  if (
    value === null
  ) {
    return 'n/a'
  }

  return (
    value.toFixed(
      2
    ) +
    '%'
  )
}

function signedPoints(
  value: number,
) {
  if (
    Math.abs(
      value
    ) < 0.000001
  ) {
    return '0.00 pp'
  }

  return (
    (
      value > 0
        ? '+'
        : ''
    ) +
    value.toFixed(
      2
    ) +
    ' pp'
  )
}

function cell(
  value: string,
  width = 22,
) {
  return value.padStart(
    width
  )
}

function metric(
  label: string,
  first: string,
  second: string,
) {
  console.log(
    `${label.padEnd(
      24
    )}${cell(
      first
    )}${cell(
      second
    )}`
  )
}

function printDrivers(
  title: string,
  analysis: TargetComparison,
  section:
    | 'liquidity'
    | 'debt',
) {
  const data =
    analysis.explanation[
      section
    ]

  console.log('')
  console.log(
    `${title} — ${analysis.target}`
  )

  if (
    data.primaryDrivers.length ===
    0
  ) {
    console.log(
      '  No primary driver detected.'
    )
  } else {
    for (
      const [
        index,
        driver,
      ] of
      data.primaryDrivers.entries()
    ) {
      console.log(
        `  ${index + 1}. ${driver.label}: ${money(
          driver.amount
        )} (${driver.share.toFixed(
          1
        )}%)`
      )
    }
  }

  if (
    data.offsettingDrivers.length >
    0
  ) {
    console.log(
      '  Offsetting:'
    )

    for (
      const driver of
      data.offsettingDrivers
    ) {
      console.log(
        `    ${driver.label}: ${money(
          driver.amount
        )}`
      )
    }
  }
}

export function printComparison(
  result: ComparisonResult,
) {
  const [
    first,
    second,
  ] =
    result.targets

  console.log('')
  console.log(
    `COMPARE — ${result.requestedWindow}`
  )

  console.log(
    '=============================================================='
  )

  console.log(
    `Blocks ${result.from.blockNumber.toLocaleString()} → ${result.to.blockNumber.toLocaleString()}`
  )

  console.log(
    `Actual elapsed: ${result.elapsedSeconds.toLocaleString()}s`
  )

  console.log('')

  console.log(
    `${'METRIC'.padEnd(
      24
    )}${cell(
      first.target
    )}${cell(
      second.target
    )}`
  )

  console.log(
    '-'.repeat(
      68
    )
  )

  metric(
    'Current liquidity',
    money(
      first.current.liquidity
    ),
    money(
      second.current.liquidity
    ),
  )

  metric(
    'Liquidity change',
    signedMoney(
      first.change.liquidity
    ),
    signedMoney(
      second.change.liquidity
    ),
  )

  metric(
    'Liquidity change %',
    signedPercent(
      first.normalized.liquidityChangePct
    ),
    signedPercent(
      second.normalized.liquidityChangePct
    ),
  )

  metric(
    'Current debt',
    money(
      first.current.debt
    ),
    money(
      second.current.debt
    ),
  )

  metric(
    'Debt change',
    signedMoney(
      first.change.debt
    ),
    signedMoney(
      second.change.debt
    ),
  )

  metric(
    'Debt change %',
    signedPercent(
      first.normalized.debtChangePct
    ),
    signedPercent(
      second.normalized.debtChangePct
    ),
  )

  metric(
    'Utilization',
    percent(
      first.current.utilization
    ),
    percent(
      second.current.utilization
    ),
  )

  metric(
    'Utilization change',
    signedPoints(
      first.change.utilization
    ),
    signedPoints(
      second.change.utilization
    ),
  )

  metric(
    'Supply APR',
    percent(
      first.current.supplyApr
    ),
    percent(
      second.current.supplyApr
    ),
  )

  metric(
    'Borrow APR',
    percent(
      first.current.borrowApr
    ),
    percent(
      second.current.borrowApr
    ),
  )

  metric(
    'Gross activity',
    money(
      first.normalized.grossActivityVolume
    ),
    money(
      second.normalized.grossActivityVolume
    ),
  )

  metric(
    'Activity / start supply',
    plainPercent(
      first.normalized.grossActivityPctOfStartingSupply
    ),
    plainPercent(
      second.normalized.grossActivityPctOfStartingSupply
    ),
  )

  metric(
    'Events',
    first.activity.eventCount.toLocaleString(),
    second.activity.eventCount.toLocaleString(),
  )

  metric(
    'Confidence',
    first.explanation.confidence,
    second.explanation.confidence,
  )

  console.log('')
  console.log('COMPARISON INSIGHTS')

  console.log(
    `  Liquidity: ${first.target} ${signedPercent(first.normalized.liquidityChangePct)} / ${second.target} ${signedPercent(second.normalized.liquidityChangePct)}`
  )

  console.log(
    `  Debt:      ${first.target} ${signedPercent(first.normalized.debtChangePct)} / ${second.target} ${signedPercent(second.normalized.debtChangePct)}`
  )

  console.log(
    `  Activity:  ${first.target} ${plainPercent(first.normalized.grossActivityPctOfStartingSupply)} / ${second.target} ${plainPercent(second.normalized.grossActivityPctOfStartingSupply)} of starting supply`
  )

  console.log(
    `  Supply APR: ${first.target} ${percent(first.current.supplyApr)} / ${second.target} ${percent(second.current.supplyApr)}`
  )

  console.log(
    `  Borrow APR: ${first.target} ${percent(first.current.borrowApr)} / ${second.target} ${percent(second.current.borrowApr)}`
  )

  printDrivers(
    'LIQUIDITY CAUSES',
    first,
    'liquidity',
  )

  printDrivers(
    'LIQUIDITY CAUSES',
    second,
    'liquidity',
  )

  printDrivers(
    'DEBT CAUSES',
    first,
    'debt',
  )

  printDrivers(
    'DEBT CAUSES',
    second,
    'debt',
  )

  console.log('')
  console.log(
    'INTEREST MODEL'
  )

  console.log(
    `  ${first.target}: ${first.attribution.debt.interestModel}`
  )

  console.log(
    `  ${second.target}: ${second.attribution.debt.interestModel}`
  )

  console.log('')
}
