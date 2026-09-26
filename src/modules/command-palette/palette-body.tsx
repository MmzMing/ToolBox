import { BookOpen, Info, Moon, Search, Shuffle, X } from 'lucide-react'
import { Command as CommandPrimitive } from 'cmdk'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { GithubIcon } from '@/components/icons/github-icon'
import { Button } from '@/components/ui/button'
import { Command, CommandList, CommandSeparator } from '@/components/ui/command'
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import { createToolsFuse, useToolSearchItems } from '@/composable/use-tools-search'
import { useTheme } from '@/modules/theme/theme-context'
import { siteConfig } from '@/config/site'
import { useSearchStore } from '@/stores/search.store'
import { useToolsStore } from '@/stores/tools.store'
import { getFavoriteTools, getRecentTools, tools, toolsByCategory } from '@/tools'

import { PaletteGroup } from './palette-group'
import { PaletteToolCards } from './palette-tool-card'

/**
 * 面板正文：查询词在 search store（打开时由 setOpen(true) 清零），cmdk 选中项与键盘高亮留在本地。
 * 关闭过程中不改写查询词，否则淡出那一帧会从筛选结果跳回全量列表，表现为闪烁；
 * 正文本身是 DialogContent 的子树，退场动画结束后会随它一起卸载。
 */
export function PaletteBody() {
  const { t } = useTranslation('common')
  const { t: tCategory } = useTranslation('categories')
  const navigate = useNavigate()
  const setOpen = useSearchStore((state) => state.setOpen)
  const query = useSearchStore((state) => state.query)
  const setQuery = useSearchStore((state) => state.setQuery)

  const [activeValue, setActiveValue] = useState('')
  /** cmdk 的选中项会停在最后悬停过的卡片上，直接拿它点亮会让绿色在鼠标移开后残留，故只在键盘导航时点亮 */
  const [keyboardNav, setKeyboardNav] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const searchItems = useToolSearchItems()
  const fuse = useMemo(() => createToolsFuse(searchItems), [searchItems])

  const hasQuery = query.trim() !== ''
  const keyboardActiveValue = keyboardNav ? activeValue : null

  const matchedTools = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      return searchItems.map(({ tool }) => tool)
    }
    return fuse.search(trimmed).map(({ item }) => item.tool)
  }, [query, fuse, searchItems])

  const goTo = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <Command
      shouldFilter={false}
      value={activeValue}
      onValueChange={setActiveValue}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          setKeyboardNav(true)
        }
      }}
      className="min-h-0 flex-1 p-0"
    >
      <div className="shrink-0 px-3 pt-3 pb-2.5">
        <InputGroup className="h-11 rounded-xl md:h-12">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <CommandPrimitive.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={t('searchPlaceholder')}
            className="text-foreground flex-1 bg-transparent text-sm outline-hidden"
          />
          <InputGroupAddon align="inline-end">
            {hasQuery ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t('clear')}
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
              >
                <X />
              </Button>
            ) : (
              <kbd className="bg-muted/60 text-muted-foreground flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[11px] leading-none">
                Esc
              </kbd>
            )}
          </InputGroupAddon>
        </InputGroup>

        {/* 快捷操作只在浏览态出现，一旦输入查询词就让位给结果 */}
        {!hasQuery && (
          <div className="mt-2.5">
            <PaletteActions goTo={goTo} onClose={() => setOpen(false)} />
          </div>
        )}
      </div>

      <CommandList
        onPointerEnter={() => setKeyboardNav(false)}
        className="max-h-none min-h-0 flex-1 px-3 pb-3"
      >
        {/* 有查询词时只留搜索结果，收藏/最近分组一并隐藏 */}
        {!hasQuery && <PinnedGroups goTo={goTo} activeValue={keyboardActiveValue} />}

        {toolsByCategory.map(({ category }) => {
          const groupTools = matchedTools.filter((tool) => tool.category === category)
          if (groupTools.length === 0) {
            return null
          }
          return (
            <PaletteGroup key={category} title={tCategory(category)} count={groupTools.length}>
              <PaletteToolCards
                tools={groupTools}
                activeValue={keyboardActiveValue}
                onOpen={goTo}
              />
            </PaletteGroup>
          )
        })}

        {matchedTools.length === 0 && hasQuery && (
          <div className="text-muted-foreground py-8 text-center text-sm">{t('noResults')}</div>
        )}
      </CommandList>
    </Command>
  )
}

type GoTo = (path: string) => void

/** 快捷操作胶囊条：随机工具 / 切换主题 / 博客 / GitHub / 关于 */
function PaletteActions({ goTo, onClose }: { goTo: GoTo; onClose: () => void }) {
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
    <div className="flex flex-wrap items-center gap-2">
      {actions.map(({ icon: Icon, label, run }) => (
        <Button
          key={label}
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => {
            onClose()
            run()
          }}
        >
          <Icon />
          {label}
        </Button>
      ))}
    </div>
  )
}

/** 空查询时的置顶分组：收藏夹 + 最近使用（订阅 store，实时更新） */
function PinnedGroups({ goTo, activeValue }: { goTo: GoTo; activeValue: string | null }) {
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
        <PaletteGroup title={t('favorites')} count={favoriteTools.length}>
          <PaletteToolCards
            tools={favoriteTools}
            valuePrefix="fav:"
            activeValue={activeValue}
            onOpen={goTo}
          />
        </PaletteGroup>
      )}
      {recentTools.length > 0 && (
        <PaletteGroup title={t('recent')} count={recentTools.length}>
          <PaletteToolCards
            tools={recentTools}
            valuePrefix="recent:"
            activeValue={activeValue}
            onOpen={goTo}
          />
        </PaletteGroup>
      )}
      <CommandSeparator className="my-1" />
    </>
  )
}
