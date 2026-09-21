import { Check, Copy, PartyPopper } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useCopy } from '@/composable/use-copy'
import { cn } from '@/lib/utils'
import type { DrawResult, FortuneLevel } from '../fortune-draw.service'

/** 卡片淡入时长（与 index.css fortune-card-in 对齐），结束后运势值条才开始填充 */
const CARD_IN_MS = 450

type FortuneCardProps = {
  result: DrawResult
}

/** 档位 → 语义令牌色（吉=中国红、平=金、凶=灰，见 index.css fortune 节） */
const LEVEL_TEXT: Record<FortuneLevel, string> = {
  good: 'text-fortune-good',
  normal: 'text-fortune-normal',
  bad: 'text-muted-foreground',
}
const LEVEL_FILL: Record<FortuneLevel, string> = {
  good: 'bg-fortune-good',
  normal: 'bg-fortune-normal',
  bad: 'bg-muted-foreground',
}
const LEVEL_BADGE: Record<FortuneLevel, string> = {
  good: 'bg-fortune-good/15 text-fortune-good',
  normal: 'bg-fortune-normal/15 text-fortune-normal',
  bad: 'bg-muted text-muted-foreground',
}
/** 吉签标题周围的光点：位置与错峰延迟为静态配置，动画见 index.css */
const SPARKLES = [
  { left: '6%', top: '30%', delay: '0ms' },
  { left: '14%', top: '68%', delay: '300ms' },
  { left: '26%', top: '12%', delay: '700ms' },
  { left: '74%', top: '16%', delay: '500ms' },
  { left: '86%', top: '40%', delay: '150ms' },
  { left: '90%', top: '70%', delay: '900ms' },
  { left: '40%', top: '4%', delay: '1100ms' },
  { left: '60%', top: '8%', delay: '1300ms' },
] as const

/** 抽签结果卡：翻牌揭示运势总结、星级、运势值、签诗与白话详解（按界面语言取中/英文本） */
export function FortuneCard({ result }: FortuneCardProps) {
  const { t, i18n } = useTranslation('tools-life', { keyPrefix: 'fortune-draw' })
  const { copy, isCopied } = useCopy()
  const lang: 'zh' | 'en' = i18n.language.startsWith('zh') ? 'zh' : 'en'
  const [barWidth, setBarWidth] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setBarWidth(result.luckValue), CARD_IN_MS)
    return () => window.clearTimeout(timer)
  }, [result.luckValue])

  const levelLabel = t(`level.${result.level}`)
  const copyText = [
    `${result.dateLabel} ${result.summary[lang]}（${levelLabel} ${result.luckValue}）`,
    `${t('luckyStarLabel')}${result.luckyStar}`,
    `${t('signLabel')}${result.signText[lang]} —— ${result.signSource[lang]}`,
    `${t('unsignLabel')}${result.unsignText[lang]}`,
    t('disclaimer'),
  ].join('\n')

  return (
    <div className="fortune-card border-border bg-card flex flex-col gap-4 rounded-2xl border p-5 shadow-sm md:p-6">
      {/* 头部：日期 + 档位徽标 + 复制 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">{result.dateLabel}</span>
        <span
          className={cn('rounded-full px-2 py-0.5 text-xs font-medium', LEVEL_BADGE[result.level])}
        >
          {levelLabel}
        </span>
        {result.isHolidayBoost && (
          <span className="bg-fortune-good/15 text-fortune-good flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
            <PartyPopper className="size-3" />
            {t('holidayBoost')}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-8"
          title={t('copy')}
          onClick={() => void copy(copyText)}
        >
          {isCopied(copyText) ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>

      {/* 运势总结：吉签带浮动光点 */}
      <div className="relative py-2 text-center">
        {result.level === 'good' &&
          SPARKLES.map((dot, index) => (
            <span
              key={index}
              className="fortune-sparkle bg-fortune-normal absolute size-1.5 rounded-full"
              style={{ left: dot.left, top: dot.top, animationDelay: dot.delay }}
            />
          ))}
        <p className={cn('text-4xl font-bold tracking-wide', LEVEL_TEXT[result.level])}>
          {result.summary[lang]}
        </p>
        <p className="text-fortune-normal mt-2 text-xl tracking-[0.3em]">{result.luckyStar}</p>
      </div>

      {/* 运势值进度条：宽度按分值动画过渡 */}
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground shrink-0 text-sm">{t('luckValueLabel')}</span>
        <div className="bg-muted h-2 min-w-0 flex-1 overflow-hidden rounded-full">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-700 ease-out',
              LEVEL_FILL[result.level],
            )}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <span className={cn('shrink-0 text-sm font-semibold', LEVEL_TEXT[result.level])}>
          {result.luckValue}
        </span>
      </div>

      {/* 签诗 / 出处 / 白话详解 */}
      <blockquote className="bg-muted rounded-xl px-4 py-3 text-center">
        <p className="text-lg font-medium">{result.signText[lang]}</p>
        <footer className="text-muted-foreground mt-1.5 text-xs">
          —— {result.signSource[lang]}
        </footer>
      </blockquote>
      <p className="text-muted-foreground text-sm leading-relaxed">{result.unsignText[lang]}</p>

      <p className="text-muted-foreground border-border border-t pt-3 text-center text-xs">
        {t('disclaimer')}
      </p>
    </div>
  )
}
