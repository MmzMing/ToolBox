const urls = new Map<string, string>()

/**
 * 画布按可视区挂载节点，同一张图会被反复挂载；每次重建再回收 object URL 既浪费
 * 又会在 StrictMode 的双挂载下把仍在使用的地址 revoke 掉。这里按记录 id 复用。
 */
export function objectUrlOf(key: string, blob: Blob): string {
  const existing = urls.get(key)
  if (existing) {
    return existing
  }
  const created = URL.createObjectURL(blob)
  urls.set(key, created)
  return created
}

export function releaseObjectUrl(key: string) {
  const existing = urls.get(key)
  if (!existing) {
    return
  }
  URL.revokeObjectURL(existing)
  urls.delete(key)
}
