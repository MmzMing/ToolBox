/** 列表重排的最小纯函数集：多个工具共用，不放进任一工具目录（AGENTS.md §7） */

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) {
    throw new Error(`move out of range: ${from} -> ${to} (length ${list.length})`)
  }
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function reverseItems<T>(list: readonly T[]): T[] {
  return [...list].reverse()
}

/** 乒乓：正放一遍再倒放一遍，去掉首尾重复帧，否则会在折返点各停一下 */
export function boomerang<T>(list: readonly T[]): T[] {
  if (list.length < 2) {
    return [...list]
  }
  return [...list, ...list.slice(1, -1).reverse()]
}

export function deleteAt<T>(list: readonly T[], indices: Iterable<number>): T[] {
  const drop = new Set(indices)
  for (const index of drop) {
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
      throw new Error(`index out of range: ${index} (length ${list.length})`)
    }
  }
  return list.filter((_, position) => !drop.has(position))
}

export function duplicateAt<T>(list: readonly T[], index: number): T[] {
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    throw new Error(`index out of range: ${index} (length ${list.length})`)
  }
  const next = [...list]
  next.splice(index + 1, 0, list[index])
  return next
}
