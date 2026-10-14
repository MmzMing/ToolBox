import { Check } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { ColorPicker } from '@/components/color-picker/ColorPicker'
import { cn } from '@/lib/utils'

import { THEME_COLORS } from '../../constants'
import { useResumeStore } from '../../store'

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
        showAlpha={false}
        label={t('resume.sidePanel.theme.custom')}
        value={themeColor}
        onValueChange={commitDebounced}
        /* 主题色最终印在白色纸张上，对比度按白纸算 */
        background="#ffffff"
        className="self-start"
      />
    </div>
  )
}
