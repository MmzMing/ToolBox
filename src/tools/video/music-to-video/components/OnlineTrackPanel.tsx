/**
 * 在线曲库导入（默认关闭）。
 *
 * 粘贴网易云 / QQ 音乐的歌单或单曲链接 → 拉列表 → 点载入：
 * 音频字节包成 File 交给现有的解码与节拍分析链路，歌词按 LRC 原文填入。
 *
 * 三条硬约束：
 * 1. 关闭时不渲染任何在线控件，也不发一个请求；
 * 2. 首次开启必须过一次告知对话框（会把歌单标识发给第三方实例）；
 * 3. 不缓存音频——Meting 给的直链带签名时效，过期即失效，只能现取现用。
 */
import { useCallback, useRef, useState, type UIEvent } from 'react'
import { Disc3, Loader2, Music, Play, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { Project } from '../engine/types'
import { MUSIC_LIMITS, MUSIC_STORAGE } from '../music-config'
import {
  downloadTrack,
  fetchPlaylist,
  fmtDuration,
  MusicError,
  normalizeApi,
  parseMusicLink,
  resolveApis,
  resolveLyrics,
  type MusicErrorKind,
  type Track,
} from '../music-source'
import { safeFileName } from '../music-to-video.service'

type Props = {
  patch: (part: Partial<Project>) => void
  onAudioFile: (file: File | null) => void
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* 隐私模式下存不了，功能照样可用，只是下次要重填 */
  }
}

/** 列表每次多渲染的行数 */
const PAGE = 20

export function OnlineTrackPanel({ patch, onAudioFile }: Props) {
  const { t } = useTranslation('tools-video', { keyPrefix: 'music-to-video' })
  const [enabled, setEnabled] = useState(() => read(MUSIC_STORAGE.enabled) === '1')
  const [ackOpen, setAckOpen] = useState(false)
  const [link, setLink] = useState(() => {
    const last = read(MUSIC_STORAGE.last)
    return last ? last.split(':').slice(1).join(':') : ''
  })
  const [tracks, setTracks] = useState<Track[]>([])
  const [listing, setListing] = useState(false)
  /** 只有被点的那首显示进度，其余行保持原样 */
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadingName, setLoadingName] = useState('')
  const [error, setError] = useState<MusicErrorKind | null>(null)
  const [note, setNote] = useState<'fellBack' | null>(null)
  /** 一屏装不下 50 行，滚到底再往下渲染，免得一次建满 DOM */
  const [shown, setShown] = useState(PAGE)
  const [apiInput, setApiInput] = useState(() => read(MUSIC_STORAGE.api) ?? '')
  /** 连点不同曲目时后一次赢，先回来的结果直接丢掉，免得放错歌 */
  const jobRef = useRef(0)

  /** 关闭即清空派生状态：不留在列表里，免得重新开启时误用上一次的结果 */
  const setOn = useCallback((on: boolean) => {
    setEnabled(on)
    write(MUSIC_STORAGE.enabled, on ? '1' : null)
    if (!on) {
      setTracks([])
      setError(null)
      setNote(null)
      setShown(PAGE)
    }
  }, [])

  const apis = useCallback(() => {
    try {
      return resolveApis(normalizeApi(apiInput))
    } catch {
      return resolveApis('')
    }
  }, [apiInput])

  const load = useCallback(async () => {
    const target = parseMusicLink(link)
    if (!target) {
      setError('badLink')
      setTracks([])
      return
    }
    setError(null)
    setNote(null)
    setListing(true)
    try {
      const r = await fetchPlaylist(target, { apis: apis(), fetchImpl: fetch })
      setTracks(r.tracks)
      setShown(PAGE)
      setNote(r.fellBack ? 'fellBack' : null)
      write(MUSIC_STORAGE.last, `${target.server}:${target.id}`)
    } catch (e) {
      setError(e instanceof MusicError ? e.kind : 'apiDown')
      setTracks([])
    } finally {
      setListing(false)
    }
  }, [apis, link])

  /** 拿到字节后包成 File，走与本地选文件完全相同的解码 / 拍点分析路径 */
  const pick = useCallback(
    async (track: Track) => {
      const job = ++jobRef.current
      setError(null)
      setNote(null)
      setLoadingId(track.id)
      setLoadingName(track.name)
      try {
        const buf = await downloadTrack(track.url, { fetchImpl: fetch })
        if (job !== jobRef.current) return
        onAudioFile(new File([buf], `${safeFileName(track.name)}.mp3`, { type: 'audio/mpeg' }))
        patch({
          title: track.name.slice(0, 120),
          artist: track.artist.slice(0, 120),
        })
        const lrc = await resolveLyrics(track.lrc, { fetchImpl: fetch }).catch(() => '')
        if (job !== jobRef.current) return
        if (lrc.trim()) patch({ lyrics: lrc })
      } catch (e) {
        if (job !== jobRef.current) return
        setError(e instanceof MusicError ? e.kind : 'cors')
      } finally {
        if (job === jobRef.current) {
          jobRef.current = 0
          setLoadingId(null)
          setLoadingName('')
        }
      }
    },
    [onAudioFile, patch],
  )

  /** 滚到接近底部时再多渲染一页，50 行不必一次建满 DOM */
  const onListScroll = useCallback(
    (e: UIEvent<HTMLUListElement>) => {
      const el = e.currentTarget
      if (el.scrollHeight - el.scrollTop - el.clientHeight > 96) return
      setShown((s) => Math.min(s + PAGE, tracks.length))
    },
    [tracks.length],
  )

  const saveApi = useCallback(() => {
    try {
      normalizeApi(apiInput)
      write(MUSIC_STORAGE.api, apiInput.trim() || null)
      setError(null)
    } catch {
      setError('badApi')
    }
  }, [apiInput])

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium">{t('online.enable')}</Label>
        <Switch
          checked={enabled}
          aria-label={t('online.enable')}
          onCheckedChange={(on) => {
            if (!on) setOn(false)
            else if (read(MUSIC_STORAGE.acknowledged) === '1') setOn(true)
            else setAckOpen(true)
          }}
        />
      </div>
      <p className="text-muted-foreground text-[11px] leading-4">{t('online.hint')}</p>

      <Dialog
        open={ackOpen}
        onOpenChange={(open) => {
          setAckOpen(open)
          if (!open) return
          write(MUSIC_STORAGE.acknowledged, '1')
          setOn(true)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{t('online.dialogTitle')}</DialogTitle>
            <DialogDescription className="text-xs">{t('online.dialogBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAckOpen(false)}>
              {t('online.dialogCancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                write(MUSIC_STORAGE.acknowledged, '1')
                setOn(true)
                setAckOpen(false)
              }}
            >
              {t('online.dialogOk')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {enabled ? (
        <>
          <div className="flex min-w-0 items-center gap-1.5">
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load()
              }}
              placeholder={t('online.placeholder')}
              aria-label={t('online.placeholder')}
              className="h-8 min-w-0 flex-1 font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={listing || !link.trim()}
              onClick={() => void load()}
            >
              {listing ? <Loader2 className="size-4 animate-spin" /> : <Music className="size-4" />}
              {t('online.fetch')}
            </Button>
          </div>

          {error ? (
            <p className="text-destructive text-[11px]">{t(`online.err.${error}`)}</p>
          ) : null}
          {note === 'fellBack' ? (
            <p className="text-muted-foreground text-[11px]">{t('online.fellBack')}</p>
          ) : null}

          {tracks.length > 0 ? (
            <div className="relative min-w-0">
              <ul
                onScroll={onListScroll}
                className="border-input flex max-h-[264px] min-w-0 flex-col gap-0.5 overflow-x-hidden overflow-y-auto rounded-md border p-1"
              >
                {tracks.slice(0, shown).map((tr) => {
                  const len = fmtDuration(tr.duration)
                  const loading = loadingId === tr.id
                  return (
                    <li key={`${tr.id}-${tr.url}`} className="flex min-w-0">
                      {/* 整行可点：窄面板里把点击区从 28px 图标扩到全行，不用瞄准 */}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void pick(tr)}
                        title={`${tr.name} — ${tr.artist}`}
                        className="hover:bg-accent/40 flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left disabled:opacity-100"
                      >
                        <Disc3 className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="w-0 min-w-0 flex-1">
                          <span className="block truncate text-xs">{tr.name}</span>
                          <span className="text-muted-foreground block truncate text-[11px]">
                            {tr.artist}
                          </span>
                        </span>
                        {len ? (
                          <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                            {len}
                          </span>
                        ) : null}
                        <span className={loading ? 'text-primary shrink-0' : 'shrink-0'}>
                          {loading ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Play className="size-4" />
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {/* 下载几 MB 再解码要几秒，进度只盖住这张列表卡，面板其余部分照常可用 */}
              {loadingId ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="bg-background/75 absolute inset-0 flex items-center justify-center gap-2 rounded-md backdrop-blur-sm"
                >
                  <Loader2 className="text-primary size-4 shrink-0 animate-spin" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{t('online.loadingTitle')}</p>
                    <p className="text-muted-foreground truncate text-[11px]">{loadingName}</p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {tracks.length >= MUSIC_LIMITS.listLimit ? (
            <p className="text-muted-foreground text-[11px]">
              {t('online.truncated', { limit: MUSIC_LIMITS.listLimit })}
            </p>
          ) : null}

          <div className="flex min-w-0 flex-col gap-1 border-t pt-2">
            <Label className="text-[11px] font-medium">{t('online.apiLabel')}</Label>
            <div className="flex min-w-0 items-center gap-1.5">
              <Input
                value={apiInput}
                onChange={(e) => setApiInput(e.target.value)}
                placeholder={t('online.apiPlaceholder')}
                aria-label={t('online.apiLabel')}
                className="h-7 min-w-0 flex-1 font-mono text-[11px]"
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                aria-label={t('online.apiSave')}
                title={t('online.apiSave')}
                onClick={saveApi}
              >
                <Save className="size-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-[11px] leading-4">{t('online.apiHint')}</p>
          </div>
        </>
      ) : null}
    </div>
  )
}
