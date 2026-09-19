import type {
  ProtocolAdapter,
} from './types.js'

import {
  fetchAaveUsdcSnapshot,
  fetchAaveUsdcSnapshotAtBlock,
} from './aave.js'

import {
  fetchAaveUsdcActivity,
} from './activity.js'

import {
  createMorphoUsdcAdapter,
  MORPHO_WSTETH_USDC_MARKET_ID,
  parseMorphoMarketId,
} from './morpho.js'

const aaveUsdc:
  ProtocolAdapter = {
    target:
      'aave:usdc',

    label:
      'Aave V3 / Ethereum / USDC',

    fetchCurrentSnapshot:
      fetchAaveUsdcSnapshot,

    fetchSnapshotAtBlock:
      fetchAaveUsdcSnapshotAtBlock,

    fetchActivity:
      fetchAaveUsdcActivity,
  }

const morphoWstethUsdc =
  createMorphoUsdcAdapter(
    MORPHO_WSTETH_USDC_MARKET_ID,
    'morpho:wsteth-usdc',
    'Morpho Blue / Ethereum / USDC / wstETH',
  )

const adapters =
  new Map<
    string,
    ProtocolAdapter
  >([
    [
      aaveUsdc.target,
      aaveUsdc,
    ],

    [
      morphoWstethUsdc.target,
      morphoWstethUsdc,
    ],
  ])

export function getAdapter(
  target: string,
): ProtocolAdapter {
  const normalized =
    target.toLowerCase()

  const staticAdapter =
    adapters.get(
      normalized
    )

  if (
    staticAdapter
  ) {
    return staticAdapter
  }

  /*
   * Generic Morpho Market ID:
   *
   * morpho:0x<64 hex chars>
   *
   * For now only USDC loan-token markets
   * are accepted by the Morpho adapter.
   */
  if (
    normalized.startsWith(
      'morpho:0x'
    )
  ) {
    const marketIdText =
      normalized.slice(
        'morpho:'.length
      )

    const marketId =
      parseMorphoMarketId(
        marketIdText
      )

    return createMorphoUsdcAdapter(
      marketId,
      normalized,
      `Morpho Blue / Ethereum / USDC / ${shortMarketId(
        marketId
      )}`,
    )
  }

  throw new Error(
    [
      `Unsupported target: ${target}`,
      '',
      `Supported targets: ${listTargets().join(
        ', '
      )}`,
      '',
      'You can also use:',
      'morpho:0x<marketId>',
    ].join('\n')
  )
}

export function listTargets() {
  return [
    ...adapters.keys(),
  ]
}

function shortMarketId(
  id: string,
) {
  return `${id.slice(
    0,
    10
  )}...${id.slice(
    -6
  )}`
}
