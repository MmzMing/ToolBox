import { describe, expect, it } from 'vitest'

import { MUSIC_API_DEFAULTS } from '@/tools/video/music-to-video/music-config'
import {
  buildApiUrl,
  downloadTrack,
  fetchPlaylist,
  fmtDuration,
  MusicError,
  normalizeApi,
  parseMusicLink,
  resolveApis,
  resolveLyrics,
  type FetchLike,
} from '@/tools/video/music-to-video/music-source'

/** 假 fetch：按 url 命中预设响应，未命中的直接报错，保证测试绝不发真实请求 */
const fakeFetch = (
  routes: Record<string, unknown | { body: unknown; status?: number } | (() => never)>,
  seen?: string[],
): FetchLike => {
  return async (url) => {
    seen?.push(url)
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) throw new Error(`unexpected fetch: ${url}`)
    const route = routes[key]
    const value = typeof route === 'function' ? route() : route
    const { body, status = 200 } =
      value && typeof value === 'object' && 'body' in (value as object)
        ? (value as { body: unknown; status?: number })
        : { body: value }
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => String(body),
      arrayBuffer: async () =>
        typeof body === 'string'
          ? (new TextEncoder().encode(body).buffer as ArrayBuffer)
          : ((body as ArrayBuffer) ?? new ArrayBuffer(0)),
    }
  }
}

describe('parseMusicLink', () => {
  it('识别网易云歌单链接（hash 路由与 m/ 路径两种写法）', () => {
    expect(parseMusicLink('https://music.163.com/#/playlist?id=17955431099')).toEqual({
      server: 'netease',
      type: 'playlist',
      id: '17955431099',
    })
    expect(parseMusicLink('https://music.163.com/m/playlist?id=88888888')?.type).toBe('playlist')
  })

  it('识别单曲与专辑链接', () => {
    expect(parseMusicLink('https://music.163.com/#/song?id=3415867798')).toMatchObject({
      type: 'song',
      id: '3415867798',
    })
    expect(parseMusicLink('https://music.163.com/album?id=12345678')).toMatchObject({
      type: 'album',
      id: '12345678',
    })
    expect(parseMusicLink('https://music.163.com/song/3415867798')).toMatchObject({ type: 'song' })
  })

  it('识别 QQ 音乐歌单（路径式与 disstid 式）', () => {
    expect(parseMusicLink('https://y.qq.com/n/ryqq/playlist/7967752005')).toEqual({
      server: 'tencent',
      type: 'playlist',
      id: '7967752005',
    })
    expect(parseMusicLink('https://c.y.qq.com/s3/fcgi/fcgp?disstid=1234567890')).toMatchObject({
      server: 'tencent',
      id: '1234567890',
    })
  })

  it('纯数字按默认目标处理', () => {
    expect(parseMusicLink('17955431099')).toEqual({
      server: 'netease',
      type: 'playlist',
      id: '17955431099',
    })
  })

  it('空串、乱码与不相关站点都返回 null', () => {
    expect(parseMusicLink('')).toBeNull()
    expect(parseMusicLink('   ')).toBeNull()
    expect(parseMusicLink('不是链接')).toBeNull()
    expect(parseMusicLink('https://example.com/playlist?id=1')).toBeNull()
    expect(parseMusicLink('https://music.163.com/#/playlist')).toBeNull()
    expect(parseMusicLink('12')).toBeNull()
  })

  it('链接带跟踪参数也能取到 id', () => {
    expect(
      parseMusicLink('https://music.163.com/playlist?id=99887766&uctoken=abc&songIds=1,2,3'),
    ).toMatchObject({ id: '99887766' })
  })
})

describe('接口地址', () => {
  it('自定义实例排在内置默认之前', () => {
    const apis = resolveApis('https://mine.example.com/meting/')
    expect(apis[0]).toBe('https://mine.example.com/meting/')
    expect(apis.slice(1)).toEqual([...MUSIC_API_DEFAULTS])
  })

  it('留空或重复时不产生空项', () => {
    expect(resolveApis('')).toEqual([...MUSIC_API_DEFAULTS])
    expect(resolveApis(MUSIC_API_DEFAULTS[0])).toEqual([...MUSIC_API_DEFAULTS])
  })

  it('只接受 https 绝对地址', () => {
    expect(normalizeApi('https://a.example/meting/?server=:server&type=:type&id=:id')).toContain(
      ':server',
    )
    expect(() => normalizeApi('http://a.example')).toThrow(MusicError)
    expect(() => normalizeApi('a.example')).toThrow(MusicError)
    expect(() => normalizeApi('not a url')).toThrow(MusicError)
    expect(normalizeApi('')).toBe('')
  })

  it('模板有占位符就替换，只有站点就补查询串', () => {
    const target = { server: 'netease', type: 'playlist', id: '42' } as const
    expect(buildApiUrl('https://a/meting/?server=:server&type=:type&id=:id', target)).toBe(
      'https://a/meting/?server=netease&type=playlist&id=42',
    )
    expect(buildApiUrl('https://a/meting/', target)).toBe(
      'https://a/meting/?server=netease&type=playlist&id=42',
    )
    expect(buildApiUrl('https://a/meting/?x=1', target)).toBe(
      'https://a/meting/?x=1&server=netease&type=playlist&id=42',
    )
  })
})

describe('fetchPlaylist', () => {
  const target = { server: 'netease', type: 'playlist', id: '1' } as const
  const primary = 'https://primary.test/meting/'
  const backup = 'https://backup.test/meting/'

  it('归一化各实例的字段差异', async () => {
    const r = await fetchPlaylist(target, {
      apis: [primary],
      fetchImpl: fakeFetch({
        'primary.test': [
          { title: '甲', author: 'A', url: 'u1', pic: 'p1', lrc: '[00:00.00]x', duration: 65 },
          { name: '乙', artist: 'B', cover: 'p2', url: 'u2', time: '1:05' },
        ],
      }),
    })
    expect(r.tracks.map((t) => [t.name, t.artist, t.duration])).toEqual([
      ['甲', 'A', 65],
      ['乙', 'B', 65],
    ])
    expect(r.tracks[0].pic).toBe('p1')
    expect(r.fellBack).toBe(false)
  })

  it('丢掉没有音频地址的曲目（VIP / 下架）', async () => {
    const r = await fetchPlaylist(target, {
      apis: [primary],
      fetchImpl: fakeFetch({ 'primary.test': [{ title: 'ok', url: 'u' }, { title: 'no url' }] }),
    })
    expect(r.tracks).toHaveLength(1)
  })

  it('主实例失败时回落备用，并报告 fellBack', async () => {
    const seen: string[] = []
    const r = await fetchPlaylist(target, {
      apis: [primary, backup],
      fetchImpl: fakeFetch(
        { 'primary.test': { body: [], status: 500 }, 'backup.test': [{ title: 'x', url: 'u' }] },
        seen,
      ),
    })
    expect(r.api).toBe(backup)
    expect(r.fellBack).toBe(true)
    expect(seen).toHaveLength(2)
  })

  it('全部失败归为 apiDown', async () => {
    await expect(
      fetchPlaylist(target, {
        apis: [primary, backup],
        fetchImpl: fakeFetch({
          'primary.test': { body: [], status: 503 },
          'backup.test': { body: [], status: 404 },
        }),
      }),
    ).rejects.toMatchObject({ kind: 'apiDown' })
  })

  it('返回非数组或全不可播也算实例失败', async () => {
    await expect(
      fetchPlaylist(target, {
        apis: [primary],
        fetchImpl: fakeFetch({ 'primary.test': { msg: 'nope' } }),
      }),
    ).rejects.toMatchObject({ kind: 'apiDown' })
    await expect(
      fetchPlaylist(target, { apis: [primary], fetchImpl: fakeFetch({ 'primary.test': [] }) }),
    ).rejects.toMatchObject({ kind: 'apiDown' })
  })

  it('网络层抛错归为 cors', async () => {
    await expect(
      fetchPlaylist(target, {
        apis: [primary],
        fetchImpl: async () => {
          throw new TypeError('Failed to fetch')
        },
      }),
    ).rejects.toMatchObject({ kind: 'cors' })
  })

  it('列表按上限截断', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ title: `t${i}`, url: `u${i}` }))
    const r = await fetchPlaylist(target, {
      apis: [primary],
      fetchImpl: fakeFetch({ 'primary.test': many }),
      limit: 50,
    })
    expect(r.tracks).toHaveLength(50)
  })
})

describe('downloadTrack', () => {
  it('取回字节', async () => {
    const buf = await downloadTrack('https://cdn.test/a.mp3', {
      fetchImpl: fakeFetch({ 'cdn.test': { body: new ArrayBuffer(1024) } }),
    })
    expect(buf.byteLength).toBe(1024)
  })

  it('没有直链 / 空响应 / 非 2xx 都算不可播', async () => {
    await expect(downloadTrack('', { fetchImpl: fakeFetch({}) })).rejects.toMatchObject({
      kind: 'notPlayable',
    })
    await expect(
      downloadTrack('https://cdn.test/a.mp3', {
        fetchImpl: fakeFetch({ 'cdn.test': { body: [], status: 403 } }),
      }),
    ).rejects.toMatchObject({ kind: 'notPlayable' })
    await expect(
      downloadTrack('https://cdn.test/a.mp3', {
        fetchImpl: fakeFetch({ 'cdn.test': { body: new ArrayBuffer(0) } }),
      }),
    ).rejects.toMatchObject({ kind: 'notPlayable' })
  })

  it('超过上限报 tooLarge', async () => {
    await expect(
      downloadTrack('https://cdn.test/big.mp3', {
        fetchImpl: fakeFetch({ 'cdn.test': { body: new ArrayBuffer(2048) } }),
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({ kind: 'tooLarge' })
  })
})

describe('resolveLyrics', () => {
  it('内联正文原样返回，url 才去取', async () => {
    const inline = '[00:01.00]第一句'
    expect(await resolveLyrics(inline, { fetchImpl: fakeFetch({}) })).toBe(inline)
    const fetched = await resolveLyrics('https://api.test/lrc?id=1', {
      fetchImpl: fakeFetch({ 'api.test': '[00:02.00]第二句' }),
    })
    expect(fetched).toContain('第二句')
  })

  it('空值与 .lrc 路径也各走各的分支', async () => {
    expect(await resolveLyrics('', { fetchImpl: fakeFetch({}) })).toBe('')
    expect(await resolveLyrics('   ', { fetchImpl: fakeFetch({}) })).toBe('')
    const viaPath = await resolveLyrics('/assets/music/a.lrc', {
      fetchImpl: fakeFetch({ '/assets/music/a.lrc': '[00:03.00]第三句' }),
    })
    expect(viaPath).toContain('第三句')
  })

  it('歌词拉不到时归为 noLyrics', async () => {
    await expect(
      resolveLyrics('https://api.test/lrc', {
        fetchImpl: fakeFetch({ 'api.test': { body: '', status: 500 } }),
      }),
    ).rejects.toMatchObject({ kind: 'noLyrics' })
  })
})

describe('fmtDuration', () => {
  it('秒转 m:ss，缺时长给占位符', () => {
    expect(fmtDuration(65)).toBe('1:05')
    expect(fmtDuration(600)).toBe('10:00')
    expect(fmtDuration(0)).toBe('')
    expect(fmtDuration(-3)).toBe('')
  })
})
