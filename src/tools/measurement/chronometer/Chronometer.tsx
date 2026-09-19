import { useEffect, useRef, useState } from 'react'
import { Flag, Pause, Play, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Button } from '@/components/ui/button'
import { computeLaps, formatChronometer } from './chronometer.service'

/** 界面刷新间隔（毫秒），约 30fps 足以显示百分秒 */
const TICK_INTERVAL_MS = 31

export default function Chronometer() {
  const { t } = useTranslation('tools-measurement')

  const [elapsed, setElapsed] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [lapTimes, setLapTimes] = useState<number[]>([])

  const elapsedRef = useRef(0)
  const startedAtRef = useRef(0)
  const intervalRef = useRef<number | null>(null)

  const stopTicking = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  // 卸载时清理定时器
  useEffect(() => stopTicking, [])

  const handleToggle = () => {
    if (isRunning) {
      stopTicking()
      setIsRunning(false)
      return
    }
    startedAtRef.current = performance.now() - elapsedRef.current
    intervalRef.current = window.setInterval(() => {
      elapsedRef.current = performance.now() - startedAtRef.current
      setElapsed(elapsedRef.current)
    }, TICK_INTERVAL_MS)
    setIsRunning(true)
  }

  const handleReset = () => {
    stopTicking()
    elapsedRef.current = 0
    startedAtRef.current = 0
    setElapsed(0)
    setLapTimes([])
    setIsRunning(false)
  }

  const handleLap = () => {
    setLapTimes((previous) => [...previous, elapsedRef.current])
  }

  const laps = computeLaps(lapTimes)
  const lapsNewestFirst = [...laps].reverse()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4">
        <span className="font-mono text-5xl font-semibold tabular-nums sm:text-6xl">
          {formatChronometer(elapsed)}
        </span>
        <div className="flex gap-2">
          <Button onClick={handleToggle}>
            {isRunning ? (
              <>
                <Pause data-icon="inline-start" />
                {t('chronometer.pause')}
              </>
            ) : (
              <>
                <Play data-icon="inline-start" />
                {t('chronometer.start')}
              </>
            )}
          </Button>
          <Button variant="secondary" onClick={handleLap} disabled={!isRunning}>
            <Flag data-icon="inline-start" />
            {t('chronometer.lap')}
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw data-icon="inline-start" />
            {t('chronometer.reset')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t('chronometer.lapsLabel')}</h2>
        {lapsNewestFirst.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('chronometer.noLaps')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {lapsNewestFirst.map((lap) => (
              <li key={lap.index} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground w-16 shrink-0">
                  {t('chronometer.lapLabel', { index: lap.index })}
                </span>
                <SpanCopyable
                  value={`${formatChronometer(lap.total)} (+${formatChronometer(lap.delta)})`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
