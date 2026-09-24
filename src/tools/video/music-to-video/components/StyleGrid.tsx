/**
 * 风格选择：每个风格画一张 192×108 的缩略图（底色 + 标题字 + 双色残影 + 主色条）。
 *
 * 用 canvas 而不是色卡，是因为风格的差别主要在"字打上去长什么样"。
 */
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { ctxOf } from '../engine/canvas'
import { fontCSS } from '../engine/fonts'
import { STYLES, STYLE_ORDER } from '../engine/styles'
import type { Plan } from '../engine/types'

type StyleGridProps = {
  value: string
  plan: Plan
  onSelect: (key: string) => void
}

export function StyleGrid({ value, plan, onSelect }: StyleGridProps) {
  const { t } = useTranslation('tools-video', { keyPrefix: 'music-to-video' })
  const refs = useRef(new Map<string, HTMLCanvasElement>())
  const sample = t('styleSample')

  useEffect(() => {
    for (const key of STYLE_ORDER) {
      const cv = refs.current.get(key)
      if (!cv) continue
      const st = STYLES[key]
      const sc = st.schemes[0]
      const x = ctxOf(cv)
      x.setTransform(1, 0, 0, 1, 0, 0)
      x.globalAlpha = 1
      x.fillStyle = sc.bg
      x.fillRect(0, 0, cv.width, cv.height)
      st.schemes.slice(1, 4).forEach((s2, i) => {
        x.fillStyle = s2.bg
        x.fillRect(cv.width - 14 * (i + 1), 0, 14, 10)
      })
      const face = st.fonts.display[0]
      x.font = fontCSS(face, 46)
      x.textAlign = 'center'
      x.textBaseline = 'middle'
      x.fillStyle = sc.ghostB
      x.fillText(sample, cv.width / 2 - 3, cv.height / 2 - 1)
      x.fillStyle = sc.ghostA
      x.fillText(sample, cv.width / 2 + 3, cv.height / 2 + 2)
      x.fillStyle = sc.fg
      x.fillText(sample, cv.width / 2, cv.height / 2)
      x.fillStyle = sc.accent
      x.fillRect(12, cv.height - 18, 30, 4)
      x.font = fontCSS('mono', 9)
      x.textAlign = 'left'
      x.fillStyle = sc.sub
      x.fillText(key.toUpperCase(), 48, cv.height - 15)
    }
  }, [plan, sample])

  return (
    <div className="grid grid-cols-2 gap-2">
      {STYLE_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          title={t(`styleDesc.${key}`)}
          onClick={() => onSelect(key)}
          className={
            value === key
              ? 'border-primary ring-primary/30 rounded-md border ring-1'
              : 'border-input hover:border-foreground/40 rounded-md border'
          }
        >
          <canvas
            ref={(el) => {
              if (el) {
                el.width = 192
                el.height = 108
                refs.current.set(key, el)
              } else {
                refs.current.delete(key)
              }
            }}
            className="block h-auto w-full rounded-t-md"
          />
          <span className="block truncate px-1.5 py-1 text-left text-[11px]">
            {t(`styles.${key}`)}
          </span>
        </button>
      ))}
    </div>
  )
}
