import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

/** 四段圆环依次描边转动的加载动画，关键帧见 index.css */
export function RingLoader({ className }: { className?: string }) {
  const { t } = useTranslation('common')

  return (
    <svg
      viewBox="0 0 240 240"
      className={cn('size-24 shrink-0', className)}
      role="status"
      aria-label={t('loading')}
    >
      <circle
        className="ring-loader__ring stroke-foreground"
        cx={120}
        cy={120}
        r={105}
        fill="none"
        strokeDasharray="0 660"
        strokeDashoffset={-330}
        strokeWidth={20}
        strokeLinecap="round"
      />
      <circle
        className="ring-loader__ring ring-loader__ring--b stroke-muted-foreground"
        cx={120}
        cy={120}
        r={35}
        fill="none"
        strokeDasharray="0 220"
        strokeDashoffset={-110}
        strokeWidth={20}
        strokeLinecap="round"
      />
      <circle
        className="ring-loader__ring ring-loader__ring--c stroke-muted-foreground"
        cx={85}
        cy={120}
        r={70}
        fill="none"
        strokeDasharray="0 440"
        strokeWidth={20}
        strokeLinecap="round"
      />
      <circle
        className="ring-loader__ring ring-loader__ring--d stroke-foreground"
        cx={155}
        cy={120}
        r={70}
        fill="none"
        strokeDasharray="0 440"
        strokeWidth={20}
        strokeLinecap="round"
      />
    </svg>
  )
}
