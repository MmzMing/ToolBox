import { BookOpen, History, Heart, Info, Moon, Shuffle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useTheme } from '@/modules/theme/theme-context'

import { GithubIcon } from '@/components/icons/github-icon'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createToolsFuse, useToolSearchItems } from '@/composable/use-tools-search'
import { useSearchStore } from '@/stores/search.store'
import { useToolsStore } from '@/stores/tools.store'
import { getFavoriteTools, getRecentTools, tools, toolsByCategory } from '@/tools'
import { siteConfig } from '@/config/site'

interface GroupedMatch {
  path: string
  category: string
}

/**
 * 全局命令面板：Ctrl/Cmd+K 打开。
 * 搜索用 fuse.js（当前语言标题 + 跨语言标题 + 关键词），cmdk 只负责键盘导航，
 * 故 Command 关闭内置过滤（shouldFilter=false），过滤结果完全由 fuse 决定。
 */
export function CommandPalette() {
  const { t } = useTranslation('common')
  const { t: tCategory } = useTranslation('categories')
  const navigate = useNavigate()

  const open = useSearchStore((state) => state.open)
  const setOpen = useSearchStore((state) => state.setOpen)
  const [query, setQuery] = useState('')

  const searchItems = useToolSearchItems()
  const fuse = useMemo(() => createToolsFuse(searchItems), [searchItems])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        const next = !useSearchStore.getState().open
        if (next) {
          setQuery('')
        }
        setOpen(next)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('')
    }
    setOpen(next)
  }

  const matched = useMemo<GroupedMatch[]>(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      return toolsByCategory
        .map(({ category, tools: categoryTools }) => ({
          path: categoryTools.map((tool) => tool.path),
          category,
        }))
        .flatMap(({ category, path }) => path.map((p) => ({ path: p, category })))
    }
    return fuse.search(trimmed).map(({ item }) => ({
      path: item.tool.path,
      category: item.tool.category,
    }))
  }, [query, fuse])

  const goTo = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="top-1/3 translate-y-0 overflow-hidden rounded-xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{t('searchPlaceholder')}</DialogTitle>
          <DialogDescription>{t('searchPlaceholder')}</DialogDescription>
        </DialogHeader>

        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t('searchPlaceholder')}
          />
          <CommandList>
            {/* 有查询词时只留搜索结果，快捷操作与收藏/最近分组一并隐藏 */}
            {!query.trim() && (
              <>
                <ActionGroups goTo={goTo} />
                <PinnedGroups goTo={goTo} />
              </>
            )}

            {toolsByCategory.map(({ category }) => {
              const groupTools = matched.filter((item) => item.category === category)
              if (groupTools.length === 0) {
                return null
              }
              return (
                <CommandGroup key={category} heading={tCategory(category)}>
                  {groupTools.map(({ path }) => (
                    <CommandItem key={path} value={path} onSelect={() => goTo(path)}>
                      <span>{t(`tools-${category}:${path.slice(1)}.title`)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}

            {matched.length === 0 && query.trim() !== '' && (
              <div className="text-muted-foreground py-6 text-center text-sm">{t('noResults')}</div>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

type GoTo = (path: string) => void

/** 固定动作：随机工具 / 切换主题 / GitHub / 关于 */
function ActionGroups({ goTo }: { goTo: GoTo }) {
  const { t } = useTranslation('common')
  const { setTheme, resolvedTheme } = useTheme()

  const actions = [
    {
      icon: Shuffle,
      label: t('randomTool'),
      run: () => goTo(tools[Math.floor(Math.random() * tools.length)].path),
    },
    {
      icon: Moon,
      label: t('toggleTheme'),
      run: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    },
    {
      icon: BookOpen,
      label: t('blog'),
      run: () => window.open(siteConfig.blogUrl, '_blank', 'noopener'),
    },
    {
      icon: GithubIcon,
      label: t('github'),
      run: () => window.open(siteConfig.githubUrl, '_blank', 'noopener'),
    },
    { icon: Info, label: t('about'), run: () => goTo('/about') },
  ]

  return (
    <>
      <CommandGroup heading={t('actions')}>
        {actions.map(({ icon: Icon, label, run }) => (
          <CommandItem
            key={label}
            value={`action:${label}`}
            onSelect={() => {
              useSearchStore.getState().setOpen(false)
              run()
            }}
          >
            <Icon className="size-4" />
            {label}
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandSeparator />
    </>
  )
}

/** 空查询时的置顶分组：收藏夹 + 最近使用（订阅 store，实时更新） */
function PinnedGroups({ goTo }: { goTo: GoTo }) {
  const { t } = useTranslation('common')
  const favorites = useToolsStore((state) => state.favorites)
  const recent = useToolsStore((state) => state.recent)

  const favoriteTools = useMemo(() => getFavoriteTools(favorites), [favorites])
  const recentTools = useMemo(() => getRecentTools(recent), [recent])

  if (favoriteTools.length === 0 && recentTools.length === 0) {
    return null
  }

  return (
    <>
      {favoriteTools.length > 0 && (
        <CommandGroup heading={t('favorites')}>
          {favoriteTools.map((tool) => (
            <CommandItem
              key={tool.path}
              value={`fav:${tool.path}`}
              onSelect={() => goTo(tool.path)}
            >
              <Heart className="size-4 text-amber-400" />
              {t(`tools-${tool.category}:${tool.name}.title`)}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {recentTools.length > 0 && (
        <CommandGroup heading={t('recent')}>
          {recentTools.map((tool) => (
            <CommandItem
              key={tool.path}
              value={`recent:${tool.path}`}
              onSelect={() => goTo(tool.path)}
            >
              <History className="text-muted-foreground size-4" />
              {t(`tools-${tool.category}:${tool.name}.title`)}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      <CommandSeparator />
    </>
  )
}
