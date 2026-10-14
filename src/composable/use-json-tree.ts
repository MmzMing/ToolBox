import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { animate } from 'motion/react'
import type { AnimationPlaybackControls, Transition } from 'motion/react'

import { useCopy } from '@/composable/use-copy'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { motionTokens } from '@/lib/motion-tokens'
import {
  isJsonBranch,
  jsonBranchPaths,
  jsonChildPath,
  jsonCopyText,
  jsonEntriesOf,
  jsonSearch,
  jsonTypeOf,
  jsonWithin,
} from '@/utils/json-tree'
import type { JsonSearchResult, JsonValueType } from '@/utils/json-tree'

/**
 * 行高（px）。滚动定位与逐行展开动画都按这个固定值算，所以一行必须只显示一行，
 * 超长内容用省略号 + title 提示，不能撑高。
 */
export const JSON_ROW_HEIGHT = 30

export type JsonTreeRow = {
  id: string
  /** more 行是分页用的「再显示 N 项」，不是数据节点 */
  kind: 'node' | 'more'
  level: number
  name: string | number | null
  value: unknown
  type: JsonValueType
  count: number
  open: boolean
  parent: string | null
  posinset: number
  setsize: number
  hidden?: number
}

export type UseJsonTreeOptions = {
  data: unknown
  rootName: string
  /** 首次渲染展开到第几层 */
  defaultExpandDepth: number
  /** 长数组/长对象每页加载的子项数 */
  pageSize: number
  /** 有搜索框时 `/` 才跳到它 */
  searchable: boolean
}

/**
 * JSON 树的展开、搜索、分页与当前行状态，外加滚动与键盘导航。
 *
 * 视图只负责把 rows 画出来；这些相互纠缠的状态（搜索会临时接管展开、命中在第 800
 * 项时要自动点开到那一页、当前行被折叠时要退到最近可见的祖先）放在一起才讲得通。
 */
export function useJsonTree({
  data,
  rootName,
  defaultExpandDepth,
  pageSize,
  searchable,
}: UseJsonTreeOptions) {
  const { t } = useTranslation('common', { keyPrefix: 'jsonViewer' })
  const reduced = usePrefersReducedMotion()
  const { copy } = useCopy()
  const treeRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  const [expandedInternal, setExpandedInternal] = useState<string[]>(() =>
    jsonBranchPaths(data, rootName, defaultExpandDepth),
  )
  const base = useMemo(() => new Set(expandedInternal), [expandedInternal])

  /* 搜索：命中所在的分支自己会展开，所以「搜索展开」与「用户手动展开」要分开记。
     搜索期间手动折叠某个命中分支会被记住，改关键词后自动失效。 */
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const search = useMemo<JsonSearchResult | null>(
    () => (needle ? jsonSearch(data, rootName, needle) : null),
    [data, needle, rootName],
  )
  const [closedWhileSearching, setClosedWhileSearching] = useState<{
    needle: string
    ids: Set<string>
  }>({ needle: '', ids: new Set() })
  const closed = closedWhileSearching.needle === needle ? closedWhileSearching.ids : null
  const [matchIndex, setMatchIndex] = useState(0)
  const matchCount = search?.matches.length ?? 0
  const matchSet = useMemo(() => new Set(search?.matches ?? []), [search])
  const currentMatch =
    search && matchCount ? search.matches[Math.min(matchIndex, matchCount - 1)] : null

  const isOpen = useCallback(
    (id: string) => {
      if (search && search.ancestors.has(id)) {
        return !closed?.has(id)
      }
      return base.has(id)
    },
    [base, closed, search],
  )

  /* 分页：命中在第 800 项时，这一支至少要点开到那一页才看得见 */
  const [pages, setPages] = useState<Record<string, number>>({})
  const limitOf = useCallback(
    (id: string) => Math.max((pages[id] ?? 1) * pageSize, search?.needed.get(id) ?? 0),
    [pageSize, pages, search],
  )

  const rows = useMemo(() => {
    const out: JsonTreeRow[] = []
    const visit = (
      value: unknown,
      id: string,
      name: string | number | null,
      level: number,
      parent: string | null,
      posinset: number,
      setsize: number,
    ) => {
      const type = jsonTypeOf(value)
      const list = isJsonBranch(type) ? jsonEntriesOf(value) : []
      const open = isJsonBranch(type) && isOpen(id)
      out.push({
        id,
        kind: 'node',
        level,
        name,
        value,
        type,
        count: list.length,
        open,
        parent,
        posinset,
        setsize,
      })
      if (!open) {
        return
      }
      const limit = limitOf(id)
      const shown = list.slice(0, limit)
      const more = list.length - shown.length
      const size = shown.length + (more > 0 ? 1 : 0)
      shown.forEach(([key, child], index) =>
        visit(child, jsonChildPath(id, key), key, level + 1, id, index + 1, size),
      )
      if (more > 0) {
        out.push({
          id: `${id}::more`,
          kind: 'more',
          level: level + 1,
          name: null,
          value: null,
          type: 'other',
          count: 0,
          open: false,
          parent: id,
          posinset: size,
          setsize: size,
          hidden: more,
        })
      }
    }
    visit(data, rootName, null, 1, null, 1, 1)
    return out
  }, [data, isOpen, limitOf, rootName])

  /* 当前行：被折叠掉时由包住它的最近可见分支接手，路径条不会指向看不见的行 */
  const [activeRaw, setActiveRaw] = useState(rootName)
  const active = useMemo(() => {
    if (rows.some((row) => row.id === activeRaw)) {
      return activeRaw
    }
    let best = rootName
    for (const row of rows) {
      if (row.kind === 'node' && jsonWithin(row.id, activeRaw) && row.id.length > best.length) {
        best = row.id
      }
    }
    return best
  }, [activeRaw, rootName, rows])
  const activeIndex = Math.max(
    0,
    rows.findIndex((row) => row.id === active),
  )
  /** 当前行确实被折叠过：高亮直接落位，不从正在收起的行飞过来 */
  const folded = active !== activeRaw
  const activeRow = rows[activeIndex]

  /* 滚动与高亮共用同一条临界阻尼弹簧：行在滚动的树里一边滚一边展开时才不会过冲 */
  const scrollSpring: Transition = motionTokens.spring.glide
  const scrollFlight = useRef<AnimationPlaybackControls | null>(null)
  const reveal = useCallback(
    (index: number, center: boolean) => {
      const tree = treeRef.current
      if (!tree) {
        return
      }
      const top = index * JSON_ROW_HEIGHT
      const bottom = top + JSON_ROW_HEIGHT
      const view = tree.clientHeight
      const now = tree.scrollTop
      let target = now
      if (center) {
        target = top - view / 2 + JSON_ROW_HEIGHT / 2
      } else if (top < now + 4) {
        target = top - 4
      } else if (bottom > now + view - 4) {
        target = bottom - view + 4
      }
      target = Math.max(0, target)
      if (Math.abs(target - now) < 1) {
        return
      }
      scrollFlight.current?.stop()
      if (reduced) {
        tree.scrollTop = target
        return
      }
      scrollFlight.current = animate(now, target, {
        ...scrollSpring,
        onUpdate: (value) => {
          tree.scrollTop = value
        },
      })
    },
    [reduced, scrollSpring],
  )
  useEffect(() => () => void scrollFlight.current?.stop(), [])

  const pendingFocus = useRef(false)
  const pendingReveal = useRef<'nearest' | 'center' | null>(null)
  /** 每次导航都自增：即使目标就是当前行，也要重新聚焦并滚到它 */
  const [navigation, setNavigation] = useState(0)
  useEffect(() => {
    if (pendingFocus.current) {
      pendingFocus.current = false
      rowRefs.current.get(active)?.focus({ preventScroll: true })
    }
    if (pendingReveal.current) {
      reveal(activeIndex, pendingReveal.current === 'center')
      pendingReveal.current = null
    }
  }, [active, activeIndex, reveal, navigation])

  const moveTo = (id: string, focus = true, how: 'nearest' | 'center' = 'nearest') => {
    pendingFocus.current = focus
    pendingReveal.current = how
    setActiveRaw(id)
    setNavigation((count) => count + 1)
  }

  const toggle = (id: string, next?: boolean) => {
    const open = isOpen(id)
    const want = next ?? !open
    if (want === open) {
      return
    }
    if (search?.ancestors.has(id)) {
      const ids = new Set(closed ?? [])
      if (want) {
        ids.delete(id)
      } else {
        ids.add(id)
      }
      setClosedWhileSearching({ needle, ids })
      if (want && !base.has(id)) {
        setExpandedInternal((current) => [...new Set(current).add(id)])
      }
      return
    }
    const nextSet = new Set(base)
    if (want) {
      nextSet.add(id)
    } else {
      nextSet.delete(id)
    }
    setExpandedInternal([...nextSet])
  }

  const expandAll = () => {
    setExpandedInternal(jsonBranchPaths(data, rootName))
    setClosedWhileSearching({ needle, ids: new Set() })
    // 上方的分支展开会把当前行顶下去，跟着它滚到落位处
    moveTo(active, false, 'nearest')
  }
  const collapseAll = () => {
    setExpandedInternal(isJsonBranch(jsonTypeOf(data)) ? [rootName] : [])
    setClosedWhileSearching({
      needle,
      ids: new Set([...(search?.ancestors ?? [])].filter((id) => id !== rootName)),
    })
    setPages({})
    moveTo(rootName, false, 'nearest')
  }
  const showMore = (parent: string) =>
    setPages((current) => ({
      ...current,
      [parent]: Math.ceil(limitOf(parent) / pageSize) + 1,
    }))

  const [announcement, setAnnouncement] = useState('')
  const copyRow = async (row: JsonTreeRow, kind: 'value' | 'path') => {
    const text = kind === 'path' ? row.id : jsonCopyText(row.value, row.type)
    const ok = await copy(text, { silent: true })
    setAnnouncement(
      ok
        ? kind === 'path'
          ? t('copiedPath', { path: row.id })
          : t('copiedValue', { path: row.id })
        : t('copyFailed'),
    )
    return ok
  }

  const stepMatch = (step: number) => {
    if (!search || !matchCount) {
      return
    }
    const next =
      (((Math.min(matchIndex, matchCount - 1) + step) % matchCount) + matchCount) % matchCount
    setMatchIndex(next)
    moveTo(search.matches[next], false, 'center')
  }

  const onQuery = (next: string) => {
    setQuery(next)
    setMatchIndex(0)
    const trimmed = next.trim().toLowerCase()
    if (trimmed) {
      const first = jsonSearch(data, rootName, trimmed).matches[0]
      if (first) {
        moveTo(first, false, 'center')
      }
    } else if (needle) {
      // 清空搜索会把搜索期间展开的分支折回去，滚到当前行落位的地方才不会留在视野外
      moveTo(activeRaw, false, 'nearest')
    }
  }

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      stepMatch(event.shiftKey ? -1 : 1)
    } else if (event.key === 'Escape' && query) {
      event.preventDefault()
      event.stopPropagation()
      onQuery('')
    } else if (event.key === 'ArrowDown' && !event.altKey) {
      event.preventDefault()
      moveTo(active, true)
    }
  }

  const onTreeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const row = rows[activeIndex]
    if (!row || event.altKey) {
      return
    }
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key.toLowerCase() === 'c') {
      if (row.kind === 'node' && !window.getSelection()?.toString()) {
        event.preventDefault()
        void copyRow(row, event.shiftKey ? 'path' : 'value').catch(() => {})
      }
      return
    }
    if (mod) {
      return
    }
    const go = (index: number) => {
      event.preventDefault()
      const target = rows[Math.max(0, Math.min(rows.length - 1, index))]
      if (target) {
        moveTo(target.id)
      }
    }
    switch (event.key) {
      case 'ArrowDown':
        go(activeIndex + 1)
        break
      case 'ArrowUp':
        go(activeIndex - 1)
        break
      case 'Home':
        go(0)
        break
      case 'End':
        go(rows.length - 1)
        break
      case 'ArrowRight':
        event.preventDefault()
        if (row.kind === 'node' && isJsonBranch(row.type)) {
          if (!row.open) {
            toggle(row.id, true)
          } else if (row.count) {
            go(activeIndex + 1)
          }
        }
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (row.kind === 'node' && row.open) {
          toggle(row.id, false)
        } else if (row.parent) {
          moveTo(row.parent)
        }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (row.kind === 'more') {
          if (row.parent) {
            showMore(row.parent)
          }
        } else if (isJsonBranch(row.type)) {
          toggle(row.id)
        }
        break
      case '/':
        if (searchable) {
          event.preventDefault()
          searchRef.current?.focus()
          searchRef.current?.select()
        }
        break
      default:
    }
  }

  return {
    reduced,
    rows,
    activeRow,
    active,
    folded,
    /** 滚动与当前行高亮共用这一条弹簧，两者同时改目标时才会走同一条轨迹 */
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
    setActiveRow: setActiveRaw,
  }
}
