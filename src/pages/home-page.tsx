import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { ToolCard } from '@/components/tool-card'
import { DocumentMeta } from '@/modules/seo/document-meta'
import { Button } from '@/components/ui/button'
import { GooeyInput } from '@/components/ui/gooey-input'
import { useIsMobile } from '@/composable/use-breakpoint'
import {
  createToolsFuse,
  useToolSearchItems,
  type ToolSearchItem,
} from '@/composable/use-tools-search'
import { useToolsStore } from '@/stores/tools.store'
import { categoryIcons } from '@/tools/categories'
import { getFavoriteTools, getRecentTools, toolsByCategory } from '@/tools'
import type { Tool } from '@/tools/define-tool'

/** 首页：Hero + 收藏（可拖拽排序）+ 最近使用 + 全部分类 */
export default function HomePage() {
  const { t } = useTranslation('home')
  const { t: tCommon } = useTranslation('common')
  const site = { site: tCommon('siteName') }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <DocumentMeta title={t('pageTitle', site)} description={t('metaDescription')} path="/" />

      <section className="flex flex-col items-center gap-6 py-14 text-center md:gap-8 md:py-20">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tighter text-balance sm:text-5xl md:text-6xl">
          {t('title', site)}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-base leading-relaxed text-pretty md:text-lg">
          {t('subtitle')}
        </p>
        <HeroSearch />
      </section>

      <FavoriteSection />
      <RecentSection />
      <AllCategoriesSection />
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

function FavoriteSection() {
  const { t } = useTranslation('home')
  const favorites = useToolsStore((state) => state.favorites)
  const reorderFavorites = useToolsStore((state) => state.reorderFavorites)
  const favoriteTools = useMemo(() => getFavoriteTools(favorites), [favorites])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (favoriteTools.length === 0) {
    return null
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }
    const oldIndex = favorites.indexOf(String(active.id))
    const newIndex = favorites.indexOf(String(over.id))
    if (oldIndex >= 0 && newIndex >= 0) {
      reorderFavorites(arrayMove(favorites, oldIndex, newIndex))
    }
  }

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-3xl font-semibold">{t('favorites')}</h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={favoriteTools.map((tool) => tool.path)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {favoriteTools.map((tool) => (
              <SortableToolCard key={tool.path} tool={tool} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  )
}

/** 最近使用（常用工具）：按使用频次与时间排序取 Top 8，可一键清空 */
function RecentSection() {
  const { t } = useTranslation('home')
  const { t: tCommon } = useTranslation('common')
  const recent = useToolsStore((state) => state.recent)
  const clearRecent = useToolsStore((state) => state.clearRecent)
  const recentTools = useMemo(() => getRecentTools(recent), [recent])

  if (recentTools.length === 0) {
    return null
  }

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-3xl font-semibold">{t('recent')}</h2>
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground ml-auto"
          onClick={clearRecent}
        >
          {tCommon('clearRecent')}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {recentTools.map((tool) => (
          <ToolCard key={tool.path} tool={tool} />
        ))}
      </div>
    </section>
  )
}

function SortableToolCard({ tool }: { tool: Tool }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tool.path,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative ${isDragging ? 'z-10 opacity-90' : ''}`}
    >
      <button
        type="button"
        aria-label="drag"
        className="text-muted-foreground absolute top-1/2 left-1 z-10 -translate-y-1/2 cursor-grab touch-none rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <ToolCard tool={tool} />
    </div>
  )
}

function AllCategoriesSection() {
  const { t: tCategory } = useTranslation('categories')

  return (
    <section className="flex flex-col gap-8">
      {toolsByCategory.map(({ category, tools }) => {
        const Icon = categoryIcons[category]
        return (
          <div key={category}>
            {/* 标题与图标按「大一号」的区块标题走；工具数量从侧栏的计数就能看出来，这里不再重复 */}
            <div className="mb-4 flex items-center gap-3">
              <Icon className="text-primary size-8" />
              <h2 className="text-3xl font-semibold">{tCategory(category)}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tools.map((tool) => (
                <ToolCard key={tool.path} tool={tool} />
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}
