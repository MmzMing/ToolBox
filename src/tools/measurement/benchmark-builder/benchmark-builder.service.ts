export interface BenchmarkCase {
  /** 场景名称 */
  name: string
  /** 箭头函数源码，如 "() => { ... }"，经 new Function 编译执行 */
  code: string
}

export interface BenchmarkResult {
  name: string
  /** 总耗时（毫秒） */
  totalMs: number
  /** 每次执行平均耗时（毫秒） */
  avgMs: number
  /** 相对最快场景的倍率（最快 = 1） */
  ratio: number
}

/** 将用户输入的函数体源码编译为可调用函数，编译失败或结果不是函数时抛 Error */
export function compileBenchmarkFn(code: string): () => unknown {
  let compiled: unknown
  try {
    compiled = new Function(`return (${code})`)()
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Benchmark code failed to compile: ${reason}`, { cause: err })
  }
  if (typeof compiled !== 'function') {
    throw new Error('Benchmark code must evaluate to a function, e.g. "() => 1 + 1"')
  }
  return compiled as () => unknown
}

/**
 * 逐场景计时：每个场景连续执行 iterations 次后取平均，
 * ratio 为相对最快场景平均耗时的倍率。编译失败抛 Error，iterations 必须为正数。
 */
export function runBenchmark(fns: BenchmarkCase[], iterations: number): BenchmarkResult[] {
  if (!Number.isFinite(iterations) || iterations <= 0) {
    throw new Error('Iterations must be a positive number')
  }
  if (fns.length === 0) {
    return []
  }
  const compiled = fns.map((item) => ({ name: item.name, fn: compileBenchmarkFn(item.code) }))
  const results = compiled.map(({ name, fn }) => {
    const start = performance.now()
    for (let i = 0; i < iterations; i += 1) {
      fn()
    }
    const totalMs = performance.now() - start
    return { name, totalMs, avgMs: totalMs / iterations, ratio: 0 }
  })
  const fastestMs = Math.min(...results.map((result) => result.avgMs))
  return results.map((result) => ({
    ...result,
    ratio: fastestMs > 0 ? result.avgMs / fastestMs : 0,
  }))
}
