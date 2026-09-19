import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  buildWhyAnalysis,
} from './analyze.js'

import type {
  ActivitySummary,
  Snapshot,
} from './types.js'

function snapshot(
  overrides: Partial<Snapshot> = {},
): Snapshot {
  return {
    target: 'test:market',
    capturedAt: 1_000_000,
    blockNumber: 100,

    availableLiquidity: 1_000,
    totalSupply: 2_000,
    totalDebt: 1_000,
    utilization: 50,

    supplyApr: 3,
    borrowApr: 10,

    ...overrides,
  }
}

function activity(
  overrides: Partial<ActivitySummary> = {},
): ActivitySummary {
  return {
    supplied: 0,
    withdrawn: 0,
    borrowed: 0,
    repaidUnderlying: 0,
    repaidATokens: 0,
    netLiquidityFlow: 0,
    events: [],

    ...overrides,
  }
}

describe('buildWhyAnalysis', () => {
  it('explains supply, borrowing, and index-based interest', () => {
    const before = snapshot({
      interestIndex: {
        index: 1,
        scaledDebt: 1_000,
      },
    })

    const current = snapshot({
      capturedAt: 1_003_600,
      blockNumber: 200,

      availableLiquidity: 1_060,
      totalSupply: 2_100,
      totalDebt: 1_042,

      interestIndex: {
        index: 1.002,
        scaledDebt: 1_000,
      },
    })

    const result = buildWhyAnalysis(
      before,
      current,
      activity({
        supplied: 100,
        borrowed: 40,
        netLiquidityFlow: 60,
      }),
      '1h',
    )

    expect(
      result.stateChange.liquidity
    ).toBe(60)

    expect(
      result.activity.netSupplyWithdraw
    ).toBe(100)

    expect(
      result.activity.netBorrowRepayLiquidity
    ).toBe(-40)

    expect(
      result.activity.netDebtPrincipalChange
    ).toBe(40)

    expect(
      result.attribution.debt.interestModel
    ).toBe('index')

    expect(
      result.attribution.debt.estimatedAccruedInterest
    ).toBeCloseTo(2, 6)

    expect(
      result.attribution.debt.residual
    ).toBeCloseTo(0, 6)

    expect(
      result.explanation.confidence
    ).toBe('HIGH')
  })

  it('falls back to average APR when no interest index exists', () => {
    const before = snapshot({
      capturedAt: 0,
      borrowApr: 36.5,
    })

    const current = snapshot({
      capturedAt: 86_400,
      blockNumber: 200,
      totalDebt: 1_001,
      borrowApr: 36.5,
    })

    const result = buildWhyAnalysis(
      before,
      current,
      activity(),
      '24h',
    )

    expect(
      result.attribution.debt.interestModel
    ).toBe('average-apr')

    expect(
      result.attribution.debt.estimatedAccruedInterest
    ).toBeCloseTo(1, 6)

    expect(
      result.attribution.debt.residual
    ).toBeCloseTo(0, 6)

    expect(
      result.explanation.confidence
    ).toBe('HIGH')
  })

  it('does not treat offsetting borrow and repay volume as a net cause', () => {
    const before = snapshot({
      capturedAt: 0,
      borrowApr: 36.5,
    })

    const current = snapshot({
      capturedAt: 86_400,
      blockNumber: 200,
      totalDebt: 1_001,
      borrowApr: 36.5,
    })

    const result = buildWhyAnalysis(
      before,
      current,
      activity({
        borrowed: 100,
        repaidUnderlying: 100,
        netLiquidityFlow: 0,
      }),
      '24h',
    )

    expect(
      result.activity.grossBorrowRepayVolume
    ).toBe(200)

    expect(
      result.activity.netDebtPrincipalChange
    ).toBe(0)

    expect(
      result.explanation.debt.primaryDrivers
    ).toHaveLength(1)

    expect(
      result.explanation.debt.primaryDrivers[0].label
    ).toBe('Accrued interest')
  })
})

describe('direction noise handling', () => {
  it('keeps tiny raw changes but describes them as unchanged', () => {
    const before = snapshot({
      blockNumber: 100,
      availableLiquidity: 1_000,
    })

    const current = snapshot({
      blockNumber: 101,
      availableLiquidity: 1_000.001,
    })

    const result = buildWhyAnalysis(
      before,
      current,
      activity(),
      '12s',
    )

    expect(
      result.stateChange.liquidity
    ).toBeCloseTo(0.001, 6)

    expect(
      result.explanation.liquidity.direction
    ).toBe('unchanged')
  })

  it('still treats a one-cent change as meaningful', () => {
    const before = snapshot({
      blockNumber: 100,
      availableLiquidity: 1_000,
    })

    const current = snapshot({
      blockNumber: 101,
      availableLiquidity: 1_000.01,
    })

    const result = buildWhyAnalysis(
      before,
      current,
      activity(),
      '12s',
    )

    expect(
      result.explanation.liquidity.direction
    ).toBe('increased')
  })
})
