import { isValidBaseUrl, type AIProvider } from '@/modules/ai/providers'
import type { ImageRequestParams } from '@/modules/ai/transport'

export type ApiLike = {
  provider: AIProvider
  apiKey: string
  baseUrl: string
  model: string
}

/** 配置指纹：key/地址/模型任一变化即失效，绿点随之回红 */
export function apiSignature(api: ApiLike): string {
  return [api.provider, api.model.trim(), api.baseUrl.trim(), api.apiKey.trim().slice(-12)].join(
    '|',
  )
}

/** 红/绿状态：未开启或未配置为红；配置齐且当前指纹测试通过才绿 */
export function apiReady(api: ApiLike, enabled: boolean, testedSignature: string): boolean {
  if (!enabled || !api.apiKey.trim() || !api.model.trim() || !isValidBaseUrl(api.baseUrl)) {
    return false
  }
  return testedSignature === apiSignature(api)
}

export const ASPECT_KEYS = ['auto', '1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4'] as const
export type AspectKey = (typeof ASPECT_KEYS)[number]

export type Quality = 'auto' | 'low' | 'medium' | 'high'
export type OutputFormat = 'png' | 'jpeg' | 'webp'
export type Background = 'auto' | 'transparent' | 'opaque'
export type ImageSize = '1K' | '2K' | '4K'
export type InputFidelity = 'low' | 'high'

export type GenParams = {
  aspect: AspectKey
  quality: Quality
  count: number
  imageSize: ImageSize
  /** 仅 Gemini 生效；空串表示不锁 seed */
  seed: string
  background: Background
  outputFormat: OutputFormat
  outputCompression: number
  inputFidelity: InputFidelity
}

export const MAX_COUNT = 4
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024
export const REFERENCE_MIMES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']

export const defaultGenParams = (): GenParams => ({
  aspect: '1:1',
  quality: 'auto',
  count: 1,
  imageSize: '1K',
  seed: '',
  background: 'auto',
  outputFormat: 'png',
  outputCompression: 100,
  inputFidelity: 'high',
})

/** OpenAI 只吃三档像素尺寸，其余比例就近映射 */
const OPENAI_SIZE: Record<AspectKey, string> = {
  auto: 'auto',
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '16:9': '1536x1024',
  '9:16': '1024x1536',
  '4:3': '1536x1024',
  '3:4': '1024x1536',
}

export const openaiSizeFor = (aspect: AspectKey): string => OPENAI_SIZE[aspect]

const has = <T extends readonly string[]>(list: T, value: unknown): value is T[number] =>
  typeof value === 'string' && (list as readonly string[]).includes(value)

const QUALITIES = ['auto', 'low', 'medium', 'high'] as const
const IMAGE_SIZES = ['1K', '2K', '4K'] as const
const BACKGROUNDS = ['auto', 'transparent', 'opaque'] as const
const OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const
const FIDELITIES = ['low', 'high'] as const

/** 只补全与夹紧，不抛错：参数条任何手输都不该让页面崩 */
export function normalizeGenParams(raw: Partial<GenParams> | null | undefined): GenParams {
  const base = defaultGenParams()
  const source = raw ?? {}
  const count = Math.round(Number(source.count))
  const compression = Math.round(Number(source.outputCompression))
  return {
    aspect: has(ASPECT_KEYS, source.aspect) ? source.aspect : base.aspect,
    quality: has(QUALITIES, source.quality) ? source.quality : base.quality,
    count: Number.isFinite(count) ? Math.min(MAX_COUNT, Math.max(1, count)) : base.count,
    imageSize: has(IMAGE_SIZES, source.imageSize) ? source.imageSize : base.imageSize,
    seed: typeof source.seed === 'string' ? source.seed.replace(/[^\d]/g, '').slice(0, 10) : '',
    background: has(BACKGROUNDS, source.background) ? source.background : base.background,
    outputFormat: has(OUTPUT_FORMATS, source.outputFormat)
      ? source.outputFormat
      : base.outputFormat,
    outputCompression: Number.isFinite(compression)
      ? Math.min(100, Math.max(0, compression))
      : base.outputCompression,
    inputFidelity: has(FIDELITIES, source.inputFidelity)
      ? source.inputFidelity
      : base.inputFidelity,
  }
}

export function toImageRequestParams(
  provider: 'openai' | 'gemini',
  params: GenParams,
): ImageRequestParams {
  if (provider === 'openai') {
    return {
      count: params.count,
      size: openaiSizeFor(params.aspect),
      quality: params.quality,
      background: params.background,
      outputFormat: params.outputFormat,
      outputCompression: params.outputFormat === 'png' ? null : params.outputCompression,
      inputFidelity: params.inputFidelity,
    }
  }
  const seed = /^\d+$/.test(params.seed) ? Number(params.seed) : null
  return {
    count: params.count,
    aspectRatio: params.aspect === 'auto' ? undefined : params.aspect,
    imageSize: params.imageSize,
    seed,
  }
}

/** 反推输出解析：JSON 数组（含围栏）优先，退化为按行取候选；对象候选序列化成可读 JSON */
export function parsePromptCandidates(text: string): string[] {
  const trimmed = text.trim()
  const collected: unknown[] = []
  const payloads = [
    trimmed,
    trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1],
    trimmed.match(/\[[\s\S]*\]/)?.[0],
  ]
  for (const payload of payloads) {
    if (!payload) {
      continue
    }
    try {
      const parsed: unknown = JSON.parse(payload)
      if (Array.isArray(parsed)) {
        collected.push(...parsed)
        break
      }
    } catch {
      // 换下一种剥法
    }
  }
  if (!collected.length) {
    collected.push(
      ...trimmed
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
        .filter((line) => line.length >= 8),
    )
  }
  const out: string[] = []
  for (const item of collected) {
    const value = typeof item === 'string' ? item.trim() : JSON.stringify(item, null, 2)
    if (value && !out.includes(value)) {
      out.push(value)
    }
  }
  return out.slice(0, 6)
}
