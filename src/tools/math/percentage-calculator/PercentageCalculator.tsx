import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  applyPercentage,
  percentOf,
  percentageChange,
  whatPercentIs,
} from './percentage-calculator.service'

type NumberPair = { x: string; y: string }

const EMPTY_PAIR: NumberPair = { x: '', y: '' }

function parseNumber(value: string): number | null {
  return value.trim() === '' || Number.isNaN(Number(value)) ? null : Number(value)
}

function compute(fn: (x: number, y: number) => number, x: string, y: string): string | null {
  const valueX = parseNumber(x)
  const valueY = parseNumber(y)
  if (valueX === null || valueY === null) {
    return null
  }
  try {
    return String(fn(valueX, valueY))
  } catch {
    return null
  }
}

/** 单张计算卡片：两个输入 + 结果行（错误时静默显示提示占位） */
function CalculationCard(props: {
  titleKey: string
  xLabel: string
  yLabel: string
  renderResult: (pair: NumberPair) => string | null
}) {
  const { t } = useTranslation('tools-math')
  const [pair, setPair] = useState<NumberPair>(EMPTY_PAIR)
  const result = props.renderResult(pair)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(`percentage-calculator.${props.titleKey}`)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>{props.xLabel}</Label>
            <Input
              type="number"
              value={pair.x}
              onChange={(event) => setPair((previous) => ({ ...previous, x: event.target.value }))}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>{props.yLabel}</Label>
            <Input
              type="number"
              value={pair.y}
              onChange={(event) => setPair((previous) => ({ ...previous, y: event.target.value }))}
              className="font-mono text-sm"
            />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground text-sm">{t('common:output')}</span>
          <span className="font-mono text-lg font-medium break-all">{result ?? '—'}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function WhatPercentIsCard() {
  const { t } = useTranslation('tools-math')
  return (
    <CalculationCard
      titleKey="card1Title"
      xLabel={t('percentage-calculator.valueX')}
      yLabel={t('percentage-calculator.valueY')}
      renderResult={({ x, y }) => {
        const value = compute(whatPercentIs, x, y)
        return value === null ? null : `${value}%`
      }}
    />
  )
}

function PercentOfCard() {
  const { t } = useTranslation('tools-math')
  return (
    <CalculationCard
      titleKey="card2Title"
      xLabel={t('percentage-calculator.valueX')}
      yLabel={t('percentage-calculator.percentLabel')}
      renderResult={({ x, y }) => compute(percentOf, x, y)}
    />
  )
}

function PercentageChangeCard() {
  const { t } = useTranslation('tools-math')
  return (
    <CalculationCard
      titleKey="card3Title"
      xLabel={t('percentage-calculator.fromValue')}
      yLabel={t('percentage-calculator.toValue')}
      renderResult={({ x, y }) => {
        const value = compute(percentageChange, x, y)
        return value === null ? null : `${value}%`
      }}
    />
  )
}

type Direction = 'increase' | 'decrease'

function ApplyPercentageCard() {
  const { t } = useTranslation('tools-math')
  const [x, setX] = useState('')
  const [percent, setPercent] = useState('')
  const [direction, setDirection] = useState<Direction>('increase')

  const result = useMemo(() => {
    const valueX = parseNumber(x)
    const valuePercent = parseNumber(percent)
    if (valueX === null || valuePercent === null) {
      return null
    }
    const signedPercent = direction === 'decrease' ? -valuePercent : valuePercent
    return String(applyPercentage(valueX, signedPercent))
  }, [x, percent, direction])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('percentage-calculator.card4Title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>{t('percentage-calculator.valueX')}</Label>
            <Input
              type="number"
              value={x}
              onChange={(event) => setX(event.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>{t('percentage-calculator.directionLabel')}</Label>
            <Select value={direction} onValueChange={(value) => setDirection(value as Direction)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="increase">
                  {t('percentage-calculator.direction-increase')}
                </SelectItem>
                <SelectItem value="decrease">
                  {t('percentage-calculator.direction-decrease')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>{t('percentage-calculator.percentLabel')}</Label>
            <Input
              type="number"
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
              className="font-mono text-sm"
            />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground text-sm">{t('common:output')}</span>
          <span className="font-mono text-lg font-medium break-all">{result ?? '—'}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function PercentageCalculator() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <WhatPercentIsCard />
      <PercentOfCard />
      <PercentageChangeCard />
      <ApplyPercentageCard />
    </div>
  )
}
