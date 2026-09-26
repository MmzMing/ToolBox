import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdownLanguage, markdown } from '@codemirror/lang-markdown'
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { useCallback, useEffect, useRef, type RefObject } from 'react'

import type { CursorPosition, SourceEdit } from './markdown-editor.types'

/** 工具栏快捷键只在这里做「按键 → 命令名」映射，命令本体在组件里（占位文本要过 i18n） */
export const EDITOR_SHORTCUT_KEYS = [
  'Mod-b',
  'Mod-i',
  'Mod-Shift-x',
  'Mod-e',
  'Mod-k',
  'Mod-Shift-k',
  'Mod-Shift-o',
] as const

export type EditorShortcutKey = (typeof EDITOR_SHORTCUT_KEYS)[number]

interface UseSourceEditorOptions {
  /** 挂载容器由调用方建好传进来：hook 返回 ref 对象再在 JSX 里读会被 React Compiler 判为渲染期访问 ref */
  hostRef: RefObject<HTMLDivElement | null>
  initialDoc: string
  dark: boolean
  lineWrap: boolean
  onChange: (text: string, cursor: CursorPosition) => void
  onShortcut: (key: EditorShortcutKey) => void
  /** 视口滚动时把当前滚动比例交给调用方（用于同步滚动），避免回调里再回头读 hook 的返回值 */
  onViewportScroll: (scrollRatio: number) => void
}

/** 着色全部走 class，颜色由 index.css 的语义令牌决定，避免在 TS 里写死颜色 */
const markdownHighlighting = HighlightStyle.define([
  { tag: t.heading1, class: 'cm-heading cm-heading-1' },
  { tag: t.heading2, class: 'cm-heading cm-heading-2' },
  { tag: t.heading3, class: 'cm-heading cm-heading-3' },
  { tag: [t.heading4, t.heading5, t.heading6], class: 'cm-heading cm-heading-4' },
  { tag: t.strong, class: 'cm-strong' },
  { tag: t.emphasis, class: 'cm-em' },
  { tag: t.strikethrough, class: 'cm-del' },
  { tag: [t.link, t.url], class: 'cm-link' },
  { tag: t.monospace, class: 'cm-code' },
  { tag: t.quote, class: 'cm-quote' },
  { tag: t.list, class: 'cm-list' },
  { tag: t.separator, class: 'cm-hr' },
  { tag: [t.meta, t.processingInstruction], class: 'cm-meta' },
])

function buildTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--foreground)' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        lineHeight: '1.7',
        overflow: 'auto',
      },
      '.cm-content': { caretColor: 'var(--foreground)', padding: '12px 0' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--muted-foreground)',
        borderRight: '1px solid var(--border)',
      },
      '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--accent)' },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
      '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--muted)' },
      '.cm-panels': { backgroundColor: 'var(--card)', color: 'var(--card-foreground)' },
      '.cm-panels, .cm-panel.cm-search': { border: '1px solid var(--border)' },
      '.cm-button, .cm-textfield': {
        backgroundColor: 'var(--secondary)',
        borderColor: 'var(--border)',
        color: 'var(--secondary-foreground)',
        backgroundImage: 'none',
      },
    },
    { dark },
  )
}

/**
 * CodeMirror 6 的 React 包装。
 *
 * 文档由 EditorView 自己持有，React 只消费 onUpdate 的镜像值——把 doc 当受控 prop 每帧回写
 * 会重置光标。切换文档走 `replaceDoc`、工具栏插入走 `applyEdit`，两者都是 dispatch 事务，
 * 因此共用同一条 history，Ctrl+Z 能撤销工具栏操作。
 */
export function useSourceEditor({
  hostRef,
  initialDoc,
  dark,
  lineWrap,
  onChange,
  onShortcut,
  onViewportScroll,
}: UseSourceEditorOptions) {
  const viewRef = useRef<EditorView | null>(null)
  const themeCompartment = useRef(new Compartment())
  const wrapCompartment = useRef(new Compartment())
  // 回调存 ref：视图只在挂载时建一次，渲染期赋值属于副作用所以放进 effect
  const optionsRef = useRef({ onChange, onShortcut, onViewportScroll })
  const seedRef = useRef({ doc: initialDoc, dark, lineWrap })

  useEffect(() => {
    optionsRef.current = { onChange, onShortcut, onViewportScroll }
  })

  useEffect(() => {
    const host = hostRef.current
    if (host === null) {
      return
    }
    const seed = seedRef.current

    const emit = () => {
      const view = viewRef.current
      if (view === null) {
        return
      }
      const head = view.state.selection.main.head
      const line = view.state.doc.lineAt(head)
      optionsRef.current.onChange(view.state.doc.toString(), {
        line: line.number,
        column: head - line.from + 1,
      })
    }

    const shortcutKeymap = EDITOR_SHORTCUT_KEYS.map((key) => ({
      key,
      preventDefault: true,
      run: () => {
        optionsRef.current.onShortcut(key)
        return true
      },
    }))

    const view = new EditorView({
      state: EditorState.create({
        doc: seed.doc,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          rectangularSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightSelectionMatches(),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(markdownHighlighting),
          themeCompartment.current.of(buildTheme(seed.dark)),
          wrapCompartment.current.of(seed.lineWrap ? [EditorView.lineWrapping] : []),
          // 自定义键位排在 defaultKeymap 之后以获得更高优先级
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...shortcutKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet) {
              emit()
            }
            if (update.viewportChanged) {
              const dom = update.view.scrollDOM
              const range = dom.scrollHeight - dom.clientHeight
              optionsRef.current.onViewportScroll(range <= 0 ? 0 : dom.scrollTop / range)
            }
          }),
        ],
      }),
      parent: host,
    })
    viewRef.current = view
    emit()

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // hostRef 由调用方的 useRef 提供，身份稳定，所以视图只建一次
  }, [hostRef])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(buildTheme(dark)),
    })
  }, [dark])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(lineWrap ? [EditorView.lineWrapping] : []),
    })
  }, [lineWrap])

  const applyEdit = useCallback((edit: SourceEdit) => {
    const view = viewRef.current
    if (view === null) {
      return
    }
    view.dispatch({
      changes: edit.changes.map((change) => ({ ...change })),
      selection: { anchor: edit.selFrom, head: edit.selTo },
      scrollIntoView: true,
    })
    view.focus()
  }, [])

  /** 切换文档：整体替换但不重建视图，滚动位置与语言状态得以保留 */
  const replaceDoc = useCallback((text: string) => {
    const view = viewRef.current
    if (view === null || view.state.doc.toString() === text) {
      return
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: 0 },
    })
    view.scrollDOM.scrollTo({ top: 0 })
  }, [])

  const readDoc = useCallback((): string => viewRef.current?.state.doc.toString() ?? '', [])

  /** 工具栏命令要基于当前选区构造编辑事务 */
  const readSelection = useCallback((): { from: number; to: number } => {
    const range = viewRef.current?.state.selection.main
    return range ? { from: range.from, to: range.to } : { from: 0, to: 0 }
  }, [])

  /** 面板从 display:none 回到可见时行高与滚动位置都算过期的，需要重新测量 */
  const remeasure = useCallback(() => {
    viewRef.current?.requestMeasure()
  }, [])

  /** 同步滚动与大纲跳转：行号折算成滚动比例，这是编辑区唯一稳定可用的坐标 */
  const scrollToLine = useCallback((line: number) => {
    const view = viewRef.current
    const dom = view?.scrollDOM
    if (!view || !dom) {
      return
    }
    const lines = view.state.doc.lines
    const ratio = lines <= 1 ? 0 : (line - 1) / (lines - 1)
    dom.scrollTo({ top: ratio * (dom.scrollHeight - dom.clientHeight) })
  }, [])

  const scrollToRatio = useCallback((ratio: number) => {
    const dom = viewRef.current?.scrollDOM
    if (!dom) {
      return
    }
    dom.scrollTo({ top: Math.max(0, Math.min(1, ratio)) * (dom.scrollHeight - dom.clientHeight) })
  }, [])

  return {
    applyEdit,
    replaceDoc,
    readDoc,
    readSelection,
    remeasure,
    scrollToLine,
    scrollToRatio,
    focus: () => viewRef.current?.focus(),
  }
}
