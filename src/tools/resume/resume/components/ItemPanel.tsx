import { Reorder, useDragControls } from 'motion/react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ItemPanelProps<T extends { id: string; visible?: boolean }> = {
  items: T[]
  summary: (item: T) => string
  editor: (item: T, patch: (changes: Partial<T>) => void) => React.ReactNode
  onItemsChange: (items: T[]) => void
  onCreate: () => T
  /** 新增按钮的文案 */
  addLabel: string
  /** 条目为空时的提示 */
  emptyLabel: string
}

function DragHandle({ onStart }: { onStart: (event: React.PointerEvent) => void }) {
  const { t } = useTranslation('tools-resume')

  return (
    <div
      aria-label={t('resume.layout.drag')}
      onPointerDown={onStart}
      className="border-border hover:bg-muted/50 flex w-10 shrink-0 cursor-grab touch-none items-center justify-center border-r"
    >
      <GripVertical className="text-muted-foreground size-4" />
    </div>
  )
}

/**
 * 条目型章节的通用外壳：拖拽排序、逐条显隐、删除确认、展开编辑。
 *
 * 经历 / 教育 / 项目 / 自定义章节共用此组件，只换 summary 与 editor 两个渲染槽。
 */
export function ItemPanel<T extends { id: string; visible?: boolean }>({
  items,
  summary,
  editor,
  onItemsChange,
  onCreate,
  addLabel,
  emptyLabel,
}: ItemPanelProps<T>) {
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?.id ?? null)

  const patchItem = (item: T, changes: Partial<T>) => {
    onItemsChange(items.map((each) => (each.id === item.id ? { ...each, ...changes } : each)))
  }

  const setVisible = (item: T, visible: boolean) => patchItem(item, { visible } as Partial<T>)

  const remove = (item: T) => {
    const remaining = items.filter((each) => each.id !== item.id)
    onItemsChange(remaining)
    if (expandedId === item.id) {
      setExpandedId(remaining[remaining.length - 1]?.id ?? null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
          {emptyLabel}
        </p>
      )}

      <Reorder.Group
        axis="y"
        values={items}
        onReorder={onItemsChange}
        className="flex flex-col gap-2"
      >
        {items.map((item) => (
          <ReorderableRow
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
            summary={summary(item)}
            visible={item.visible !== false}
            onToggleVisible={(next) => setVisible(item, next)}
            onRemoved={() => remove(item)}
            editor={editor(item, (changes) => patchItem(item, changes))}
          />
        ))}
      </Reorder.Group>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5 border-dashed"
        onClick={() => {
          const created = onCreate()
          onItemsChange([...items, created])
          setExpandedId(created.id)
        }}
      >
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </div>
  )
}

function ReorderableRow<T extends { id: string }>({
  item,
  summary,
  visible,
  expanded,
  editor,
  onToggleExpand,
  onToggleVisible,
  onRemoved,
}: {
  item: T
  summary: string
  visible: boolean
  expanded: boolean
  editor: React.ReactNode
  onToggleExpand: () => void
  onToggleVisible: (next: boolean) => void
  onRemoved: () => void
}) {
  const { t } = useTranslation('tools-resume')
  const dragControls = useDragControls()

  return (
    <Reorder.Item
      id={item.id}
      value={item}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ scale: 1.02 }}
      className="border-border bg-card overflow-hidden rounded-lg border"
    >
      <div className="flex items-center">
        <DragHandle onStart={(event) => dragControls.start(event)} />

        <div
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 p-3 select-none"
          onClick={onToggleExpand}
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              !visible && 'text-muted-foreground line-through',
            )}
          >
            {summary || t('resume.item.untitled')}
          </span>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={visible ? t('resume.layout.hide') : t('resume.layout.show')}
            aria-label={visible ? t('resume.layout.hide') : t('resume.layout.show')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onToggleVisible(!visible)
            }}
          >
            {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={t('resume.item.delete')}
                aria-label={t('resume.item.delete')}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <Trash2 className="text-destructive size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(event) => event.stopPropagation()}>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('resume.item.deleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('resume.item.deleteDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={(event) => event.stopPropagation()}>
                  {t('resume.confirm.cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemoved()
                  }}
                >
                  {t('resume.confirm.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <ChevronDown
            className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-180')}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t p-3">{editor}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  )
}
