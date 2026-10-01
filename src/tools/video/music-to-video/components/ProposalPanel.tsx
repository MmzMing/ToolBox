/**
 * 当前方案面板：一眼看清这次随机成了什么，并且只换其中一面。
 *
 * 「换风格 / 换配色 / 换氛围 / 换构成」各自只动一类参数，收成一排图标按钮；
 * ◀ ▶ 在方案之间回退，历史只记"长相"，歌词与时间轴不会被回滚。
 */
import {
  Blend,
  ChevronLeft,
  ChevronRight,
  Eraser,
  LayoutGrid,
  Palette,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Separator } from '@/components/ui/separator'
import { FONTS } from '../engine/fonts'
import { THEME_ORDER, type ThemeId } from '../engine/omakase'
import { TipButton } from './TipButton'
import type { Plan, Project } from '../engine/types'

type ProposalPanelProps = {
  project: Project
  plan: Plan
  onReroll: (part: 'style' | 'palette' | 'mood' | 'cut') => void
  onDropLook: () => void
  onClearLooks: () => void
  histIndex: number
  histLength: number
  onHist: (delta: number) => void
  /** 一键随机的方向；不选则与JIZURA的普通「おまかせ」一致 */
  theme: ThemeId | null
  onTheme: (theme: ThemeId | null) => void
}

/** 只换一面的四个入口 */
const REROLLS = [
  { part: 'style', icon: Palette, key: 'style' },
  { part: 'palette', icon: Blend, key: 'palette' },
  { part: 'mood', icon: Sparkles, key: 'mood' },
  { part: 'cut', icon: LayoutGrid, key: 'cut' },
] as const

export function ProposalPanel({
  project,
  plan,
  onReroll,
  onDropLook,
  onClearLooks,
  histIndex,
  histLength,
  onHist,
  theme,
  onTheme,
}: ProposalPanelProps) {
  const { t } = useTranslation('tools-video', { keyPrefix: 'music-to-video' })
  const sc = plan.style.schemes[0]
  const cuts = plan.cuts.filter((c) => c.line >= 0 && c.layout !== 'interlude')
  const kinds = new Set(cuts.map((c) => c.layout)).size
  const faceKey = plan.style.fonts.display[0]
  const moodLabel = project.mood ? t(`moods.${project.mood}`) : t('proposal.custom')
  const swatch = (color: string, i: number) => (
    <i
      key={`${color}-${i}`}
      title={color}
      className="border-background inline-block size-3 shrink-0 rounded-full border"
      style={{ background: color }}
    />
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <TipButton
          size="icon"
          variant="outline"
          className="size-7 shrink-0"
          disabled={histIndex <= 0}
          onClick={() => onHist(-1)}
          tip={t('actions.prevLook')}
        >
          <ChevronLeft className="size-4" />
        </TipButton>
        <span className="text-muted-foreground w-12 text-center font-mono text-[11px]">
          {histLength > 1 ? `${histIndex + 1}/${histLength}` : ''}
        </span>
        <TipButton
          size="icon"
          variant="outline"
          className="size-7 shrink-0"
          disabled={histIndex >= histLength - 1}
          onClick={() => onHist(1)}
          tip={t('actions.nextLook')}
        >
          <ChevronRight className="size-4" />
        </TipButton>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <span className="text-muted-foreground shrink-0 text-[11px]">{t('reroll.title')}</span>
        {REROLLS.map(({ part, icon: Icon, key }) => (
          <TipButton
            key={part}
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => onReroll(part)}
            tip={t(`reroll.${key}`)}
          >
            <Icon className="size-4" />
          </TipButton>
        ))}

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* 方向：把一键随机限定在一个主题里（对应JIZURA的 テーマ） */}
        <span className="text-muted-foreground shrink-0 text-[11px]" title={t('themeTitle')}>
          {t('themeTitle')}
        </span>
        <select
          className="border-input bg-background h-7 shrink-0 rounded-md border px-1.5 text-[11px]"
          aria-label={t('themeTitle')}
          value={theme ?? 'none'}
          onChange={(e) => onTheme(e.target.value === 'none' ? null : (e.target.value as ThemeId))}
        >
          <option value="none">{t('themes.none')}</option>
          {THEME_ORDER.map((id) => (
            <option key={id} value={id}>
              {t(`themes.${id}`)}
            </option>
          ))}
        </select>
        <TipButton
          size="icon"
          variant="destructive"
          className="ml-auto size-7 shrink-0"
          disabled={histLength === 0}
          onClick={onClearLooks}
          tip={t('actions.clearLooks')}
        >
          <Trash2 className="size-4" />
        </TipButton>
      </div>

      <div className="border-input flex flex-col gap-1 rounded-md border p-2 text-[11px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground shrink-0">{t('fields.style')}</span>
          <b className="min-w-0 truncate text-right text-xs">{t(`styles.${project.style}`)}</b>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground shrink-0">{t('fields.mood')}</span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <span className="truncate">{moodLabel}</span>
            {[sc.bg, sc.fg, sc.accent, sc.ghostA, sc.ghostB].map(swatch)}
            {project.colors.accentOn ? (
              <span className="text-muted-foreground shrink-0">{t('proposal.random')}</span>
            ) : null}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground shrink-0">{t('proposal.headingFont')}</span>
          <span className="min-w-0 truncate text-right">{FONTS[faceKey]?.label ?? faceKey}</span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2 pt-0.5">
          <div className="text-muted-foreground flex w-0 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono">
            <span>{t('proposal.compositionValue', { cuts: cuts.length, kinds })}</span>
            <span>
              {t('proposal.effectsValue', {
                treat: cuts.filter((c) => c.treat !== 'none').length,
                bg: new Set(cuts.map((c) => c.bg).filter((b) => b !== 'none')).size,
                cam: cuts.filter((c) => c.cam !== 'push').length,
              })}
            </span>
          </div>
          {/* 历史攒到几十条时 ◀ ▶ 翻不动，就地删掉正看着的这一版 */}
          <div className="flex shrink-0 items-center">
            <TipButton
              size="icon"
              variant="destructive"
              className="size-6"
              disabled={histIndex < 0}
              onClick={onDropLook}
              tip={t('actions.dropLook')}
            >
              <Eraser className="size-3.5" />
            </TipButton>
          </div>
        </div>
      </div>
    </div>
  )
}
