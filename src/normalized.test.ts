import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  buildNormalizedMetrics,
} from './normalized.js'

describe('buildNormalizedMetrics', () => {
  it('calculates normalized market changes', () => {
    const result =
      buildNormalizedMetrics({
        startingLiquidity: 100,
        startingDebt: 1_000,
        startingSupply: 2_000,

        liquidityChange: 20,
        debtChange: -50,

        grossSupplyWithdrawVolume: 300,
        grossBorrowRepayVolume: 100,

        liquidityResidual: 0.2,
        debtResidual: -0.5,
      })

    expect(
      result.liquidityChangePct
    ).toBeCloseTo(20, 6)

    expect(
      result.debtChangePct
    ).toBeCloseTo(-5, 6)

    expect(
      result.grossActivityVolume
    ).toBe(400)

    expect(
      result.grossActivityPctOfStartingSupply
    ).toBeCloseTo(20, 6)

    expect(
      result.liquidityResidualPct
    ).toBeCloseTo(1, 6)

    expect(
      result.debtResidualPct
    ).toBeCloseTo(1, 6)
  })

  it('returns null when a percentage base is zero', () => {
    const result =
      buildNormalizedMetrics({
        startingLiquidity: 0,
        startingDebt: 0,
        startingSupply: 0,

        liquidityChange: 10,
        debtChange: 10,

        grossSupplyWithdrawVolume: 10,
        grossBorrowRepayVolume: 10,

        liquidityResidual: 1,
        debtResidual: 1,
      })

    expect(
      result.liquidityChangePct
    ).toBeNull()

    expect(
      result.debtChangePct
    ).toBeNull()

    expect(
      result.grossActivityPctOfStartingSupply
    ).toBeNull()
  })

  it('handles effectively zero observed change safely', () => {
    const result =
      buildNormalizedMetrics({
        startingLiquidity: 1_000,
        startingDebt: 1_000,
        startingSupply: 2_000,

        liquidityChange: 0,
        debtChange: 0,

        grossSupplyWithdrawVolume: 0,
        grossBorrowRepayVolume: 0,

        liquidityResidual: 0,
        debtResidual: 0,
      })

    expect(
      result.liquidityResidualPct
    ).toBeNull()

    expect(
      result.debtResidualPct
    ).toBeNull()
  })
})
