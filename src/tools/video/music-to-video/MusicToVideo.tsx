/**
 * 音乐转视频（中文文字 PV）工具主界面。
 *
 * 渲染与规划引擎移植自 MIT 许可的 JIZURA（原作：日文字幕 PV 生成器），
 * 已按本仓库规范重写为 TypeScript 并把文字管线改造为中文分词。
 *
 * 数据流：project + 音频特征 → buildPlan()（纯函数、确定性）→ PreviewStage 逐帧渲染。
 * 导出走同一条渲染链，所以"看到的即所得"：预览与 MP4 用的是同一套分镜与同一批随机数。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, FileJson, FolderOpen, Info, Save, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useBreakpoint } from '@/composable/use-breakpoint'
import { useShallow } from 'zustand/react/shallow'

import { ControlPanels } from './components/ControlPanels'
import { PreviewStage } from './components/PreviewStage'
import { ProposalPanel } from './components/ProposalPanel'
import type { Quality } from './engine/export'
import { ENTER, EXIT } from './engine/registry'
import type { AudioFeatures, AudioInfo, GroupKey, Project } from './engine/types'
import { tool } from './index'
import { ENGINE_SOURCE } from './music-config'
import {
  addUserFont,
  analyzeAudio,
  beatGrid,
  buildPlan,
  clearFontCaches,
  downloadBlob,
  ensureFonts,
  EXPORT_ERRORS,
  exportMp4,
  exportPngZip,
  fontsOfPlan,
  loadUserFont,
  omakase as rollOmakase,
  outputSize,
  parseProject,
  pickVideoCodec,
  planForAE,
  planText,
  randomPalette,
  Renderer,
  safeFileName,
  serializeProject,
  STYLES,
  STYLE_ORDER,
  type ExportJob,
  type ThemeId,
} from './music-to-video.service'
import { useMusicVideoStore } from './store'
import { usePlayback } from './use-playback'

/** 方案历史只记"长相"，歌词与时间轴不参与回退 */
const LOOK_KEYS = [
  'style',
  'mood',
  'seed',
  'fx',
  'enabled',
  'fonts',
  'colors',
  'overrides',
] as const
const HUD_CHARS = '0123456789:./-_()【】No.LYRICRECUNTITLEDXY bpm—／ '

const lookOf = (p: Project): string => {
  const picked: Record<string, unknown> = {}
  for (const k of LOOK_KEYS) picked[k] = p[k]
  return JSON.stringify(picked)
}

/** 界面模式：简易只显示必填项与一键随机入口，与 JIZURA 的 かんたん / 詳細 同源 */
const MODE_KEY = 'toolbox.music-to-video.mode'

export default function MusicToVideo() {
  const { t } = useTranslation('tools-video', { keyPrefix: 'music-to-video' })
  /** xl 才有的左右分栏才钉得住面板顶部两块，窄屏钉住就等于把标签内容挤没 */
  const isDesktop = useBreakpoint() === 'desktop'
  const project = useMusicVideoStore((state) => state.project)
  const { patch, patchFx, patchOverride } = useMusicVideoStore(
    useShallow((state) => ({
      patch: state.patch,
      patchFx: state.patchFx,
      patchOverride: state.patchOverride,
    })),
  )

  const [simple, setSimple] = useState(() => {
    try {
      return localStorage.getItem(MODE_KEY) !== 'pro'
    } catch {
      return true
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, simple ? 'easy' : 'pro')
    } catch {
      /* 隐私模式下写不了 localStorage，切图模式记住与否不影响使用 */
    }
  }, [simple])

  const [audio, setAudio] = useState<AudioInfo | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [fontEpoch, setFontEpoch] = useState(0)
  const [userFonts, setUserFonts] = useState<{ key: string; label: string }[]>([])
  const [quality, setQuality] = useState<Quality>('high')
  /** 打开后预览按导出的帧率走带，看到的就是导出的节奏 */
  const [exportPreview, setExportPreview] = useState(false)
  const [job, setJob] = useState<ExportJob>(null)
  const [codecNote, setCodecNote] = useState('')
  const [canMp4, setCanMp4] = useState(true)
  const [currentLine, setCurrentLine] = useState(-1)
  const [tapIndex, setTapIndex] = useState<number | null>(null)
  const [hist, setHist] = useState({ i: -1, len: 0 })
  /** 一键随机的方向（JIZURA 的 テーマ）；null = 不限定 */
  const [theme, setTheme] = useState<ThemeId | null>(null)

  const historyRef = useRef<string[]>([])
  const indexRef = useRef(-1)
  const abortRef = useRef<AbortController | null>(null)
  const warmRef = useRef(0)

  /** 手工 BPM 会重建节拍网格；没有音频时也能只靠 BPM 卡点 */
  const features = useMemo<AudioFeatures | null>(() => {
    const { bpm, offset } = project.timing
    if (audio) {
      return {
        duration: audio.duration,
        beats: bpm > 0 ? beatGrid(bpm, offset, audio.duration) : audio.beats,
        energy: audio.energy,
        energyRate: audio.energyRate,
      }
    }
    if (bpm > 0) {
      return { duration: 0, beats: beatGrid(bpm, offset, 600), energy: null, energyRate: 0 }
    }
    return null
  }, [audio, project.timing])

  const plan = useMemo(() => buildPlan(project, features), [project, features])
  const playback = usePlayback(audio, plan.duration)
  const { seek, play, pause, now, playing, loop, setLoop } = playback

  /* ---------------- 方案历史 ---------------- */
  const syncHist = useCallback(() => {
    setHist({ i: indexRef.current, len: historyRef.current.length })
  }, [])
  const remember = useCallback(() => {
    const snap = lookOf(project)
    if (indexRef.current >= 0 && historyRef.current[indexRef.current] === snap) return
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1)
    historyRef.current.push(snap)
    indexRef.current = historyRef.current.length - 1
  }, [project])
  const commit = useCallback(() => {
    const snap = lookOf(project)
    if (historyRef.current[indexRef.current] !== snap) {
      historyRef.current = historyRef.current.slice(0, indexRef.current + 1)
      historyRef.current.push(snap)
      indexRef.current = historyRef.current.length - 1
    }
    if (historyRef.current.length > 80) {
      historyRef.current.splice(0, historyRef.current.length - 80)
      indexRef.current = historyRef.current.length - 1
    }
    syncHist()
  }, [project, syncHist])

  const histGo = useCallback(
    (delta: number) => {
      remember()
      const j = indexRef.current + delta
      const list = historyRef.current
      if (j < 0 || j >= list.length) return
      indexRef.current = j
      patch(JSON.parse(list[j]) as Partial<Project>)
      syncHist()
      seek(0)
    },
    [patch, remember, seek, syncHist],
  )

  /** 删掉正看着的这一版：只动历史，当前参数保持不变 */
  const dropLook = useCallback(() => {
    const i = indexRef.current
    if (i < 0 || i >= historyRef.current.length) return
    historyRef.current.splice(i, 1)
    indexRef.current = historyRef.current.length ? Math.min(i, historyRef.current.length - 1) : -1
    syncHist()
  }, [syncHist])

  const clearLooks = useCallback(() => {
    historyRef.current = []
    indexRef.current = -1
    syncHist()
  }, [syncHist])

  /* ---------------- 随机与部件 ---------------- */
  const runOmakase = useCallback(() => {
    if (job || tapIndex != null) return
    remember()
    patch(rollOmakase(project, Math.random, theme))
    commit()
    seek(0)
  }, [commit, job, patch, project, remember, seek, tapIndex, theme])

  const reroll = useCallback(
    (part: 'style' | 'palette' | 'mood' | 'cut') => {
      if (job || tapIndex != null) return
      remember()
      if (part === 'style') {
        const pool = STYLE_ORDER.filter((k) => k !== project.style)
        const style = pool[Math.floor(Math.random() * pool.length)] ?? project.style
        patch({ style, colors: { ...project.colors, enabled: false } })
        toast.info(t('styles.' + style))
      } else if (part === 'cut') {
        patch({ seed: Math.floor(Math.random() * 1e9) })
      } else if (part === 'palette') {
        const bg =
          project.colors.enabled && project.colors.bg
            ? project.colors.bg
            : STYLES[project.style].schemes[0].bg
        const p = randomPalette(bg)
        patch({ colors: { ...project.colors, ...p, accentOn: true } })
      } else {
        const r = rollOmakase(project, Math.random)
        patch({ mood: r.mood, fx: r.fx, enabled: r.enabled })
      }
      commit()
      seek(0)
    },
    [commit, job, patch, project, remember, seek, t, tapIndex],
  )

  const setPart = useCallback(
    (group: GroupKey, key: string, on: boolean) => {
      patch({ enabled: { ...project.enabled, [group]: { ...project.enabled[group], [key]: on } } })
    },
    [patch, project.enabled],
  )
  const bulkParts = useCallback(
    (group: GroupKey, mode: 'on' | 'off' | 'flip') => {
      const cur = { ...project.enabled[group] }
      patch({
        enabled: {
          ...project.enabled,
          [group]: Object.fromEntries(
            Object.keys(cur).map((k) => [
              k,
              mode === 'on' ? true : mode === 'off' ? false : cur[k] === false,
            ]),
          ),
        },
      })
    },
    [patch, project.enabled],
  )

  /* ---------------- 逐行操作 ---------------- */
  const setLineTime = useCallback(
    (line: number, seconds: number | null) => {
      const lineTimes = { ...project.timing.lineTimes }
      if (seconds == null) delete lineTimes[line]
      else lineTimes[line] = seconds
      patch({ timing: { ...project.timing, lineTimes } })
    },
    [patch, project.timing],
  )
  const setLayout = useCallback(
    (line: number, layout: string | null) => {
      patchOverride(line, { layout: layout ?? undefined })
    },
    [patchOverride],
  )
  const rerollLine = useCallback(
    (line: number) => {
      const cur = project.overrides[line] || {}
      patchOverride(line, { seed: (cur.seed ?? 0) + 1, lock: false, lockedSeed: undefined })
      const ln = plan.lines[line]
      if (ln) seek(ln.start + 0.001)
    },
    [patchOverride, plan.lines, project.overrides, seek],
  )
  const toggleLock = useCallback(
    (line: number, locked: boolean) => {
      patchOverride(
        line,
        locked
          ? { lock: true, lockedSeed: plan.lines[line]?.seed }
          : { lock: false, lockedSeed: undefined },
      )
    },
    [patchOverride, plan.lines],
  )
  const clearTimes = useCallback(
    () => patch({ timing: { ...project.timing, lineTimes: {} } }),
    [patch, project.timing],
  )

  /* ---------------- 点拍同步 ---------------- */
  const startTap = useCallback(() => {
    if (!plan.lines.length) return
    setTapIndex(0)
    seek(0)
    play()
  }, [plan.lines.length, play, seek])
  const tapNow = useCallback(() => {
    if (tapIndex == null) return
    setLineTime(tapIndex, Number(now().toFixed(3)))
    if (tapIndex + 1 >= plan.lines.length) {
      setTapIndex(null)
      pause()
    } else {
      setTapIndex(tapIndex + 1)
    }
  }, [now, pause, plan.lines.length, setLineTime, tapIndex])

  /* ---------------- 音频与字体 ---------------- */
  const handleAudioFile = useCallback(
    async (file: File | null) => {
      if (!file) {
        pause()
        setAudio(null)
        seek(0)
        return
      }
      setAnalyzing(true)
      pause()
      try {
        const info = await analyzeAudio(file)
        setAudio(info)
        setTapIndex(null)
        seek(0)
        patch({ timing: { ...project.timing, snap: true } })
        if (!project.title) patch({ title: file.name.replace(/\.[^.]+$/, '') })
      } catch {
        setAudio(null)
        toast.error(t('errors.decode'))
      } finally {
        setAnalyzing(false)
      }
    },
    [patch, pause, project.timing, project.title, seek, t],
  )

  /* ---------------- 工程文件（.json） ---------------- */
  const projectFileRef = useRef<HTMLInputElement>(null)

  const saveProject = useCallback(() => {
    const name = safeFileName(project.title || 'music-to-video')
    downloadBlob(
      new Blob([serializeProject(project)], { type: 'application/json' }),
      `${name}.json`,
    )
  }, [project])

  const openProject = useCallback(
    async (file: File | null) => {
      if (!file) return
      const loaded = parseProject(await file.text())
      if (!loaded) {
        toast.error(t('errors.badProject'))
        return
      }
      // 音频不随工程文件走，换工程就回到无声预览，避免时间轴对不上
      pause()
      setAudio(null)
      patch(loaded)
      seek(0)
      toast.success(t('state.projectLoaded'))
    },
    [patch, pause, seek, t],
  )

  /** AE 面板用的构成数据：把浏览器里的新表现换成面板里最接近的一件 */
  const exportAE = useCallback(() => {
    const name = safeFileName(project.title || plan.title || 'music-to-video')
    const json = JSON.stringify(
      planForAE(plan, project, (subs) => t('ae.note', { subs })),
      null,
      1,
    )
    downloadBlob(new Blob([json], { type: 'application/json' }), `${name}_ae.json`)
  }, [plan, project, t])

  const registerFont = useCallback((key: string, label: string) => {
    setUserFonts((list) => (list.some((f) => f.key === key) ? list : [...list, { key, label }]))
  }, [])
  const handleFontFile = useCallback(
    async (file: File) => {
      try {
        const key = await loadUserFont(file)
        registerFont(key, file.name)
        patch({ fonts: { ...project.fonts, display: key } })
      } catch {
        /* 字体文件读不出来时保持原样 */
      }
    },
    [patch, project.fonts, registerFont],
  )
  const addLocalFont = useCallback(
    (family: string) => {
      const key = `local_${family.replace(/\s+/g, '_')}`
      const bold = /bold|太|black|heavy|[6-9]00/i.test(family)
      addUserFont(key, family, family, bold ? 700 : 400)
      registerFont(key, family)
      patch({ fonts: { ...project.fonts, display: key } })
    },
    [patch, project.fonts, registerFont],
  )

  useEffect(() => {
    let alive = true
    const keys = [...new Set([...fontsOfPlan(plan), ...userFonts.map((f) => f.key)])]
    const text = `${planText(plan)}${HUD_CHARS}${project.lyrics}`
    ensureFonts(text, keys).then(() => {
      if (!alive) return
      clearFontCaches()
      setFontEpoch((n) => n + 1)
    })
    return () => {
      alive = false
    }
  }, [plan, userFonts, project.lyrics])

  // 空闲时预分解会用到碎片的镜头，避免首次播放时逐字卡顿
  useEffect(() => {
    const job = ++warmRef.current
    const cv = document.createElement('canvas')
    cv.width = 480
    cv.height = Math.max(1, Math.round((480 * plan.H) / plan.W))
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const renderer = new Renderer()
    // 碎片是由登场/退场动效触发分解的，所以看这两件的定义要不要碎片
    const needsPieces = (id: string): boolean =>
      Boolean(ENTER[id]?.pieces || EXIT[id]?.pieces || EXIT[id]?.shatter)
    const targets = plan.cuts.filter((c) => needsPieces(c.enter) || needsPieces(c.exit))
    let i = 0
    const idle = (deadline: IdleDeadline | null) => {
      if (job !== warmRef.current || abortRef.current) return
      do {
        const c = targets[i++]
        if (!c) return
        for (const at of [c.start + Math.min(c.inDur * 0.3, c.dur * 0.2), c.end - c.outDur * 0.5]) {
          try {
            renderer.frame(ctx, plan, at, {
              scale: cv.width / plan.W,
              fast: true,
              noHud: true,
              noGhost: true,
            })
          } catch {
            /* 预热失败只是首帧稍慢，不影响正确性 */
          }
        }
      } while (i < targets.length && deadline && deadline.timeRemaining() > 8)
      if (i < targets.length) schedule()
    }
    const schedule = () => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(idle, { timeout: 400 })
      else setTimeout(() => idle(null), 60)
    }
    schedule()
  }, [plan])

  useEffect(() => {
    let alive = true
    const [w, h] = outputSize(project.aspect, project.res)
    void pickVideoCodec(w, h, project.fps, 12_000_000).then((vc) => {
      if (!alive) return
      setCanMp4(!!vc)
      setCodecNote(
        vc
          ? t('export.codec', { codec: vc.label, w, h, fps: project.fps })
          : t('errors.noWebCodecs'),
      )
    })
    return () => {
      alive = false
    }
  }, [project.aspect, project.res, project.fps, t])

  /* ---------------- 导出 ---------------- */
  const runExport = useCallback(
    async (kind: 'mp4' | 'png' | 'pnga') => {
      if (job) return
      pause()
      const controller = new AbortController()
      abortRef.current = controller
      const total = Math.max(1, Math.round(plan.duration * plan.fps))
      const onProgress = (ratio: number) =>
        setJob({
          kind,
          progress: Math.min(1, ratio),
          text: t('state.frames', { done: Math.round(ratio * total), total }),
        })
      setJob({ kind, progress: 0, text: t('state.preparing') })
      const name = safeFileName(project.title || plan.title || 'music-to-video')
      try {
        await ensureFonts(planText(plan) + HUD_CHARS, fontsOfPlan(plan))
        clearFontCaches()
        if (kind === 'mp4') {
          const r = await exportMp4({
            plan,
            project: { ...project, includeAudio: project.includeAudio && !!audio },
            audio,
            quality,
            onProgress,
            signal: controller.signal,
          })
          downloadBlob(r.blob, `${name}.mp4`)
          setJob({
            kind,
            progress: 1,
            text: t('state.doneSize', { size: (r.blob.size / 1048576).toFixed(1), codec: r.codec }),
          })
        } else {
          const blob = await exportPngZip({
            plan,
            project,
            transparent: kind === 'pnga',
            onProgress,
            signal: controller.signal,
          })
          downloadBlob(blob, `${name}${kind === 'pnga' ? '_alpha' : ''}_png.zip`)
          setJob({
            kind,
            progress: 1,
            text: t('state.doneSize', { size: (blob.size / 1048576).toFixed(1), codec: 'PNG' }),
          })
        }
      } catch (error) {
        const code = error instanceof Error ? error.message : ''
        const text =
          code === EXPORT_ERRORS.cancelled
            ? t('state.cancelled')
            : code === EXPORT_ERRORS.noVideoEncoder || code === EXPORT_ERRORS.noCodec
              ? t('errors.noWebCodecs')
              : t('errors.export')
        setJob({ kind, progress: 0, text })
      } finally {
        abortRef.current = null
        setTimeout(() => setJob(null), 2600)
      }
    },
    [audio, job, pause, plan, project, quality, t],
  )

  /* ---------------- 快捷键 ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? ''
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag)
      if (typing) return
      if (tapIndex != null && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault()
        tapNow()
        return
      }
      if (e.code === 'Escape') {
        if (tapIndex != null) setTapIndex(null)
        pause()
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        if (playing) pause()
        else play()
      } else if (e.code === 'ArrowRight') {
        seek(now() + (e.shiftKey ? 1 : 1 / plan.fps))
      } else if (e.code === 'ArrowLeft') {
        seek(now() - (e.shiftKey ? 1 : 1 / plan.fps))
      } else if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        runOmakase()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [now, pause, plan.fps, play, playing, runOmakase, seek, tapIndex, tapNow])

  /* ---------------- 首帧落在有内容的地方 ---------------- */
  const bootedRef = useRef(false)
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    const first = plan.cuts.find((c) => c.line >= 0)
    if (first) seek(first.start + Math.min(first.dur * 0.6, first.inDur + 0.25))
  }, [plan.cuts, seek])

  useEffect(() => {
    if (!historyRef.current.length) {
      historyRef.current = [lookOf(project)]
      indexRef.current = 0
      syncHist()
    }
  }, [project, syncHist])

  const tapLine = tapIndex != null ? plan.lines[tapIndex] : null

  /* ---------------- 面板顶部两块：宽屏钉住，窄屏交给滚动区 ---------------- */
  const easyHint = (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-[11px] leading-4">{t('easy.hint')}</p>
      <label className="flex items-center justify-between gap-2 text-xs">
        {t('parts.useExtra')}
        <Switch
          checked={project.extra}
          onCheckedChange={(extra) => patch({ extra })}
          aria-label={t('parts.useExtra')}
        />
      </label>
      <label className="flex items-center justify-between gap-2 text-xs">
        {t('parts.useTraditional')}
        <Switch
          checked={project.traditional}
          onCheckedChange={(traditional) => patch({ traditional })}
          aria-label={t('parts.useTraditional')}
        />
      </label>
      {(['typo', 'kinetic', 'horror'] as const).map((set) => (
        <label key={set} className="flex items-center justify-between gap-2 text-xs">
          {t(`parts.set_${set}`)}
          <Switch
            checked={project[set]}
            onCheckedChange={(on) => patch({ [set]: on })}
            aria-label={t(`parts.set_${set}`)}
          />
        </label>
      ))}
    </div>
  )
  const proposalBlock = (
    <ProposalPanel
      project={project}
      plan={plan}
      onReroll={reroll}
      onDropLook={dropLook}
      onClearLooks={clearLooks}
      histIndex={hist.i}
      histLength={hist.len}
      onHist={histGo}
      theme={theme}
      onTheme={setTheme}
    />
  )
  const panelHeader = (
    <>
      {simple ? easyHint : null}
      {proposalBlock}
    </>
  )

  return (
    <div className="flex h-full min-h-0 flex-col pt-(--shell-immersive-inset-top)">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:px-4">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
          <tool.icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {/* 整页式布局的页面级 h1 由 ToolLayout 以 sr-only 提供，这里降为 h2 避免双 H1 */}
          <h2 className="truncate text-base font-semibold">{t('title')}</h2>
          <p className="text-muted-foreground truncate text-xs">{t('description')}</p>
        </div>
        {tapIndex != null ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground max-w-[220px] truncate text-xs">
              {t('tap.hint', { line: tapIndex + 1, text: tapLine?.text ?? '—' })}
            </span>
            <Button size="sm" variant="outline" onClick={tapNow}>
              {t('tap.record')}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={t('tap.stop')}
              onClick={() => {
                setTapIndex(null)
                pause()
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : null}
        <ToggleGroup
          type="single"
          value={simple ? 'easy' : 'pro'}
          onValueChange={(value) => {
            if (value) setSimple(value === 'easy')
          }}
          className="shrink-0"
          aria-label={t('easy.modeGroup')}
        >
          <ToggleGroupItem
            value="easy"
            className="h-7 px-2 text-[11px]"
            aria-label={t('easy.modeEasy')}
          >
            {t('easy.modeEasy')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="pro"
            className="h-7 px-2 text-[11px]"
            aria-label={t('easy.modePro')}
          >
            {t('easy.modePro')}
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex shrink-0 items-center gap-1">
          <input
            ref={projectFileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label={t('actions.openProject')}
            onChange={(e) => {
              void openProject(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={t('actions.openProject')}
            title={t('actions.openProject')}
            onClick={() => projectFileRef.current?.click()}
          >
            <FolderOpen className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={t('actions.saveProject')}
            title={t('actions.saveProject')}
            onClick={saveProject}
          >
            <Save className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={t('actions.exportAe')}
            title={t('actions.exportAe')}
            onClick={exportAE}
          >
            <FileJson className="size-4" />
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t('about.title')}
                title={t('about.title')}
              >
                <Info className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm">{t('about.title')}</DialogTitle>
                <DialogDescription className="text-xs">{t('about.lead')}</DialogDescription>
              </DialogHeader>
              <ul className="text-muted-foreground flex flex-col gap-2 text-xs">
                <li>{t('about.output')}</li>
                <li>{t('about.input')}</li>
                <li>{t('about.local')}</li>
                <li>{t('about.online')}</li>
              </ul>
              {/* 渲染引擎来自开源项目，出处与许可必须写清楚（含项目地址） */}
              <section className="bg-muted/40 flex flex-col gap-1.5 rounded-lg border p-3">
                <h3 className="text-xs font-medium">{t('about.sourceTitle')}</h3>
                <p className="text-xs">
                  {t('about.sourceName')}
                  <span className="text-muted-foreground"> — {t('about.sourceBy')}</span>
                </p>
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="text-muted-foreground">{t('about.sourceRepoLabel')}：</span>
                  <a
                    href={ENGINE_SOURCE.repo}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 break-all underline underline-offset-2"
                  >
                    {ENGINE_SOURCE.repo}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                </p>
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="text-muted-foreground">{t('about.sourceCopyrightLabel')}：</span>
                  <span>
                    {ENGINE_SOURCE.license} · © {ENGINE_SOURCE.holder}
                  </span>
                </p>
                <p className="text-muted-foreground text-[11px] leading-4">
                  {t('about.sourceCopyright')}
                </p>
                <p className="text-muted-foreground text-[11px] leading-4">
                  {t('about.sourceNote')}
                </p>
                <p className="text-muted-foreground text-[11px] leading-4">{t('about.engine')}</p>
              </section>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2 xl:flex-row xl:gap-3 xl:overflow-hidden xl:px-4 xl:pb-4">
        <div className="flex h-[34svh] min-h-[180px] shrink-0 flex-col xl:h-auto xl:min-h-0 xl:flex-1">
          <PreviewStage
            plan={plan}
            audio={audio}
            playing={playing}
            loop={loop}
            onTogglePlay={() => (playing ? pause() : play())}
            onToggleLoop={() => setLoop(!loop)}
            onSeek={seek}
            onShuffle={() => patch({ seed: Math.floor(Math.random() * 1e9) })}
            onOmakase={runOmakase}
            getTime={now}
            fontEpoch={fontEpoch}
            exportFps={exportPreview ? plan.fps : 0}
            volume={playback.volume}
            onVolume={playback.setVolume}
            onCurrentLine={setCurrentLine}
          />
        </div>

        <aside className="bg-card/50 flex min-h-[240px] w-full flex-1 flex-col overflow-hidden rounded-lg border xl:h-auto xl:min-h-0 xl:w-[400px] xl:flex-none">
          {isDesktop ? (
            <>
              {simple ? (
                <div className="flex shrink-0 flex-col gap-2 border-b p-3 pb-2">{easyHint}</div>
              ) : null}
              <div className="shrink-0 border-b p-3">{proposalBlock}</div>
            </>
          ) : null}
          <ControlPanels
            project={project}
            plan={plan}
            simple={simple}
            header={isDesktop ? null : panelHeader}
            audio={audio}
            analyzing={analyzing}
            currentLine={currentLine}
            codecNote={codecNote}
            canMp4={canMp4}
            job={job}
            quality={quality}
            exportPreview={exportPreview}
            onExportPreview={setExportPreview}
            userFonts={userFonts}
            patch={patch}
            patchFx={patchFx}
            setQuality={setQuality}
            onAudioFile={(file) => void handleAudioFile(file)}
            onFontFile={(file) => void handleFontFile(file)}
            onAddLocalFont={addLocalFont}
            onExport={(kind) => void runExport(kind)}
            onCancelExport={() => abortRef.current?.abort()}
            onSeek={seek}
            onSetLineTime={setLineTime}
            onSetLayout={setLayout}
            onRerollLine={rerollLine}
            onToggleLock={toggleLock}
            onClearTimes={clearTimes}
            onStartTap={startTap}
            tapping={tapIndex != null}
            onSetPart={setPart}
            onBulkParts={bulkParts}
          />
        </aside>
      </div>
    </div>
  )
}
