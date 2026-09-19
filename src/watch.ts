import {
  client,
} from './ethereum.js'

import {
  getAdapter,
} from './adapters.js'

import {
  buildWhyAnalysis,
} from './analyze.js'

import type {
  Snapshot,
} from './types.js'

function money(
  value: number,
) {
  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    },
  ).format(value)
}

function signedMoney(
  value: number,
) {
  if (
    Math.abs(value) <
    0.005
  ) {
    return '$0.00'
  }

  return (
    (
      value > 0
        ? '+'
        : ''
    ) +
    money(value)
  )
}

function signedPercent(
  value: number,
) {
  if (
    Math.abs(value) <
    0.005
  ) {
    return '0.00%'
  }

  return (
    (
      value > 0
        ? '+'
        : ''
    ) +
    value.toFixed(2) +
    '%'
  )
}

function sleep(
  ms: number,
) {
  return new Promise<void>(
    resolve =>
      setTimeout(
        resolve,
        ms,
      )
  )
}

export function parseWatchInterval(
  value: string,
) {
  const match =
    /^(\d+)(s|m)$/i.exec(
      value.trim()
    )

  if (!match) {
    throw new Error(
      [
        `Invalid interval: ${value}`,
        'Examples: 15s, 30s, 1m, 5m',
      ].join('\n')
    )
  }

  const amount =
    Number(
      match[1]
    )

  const unit =
    match[2].toLowerCase()

  return (
    amount *
    (
      unit === 's'
        ? 1_000
        : 60_000
    )
  )
}

async function latestSnapshot(
  target: string,
) {
  const adapter =
    getAdapter(target)

  return {
    adapter,
    snapshot:
      await adapter.fetchCurrentSnapshot(),
  }
}

async function analyzeChange(
  target: string,
  before: Snapshot,
) {
  const adapter =
    getAdapter(target)

  const latest =
    await client.getBlock({
      blockTag: 'latest',
    })

  if (
    latest.number === null
  ) {
    throw new Error(
      'Latest block has no number.'
    )
  }

  const current =
    await adapter.fetchSnapshotAtBlock(
      latest.number
    )

  if (
    current.blockNumber <=
    before.blockNumber
  ) {
    return {
      current,
      analysis: null,
    }
  }

  const activity =
    await adapter.fetchActivity(
      before.blockNumber + 1,
      current.blockNumber,
    )

  const elapsed =
    current.capturedAt -
    before.capturedAt

  const analysis =
    buildWhyAnalysis(
      before,
      current,
      activity,
      `${elapsed}s`,
    )

  return {
    current,
    analysis,
  }
}

function printUpdate(
  label: string,
  analysis: ReturnType<
    typeof buildWhyAnalysis
  >,
) {
  console.log('')
  console.log(
    `[${new Date().toLocaleTimeString()}] ${label}`
  )

  console.log(
    `Blocks ${analysis.from.blockNumber.toLocaleString()} → ${analysis.to.blockNumber.toLocaleString()}`
  )

  console.log(
    `Liquidity ${signedMoney(
      analysis.stateChange.liquidity
    )}`
  )

  console.log(
    `Debt      ${signedMoney(
      analysis.stateChange.debt
    )}`
  )

  console.log(
    `Events    ${analysis.activity.eventCount}`
  )

  console.log(
    `Confidence ${analysis.explanation.confidence}`
  )

  if (
    analysis.explanation.liquidity.primaryDrivers.length >
    0
  ) {
    const driver =
      analysis.explanation.liquidity.primaryDrivers[0]

    console.log(
      `Liquidity cause: ${driver.label} (${signedPercent(
        driver.share
      )})`
    )
  }

  if (
    analysis.explanation.debt.primaryDrivers.length >
    0
  ) {
    const driver =
      analysis.explanation.debt.primaryDrivers[0]

    console.log(
      `Debt cause:      ${driver.label} (${driver.share.toFixed(
        1
      )}%)`
    )
  }

  console.log(
    `Interest model: ${analysis.attribution.debt.interestModel}`
  )
}

function matchesThreshold(
  analysis: ReturnType<
    typeof buildWhyAnalysis
  >,
  minLiquidity: number,
  minDebt: number,
) {
  const liquidityEnabled =
    minLiquidity > 0

  const debtEnabled =
    minDebt > 0

  if (
    !liquidityEnabled &&
    !debtEnabled
  ) {
    return true
  }

  const liquidityMatch =
    liquidityEnabled &&
    Math.abs(
      analysis.stateChange.liquidity
    ) >= minLiquidity

  const debtMatch =
    debtEnabled &&
    Math.abs(
      analysis.stateChange.debt
    ) >= minDebt

  return (
    liquidityMatch ||
    debtMatch
  )
}

function printJsonUpdate(
  target: string,
  label: string,
  analysis: ReturnType<
    typeof buildWhyAnalysis
  >,
) {
  const {
    events: _events,
    ...activity
  } = analysis.activity

  console.log(
    JSON.stringify({
      type: 'chain-diff.watch',
      status: 'matched',
      target,
      label,

      observedAt:
        new Date(
          analysis.to.timestamp * 1000
        ).toISOString(),

      from: analysis.from,
      to: analysis.to,

      stateChange:
        analysis.stateChange,

      activity,

      attribution:
        analysis.attribution,

      explanation:
        analysis.explanation,
    })
  )
}

function printMatchedUpdate(
  target: string,
  label: string,
  analysis: ReturnType<
    typeof buildWhyAnalysis
  >,
  json: boolean,
) {
  if (json) {
    printJsonUpdate(
      target,
      label,
      analysis,
    )

    return
  }

  printUpdate(
    label,
    analysis,
  )
}

function statusLog(
  json: boolean,
  message: string,
) {
  if (json) {
    console.error(message)
    return
  }

  console.log(message)
}

export async function watchTarget(
  target: string,
  options: {
    interval: string
    once: boolean
    minLiquidity: string
    minDebt: string
    json: boolean
  },
) {
  const intervalMs =
    parseWatchInterval(
      options.interval
    )

  const minLiquidity =
    Number(
      options.minLiquidity
    )

  const minDebt =
    Number(
      options.minDebt
    )

  if (
    !Number.isFinite(minLiquidity) ||
    !Number.isFinite(minDebt) ||
    minLiquidity < 0 ||
    minDebt < 0
  ) {
    throw new Error(
      'Thresholds must be non-negative numbers.'
    )
  }

  const {
    adapter,
    snapshot: initial,
  } =
    await latestSnapshot(
      target
    )

  let previous =
    initial

  statusLog(
    options.json,
    `Watching ${adapter.label}`
  )

  statusLog(
    options.json,
    `Starting block: ${previous.blockNumber.toLocaleString()}`
  )

  statusLog(
    options.json,
    `Interval: ${options.interval}`
  )

  if (
    options.once
  ) {
    statusLog(
      options.json,
      'Waiting for next interval...'
    )

    await sleep(
      intervalMs
    )

    const result =
      await analyzeChange(
        target,
        previous,
      )

    if (
      result.analysis === null
    ) {
      if (options.json) {
        console.log(
          JSON.stringify({
            type: 'chain-diff.watch',
            status: 'no_new_block',
            target: adapter.target,
            label: adapter.label,
          })
        )
      } else {
        console.log(
          'No new block yet.'
        )
      }

      return
    }

    if (
      matchesThreshold(
        result.analysis,
        minLiquidity,
        minDebt,
      )
    ) {
      printMatchedUpdate(
        adapter.target,
        adapter.label,
        result.analysis,
        options.json,
      )
    } else if (
      options.json
    ) {
      console.log(
        JSON.stringify({
          type: 'chain-diff.watch',
          status: 'no_match',
          target: adapter.target,
          label: adapter.label,
        })
      )
    } else {
      console.log(
        'No change matched thresholds.'
      )
    }

    return
  }

  while (true) {
    await sleep(
      intervalMs
    )

    try {
      const result =
        await analyzeChange(
          target,
          previous,
        )

      if (
        result.analysis === null
      ) {
        continue
      }

      if (
        matchesThreshold(
          result.analysis,
          minLiquidity,
          minDebt,
        )
      ) {
        printMatchedUpdate(
          adapter.target,
          adapter.label,
          result.analysis,
          options.json,
        )
      }

      previous =
        result.current
    } catch (error) {
      console.error(
        'Watch iteration failed:',
        error
      )
    }
  }
}
