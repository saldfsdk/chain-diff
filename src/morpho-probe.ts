import {
  formatUnits,
  parseAbi,
  type Address,
} from 'viem'

import {
  type MarketId,
} from '@morpho-org/blue-sdk'

import {
  fetchMarket,
  fetchMarketParams,
} from '@morpho-org/blue-sdk-viem'

import {
  client,
} from './ethereum.js'

const MARKET_ID =
  '0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc' as MarketId

const erc20Abi =
  parseAbi([
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
  ])

async function tokenInfo(
  address: Address,
  blockNumber: bigint,
) {
  const [
    symbol,
    decimals,
  ] =
    await Promise.all([
      client.readContract({
        address,
        abi: erc20Abi,
        functionName: 'symbol',
        blockNumber,
      }),

      client.readContract({
        address,
        abi: erc20Abi,
        functionName: 'decimals',
        blockNumber,
      }),
    ])

  return {
    symbol,
    decimals,
  }
}

function assets(
  value: bigint,
  decimals: number,
) {
  return Number(
    formatUnits(
      value,
      decimals,
    )
  )
}

function wadPercent(
  value: bigint,
) {
  return (
    Number(
      formatUnits(
        value,
        18,
      )
    ) * 100
  )
}

async function inspectMarket(
  blockNumber: bigint,
) {
  const block =
    await client.getBlock({
      blockNumber,
    })

  const params =
    await fetchMarketParams(
      MARKET_ID,
      client,
    )

  const market =
    await fetchMarket(
      MARKET_ID,
      client,
      {
        blockNumber,
      },
    )

  const loan =
    await tokenInfo(
      params.loanToken as Address,
      blockNumber,
    )

  const collateral =
    await tokenInfo(
      params.collateralToken as Address,
      blockNumber,
    )

  const accrued =
    market.accrueInterest(
      block.timestamp
    )

  console.log('')
  console.log(
    `Block ${blockNumber.toLocaleString()}`
  )

  console.log(
    `Timestamp ${block.timestamp}`
  )

  console.log('')
  console.log(
    `Loan token:       ${loan.symbol}`
  )

  console.log(
    `Collateral token: ${collateral.symbol}`
  )

  console.log('')
  console.log('RAW MARKET')

  console.log(
    `Supply:    ${assets(
      market.totalSupplyAssets,
      loan.decimals,
    ).toLocaleString()} ${loan.symbol}`
  )

  console.log(
    `Borrow:    ${assets(
      market.totalBorrowAssets,
      loan.decimals,
    ).toLocaleString()} ${loan.symbol}`
  )

  console.log(
    `Liquidity: ${assets(
      market.liquidity,
      loan.decimals,
    ).toLocaleString()} ${loan.symbol}`
  )

  console.log(
    `Utilization: ${wadPercent(
      market.utilization
    ).toFixed(2)}%`
  )

  console.log('')
  console.log('ACCRUED TO BLOCK TIME')

  console.log(
    `Supply:    ${assets(
      accrued.totalSupplyAssets,
      loan.decimals,
    ).toLocaleString()} ${loan.symbol}`
  )

  console.log(
    `Borrow:    ${assets(
      accrued.totalBorrowAssets,
      loan.decimals,
    ).toLocaleString()} ${loan.symbol}`
  )

  console.log(
    `Liquidity: ${assets(
      accrued.liquidity,
      loan.decimals,
    ).toLocaleString()} ${loan.symbol}`
  )

  console.log(
    `Utilization: ${wadPercent(
      accrued.utilization
    ).toFixed(2)}%`
  )

  console.log('')
  console.log('APY')

  console.log(
    `Supply APY raw: ${accrued.getSupplyApy(
      block.timestamp
    )}`
  )

  console.log(
    `Borrow APY raw: ${accrued.getBorrowApy(
      block.timestamp
    )}`
  )
}

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

console.log(
  '=== MORPHO LATEST ==='
)

await inspectMarket(
  latest.number
)

const historicalBlock =
  latest.number > 10n
    ? latest.number - 10n
    : latest.number

console.log('')
console.log(
  '=== MORPHO HISTORICAL ==='
)

await inspectMarket(
  historicalBlock
)


