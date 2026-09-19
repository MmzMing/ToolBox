/**
 * ETA 计算（纯逻辑）。人性化文本由 i18n 层拼接，service 返回结构化数据。
 */

export interface EtaTextParts {
  h: number
  m: number
  s: number
}

export interface EtaResult {
  /** 进度百分比（四舍五入到 2 位小数） */
  percent: number
  /** 剩余数量 */
  remaining: number
  /** 预计剩余秒数；进度信息不足以估算时为 Infinity */
  remainingSeconds: number
  /** 剩余时间的时分秒结构；无法估算时为 null */
  etaText: EtaTextParts | null
  /** 预计完成时间戳（毫秒，当前时间 + 剩余秒数）；无法估算时为 null */
  etaTimestamp: number | null
}

/**
 * 根据已完成数量、总量与已用时间估算剩余时间与完成时间戳。
 * done > total、elapsedSeconds < 0、total <= 0、done < 0 时抛 Error。
 * done = 0 或 elapsedSeconds = 0 时无法估算（remainingSeconds 为 Infinity，etaText 为 null）。
 */
export function calculateEta(done: number, total: number, elapsedSeconds: number): EtaResult {
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(`Total must be a positive number: ${total}`)
  }
  if (!Number.isFinite(done) || done < 0) {
    throw new Error(`Done must be a non-negative number: ${done}`)
  }
  if (done > total) {
    throw new Error(`Done (${done}) cannot exceed total (${total})`)
  }
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error(`Elapsed seconds must be a non-negative number: ${elapsedSeconds}`)
  }

  const percent = Math.round((done / total) * 10000) / 100
  const remaining = total - done

  if (remaining === 0) {
    return {
      percent: 100,
      remaining: 0,
      remainingSeconds: 0,
      etaText: { h: 0, m: 0, s: 0 },
      etaTimestamp: Date.now(),
    }
  }

  const canEstimate = done > 0 && elapsedSeconds > 0
  if (!canEstimate) {
    return {
      percent,
      remaining,
      remainingSeconds: Infinity,
      etaText: null,
      etaTimestamp: null,
    }
  }

  const remainingSeconds = remaining / (done / elapsedSeconds)
  const totalRounded = Math.round(remainingSeconds)
  return {
    percent,
    remaining,
    remainingSeconds,
    etaText: {
      h: Math.floor(totalRounded / 3600),
      m: Math.floor((totalRounded % 3600) / 60),
      s: totalRounded % 60,
    },
    etaTimestamp: Date.now() + remainingSeconds * 1000,
  }
}
