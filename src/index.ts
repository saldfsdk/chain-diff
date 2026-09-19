#!/usr/bin/env node
import { watchTarget } from './watch.js'
import { compareTargets, printComparison } from './compare.js'
import {
  Command,
} from 'commander'

import {
  getAdapter,
  listTargets,
} from './adapters.js'

import {
  findBlockAtOrBeforeTimestamp,
} from './ethereum.js'

import {
  saveSnapshot,
} from './db.js'

import {
  buildWhyAnalysis,
  type WhyAnalysis,
} from './analyze.js'

import {
  printHumanExplanation,
} from './explain.js'

import type {
  Snapshot,
  ActivitySummary,
  ProtocolAdapter,
} from './types.js'

const program =
  new Command()

program
  .name('chain-diff')
  .description(
    'Git diff for onchain state'
  )
  .version('0.1.0')

program
  .command('targets')
  .description(
    'List supported targets'
  )
  .action(() => {
    console.log(
      'Supported targets:'
    )

    for (
      const target of
      listTargets()
    ) {
      const adapter =
        getAdapter(
          target
        )

      console.log(
        `  ${target.padEnd(
          18
        )} ${adapter.label}`
      )
    }
  })

program
  .command('diff')
  .argument(
    '<target>',
    'Example: aave:usdc',
  )
  .option(
    '--since <duration>',
    'Example: 1m, 1h, 24h, 7d',
    '24h',
  )
  .option(
    '--json',
    'Output structured JSON',
    false,
  )
  .action(async (
    target: string,
    options: {
      since: string
      json: boolean
    },
  ) => {
    try {
      const adapter =
        getAdapter(
          target
        )

      const {
        current,
        baseline,
      } =
        await loadWindow(
          adapter,
          options.since,
          !options.json,
        )

      saveSnapshot(
        current
      )

      if (
        options.json
      ) {
        const output = {
          target:
            adapter.target,

          label:
            adapter.label,

          requestedWindow:
            options.since,

          elapsedSeconds:
            current.capturedAt -
            baseline.capturedAt,

          from: {
            blockNumber:
              baseline.blockNumber,

            timestamp:
              baseline.capturedAt,
          },

          to: {
            blockNumber:
              current.blockNumber,

            timestamp:
              current.capturedAt,
          },

          state: {
            before:
              baseline,

            current,
          },

          diff: {
            liquidity:
              current.availableLiquidity -
              baseline.availableLiquidity,

            totalSupply:
              current.totalSupply -
              baseline.totalSupply,

            totalDebt:
              current.totalDebt -
              baseline.totalDebt,

            utilization:
              current.utilization -
              baseline.utilization,

            supplyApr:
              current.supplyApr -
              baseline.supplyApr,

            borrowApr:
              current.borrowApr -
              baseline.borrowApr,
          },
        }

        console.log(
          JSON.stringify(
            output,
            null,
            2,
          )
        )

        return
      }

      printCurrent(
        adapter.label,
        current,
      )

      printWindowInfo(
        options.since,
        baseline,
        current,
      )

      printDiff(
        baseline,
        current,
        options.since,
      )
    } catch (error) {
      handleError(
        error
      )
    }
  })

program
  .command('why')
  .argument(
    '<target>',
    'Example: aave:usdc',
  )
  .option(
    '--since <duration>',
    'Example: 1m, 1h, 24h, 7d',
    '24h',
  )
  .option(
    '--json',
    'Output structured JSON',
    false,
  )
  .option(
    '--summary',
    'Exclude full event list from JSON output',
    false,
  )
  .action(async (
    target: string,
    options: {
      since: string
      json: boolean
      summary: boolean
    },
  ) => {
    try {
      const adapter =
        getAdapter(
          target
        )

      const {
        current,
        baseline,
      } =
        await loadWindow(
          adapter,
          options.since,
          !options.json,
        )

      if (
        !options.json
      ) {
        console.log(
          'Fetching protocol activity...'
        )
      }

      const activity =
        await adapter.fetchActivity(
          baseline.blockNumber + 1,
          current.blockNumber,
        )

      saveSnapshot(
        current
      )

      const analysis =
        buildWhyAnalysis(
          baseline,
          current,
          activity,
          options.since,
        )

      if (
        options.json
      ) {
        let jsonAnalysis:
          Record<string, unknown> =
          analysis

        if (
          options.summary
        ) {
          const {
            events,
            ...activitySummary
          } =
            analysis.activity

          jsonAnalysis = {
            ...analysis,

            activity: {
              ...activitySummary,
            },
          }
        }

        console.log(
          JSON.stringify(
            {
              protocolLabel:
                adapter.label,

              ...jsonAnalysis,
            },
            null,
            2,
          )
        )

        return
      }

      printWhy(
        adapter.label,
        analysis,
        baseline,
        current,
        activity,
      )
    } catch (error) {
      handleError(
        error
      )
    }
  })


program
  .command('compare')
  .description(
    'Compare two protocol targets over the same Ethereum block window'
  )
  .argument(
    '<firstTarget>',
    'First target'
  )
  .argument(
    '<secondTarget>',
    'Second target'
  )
  .requiredOption(
    '--since <duration>',
    'Comparison window, e.g. 1h or 24h'
  )
  .option(
    '--json',
    'Output structured JSON',
    false
  )
  .action(
    async (
      firstTarget: string,
      secondTarget: string,
      options: {
        since: string
        json: boolean
      },
    ) => {
      const result =
        await compareTargets(
          firstTarget,
          secondTarget,
          options.since,
        )

      if (
        options.json
      ) {
        console.log(
          JSON.stringify(
            result,
            null,
            2,
          )
        )

        return
      }

      printComparison(
        result
      )
    }
  )


program
  .command('watch')
  .description(
    'Watch a protocol target for new state changes'
  )
  .argument(
    '<target>',
    'Target to watch'
  )
  .option(
    '--interval <duration>',
    'Polling interval',
    '30s'
  )
  .option(
    '--once',
    'Run one polling interval and exit',
    false
  )
  .option(
    '--min-liquidity <usd>',
    'Only show changes with at least this liquidity movement',
    '0'
  )
  .option(
    '--min-debt <usd>',
    'Only show changes with at least this debt movement',
    '0'
  )
  .option(
    '--json',
    'Output matching updates as JSON lines',
    false
  )
  .action(
    async (
      target: string,
      options: {
        interval: string
        once: boolean
        minLiquidity: string
        minDebt: string
        json: boolean
      },
    ) => {
      await watchTarget(
        target,
        options,
      )
    }
  )

await program.parseAsync()

async function loadWindow(
  adapter: ProtocolAdapter,
  requested: string,
  verbose: boolean,
) {
  const seconds =
    parseDuration(
      requested
    )

  if (verbose) {
    console.log(
      'Finding historical Ethereum block...'
    )
  }

  const current =
    await adapter
      .fetchCurrentSnapshot()

  const targetTimestamp =
    current.capturedAt -
    seconds

  const baselineBlock =
    await findBlockAtOrBeforeTimestamp(
      targetTimestamp
    )

  if (verbose) {
    console.log(
      `Historical block: ${baselineBlock.toLocaleString()}`
    )

    console.log(
      'Fetching historical protocol state...'
    )
  }

  const baseline =
    await adapter
      .fetchSnapshotAtBlock(
        baselineBlock
      )

  return {
    current,
    baseline,
  }
}

function parseDuration(
  value: string,
) {
  const match =
    /^(\d+)(m|h|d)$/.exec(
      value
    )

  if (!match) {
    throw new Error(
      'Invalid duration. Use 1m, 1h, 24h, or 7d.'
    )
  }

  const amount =
    Number(
      match[1]
    )

  const unit =
    match[2]

  if (
    unit === 'm'
  ) {
    return (
      amount *
      60
    )
  }

  if (
    unit === 'h'
  ) {
    return (
      amount *
      3600
    )
  }

  return (
    amount *
    86400
  )
}

function printWhy(
  label: string,
  analysis: WhyAnalysis,
  before: Snapshot,
  current: Snapshot,
  activity: ActivitySummary,
) {
  console.log('')
  console.log(
    label
  )

  console.log(
    `WHY —${analysis.requestedWindow}`
  )

  console.log(
    '=========================='
  )

  console.log('')

  console.log(
    `Blocks ${before.blockNumber.toLocaleString()} →${current.blockNumber.toLocaleString()}`
  )

  console.log(
    `Requested window: ${analysis.requestedWindow}`
  )

  console.log(
    `Actual elapsed:   ${formatDuration(
      analysis.elapsedSeconds
    )}`
  )

  console.log('')
  console.log(
    'OBSERVED STATE CHANGE'
  )

  console.log(
    `Liquidity   ${signedMoney(
      analysis.stateChange
        .liquidity
    )}`
  )

  console.log(
    `Debt        ${signedMoney(
      analysis.stateChange
        .debt
    )}`
  )

  console.log('')
  console.log(
    'DETECTED PROTOCOL ACTIVITY'
  )

  console.log(
    `Supply      ${signedMoney(
      activity.supplied
    )}`
  )

  console.log(
    `Withdraw    ${signedMoney(
      -activity.withdrawn
    )}`
  )

  console.log(
    `Borrow      ${signedMoney(
      -activity.borrowed
    )}`
  )

  console.log(
    `Repay       ${signedMoney(
      activity.repaidUnderlying
    )}`
  )

  if (
    activity.repaidATokens >
    0
  ) {
    console.log(
      `Internal repay ${money(
        activity.repaidATokens
      )}`
    )
  }

  console.log('')
  console.log(
    'ATTRIBUTION'
  )

  console.log(
    `Event-implied liquidity flow  ${signedMoney(
      analysis.attribution
        .liquidity
        .explainedFlow
    )}`
  )

  console.log(
    `Unexplained residual          ${signedMoney(
      analysis.attribution
        .liquidity
        .residual
    )}`
  )

  console.log('')

  console.log(
    `Borrow/repay debt change      ${signedMoney(
      analysis.attribution
        .debt
        .borrowRepayChange
    )}`
  )

  console.log(
    `Estimated accrued interest    ${signedMoney(
      analysis.attribution
        .debt
        .estimatedAccruedInterest
    )}`
  )

  console.log(
    `Explained debt change         ${signedMoney(
      analysis.attribution
        .debt
        .explainedChange
    )}`
  )

  console.log(
    `Unexplained debt residual     ${signedMoney(
      analysis.attribution
        .debt
        .residual
    )}`
  )

  printHumanExplanation(
    analysis
  )

  console.log('')

  console.log(
    `EVENTS DETECTED: ${activity.events.length}`
  )

  if (
    activity.events.length ===
    0
  ) {
    console.log(
      'No events detected.'
    )

    return
  }

  console.log('')
  console.log(
    'LARGEST EVENTS'
  )

  for (
    const event of
    activity.events.slice(
      0,
      10,
    )
  ) {
    console.log('')

    console.log(
      `${event.type.padEnd(
        8
      )} ${money(
        event.amount
      )}`
    )

    console.log(
      `  Address ${short(
        event.address
      )}`
    )

    console.log(
      `  Tx      ${short(
        event.txHash
      )}`
    )

    console.log(
      `  Block   ${event.blockNumber.toLocaleString()}`
    )
  }
}

function printWindowInfo(
  requested: string,
  before: Snapshot,
  current: Snapshot,
) {
  console.log('')
  console.log(
    'WINDOW'
  )

  console.log(
    '=========================='
  )

  console.log(
    `Requested: ${requested}`
  )

  console.log(
    `Actual:    ${formatDuration(
      current.capturedAt -
      before.capturedAt
    )}`
  )

  console.log(
    `Blocks:    ${before.blockNumber.toLocaleString()} →${current.blockNumber.toLocaleString()}`
  )
}

function printCurrent(
  label: string,
  snapshot: Snapshot,
) {
  console.log('')
  console.log(
    label
  )

  console.log(
    '=========================='
  )

  console.log(
    `Block: ${snapshot.blockNumber.toLocaleString()}`
  )

  console.log('')

  console.log(
    `Available liquidity  ${money(
      snapshot.availableLiquidity
    )}`
  )

  console.log(
    `Total supplied       ${money(
      snapshot.totalSupply
    )}`
  )

  console.log(
    `Total debt           ${money(
      snapshot.totalDebt
    )}`
  )

  console.log(
    `Utilization          ${snapshot.utilization.toFixed(
      2
    )}%`
  )

  console.log(
    `Supply APR           ${snapshot.supplyApr.toFixed(
      2
    )}%`
  )

  console.log(
    `Borrow APR           ${snapshot.borrowApr.toFixed(
      2
    )}%`
  )
}

function printDiff(
  before: Snapshot,
  current: Snapshot,
  since: string,
) {
  console.log('')
  console.log(
    `DIFF —${since}`
  )

  console.log(
    '=========================='
  )

  printMoneyDiff(
    'Liquidity',
    before.availableLiquidity,
    current.availableLiquidity,
  )

  printMoneyDiff(
    'Total supplied',
    before.totalSupply,
    current.totalSupply,
  )

  printMoneyDiff(
    'Total debt',
    before.totalDebt,
    current.totalDebt,
  )

  printPpDiff(
    'Utilization',
    before.utilization,
    current.utilization,
  )

  printPpDiff(
    'Supply APR',
    before.supplyApr,
    current.supplyApr,
  )

  printPpDiff(
    'Borrow APR',
    before.borrowApr,
    current.borrowApr,
  )
}

function printMoneyDiff(
  label: string,
  before: number,
  current: number,
) {
  const delta =
    current -
    before

  const percent =
    before === 0
      ? 0
      : (
          delta /
          before
        ) * 100

  console.log('')
  console.log(
    label
  )

  console.log(
    `  ${money(
      before
    )} →${money(
      current
    )}`
  )

  console.log(
    `  ${signedMoney(
      delta
    )} (${signedPercent(
      percent
    )})`
  )
}

function printPpDiff(
  label: string,
  before: number,
  current: number,
) {
  const delta =
    current -
    before

  console.log('')
  console.log(
    label
  )

  console.log(
    `  ${before.toFixed(
      2
    )}% →${current.toFixed(
      2
    )}%`
  )

  console.log(
    `  ${signed(
      delta
    )} pp`
  )
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
        0,
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
    ) < 0.5
  ) {
    return '$0'
  }

  const sign =
    value > 0
      ? '+'
      : ''

  return `${sign}${money(
    value
  )}`
}

function signedPercent(
  value: number,
) {
  const sign =
    value >= 0
      ? '+'
      : ''

  return `${sign}${value.toFixed(
    2
  )}%`
}

function signed(
  value: number,
) {
  const sign =
    value >= 0
      ? '+'
      : ''

  return `${sign}${value.toFixed(
    2
  )}`
}

function formatDuration(
  seconds: number,
) {
  if (
    seconds <
    60
  ) {
    return `${seconds}s`
  }

  const minutes =
    Math.floor(
      seconds /
      60
    )

  const remainingSeconds =
    seconds %
    60

  if (
    minutes <
    60
  ) {
    return `${minutes}m ${remainingSeconds}s`
  }

  const hours =
    Math.floor(
      minutes /
      60
    )

  const remainingMinutes =
    minutes %
    60

  return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`
}

function short(
  value: string,
) {
  if (
    value.length <=
    14
  ) {
    return value
  }

  return `${value.slice(
    0,
    8
  )}...${value.slice(
    -6
  )}`
}

function handleError(
  error: unknown,
) {
  console.error('')
  console.error(
    'Error:'
  )

  console.error(
    error
  )

  process.exitCode =
    1
}

