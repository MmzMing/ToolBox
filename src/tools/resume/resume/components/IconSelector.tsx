import { icons, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createElement, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

/**
 * 图标选择器：按分类挑选简历字段的行首图标。
 *
 * 存进数据的是 lucide 的导出名（如 `Briefcase`），模板侧用
 * `icons[name]` 动态取组件。这里是一份精选清单而非全部 1848 个图标，
 * 与旧项目一致——简历里能用的符号本就有限，全量列表只会让人挑不动。
 */
const ICON_GROUPS = {
  personal: ['User', 'Mail', 'Phone', 'MapPin', 'Globe', 'Smartphone', 'AtSign', 'Contact'],
  education: ['GraduationCap', 'School', 'Book', 'BookOpen', 'Library', 'Award'],
  work: ['Briefcase', 'Landmark', 'Building', 'CalendarRange', 'Clock'],
  skills: ['Code', 'Cpu', 'Database', 'Terminal', 'Layers'],
  languages: ['Languages', 'MessageSquare', 'MessagesSquare'],
  projects: ['FolderGit2', 'GitBranch', 'Rocket', 'Target'],
  achievements: ['Trophy', 'Medal', 'Star'],
  hobbies: ['Heart', 'Music', 'Palette', 'Camera', 'Gamepad2', 'Plane', 'Coffee', 'Dumbbell'],
  social: ['Rss', 'Share2', 'MessageCircle', 'Newspaper', 'Hash'],
  others: [
    'FileText',
    'FileCheck',
    'Funnel',
    'Link',
    'Wallet',
    'Lightbulb',
    'Send',
    'Settings',
    'Search',
    'Flag',
    'Bookmark',
    'ThumbsUp',
    'Zap',
  ],
} as const satisfies Record<string, readonly string[]>

const ALL_ICONS = Object.entries(ICON_GROUPS).flatMap(([group, names]) =>
  names.map((name) => ({ name, group })),
)

const FALLBACK_ICON = 'User'

function resolveIcon(name: string | undefined): LucideIcon {
  const candidate = name && name in icons ? name : FALLBACK_ICON
  return icons[candidate as keyof typeof icons]
}

type IconSelectorProps = {
  value?: string
  onChange: (value: string) => void
}

export function IconSelector({ value, onChange }: IconSelectorProps) {
  const { t } = useTranslation('tools-resume')
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [group, setGroup] = useState<string>('all')

  const Current = resolveIcon(value)

  const filtered = ALL_ICONS.filter(({ name, group: own }) => {
    const matchesGroup = group === 'all' || own === group
    const needle = term.trim().toLowerCase()
    const matchesTerm =
      !needle ||
      name.toLowerCase().includes(needle) ||
      t(`resume.iconSelector.icons.${name}`).toLowerCase().includes(needle)
    return matchesGroup && matchesTerm
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('resume.iconSelector.title')}
        >
          {createElement(Current, { className: 'size-4' })}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-4">
        <div className="flex flex-col gap-3">
          <div className="border-input bg-background/50 flex items-center gap-2 rounded-lg border px-3 py-2">
            <Search className="text-muted-foreground size-4" />
            <Input
              value={term}
              aria-label={t('resume.iconSelector.searchPlaceholder')}
              placeholder={t('resume.iconSelector.searchPlaceholder')}
              onChange={(event) => setTerm(event.target.value)}
              className="h-6 border-0 p-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="flex flex-wrap gap-1">
            {['all', ...Object.keys(ICON_GROUPS)].map((key) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setGroup(key)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs',
                  group === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {key === 'all'
                  ? t('resume.iconSelector.all')
                  : t(`resume.iconSelector.categories.${key}`)}
              </Button>
            ))}
          </div>

          {filtered.length > 0 ? (
            <ScrollArea className="max-h-[320px] pr-2">
              <div className="grid grid-cols-8 gap-2">
                {filtered.map(({ name }) => {
                  const Icon = resolveIcon(name)
                  return (
                    <Button
                      key={name}
                      type="button"
                      variant="ghost"
                      title={t(`resume.iconSelector.icons.${name}`)}
                      className={cn(
                        'relative h-10 p-2',
                        value === name && 'bg-primary text-primary-foreground hover:bg-primary/90',
                      )}
                      onClick={() => {
                        onChange(name)
                        setOpen(false)
                      }}
                    >
                      {createElement(Icon, { className: 'size-4' })}
                    </Button>
                  )
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center justify-center px-4 py-8 text-sm">
              <Search className="mb-2 size-10 opacity-20" />
              {t('resume.iconSelector.empty')}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
