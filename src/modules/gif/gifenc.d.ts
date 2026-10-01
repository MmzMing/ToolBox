/**
 * gifenc 不自带类型，且 Node/Vitest 侧 'gifenc' 会命中 CJS 的 main（无具名导出），
 * 因此统一从 ESM 入口深路径导入，这里补最小声明。
 */
declare module 'gifenc/dist/gifenc.esm.js' {
  export type GifencPalette = number[][]

  export type GifencFrameOptions = {
    palette?: GifencPalette
    first?: boolean
    delay?: number
    repeat?: number
    transparent?: boolean
    transparentIndex?: number
    dispose?: number
    colorDepth?: number
  }

  export type GifencEncoder = {
    writeFrame(index: Uint8Array, width: number, height: number, options?: GifencFrameOptions): void
    finish(): void
    bytes(): Uint8Array<ArrayBuffer>
    bytesView(): Uint8Array
    reset(): void
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifencEncoder

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {
      format?: 'rgb565' | 'rgb444' | 'rgba4444'
      oneBitAlpha?: boolean | number
      clearAlpha?: boolean
      clearAlphaThreshold?: number
      clearAlphaColor?: number
      useSqrt?: boolean
    },
  ): GifencPalette

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifencPalette,
    format?: 'rgb565' | 'rgb444' | 'rgba4444',
  ): Uint8Array
}
