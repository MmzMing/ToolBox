/**
 * 在线曲库的配置：内置的 Meting 公共实例与各项上限。
 *
 * 借鉴 my-blog 的 `src/config/musicConfig.ts`：仓库里给一组能用的默认源，
 * 用户在网页上填的地址排在最前、失败后仍会回落到这里。
 *
 * 为什么不用 i-meto：它的 `type=url` 二跳已 404（列表能拉到却放不出声），
 * 我的实测与 my-blog 的配置注释都记录了这一点，所以不列入默认，免得用户以为是自己的链接错了。
 */

/** 内置实例模板，`:server` / `:type` / `:id` 由 buildApiUrl 替换 */
export const MUSIC_API_DEFAULTS: readonly string[] = [
  'https://api.qijieya.cn/meting/?server=:server&type=:type&id=:id',
  'https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id',
]

export const MUSIC_DEFAULTS = {
  server: 'netease',
  type: 'playlist',
} as const

export const MUSIC_LIMITS = {
  /** 单曲字节上限：约 40MB，够一首 60fps 的完整歌，超了直接让用户改用本地文件 */
  maxBytes: 40 * 1024 * 1024,
  /** 单次请求超时（列表与音频共用） */
  timeoutMs: 20_000,
  /** 列表最多渲染多少首，防止长歌单把面板撑爆 */
  listLimit: 50,
} as const

/** 只存这几个键，全部走 localStorage */
export const MUSIC_STORAGE = {
  enabled: 'toolbox.music-to-video.online',
  acknowledged: 'toolbox.music-to-video.onlineAck',
  api: 'toolbox.music-to-video.musicApi',
  /** 上次成功拉取的来源，形如 `netease:17955431099`，仅用于摘要与预填 */
  last: 'toolbox.music-to-video.musicLast',
} as const
