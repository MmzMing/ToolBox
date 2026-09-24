/**
 * 在线曲库取数：链接解析 + Meting 客户端。
 *
 * 全部纯逻辑，`fetchImpl` 由外部注入，所以单测不发真实请求。
 * 抛错统一用 MusicError，kind 给界面翻译成八种文案，message 保留英文技术信息（AGENTS.md §7）。
 */
import { MUSIC_API_DEFAULTS, MUSIC_DEFAULTS, MUSIC_LIMITS } from './music-config'

export type MusicServer = 'netease' | 'tencent'
export type MusicType = 'playlist' | 'song' | 'album'

export type MusicTarget = { server: MusicServer; type: MusicType; id: string }

export type Track = {
  /** 平台曲目 id，没有就退回用 url 当键 */
  id: string
  name: string
  artist: string
  /** 音频直链（Meting 二跳地址，带签名时效，不可长期保存） */
  url: string
  pic: string
  /** LRC 正文，或一个指向 LRC 的 url；没有则空串 */
  lrc: string
  duration: number
}

export type MusicErrorKind =
  'badLink' | 'badApi' | 'apiDown' | 'cors' | 'notPlayable' | 'tooLarge' | 'timeout' | 'noLyrics'

export class MusicError extends Error {
  readonly kind: MusicErrorKind
  constructor(kind: MusicErrorKind, message: string) {
    super(message)
    this.name = 'MusicError'
    this.kind = kind
  }
}

/** 只用到这几个成员，测试里也好造假 */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text: () => Promise<string>
  arrayBuffer: () => Promise<ArrayBuffer>
}>

/* ------------------------------ 链接解析 ------------------------------ */

const first = (re: RegExp, text: string): string | null => {
  const m = re.exec(text)
  return m?.[1] ?? null
}

/**
 * 从粘贴的链接或纯 ID 里解析出取数目标。
 * 支持网易云的歌单 / 单曲 / 专辑 / 榜单，QQ 音乐的歌单与 disstid；
 * 纯数字按默认（网易云歌单）处理。认不出来返回 null。
 */
export function parseMusicLink(input: string): MusicTarget | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null

  if (/^\d{4,20}$/.test(raw)) {
    return { server: MUSIC_DEFAULTS.server, type: MUSIC_DEFAULTS.type, id: raw }
  }

  const isTencent = /(^|\.)y\.qq\.com|qq\.com|yuancaigou/i.test(raw) && !/163\.com/i.test(raw)
  if (isTencent) {
    const playlist = first(/playlist\/(\d{4,20})/i, raw) ?? first(/disstid=(\d{4,20})/i, raw) ?? ''
    if (playlist) return { server: 'tencent', type: 'playlist', id: playlist }
    const song = first(/(?:songdetail|song)\/(?:00[0-9a-z]{26,30}|(\d{4,20}))/i, raw)
    if (song) return { server: 'tencent', type: 'song', id: song }
    const album = first(/album\/(\d{4,20})/i, raw)
    if (album) return { server: 'tencent', type: 'album', id: album }
    return null
  }

  const isNetease = /163\.com|music\.126\.net/i.test(raw)
  if (!isNetease) return null
  const byQuery = first(/(?:id|disstid|songid)=(\d{4,20})/i, raw)
  const byPath = first(/\/(?:song|album|playlist)\/(\d{4,20})/i, raw)
  const id = byQuery ?? byPath
  if (!id) return null
  const type: MusicType = /album/i.test(raw) ? 'album' : /song/i.test(raw) ? 'song' : 'playlist'
  return { server: 'netease', type, id }
}

/** 校验并归一化用户自填的接口地址：必须是 https 绝对地址 */
export function normalizeApi(input: string): string {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new MusicError('badApi', 'Custom API is not an absolute URL')
  }
  if (url.protocol !== 'https:') {
    throw new MusicError('badApi', 'Custom API must use https')
  }
  return url.toString()
}

/** 自定义实例排最前，其后是内置默认；去重，空值忽略 */
export function resolveApis(custom: string | null | undefined): string[] {
  const out: string[] = []
  for (const api of [custom ?? '', ...MUSIC_API_DEFAULTS]) {
    if (api && !out.includes(api)) out.push(api)
  }
  return out
}

/** 模板里带占位符就替换，只填了站点地址就自动补查询串 */
export function buildApiUrl(template: string, target: MusicTarget): string {
  const query = `server=${target.server}&type=${target.type}&id=${target.id}`
  if (template.includes(':server')) {
    return template
      .replace(':server', target.server)
      .replace(':type', target.type)
      .replace(':id', target.id)
      .replace(':r', Math.random().toString(36).slice(2, 10))
  }
  return `${template}${template.includes('?') ? '&' : '?'}${query}`
}

/* ------------------------------ 请求 ------------------------------ */

/** 带超时的 fetch；上游抛网络错误时归一化成 MusicError */
async function request(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<Awaited<ReturnType<FetchLike>>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { signal: controller.signal })
  } catch (e) {
    if (controller.signal.aborted) throw new MusicError('timeout', `Request timed out: ${url}`)
    throw new MusicError('cors', `Network or CORS failure: ${url} (${String(e)})`)
  } finally {
    clearTimeout(timer)
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const num = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
    // 有些实例给的是 "mm:ss"
    const mm = /^(\d+):(\d{1,2})$/.exec(v.trim())
    if (mm) return Number(mm[1]) * 60 + Number(mm[2])
  }
  return 0
}

/** 各家 Meting 实例字段名不统一（title/name、author/artist、pic/cover），在这里归一 */
function normalizeTrack(item: Record<string, unknown>): Track {
  const url = str(item.url)
  return {
    id: str(item.id) || url,
    name: str(item.title) || str(item.name) || '未知曲目',
    artist: str(item.author) || str(item.artist) || '未知歌手',
    url,
    pic: str(item.pic) || str(item.cover) || str(item.img) || '',
    lrc: str(item.lrc),
    duration: num(item.duration ?? item.time),
  }
}

export type PlaylistResult = { tracks: Track[]; api: string; fellBack: boolean }

/** 依次尝试接口，第一个拿到非空列表的就赢 */
export async function fetchPlaylist(
  target: MusicTarget,
  opts: { apis: string[]; fetchImpl: FetchLike; timeoutMs?: number; limit?: number },
): Promise<PlaylistResult> {
  const { apis, fetchImpl } = opts
  const timeoutMs = opts.timeoutMs ?? MUSIC_LIMITS.timeoutMs
  const limit = opts.limit ?? MUSIC_LIMITS.listLimit
  let lastError: unknown = null
  for (const [i, api] of apis.entries()) {
    try {
      const res = await request(fetchImpl, buildApiUrl(api, target), timeoutMs)
      if (!res.ok) throw new MusicError('apiDown', `API ${api} responded ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data)) throw new MusicError('apiDown', `API ${api} returned non-array`)
      const usable = (data as Record<string, unknown>[])
        .map(normalizeTrack)
        .filter((t) => t.url.length > 0)
        .slice(0, limit)
      if (!usable.length) throw new MusicError('apiDown', `API ${api} returned no playable track`)
      return { tracks: usable, api, fellBack: i > 0 }
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof MusicError
    ? lastError
    : new MusicError('apiDown', 'All music APIs failed')
}

/** 下载音频字节；界面拿到后包成 File 交给现有解码链路 */
export async function downloadTrack(
  url: string,
  opts: { fetchImpl: FetchLike; timeoutMs?: number; maxBytes?: number },
): Promise<ArrayBuffer> {
  if (!url) throw new MusicError('notPlayable', 'Track has no audio url')
  const timeoutMs = opts.timeoutMs ?? MUSIC_LIMITS.timeoutMs
  const maxBytes = opts.maxBytes ?? MUSIC_LIMITS.maxBytes
  const res = await request(opts.fetchImpl, url, timeoutMs)
  if (!res.ok) {
    throw new MusicError('notPlayable', `Audio responded ${res.status}: ${url}`)
  }
  const buf = await res.arrayBuffer()
  if (!buf.byteLength) throw new MusicError('notPlayable', `Audio is empty: ${url}`)
  if (buf.byteLength > maxBytes) {
    throw new MusicError('tooLarge', `Audio is ${buf.byteLength} bytes, over the ${maxBytes} limit`)
  }
  return buf
}

/** lrc 字段可能是正文，也可能是一个 url */
export async function resolveLyrics(
  lrc: string,
  opts: { fetchImpl: FetchLike; timeoutMs?: number },
): Promise<string> {
  const raw = String(lrc ?? '').trim()
  if (!raw) return ''
  const isUrl =
    /^https?:\/\//i.test(raw) || raw.startsWith('//') || /\.(lrc|txt)(\?|#|$)/i.test(raw)
  if (!isUrl) return raw
  const res = await request(opts.fetchImpl, raw, opts.timeoutMs ?? MUSIC_LIMITS.timeoutMs)
  if (!res.ok) throw new MusicError('noLyrics', `Lyrics responded ${res.status}`)
  return await res.text()
}

/** 秒 → m:ss；拿不到时长就返回空串，界面上不画占位符 */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (!s) return ''
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
