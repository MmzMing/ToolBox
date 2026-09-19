import { diffLines } from 'diff'

export type DiffRowType = 'added' | 'removed' | 'unchanged'

export interface DiffRow {
  type: DiffRowType
  text: string
}

export interface DiffStats {
  added: number
  removed: number
}

/** 行级 diff：每行一条记录，type 为 added / removed / unchanged */
export function buildDiffRows(a: string, b: string): DiffRow[] {
  const changes = diffLines(a, b)
  const rows: DiffRow[] = []

  for (const change of changes) {
    const lines = change.value.split('\n')
    // diffLines 的 value 以 \n 结尾（最后一行除外），split 后会多出一个空串
    if (lines.at(-1) === '') {
      lines.pop()
    }
    const type: DiffRowType = change.added ? 'added' : change.removed ? 'removed' : 'unchanged'
    for (const text of lines) {
      rows.push({ type, text })
    }
  }

  return rows
}

/** 统计 diff 中新增与删除的行数 */
export function diffStats(rows: readonly DiffRow[]): DiffStats {
  return rows.reduce<DiffStats>(
    (stats, row) => {
      if (row.type === 'added') {
        stats.added += 1
      } else if (row.type === 'removed') {
        stats.removed += 1
      }
      return stats
    },
    { added: 0, removed: 0 },
  )
}
