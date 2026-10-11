import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { CircuitBoard } from '@/components/home/circuit/CircuitBoard'
import { DocumentMeta } from '@/modules/seo/document-meta'
import { GooeyInput } from '@/components/ui/gooey-input'
import { useIsMobile } from '@/composable/use-breakpoint'
import {
  createToolsFuse,
  useToolSearchItems,
  type ToolSearchItem,
} from '@/composable/use-tools-search'

/** 首页：大标题 + 搜索 + 分类电路板。工具清单都在板子里，页面本身不再铺卡片 */
export default function HomePage() {
  const { t } = useTranslation('home')
  const { t: tCommon } = useTranslation('common')
  const site = { site: tCommon('siteName') }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <DocumentMeta title={t('pageTitle', site)} description={t('metaDescription')} path="/" />

      <section className="flex flex-col items-center gap-6 pt-14 text-center md:gap-8 md:pt-20">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tighter text-balance sm:text-5xl md:text-6xl">
          {t('title', site)}
        </h1>
        <p className="text-muted-foreground max-w-4xl px-2 text-base leading-relaxed text-pretty md:text-lg">
          {t('subtitle')}
        </p>
        <HeroSearch />
      </section>

      <CircuitBoard />
    </div>
  )
}

/** Hero 搜索：gooey 输入框，输入时在下方面板内联列出匹配工具（不含命令面板的快捷操作） */
function HeroSearch() {
  const { t } = useTranslation('common')
  const isMobile = useIsMobile()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)

  const searchItems = useToolSearchItems()
  const fuse = useMemo(() => createToolsFuse(searchItems), [searchItems])

  const expandedWidth = isMobile ? 240 : 400
  const expandedOffset = isMobile ? 48 : 64

  const results = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      return []
    }
    return fuse
      .search(trimmed)
      .slice(0, 8)
      .map(({ item }) => item)
  }, [query, fuse])

  useEffect(() => {
    if (!panelOpen) {
      return
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setPanelOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanelOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [panelOpen])

  const handleChange = (next: string) => {
    setQuery(next)
    setPanelOpen(next.trim() !== '')
  }

  return (
    <div
      ref={wrapRef}
      data-tour="search"
      className="relative flex justify-center"
      style={{ width: expandedWidth + expandedOffset }}
    >
      <GooeyInput
        value={query}
        placeholder={t('searchPlaceholder')}
        collapsedWidth={isMobile ? 190 : 240}
        expandedWidth={expandedWidth}
        expandedOffset={expandedOffset}
        classNames={{
          filterWrap: 'h-12',
          buttonRow: 'h-12',
          trigger: 'h-12 px-5 text-base',
          input: 'text-base',
          bubble: 'size-12',
          bubbleSurface: 'size-12',
        }}
        onValueChange={handleChange}
      />

      {panelOpen && query.trim() !== '' && (
        <div className="bg-popover text-popover-foreground absolute top-full left-0 z-20 mt-3 w-full rounded-xl border p-2 text-left shadow-lg">
          {results.length > 0 ? (
            <ul className="flex flex-col">
              {results.map((item) => (
                <HeroSearchResult
                  key={item.tool.path}
                  item={item}
                  onPick={() => setPanelOpen(false)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground px-3 py-6 text-center text-base">
              {t('noResults')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function HeroSearchResult({ item, onPick }: { item: ToolSearchItem; onPick: () => void }) {
  const { tool, title, description } = item
  const Icon = tool.icon

  return (
    <li>
      <Link
        to={tool.path}
        onClick={onPick}
        className="hover:bg-accent hover:text-accent-foreground flex items-start gap-3 rounded-lg px-3 py-2.5"
      >
        <Icon className="text-primary mt-1 size-5 shrink-0" />
        <span className="min-w-0">
          <span className="block text-lg leading-snug font-medium">{title}</span>
          <span className="text-muted-foreground block truncate text-sm">{description}</span>
        </span>
      </Link>
    </li>
  )
}
