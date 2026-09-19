export type NormalizedMetrics = {
  liquidityChangePct: number | null
  debtChangePct: number | null
  grossActivityVolume: number
  grossActivityPctOfStartingSupply: number | null
  liquidityResidualPct: number | null
  debtResidualPct: number | null
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

export function buildNormalizedMetrics(
  input: {
    startingLiquidity: number
    startingDebt: number
    startingSupply: number

    liquidityChange: number
    debtChange: number

    grossSupplyWithdrawVolume: number
    grossBorrowRepayVolume: number

    liquidityResidual: number
    debtResidual: number
  },
): NormalizedMetrics {
  const grossActivityVolume =
    input.grossSupplyWithdrawVolume +
    input.grossBorrowRepayVolume

  return {
    liquidityChangePct:
      percentOf(
        input.liquidityChange,
        input.startingLiquidity,
      ),

    debtChangePct:
      percentOf(
        input.debtChange,
        input.startingDebt,
      ),

    grossActivityVolume,

    grossActivityPctOfStartingSupply:
      percentOf(
        grossActivityVolume,
        input.startingSupply,
      ),

    liquidityResidualPct:
      residualPercent(
        input.liquidityResidual,
        input.liquidityChange,
      ),

    debtResidualPct:
      residualPercent(
        input.debtResidual,
        input.debtChange,
      ),
  }
}
