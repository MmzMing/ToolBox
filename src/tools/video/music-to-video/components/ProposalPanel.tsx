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
  LayoutGrid,
  Palette,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FONTS } from '../engine/fonts'
import type { Plan, Project } from '../engine/types'

type ProposalPanelProps = {
  project: Project
  plan: Plan
  onReroll: (part: 'style' | 'palette' | 'mood' | 'cut') => void
  onOmakase: () => void
  histIndex: number
  histLength: number
  onHist: (delta: number) => void
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
  onOmakase,
  histIndex,
  histLength,
  onHist,
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
      <Button onClick={onOmakase} className="w-full">
        <Wand2 className="size-4" />
        {t('actions.omakase')}
      </Button>

      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          className="size-7 shrink-0"
          disabled={histIndex <= 0}
          onClick={() => onHist(-1)}
          aria-label={t('actions.prevLook')}
          title={t('actions.prevLook')}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-muted-foreground w-12 text-center font-mono text-[11px]">
          {histLength > 1 ? `${histIndex + 1}/${histLength}` : ''}
        </span>
        <Button
          size="icon"
          variant="outline"
          className="size-7 shrink-0"
          disabled={histIndex >= histLength - 1}
          onClick={() => onHist(1)}
          aria-label={t('actions.nextLook')}
          title={t('actions.nextLook')}
        >
          <ChevronRight className="size-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <span className="text-muted-foreground shrink-0 text-[11px]">{t('reroll.title')}</span>
        {REROLLS.map(({ part, icon: Icon, key }) => (
          <Tooltip key={part}>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t(`reroll.${key}`)}
                onClick={() => onReroll(part)}
              >
                <Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t(`reroll.${key}`)}</TooltipContent>
          </Tooltip>
        ))}
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
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 font-mono">
          <span>{t('proposal.compositionValue', { cuts: cuts.length, kinds })}</span>
          <span>
            {t('proposal.effectsValue', {
              treat: cuts.filter((c) => c.treat !== 'none').length,
              bg: new Set(cuts.map((c) => c.bg).filter((b) => b !== 'none')).size,
              cam: cuts.filter((c) => c.cam !== 'push').length,
            })}
          </span>
        </div>
      </div>
    </div>
  )
}
