import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

type AlignSelectorProps = {
  value: 'left' | 'center' | 'right'
  onChange: (value: 'left' | 'center' | 'right') => void
}

/** 三张缩略示意卡：头像与文字在纸面上的相对位置 */
export function AlignSelector({ value, onChange }: AlignSelectorProps) {
  const { t } = useTranslation('tools-resume')

  const layouts = [
    {
      value: 'left' as const,
      label: t('resume.basicPanel.align.left'),
      art: (
        <svg viewBox="0 0 48 48" fill="none" className="size-full">
          <circle cx="15" cy="24" r="6" className="fill-current" />
          <rect x="27" y="21" width="15" height="2" className="fill-current" />
          <rect x="27" y="25" width="12" height="2" className="fill-current" />
          <rect x="27" y="29" width="13" height="2" className="fill-current" />
        </svg>
      ),
    },
    {
      value: 'center' as const,
      label: t('resume.basicPanel.align.center'),
      art: (
        <svg viewBox="0 0 48 48" fill="none" className="size-full">
          <circle cx="24" cy="15" r="6" className="fill-current" />
          <rect x="16.5" y="27" width="15" height="2" className="fill-current" />
          <rect x="18" y="31" width="12" height="2" className="fill-current" />
          <rect x="17" y="35" width="14" height="2" className="fill-current" />
        </svg>
      ),
    },
    {
      value: 'right' as const,
      label: t('resume.basicPanel.align.right'),
      art: (
        <svg viewBox="0 0 48 48" fill="none" className="size-full">
          <circle cx="33" cy="24" r="6" className="fill-current" />
          <rect x="6" y="21" width="15" height="2" className="fill-current" />
          <rect x="9" y="25" width="12" height="2" className="fill-current" />
          <rect x="8" y="29" width="13" height="2" className="fill-current" />
        </svg>
      ),
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {layouts.map((layout) => (
        <button
          key={layout.value}
          type="button"
          title={layout.label}
          aria-label={layout.label}
          aria-pressed={value === layout.value}
          onClick={() => onChange(layout.value)}
          className={cn(
            'flex flex-col items-center justify-center rounded-xl border-2 p-3 transition-all',
            'hover:scale-[1.02] active:scale-[0.98]',
            value === layout.value
              ? 'border-primary bg-primary/5 text-primary shadow-sm'
              : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground border-transparent',
          )}
        >
          <span className="size-10">{layout.art}</span>
        </button>
      ))}
    </div>
  )
}
