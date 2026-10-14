import { BookOpen, Info, Moon, Search, Shuffle, X } from 'lucide-react'
import { Command as CommandPrimitive } from 'cmdk'
import { AnimatePresence, motion } from 'motion/react'
import type { Transition } from 'motion/react'
import { type ComponentProps, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { GithubIcon } from '@/components/icons/github-icon'
import { EmptyStates } from '@/components/empty-states/EmptyStates'
import { Button, buttonVariants } from '@/components/ui/button'
import { Command, CommandList } from '@/components/ui/command'
import { createToolsFuse, useToolSearchItems } from '@/composable/use-tools-search'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { modKeyLabel } from '@/layouts/app-shell/dock-logic'
import { useTheme } from '@/modules/theme/theme-context'
import { siteConfig } from '@/config/site'
import { cn } from '@/lib/utils'
import { motionTokens } from '@/lib/motion-tokens'
import { useSearchStore } from '@/stores/search.store'
import { useToolsStore } from '@/stores/tools.store'
import { getFavoriteTools, getRecentTools, tools, toolsByCategory } from '@/tools'

import { PaletteGroup } from './palette-group'
import { PaletteToolCards } from './palette-tool-card'

const { blur, duration, ease, spring } = motionTokens

/** 退场比入场快一拍：清除按钮收起时不留残影，右侧键帽正顺着 popLayout 的弹簧归位 */
const LEAVE: Transition = { duration: duration.quick, ease: [...ease.standard] }

/** 徽标键随平台取 ⌘ 或 Ctrl，与快捷键实际监听的 metaKey || ctrlKey 一致 */
const MOD_KEY = modKeyLabel(typeof navigator === 'undefined' ? '' : navigator.userAgent)

/** ⌘K 键帽：描边小方片；Esc 是纯文字，两者一明一暗分出主次 */
const keyCap =
  'border-input bg-muted/50 text-foreground flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 font-mono text-xs leading-none'

/**
 * 面板正文：查询词在 search store（打开时由 setOpen(true) 清零），cmdk 选中项与键盘高亮留在本地。
 * 关闭过程中不改写查询词，否则淡出那一帧会从筛选结果跳回全量列表，表现为闪烁；
 * 正文本身是 DialogContent 的子树，退场动画结束后会随它一起卸载。
 */
export function PaletteBody() {
  const { t } = useTranslation('common')
  const { t: tCategory } = useTranslation('categories')
  const reduced = usePrefersReducedMotion()
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

  /** 清除按钮的进出场：透明度瞬间到位，尺寸与模糊量交给 snappy 弹簧；减弱动效时一律归零 */
  const clearMotion: ComponentProps<typeof motion.button> = reduced
    ? {
        initial: false,
        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, transition: { duration: 0 } },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, scale: 0.6, filter: `blur(${blur.subtle}px)` },
        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, scale: 0.6, filter: `blur(${blur.subtle}px)`, transition: LEAVE },
        transition: { default: spring.snappy, opacity: { duration: duration.instant } },
      }

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
      {/* 搜索区用一层浅底与下方结果区分色，不再画分隔线 */}
      <div className="bg-muted/40 shrink-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <Search
            size={18}
            strokeWidth={1.75}
            className="text-muted-foreground shrink-0"
            aria-hidden="true"
          />
          <CommandPrimitive.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={t('searchPlaceholder')}
            className="placeholder:text-muted-foreground/70 min-w-0 flex-1 bg-transparent text-base outline-hidden"
          />
          {/* 清除按钮退场时会被转成 absolute，锚点就是这层；不写 relative 它会去找更外的定位祖先 */}
          <div className="relative flex shrink-0 items-center gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {hasQuery && (
                <motion.button
                  key="clear"
                  type="button"
                  aria-label={t('clearSearch')}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
                    'shrink-0 transition-colors',
                  )}
                  onClick={() => {
                    setQuery('')
                    inputRef.current?.focus()
                  }}
                  {...clearMotion}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </motion.button>
              )}
            </AnimatePresence>
            {/* Esc 是纯文字、⌘K 是键帽：一个提示怎么关，一个提示从哪儿再唤起 */}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0 text-sm font-medium transition-colors"
              aria-label={t('closePalette')}
              onClick={() => setOpen(false)}
            >
              Esc
            </button>
            <kbd className={keyCap}>
              <span>{MOD_KEY}</span>
              <span>K</span>
            </kbd>
          </div>
        </div>

        {/* 快捷操作只在浏览态出现，一旦输入查询词就让位给结果 */}
        {!hasQuery && (
          <div className="px-4 pb-3.5">
            <PaletteActions goTo={goTo} onClose={() => setOpen(false)} />
          </div>
        )}
      </div>

      <CommandList
        onPointerEnter={() => setKeyboardNav(false)}
        className="max-h-none min-h-0 flex-1 px-4 pb-4"
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
          <EmptyStates
            scene="search"
            compact
            className="pt-2"
            onAction={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          />
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
    </>
  )
}
