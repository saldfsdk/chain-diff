import type {
  Driver,
  WhyAnalysis,
} from './analyze.js'

export function printHumanExplanation(
  analysis: WhyAnalysis,
) {
  console.log('')
  console.log('EXPLANATION')
  console.log(
    '=========================='
  )

  printLiquidity(
    analysis
  )

  console.log('')

  printDebt(
    analysis
  )

  console.log('')

  console.log(
    `Confidence: ${analysis.explanation.confidence}`
  )
}

function printLiquidity(
  analysis: WhyAnalysis,
) {
  const delta =
    analysis.stateChange.liquidity

  const info =
    analysis.explanation.liquidity

  console.log(
    `Liquidity ${info.direction} by ${money(
      Math.abs(delta)
    )}.`
  )

  if (
    info.primaryDrivers.length >
    0
  ) {
    console.log('')
    console.log(
      'Primary drivers:'
    )

    printDrivers(
      info.primaryDrivers,
      info.direction ===
        'decreased'
        ? '-'
        : '+',
    )
  }

  if (
    info.offsettingDrivers.length >
    0
  ) {
    console.log('')
    console.log(
      'Offsetting drivers:'
    )

    printDrivers(
      info.offsettingDrivers,
      info.direction ===
        'decreased'
        ? '+'
        : '-',
    )
  }

  console.log('')

  console.log(
    `Liquidity residual: ${signedMoney(
      analysis.attribution
        .liquidity.residual
    )}`
  )
}

function printDebt(
  analysis: WhyAnalysis,
) {
  const delta =
    analysis.stateChange.debt

  const info =
    analysis.explanation.debt

  console.log(
    `Debt ${info.direction} by ${money(
      Math.abs(delta)
    )}.`
  )

  if (
    info.primaryDrivers.length >
    0
  ) {
    console.log('')
    console.log(
      'Primary causes:'
    )

    printDrivers(
      info.primaryDrivers,
      info.direction ===
        'decreased'
        ? '-'
        : '+',
    )
  }

  if (
    info.offsettingDrivers.length >
    0
  ) {
    console.log('')
    console.log(
      'Offsetting causes:'
    )

    printDrivers(
      info.offsettingDrivers,
      info.direction ===
        'decreased'
        ? '+'
        : '-',
    )
  }

  console.log('')

  console.log(
    `Debt residual: ${signedMoney(
      analysis.attribution
        .debt.residual
    )}`
  )
}

function printDrivers(
  drivers: Driver[],
  sign: '+' | '-',
) {
  drivers.forEach(
    (
      driver,
      index,
    ) => {
      console.log(
        `${index + 1}. ${driver.label.padEnd(
          18
        )} ${sign}${money(
          driver.amount
        )} (${driver.share.toFixed(
          1
        )}%)`
      )
    },
  )
}

function money(
  value: number,
) {
  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    },
  ).format(
    Math.abs(value)
  )
}

function signedMoney(
  value: number,
) {
  if (
    Math.abs(value) < 0.5
  ) {
    return '$0'
  }

  const sign =
    value > 0
      ? '+'
      : '-'

  return `${sign}${money(
    value
  )}`
}
