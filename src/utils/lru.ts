export type StorageStat = { id: string; createdAt: number; bytes: number }

/** 按 createdAt 从旧到新淘汰，直到条数与总体积都回到上限内 */
export function selectEvictIds(
  stats: readonly StorageStat[],
  maxCount: number,
  maxBytes: number,
): string[] {
  const sorted = [...stats].sort((a, b) => a.createdAt - b.createdAt)
  const evict: string[] = []
  let bytes = sorted.reduce((sum, stat) => sum + stat.bytes, 0)
  let count = sorted.length
  for (const stat of sorted) {
    if (count <= maxCount && bytes <= maxBytes) {
      break
    }
    evict.push(stat.id)
    count -= 1
    bytes -= stat.bytes
  }
  return evict
}
