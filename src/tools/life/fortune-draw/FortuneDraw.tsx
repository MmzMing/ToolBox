import { Shuffle, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FortuneCard } from './components/FortuneCard'
import { FortuneTube, type DrawPhase } from './components/FortuneTube'
import { drawFortune, type DrawResult } from './fortune-draw.service'

/** 摇签与飞签时长（与 index.css 中 fortune-shake / fortune-stick-fly 对齐） */
const SHAKE_MS = 1200
const FLY_MS = 500

/**
 * 今日运势抽签。生命周期：点击抽签 → 舞台区签筒摇签 → 中签条飞出 →
 * 签筒退场，结果卡在舞台区原地翻牌揭示（签筒与卡片共用同一层，不同时存在）。
 */
export default function FortuneDraw() {
  const { t } = useTranslation('tools-life', { keyPrefix: 'fortune-draw' })
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<DrawPhase>('idle')
  const [result, setResult] = useState<DrawResult | null>(null)
  const [drawCount, setDrawCount] = useState(0)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [])

  const isDrawing = phase !== 'idle'

  const handleDraw = (fixed: boolean) => {
    if (isDrawing) return
    const next = drawFortune({ name, fixed })
    setResult(null) // 卡片退场，签筒回到舞台
    setPhase('shaking')
    setDrawCount((count) => count + 1)
    timersRef.current.push(window.setTimeout(() => setPhase('flying'), SHAKE_MS))
    timersRef.current.push(
      window.setTimeout(() => {
        setResult(next)
        setPhase('idle')
      }, SHAKE_MS + FLY_MS),
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 操作区：名字 + 两种抽签模式 */}
      <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('namePlaceholder')}
            maxLength={24}
            className="sm:max-w-56"
          />
          <div className="flex gap-2">
            <Button onClick={() => handleDraw(true)} disabled={isDrawing}>
              <Sparkles className="size-4" />
              {t('drawDaily')}
            </Button>
            <Button variant="outline" onClick={() => handleDraw(false)} disabled={isDrawing}>
              <Shuffle className="size-4" />
              {t('drawRandom')}
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">{t('fixedHint')}</p>
      </div>

      {/* 舞台区：签筒与结果卡共用同一层 —— 动画未结束时只有签筒，动画结束签筒让位给卡片 */}
      {result ? (
        <FortuneCard key={drawCount} result={result} />
      ) : (
        <div className="flex flex-col items-center gap-3 py-2">
          <FortuneTube phase={phase} label={t('tubeLabel')} />
          <p className="text-muted-foreground h-4 text-xs">
            {isDrawing ? t('drawing') : t('emptyHint')}
          </p>
        </div>
      )}
    </div>
  )
}
