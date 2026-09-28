import { Check } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { THEME_COLORS } from '../../constants'
import { useResumeStore } from '../../store'
import { ColorPicker } from '../ColorPicker'

const PRESETS = THEME_COLORS as readonly string[]

/** 主题色浮层：12 个预设圆点 + 自定义取色器 */
export function ThemePanel() {
  const { t } = useTranslation('tools-resume')
  const themeColor = useResumeStore(
    (state) => state.activeResume?.globalSettings.themeColor ?? THEME_COLORS[0],
  )
  const setThemeColor = useResumeStore((state) => state.setThemeColor)

  // 取色器每动一像素都会入一条撤销记录，节流到 100ms
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
      }
    }
  }, [])
  const commitDebounced = (color: string) => {
    if (timer.current) {
      clearTimeout(timer.current)
    }
    timer.current = setTimeout(() => setThemeColor(color), 100)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2.5">
        {THEME_COLORS.map((preset) => (
          <button
            key={preset}
            type="button"
            title={preset}
            aria-label={preset}
            onClick={() => setThemeColor(preset)}
            className={cn(
              'relative flex size-6 items-center justify-center overflow-hidden rounded-full transition-all',
              themeColor === preset
                ? 'ring-primary ring-2'
                : 'ring-border hover:ring-primary/50 ring-1 hover:scale-110',
            )}
          >
            <span className="absolute inset-0" style={{ backgroundColor: preset }} />
            {themeColor === preset && (
              <Check className="relative size-3.5" style={{ color: '#ffffff' }} />
            )}
          </button>
        ))}
      </div>

      <ColorPicker
        value={themeColor}
        onChange={commitDebounced}
        className={cn(
          'h-7 w-auto gap-1.5 self-start rounded-full border px-3 py-0 text-xs shadow-none',
          PRESETS.includes(themeColor)
            ? 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground bg-transparent'
            : 'border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 hover:border-primary/60',
        )}
        style={{ backgroundColor: 'transparent' }}
      >
        {t('resume.sidePanel.theme.custom')}
        {!PRESETS.includes(themeColor) && (
          <span
            className="ml-0.5 size-2.5 rounded-full border"
            style={{ backgroundColor: themeColor }}
          />
        )}
      </ColorPicker>
    </div>
  )
}
