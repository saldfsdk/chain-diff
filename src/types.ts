export type InterestIndexState = {
  index: number
  scaledDebt: number
}

export type Snapshot = {
  target: string
  capturedAt: number
  blockNumber: number

  availableLiquidity: number
  totalSupply: number
  totalDebt: number
  utilization: number

  supplyApr: number
  borrowApr: number

  interestIndex?: InterestIndexState
}

export type Activity = {
  type:
    | 'SUPPLY'
    | 'WITHDRAW'
    | 'BORROW'
    | 'REPAY'

  amount: number
  address: string
  txHash: string
  blockNumber: number
  useATokens?: boolean
}

export type ActivitySummary = {
  supplied: number
  withdrawn: number
  borrowed: number
  repaidUnderlying: number
  repaidATokens: number

  netLiquidityFlow: number

  events: Activity[]
}

export type ProtocolAdapter = {
  target: string
  label: string

  fetchCurrentSnapshot:
    () => Promise<Snapshot>

  fetchSnapshotAtBlock:
    (
      blockNumber: bigint,
    ) => Promise<Snapshot>

  fetchActivity:
    (
      fromBlockNumber: number,
      toBlockNumber: number,
    ) => Promise<ActivitySummary>
}
