import fs from 'node:fs'

const path = 'src/compare.ts'
let code = fs.readFileSync(path, 'utf8')

const oldType = `  attribution:
    WhyAnalysis['attribution']

  explanation:
    WhyAnalysis['explanation']
}`

const newType = `  attribution:
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
}`

if (!code.includes(oldType)) {
  throw new Error(
    'Could not find TargetComparison attribution block.'
  )
}

code = code.replace(
  oldType,
  newType
)

const analyzeMarker = `async function analyzeTarget(`

const helpers = `function percentOf(
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

`

if (!code.includes(analyzeMarker)) {
  throw new Error(
    'Could not find analyzeTarget().'
  )
}

if (!code.includes('function percentOf(')) {
  code = code.replace(
    analyzeMarker,
    helpers + analyzeMarker
  )
}

const returnMarker = `  return {
    target:
      adapter.target,`

const preparation = `  const grossActivityVolume =
    analysis.activity.grossSupplyWithdrawVolume +
    analysis.activity.grossBorrowRepayVolume

  const liquidityChangePct =
    percentOf(
      analysis.stateChange.liquidity,
      before.availableLiquidity,
    )

  const debtChangePct =
    percentOf(
      analysis.stateChange.debt,
      before.totalDebt,
    )

  const grossActivityPctOfStartingSupply =
    percentOf(
      grossActivityVolume,
      before.totalSupply,
    )

  const liquidityResidualPct =
    residualPercent(
      analysis.attribution.liquidity.residual,
      analysis.stateChange.liquidity,
    )

  const debtResidualPct =
    residualPercent(
      analysis.attribution.debt.residual,
      analysis.stateChange.debt,
    )

`

if (!code.includes(returnMarker)) {
  throw new Error(
    'Could not find TargetComparison return block.'
  )
}

if (
  !code.includes(
    'const grossActivityVolume ='
  )
) {
  code = code.replace(
    returnMarker,
    preparation + returnMarker
  )
}

const oldReturnTail = `    attribution:
      analysis.attribution,

    explanation:
      analysis.explanation,
  }`

const newReturnTail = `    attribution:
      analysis.attribution,

    normalized: {
      liquidityChangePct,
      debtChangePct,

      grossActivityVolume,
      grossActivityPctOfStartingSupply,

      liquidityResidualPct,
      debtResidualPct,
    },

    explanation:
      analysis.explanation,
  }`

if (!code.includes(oldReturnTail)) {
  throw new Error(
    'Could not find TargetComparison return tail.'
  )
}

code = code.replace(
  oldReturnTail,
  newReturnTail
)

const signedPointsMarker = `function signedPoints(
  value: number,
) {`

const normalizedFormatters = `function signedPercent(
  value: number | null,
) {
  if (
    value === null
  ) {
    return 'n/a'
  }

  if (
    Math.abs(value) <
    0.005
  ) {
    return '0.00%'
  }

  return \`${
    value > 0
      ? '+'
      : ''
  }\${value.toFixed(
    2
  )}%\`
}

function plainPercent(
  value: number | null,
) {
  if (
    value === null
  ) {
    return 'n/a'
  }

  return \`\${value.toFixed(
    2
  )}%\`
}

`

if (!code.includes(signedPointsMarker)) {
  throw new Error(
    'Could not find signedPoints().'
  )
}

if (!code.includes('function signedPercent(')) {
  code = code.replace(
    signedPointsMarker,
    normalizedFormatters +
    signedPointsMarker
  )
}

const liquidityMetric = `  metric(
    'Liquidity change',
    signedMoney(
      first.change.liquidity
    ),
    signedMoney(
      second.change.liquidity
    ),
  )`

const liquidityMetricNew = `${liquidityMetric}

  metric(
    'Liquidity change %',
    signedPercent(
      first.normalized.liquidityChangePct
    ),
    signedPercent(
      second.normalized.liquidityChangePct
    ),
  )`

if (!code.includes(liquidityMetric)) {
  throw new Error(
    'Could not find liquidity metric.'
  )
}

code = code.replace(
  liquidityMetric,
  liquidityMetricNew
)

const debtMetric = `  metric(
    'Debt change',
    signedMoney(
      first.change.debt
    ),
    signedMoney(
      second.change.debt
    ),
  )`

const debtMetricNew = `${debtMetric}

  metric(
    'Debt change %',
    signedPercent(
      first.normalized.debtChangePct
    ),
    signedPercent(
      second.normalized.debtChangePct
    ),
  )`

if (!code.includes(debtMetric)) {
  throw new Error(
    'Could not find debt metric.'
  )
}

code = code.replace(
  debtMetric,
  debtMetricNew
)

const eventsMetric = `  metric(
    'Events',
    first.activity.eventCount.toLocaleString(),
    second.activity.eventCount.toLocaleString(),
  )`

const activityMetrics = `  metric(
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

${eventsMetric}`

if (!code.includes(eventsMetric)) {
  throw new Error(
    'Could not find events metric.'
  )
}

code = code.replace(
  eventsMetric,
  activityMetrics
)

fs.writeFileSync(
  path,
  code,
  'utf8'
)

console.log(
  'Added normalized comparison metrics.'
)
