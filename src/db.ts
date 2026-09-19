import {
  DatabaseSync,
} from 'node:sqlite'

import {
  resolve,
} from 'node:path'

import type {
  Snapshot,
} from './types.js'

const db =
  new DatabaseSync(
    resolve(
      process.cwd(),
      'chain-diff.db',
    )
  )

db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    target TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    block_number INTEGER NOT NULL,

    available_liquidity REAL NOT NULL,
    total_supply REAL NOT NULL,
    total_debt REAL NOT NULL,
    utilization REAL NOT NULL,

    supply_apr REAL NOT NULL,
    borrow_apr REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_target_time
  ON snapshots(target, captured_at);
`)

type SnapshotRow = {
  target: string
  captured_at: number
  block_number: number

  available_liquidity: number
  total_supply: number
  total_debt: number
  utilization: number

  supply_apr: number
  borrow_apr: number
}

export function saveSnapshot(
  snapshot: Snapshot,
) {
  const stmt =
    db.prepare(`
      INSERT INTO snapshots (
        target,
        captured_at,
        block_number,
        available_liquidity,
        total_supply,
        total_debt,
        utilization,
        supply_apr,
        borrow_apr
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

  stmt.run(
    snapshot.target,
    snapshot.capturedAt,
    snapshot.blockNumber,
    snapshot.availableLiquidity,
    snapshot.totalSupply,
    snapshot.totalDebt,
    snapshot.utilization,
    snapshot.supplyApr,
    snapshot.borrowApr,
  )
}

export function getSnapshotAtOrBefore(
  target: string,
  unixTime: number,
): Snapshot | null {
  const stmt =
    db.prepare(`
      SELECT
        target,
        captured_at,
        block_number,
        available_liquidity,
        total_supply,
        total_debt,
        utilization,
        supply_apr,
        borrow_apr

      FROM snapshots

      WHERE target = ?
        AND captured_at <= ?

      ORDER BY captured_at DESC

      LIMIT 1
    `)

  const row =
    stmt.get(
      target,
      unixTime,
    ) as SnapshotRow | undefined

  if (!row) {
    return null
  }

  return {
    target:
      row.target,

    capturedAt:
      row.captured_at,

    blockNumber:
      row.block_number,

    availableLiquidity:
      row.available_liquidity,

    totalSupply:
      row.total_supply,

    totalDebt:
      row.total_debt,

    utilization:
      row.utilization,

    supplyApr:
      row.supply_apr,

    borrowApr:
      row.borrow_apr,
  }
}
