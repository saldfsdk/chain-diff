import type {
  Snapshot,
  Activity,
  ActivitySummary,
} from './types.js'

export type Driver = {
  label: string
  amount: number
  share: number
}

export type WhyAnalysis = {
  target: string
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

  stateChange: {
    liquidity: number
    debt: number
    utilization: number
    supplyApr: number
    borrowApr: number
  }

  activity: {
    supplied: number
    withdrawn: number
    borrowed: number
    repaidUnderlying: number
    repaidATokens: number

    netLiquidityFlow: number

    netSupplyWithdraw: number
    netBorrowRepayLiquidity: number
    netDebtPrincipalChange: number

    grossSupplyWithdrawVolume: number
    grossBorrowRepayVolume: number

    eventCount: number
    events: Activity[]
  }

  attribution: {
    liquidity: {
      explainedFlow: number
      residual: number
    }

    debt: {
      borrowRepayChange: number

      estimatedAccruedInterest: number

      interestModel:
        | 'index'
        | 'average-apr'

      explainedChange: number
      residual: number
    }
  }

  explanation: {
    liquidity: {
      direction:
        | 'increased'
        | 'decreased'
        | 'unchanged'

      primaryDrivers: Driver[]
      offsettingDrivers: Driver[]
    }

    debt: {
      direction:
        | 'increased'
        | 'decreased'
        | 'unchanged'

      primaryDrivers: Driver[]
      offsettingDrivers: Driver[]
    }

    confidence:
      | 'HIGH'
      | 'MEDIUM'
      | 'LOW'
  }
}

type Contribution = {
  label: string
  effect: number
}

export function buildWhyAnalysis(
  before: Snapshot,
  current: Snapshot,
  activity: ActivitySummary,
  requestedWindow: string,
): WhyAnalysis {
  const elapsedSeconds =
    current.capturedAt -
    before.capturedAt

  const liquidityDelta =
    current.availableLiquidity -
    before.availableLiquidity

  const debtDelta =
    current.totalDebt -
    before.totalDebt

  const utilizationDelta =
    current.utilization -
    before.utilization

  const supplyAprDelta =
    current.supplyApr -
    before.supplyApr

  const borrowAprDelta =
    current.borrowApr -
    before.borrowApr

  const netSupplyWithdraw =
    activity.supplied -
    activity.withdrawn

  const netBorrowRepayLiquidity =
    activity.repaidUnderlying -
    activity.borrowed

  const netDebtPrincipalChange =
    activity.borrowed -
    activity.repaidUnderlying -
    activity.repaidATokens

  const grossSupplyWithdrawVolume =
    activity.supplied +
    activity.withdrawn

  const grossBorrowRepayVolume =
    activity.borrowed +
    activity.repaidUnderlying +
    activity.repaidATokens

  const indexInterest =
    estimateIndexInterest(
      before,
      current,
    )

  const averageAprInterest =
    estimateAverageAprInterest(
      before,
      current,
      elapsedSeconds,
    )

  const estimatedAccruedInterest =
    indexInterest ??
    averageAprInterest

  const interestModel:
    'index' |
    'average-apr' =
      indexInterest !== null
        ? 'index'
        : 'average-apr'

  const explainedDebtChange =
    netDebtPrincipalChange +
    estimatedAccruedInterest

  const liquidityResidual =
    liquidityDelta -
    activity.netLiquidityFlow

  const debtResidual =
    debtDelta -
    explainedDebtChange

  const liquidityContributions:
    Contribution[] = []

  if (
    Math.abs(
      netSupplyWithdraw
    ) >= 0.5
  ) {
    liquidityContributions.push({
      label:
        netSupplyWithdraw >= 0
          ? 'Net supply'
          : 'Net withdrawals',

      effect:
        netSupplyWithdraw,
    })
  }

  if (
    Math.abs(
      netBorrowRepayLiquidity
    ) >= 0.5
  ) {
    liquidityContributions.push({
      label:
        netBorrowRepayLiquidity >= 0
          ? 'Net repayments'
          : 'Net borrowing',

      effect:
        netBorrowRepayLiquidity,
    })
  }

  const liquidityDrivers =
    classifyContributions(
      liquidityDelta,
      liquidityContributions,
    )

  const debtContributions:
    Contribution[] = []

  if (
    Math.abs(
      netDebtPrincipalChange
    ) >= 0.5
  ) {
    debtContributions.push({
      label:
        netDebtPrincipalChange >= 0
          ? 'Net borrowing'
          : 'Net repayments',

      effect:
        netDebtPrincipalChange,
    })
  }

  if (
    Math.abs(
      estimatedAccruedInterest
    ) >= 0.5
  ) {
    debtContributions.push({
      label:
        'Accrued interest',

      effect:
        estimatedAccruedInterest,
    })
  }

  const debtDrivers =
    classifyContributions(
      debtDelta,
      debtContributions,
    )

  return {
    target:
      current.target,

    requestedWindow,

    from: {
      blockNumber:
        before.blockNumber,

      timestamp:
        before.capturedAt,
    },

    to: {
      blockNumber:
        current.blockNumber,

      timestamp:
        current.capturedAt,
    },

    elapsedSeconds,

    stateChange: {
      liquidity:
        liquidityDelta,

      debt:
        debtDelta,

      utilization:
        utilizationDelta,

      supplyApr:
        supplyAprDelta,

      borrowApr:
        borrowAprDelta,
    },

    activity: {
      supplied:
        activity.supplied,

      withdrawn:
        activity.withdrawn,

      borrowed:
        activity.borrowed,

      repaidUnderlying:
        activity.repaidUnderlying,

      repaidATokens:
        activity.repaidATokens,

      netLiquidityFlow:
        activity.netLiquidityFlow,

      netSupplyWithdraw,

      netBorrowRepayLiquidity,

      netDebtPrincipalChange,

      grossSupplyWithdrawVolume,

      grossBorrowRepayVolume,

      eventCount:
        activity.events.length,

      events:
        activity.events,
    },

    attribution: {
      liquidity: {
        explainedFlow:
          activity.netLiquidityFlow,

        residual:
          liquidityResidual,
      },

      debt: {
        borrowRepayChange:
          netDebtPrincipalChange,

        estimatedAccruedInterest,

        interestModel,

        explainedChange:
          explainedDebtChange,

        residual:
          debtResidual,
      },
    },

    explanation: {
      liquidity: {
        direction:
          direction(
            liquidityDelta
          ),

        primaryDrivers:
          liquidityDrivers.primary,

        offsettingDrivers:
          liquidityDrivers.offsetting,
      },

      debt: {
        direction:
          direction(
            debtDelta
          ),

        primaryDrivers:
          debtDrivers.primary,

        offsettingDrivers:
          debtDrivers.offsetting,
      },

      confidence:
        confidence(
          liquidityDelta,
          liquidityResidual,
          debtDelta,
          debtResidual,
        ),
    },
  }
}

function estimateIndexInterest(
  before: Snapshot,
  current: Snapshot,
): number | null {
  if (
    !before.interestIndex ||
    !current.interestIndex
  ) {
    return null
  }

  const indexChange =
    current.interestIndex.index -
    before.interestIndex.index

  const averageScaledDebt =
    (
      before.interestIndex.scaledDebt +
      current.interestIndex.scaledDebt
    ) / 2

  return (
    averageScaledDebt *
    indexChange
  )
}

function estimateAverageAprInterest(
  before: Snapshot,
  current: Snapshot,
  elapsedSeconds: number,
) {
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

function classifyContributions(
  observed: number,
  contributions: Contribution[],
) {
  if (
    Math.abs(
      observed
    ) < 0.000001
  ) {
    return {
      primary: [],
      offsetting:
        toDrivers(
          contributions
        ),
    }
  }

  const observedSign =
    observed > 0
      ? 1
      : -1

  const primary =
    contributions.filter(
      item =>
        Math.sign(
          item.effect
        ) ===
        observedSign
    )

  const offsetting =
    contributions.filter(
      item =>
        Math.sign(
          item.effect
        ) ===
        -observedSign
    )

  return {
    primary:
      toDrivers(
        primary
      ),

    offsetting:
      toDrivers(
        offsetting
      ),
  }
}

function toDrivers(
  contributions: Contribution[],
): Driver[] {
  const sorted =
    [...contributions]
      .filter(
        item =>
          Math.abs(
            item.effect
          ) >= 0.5
      )
      .sort(
        (
          a,
          b,
        ) =>
          Math.abs(
            b.effect
          ) -
          Math.abs(
            a.effect
          )
      )

  const total =
    sorted.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        Math.abs(
          item.effect
        ),
      0,
    )

  return sorted.map(
    item => ({
      label:
        item.label,

      amount:
        Math.abs(
          item.effect
        ),

      share:
        total === 0
          ? 0
          : (
              Math.abs(
                item.effect
              ) /
              total
            ) * 100,
    })
  )
}

function direction(
  value: number,
):
  | 'increased'
  | 'decreased'
  | 'unchanged' {
  if (Math.abs(value) < 0.005) {
    return 'unchanged'
  }

  return value > 0
    ? 'increased'
    : 'decreased'
}

function confidence(
  liquidityDelta: number,
  liquidityResidual: number,
  debtDelta: number,
  debtResidual: number,
):
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW' {
  const liquidityError =
    residualRatio(
      liquidityResidual,
      liquidityDelta,
    )

  const debtError =
    residualRatio(
      debtResidual,
      debtDelta,
    )

  const worst =
    Math.max(
      liquidityError,
      debtError,
    )

  if (
    worst <= 0.01
  ) {
    return 'HIGH'
  }

  if (
    worst <= 0.05
  ) {
    return 'MEDIUM'
  }

  return 'LOW'
}

function residualRatio(
  residual: number,
  observed: number,
) {
  if (
    Math.abs(
      observed
    ) < 1
  ) {
    return Math.abs(
      residual
    ) < 1
      ? 0
      : 1
  }

  return (
    Math.abs(
      residual
    ) /
    Math.abs(
      observed
    )
  )
}
