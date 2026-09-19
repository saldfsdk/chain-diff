import {
  createPublicClient,
  http,
} from 'viem'

import {
  mainnet,
} from 'viem/chains'

export const client =
  createPublicClient({
    chain: mainnet,

    transport:
      process.env.ETH_RPC_URL
        ? http(
            process.env.ETH_RPC_URL
          )
        : http(),
  })

export async function findBlockAtOrBeforeTimestamp(
  targetTimestamp: number,
): Promise<bigint> {
  const latest =
    await client.getBlock({
      blockTag: 'latest',
    })

  if (
    latest.number === null
  ) {
    throw new Error(
      'Latest block has no block number.'
    )
  }

  const target =
    BigInt(
      targetTimestamp
    )

  if (
    latest.timestamp <= target
  ) {
    return latest.number
  }

  let upper =
    latest.number

  let step =
    32n

  let lower =
    upper > step
      ? upper - step
      : 0n

  let lowerBlock =
    await client.getBlock({
      blockNumber: lower,
    })

  while (
    lowerBlock.timestamp >
      target &&
    lower > 0n
  ) {
    upper = lower

    step *= 2n

    lower =
      upper > step
        ? upper - step
        : 0n

    lowerBlock =
      await client.getBlock({
        blockNumber: lower,
      })
  }

  while (
    lower + 1n <
    upper
  ) {
    const middle =
      (
        lower +
        upper
      ) / 2n

    const middleBlock =
      await client.getBlock({
        blockNumber:
          middle,
      })

    if (
      middleBlock.timestamp <=
      target
    ) {
      lower =
        middle
    } else {
      upper =
        middle
    }
  }

  return lower
}
