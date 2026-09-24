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
import { GripVertical, Search } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { ToolCard } from '@/components/tool-card'
import { DocumentMeta } from '@/modules/seo/document-meta'
import { siteConfig } from '@/config/site'
import { Button } from '@/components/ui/button'
import { useSearchStore } from '@/stores/search.store'
import { useToolsStore } from '@/stores/tools.store'
import { categoryIcons } from '@/tools/categories'
import { getFavoriteTools, getRecentTools, toolsByCategory } from '@/tools'
import type { Tool } from '@/tools/define-tool'

/** 首页：Hero + 收藏（可拖拽排序）+ 最近使用 + 全部分类 */
export default function HomePage() {
  const { t } = useTranslation('home')
  const { t: tCommon } = useTranslation('common')
  const openPalette = useSearchStore((state) => state.setOpen)
  const site = { site: siteConfig.name }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <DocumentMeta title={t('pageTitle', site)} description={t('subtitle')} />

      <section className="flex flex-col items-center gap-4 py-10 text-center md:py-14">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title', site)}</h1>
        <p className="text-muted-foreground max-w-xl text-sm text-balance md:text-base">
          {t('subtitle')}
        </p>
        <Button variant="outline" onClick={() => openPalette(true)} className="gap-2">
          <Search className="size-4" />
          {tCommon('searchPlaceholder')}
          <kbd className="bg-muted rounded border px-1.5 font-mono text-[10px]">Ctrl K</kbd>
        </Button>
      </section>

      <FavoriteSection />
      <RecentSection />
      <AllCategoriesSection />
    </div>
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
      <h2 className="mb-3 text-lg font-semibold">{t('favorites')}</h2>
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
        <h2 className="text-lg font-semibold">{t('recent')}</h2>
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
  const { t } = useTranslation('home')
  const { t: tCategory } = useTranslation('categories')

  return (
    <section className="flex flex-col gap-8">
      {toolsByCategory.map(({ category, tools }) => {
        const Icon = categoryIcons[category]
        return (
          <div key={category}>
            <div className="mb-3 flex items-center gap-2">
              <Icon className="text-primary size-4" />
              <h2 className="text-lg font-semibold">{tCategory(category)}</h2>
              <span className="text-muted-foreground text-xs">
                {t('toolCount', { count: tools.length })}
              </span>
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
