import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Link2,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import type { Transition } from 'motion/react'

import { JSON_ROW_HEIGHT, useJsonTree } from '@/composable/use-json-tree'
import type { JsonTreeRow } from '@/composable/use-json-tree'
import { Button } from '@/components/ui/button'
import { motionTokens } from '@/lib/motion-tokens'
import { cn } from '@/lib/utils'
import { isJsonBranch, jsonEntriesOf, jsonPrimitiveText } from '@/utils/json-tree'
import type { JsonValueType } from '@/utils/json-tree'

export type JsonViewerProps = {
  data: unknown
  /** 路径里的根名，如 `root.users[0].name` */
  rootName?: string
  /** 首次渲染展开到第几层 */
  defaultExpandDepth?: number
  /** 显示搜索框 */
  searchable?: boolean
  /** 长数组/长对象每页加载的子项数 */
  pageSize?: number
  /** 显示「复制值 / 复制路径」 */
  copyable?: boolean
  /** 在树下方显示当前行的路径 */
  showPath?: boolean
  /** 滚动区高度；放进 IoCard 之类的弹性容器时传 '100%' */
  maxHeight?: number | string
  /** 树的无障碍名称 */
  label?: string
  className?: string
}

/** 超过这个行数就关掉逐行动画：几百个 spring 同时跑会把主线程占满 */
const BULK_ROWS = 400

/** 值按类型着色，配色沿用 highlight.js 那套语法令牌，与文本视图的颜色语义一致 */
const VALUE_COLOR: Record<JsonValueType, string> = {
  string: 'text-[var(--syntax-string)]',
  number: 'text-[var(--syntax-number)]',
  boolean: 'text-[var(--syntax-keyword)]',
  null: 'text-[var(--syntax-keyword)]',
  object: '',
  array: '',
  other: 'text-muted-foreground',
}

function Highlight({ text, needle, current }: { text: string; needle: string; current: boolean }) {
  if (!needle) {
    return <>{text}</>
  }
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let from = 0
  let at = lower.indexOf(needle)
  while (at !== -1) {
    if (at > from) {
      parts.push(text.slice(from, at))
    }
    parts.push(
      <mark
        key={at}
        className={cn(
          'rounded-sm',
          current ? 'bg-primary text-primary-foreground' : 'bg-primary/25 text-foreground',
        )}
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    )
    from = at + needle.length
    at = lower.indexOf(needle, from)
  }
  if (from < text.length) {
    parts.push(text.slice(from))
  }
  return <>{parts}</>
}

type CopyState = 'idle' | 'done' | 'error'

/** 纯图标复制按钮：图标原地换，按钮宽度不随状态跳 */
function CopyButton({
  label,
  icon,
  onCopy,
  reduced,
  className,
  focusable = false,
}: {
  label: string
  icon: ReactNode
  onCopy: () => Promise<boolean>
  reduced: boolean
  className?: string
  focusable?: boolean
}) {
  const { t } = useTranslation('common', { keyPrefix: 'jsonViewer' })
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const run = async () => {
    window.clearTimeout(timer.current)
    setState((await onCopy()) ? 'done' : 'error')
    timer.current = window.setTimeout(() => setState('idle'), 1400)
  }

  const glyph =
    state === 'done' ? (
      <Check size={14} strokeWidth={2} aria-hidden="true" />
    ) : state === 'error' ? (
      <X size={14} strokeWidth={2} aria-hidden="true" />
    ) : (
      icon
    )

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      tabIndex={focusable ? undefined : -1}
      className={className}
      aria-label={state === 'done' ? t('copied') : state === 'error' ? t('copyFailed') : label}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        void run()
      }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={state}
          className="flex items-center"
          initial={
            reduced
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.6, filter: `blur(${motionTokens.blur.subtle}px)` }
          }
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={
            reduced
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.6, filter: `blur(${motionTokens.blur.subtle}px)` }
          }
          transition={
            reduced
              ? { duration: motionTokens.duration.instant }
              : {
                  ...motionTokens.spring.snappy,
                  opacity: { duration: motionTokens.duration.instant },
                  filter: { duration: motionTokens.duration.instant },
                }
          }
        >
          {glyph}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}

/**
 * JSON 折叠树：按类型着色的可折叠结构视图。
 *
 * 分支逐行展开、长数组分页、搜索高亮并自动展开命中所在的分支、每行可复制值或路径；
 * 键盘按 WAI-ARIA tree 模式走（方向键移动/展开、Home/End 跳转、Enter 切换、
 * Cmd/Ctrl+C 复制当前行的值、Cmd/Ctrl+Shift+C 复制路径）。
 */
export function JsonViewer({
  data,
  rootName = 'root',
  defaultExpandDepth = 1,
  searchable = true,
  pageSize = 50,
  copyable = true,
  showPath = true,
  maxHeight = 420,
  label,
  className,
}: JsonViewerProps) {
  const { t } = useTranslation('common', { keyPrefix: 'jsonViewer' })
  const uid = useId()
  const {
    reduced,
    rows,
    active,
    activeRow,
    folded,
    scrollSpring,
    query,
    needle,
    matchCount,
    matchIndex,
    matchSet,
    currentMatch,
    announcement,
    treeRef,
    searchRef,
    rowRefs,
    onQuery,
    onSearchKeyDown,
    onTreeKeyDown,
    toggle,
    expandAll,
    collapseAll,
    showMore,
    moveTo,
    copyRow,
    stepMatch,
    setActiveRow,
  } = useJsonTree({ data, rootName, defaultExpandDepth, pageSize, searchable })

  const heightStyle = {
    '--json-max-height': typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
  } as CSSProperties
  const bulk = rows.length > BULK_ROWS
  const rowTransition: Transition =
    reduced || bulk
      ? { duration: 0 }
      : {
          height: motionTokens.spring.glide,
          opacity: {
            duration: motionTokens.duration.quick,
            ease: [...motionTokens.ease.standard],
          },
        }

  const countLabel = (type: JsonValueType, count: number) =>
    type === 'array' ? t('items', { count }) : t('keys', { count })

  const describe = (row: JsonTreeRow) => {
    const name = row.name === null ? rootName : String(row.name)
    if (row.kind === 'more') {
      return t('moreAria', {
        count: Math.min(pageSize, row.hidden ?? 0),
        hidden: row.hidden ?? 0,
      })
    }
    return isJsonBranch(row.type)
      ? `${name}, ${row.type}, ${countLabel(row.type, row.count)}`
      : `${name}: ${jsonPrimitiveText(row.value, row.type)}`
  }

  const preview = (row: JsonTreeRow) => {
    if (row.type === 'array') {
      return '[…]'
    }
    const keys = jsonEntriesOf(row.value)
      .slice(0, 3)
      .map(([key]) => key)
      .join(', ')
    return `{ ${keys}${row.count > 3 ? ', …' : ''} }`
  }

  const actionClass =
    'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 group-data-[active=true]/row:opacity-100 max-md:opacity-100'

  return (
    <div
      className={cn('border-border bg-card flex min-h-0 flex-col rounded-lg border', className)}
      style={heightStyle}
    >
      {searchable || rows.length > 1 ? (
        <div className="border-border flex shrink-0 items-center gap-1 border-b px-1.5 py-1">
          {searchable ? (
            <label className="focus-within:bg-accent/60 flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-0.5">
              <Search
                size={15}
                strokeWidth={1.75}
                aria-hidden="true"
                className="text-muted-foreground shrink-0"
              />
              <input
                ref={searchRef}
                type="search"
                className="text-muted-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-xs outline-none"
                value={query}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchAria')}
                aria-controls={`${uid}-tree`}
                onChange={(event) => onQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                spellCheck={false}
                autoComplete="off"
              />
              <AnimatePresence initial={false}>
                {needle ? (
                  <motion.span
                    key="matches"
                    className="flex shrink-0 items-center gap-0.5"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, x: 6 }}
                    transition={{
                      duration: motionTokens.duration.quick,
                      ease: [...motionTokens.ease.enter],
                    }}
                  >
                    <span
                      className="text-muted-foreground text-[11px] tabular-nums"
                      aria-live="polite"
                    >
                      {matchCount
                        ? `${Math.min(matchIndex, matchCount - 1) + 1}/${matchCount}`
                        : t('noMatch')}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('prevMatch')}
                      disabled={!matchCount}
                      onClick={() => stepMatch(-1)}
                    >
                      <ChevronUp size={15} strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('nextMatch')}
                      disabled={!matchCount}
                      onClick={() => stepMatch(1)}
                    >
                      <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </label>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          <span className="bg-border h-4 w-px shrink-0" aria-hidden="true" />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('expandAll')}
            title={t('expandAll')}
            onClick={expandAll}
          >
            <ChevronsUpDown size={15} strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('collapseAll')}
            title={t('collapseAll')}
            onClick={collapseAll}
          >
            <ChevronsDownUp size={15} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <LayoutGroup id={uid}>
        <motion.div
          ref={treeRef}
          layoutScroll
          id={`${uid}-tree`}
          role="tree"
          aria-label={label ?? t('treeAria')}
          className="max-h-[var(--json-max-height)] min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1.5 py-1 font-mono text-xs"
          onKeyDown={onTreeKeyDown}
        >
          <AnimatePresence initial={false}>
            {rows.map((row) => {
              const isActive = row.id === active
              const branch = isJsonBranch(row.type)
              const matched = row.kind === 'node' && matchSet.has(row.id)
              const isCurrentMatch = row.id === currentMatch
              const mark = matched ? needle : ''
              return (
                <motion.div
                  key={row.id}
                  ref={(node: HTMLDivElement | null) => {
                    if (node) {
                      rowRefs.current.set(row.id, node)
                    } else {
                      rowRefs.current.delete(row.id)
                    }
                  }}
                  role="treeitem"
                  tabIndex={isActive ? 0 : -1}
                  aria-level={row.level}
                  aria-posinset={row.posinset}
                  aria-setsize={row.setsize}
                  aria-expanded={row.kind === 'node' && branch ? row.open : undefined}
                  aria-selected={isActive}
                  aria-label={describe(row)}
                  className="group/row relative flex shrink-0 items-center pr-1 pl-[calc(var(--level)*var(--spacing)*4)]"
                  data-active={isActive || undefined}
                  style={{ '--level': row.level - 1 } as CSSProperties}
                  initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
                  animate={{
                    height: JSON_ROW_HEIGHT,
                    opacity: 1,
                    transitionEnd: { overflow: 'visible' },
                  }}
                  exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
                  transition={rowTransition}
                  onFocus={(event) => {
                    if (event.target === event.currentTarget && row.id !== active) {
                      setActiveRow(row.id)
                    }
                  }}
                  onClick={() => {
                    if (row.kind === 'more') {
                      if (row.parent) {
                        showMore(row.parent)
                      }
                      moveTo(row.id)
                      return
                    }
                    if (branch) {
                      toggle(row.id)
                    }
                    moveTo(row.id)
                  }}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="json-active"
                      aria-hidden="true"
                      className="bg-accent pointer-events-none absolute inset-0 rounded-sm"
                      transition={reduced || folded ? { duration: 0 } : scrollSpring}
                    />
                  ) : null}
                  <span className="relative flex min-w-0 flex-1 items-center gap-1">
                    {row.kind === 'more' ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="text-primary shrink-0">
                          {t('showMore', { count: Math.min(pageSize, row.hidden ?? 0) })}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {t('hiddenCount', { count: row.hidden ?? 0 })}
                        </span>
                      </span>
                    ) : (
                      <>
                        <span
                          aria-hidden="true"
                          data-open={row.open || undefined}
                          className={cn(
                            'text-muted-foreground flex size-4 shrink-0 items-center justify-center transition-transform',
                            branch && 'cursor-pointer',
                            row.open && 'rotate-90',
                          )}
                        >
                          {branch ? <ChevronRight size={14} strokeWidth={1.75} /> : null}
                        </span>
                        <span
                          className={cn(
                            'max-w-[45%] shrink-0 truncate',
                            typeof row.name === 'number'
                              ? 'text-[var(--syntax-number)]'
                              : 'text-[var(--syntax-title)]',
                          )}
                        >
                          {row.name === null ? (
                            rootName
                          ) : typeof row.name === 'number' ? (
                            row.name
                          ) : (
                            <Highlight text={row.name} needle={mark} current={isCurrentMatch} />
                          )}
                        </span>
                        <span className="text-muted-foreground shrink-0" aria-hidden="true">
                          {row.name === null && branch ? '' : ':'}
                        </span>
                        {branch ? (
                          <span className="flex min-w-0 items-center gap-2">
                            {!row.open ? (
                              <span className="text-muted-foreground shrink-0">{preview(row)}</span>
                            ) : null}
                            <span className="text-muted-foreground truncate">
                              {countLabel(row.type, row.count)}
                            </span>
                          </span>
                        ) : (
                          <span
                            className={cn('min-w-0 truncate', VALUE_COLOR[row.type])}
                            title={
                              row.type === 'string' && (row.value as string).length > 40
                                ? (row.value as string)
                                : undefined
                            }
                          >
                            {row.type === 'string' ? (
                              <>
                                &quot;
                                <Highlight
                                  text={row.value as string}
                                  needle={mark}
                                  current={isCurrentMatch}
                                />
                                &quot;
                              </>
                            ) : (
                              <Highlight
                                text={jsonPrimitiveText(row.value, row.type)}
                                needle={mark}
                                current={isCurrentMatch}
                              />
                            )}
                          </span>
                        )}
                        {copyable ? (
                          <span
                            className={cn(
                              'ml-auto flex shrink-0 items-center gap-0.5',
                              actionClass,
                            )}
                          >
                            <CopyButton
                              label={t('copyValue')}
                              icon={<Copy size={14} strokeWidth={1.75} aria-hidden="true" />}
                              reduced={reduced}
                              onCopy={() => copyRow(row, 'value')}
                            />
                            <CopyButton
                              label={t('copyPath')}
                              icon={<Link2 size={14} strokeWidth={1.75} aria-hidden="true" />}
                              reduced={reduced}
                              onCopy={() => copyRow(row, 'path')}
                            />
                          </span>
                        ) : null}
                      </>
                    )}
                  </span>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>

      {showPath && activeRow ? (
        <div className="border-border flex shrink-0 items-center gap-2 border-t px-2 py-1 text-[11px]">
          <code className="text-muted-foreground min-w-0 flex-1 truncate">
            {activeRow.kind === 'node' ? activeRow.id : activeRow.parent}
          </code>
          <span className="text-muted-foreground shrink-0">
            {activeRow.kind === 'node'
              ? isJsonBranch(activeRow.type)
                ? `${activeRow.type}, ${countLabel(activeRow.type, activeRow.count)}`
                : activeRow.type
              : t('page')}
          </span>
          {copyable && activeRow.kind === 'node' ? (
            <CopyButton
              key={activeRow.id}
              focusable
              label={t('copyPath')}
              icon={<Copy size={14} strokeWidth={1.75} aria-hidden="true" />}
              reduced={reduced}
              onCopy={() => copyRow(activeRow, 'path')}
            />
          ) : null}
        </div>
      ) : null}
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  )
}

export default JsonViewer
