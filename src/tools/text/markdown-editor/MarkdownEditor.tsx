import type { PanelImperativeHandle } from 'react-resizable-panels'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useBreakpoint } from '@/composable/use-breakpoint'
import { useCopy } from '@/composable/use-copy'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useTheme } from '@/modules/theme/theme-context'
import { filesFromDataTransfer } from '@/utils/data-transfer-files'
import { downloadText } from '@/utils/download'
import { renderMarkdown, sanitizeMarkdownHtml, type MarkdownHeading } from '@/utils/markdown'

import { EditorToolbar } from './components/EditorToolbar'
import { PreviewPane } from './components/PreviewPane'
import { StatusBar } from './components/StatusBar'
import { TitleInput } from './components/TitleInput'
import { loadKatexCss } from './components/preview-renderers'
import { printDocument } from './export/print'
import { buildStandaloneHtml } from './export/standalone-html'
import {
  buildBlockEdit,
  buildInlineMarkEdit,
  buildLineBlockEdit,
  buildLinkEdit,
  buildTable,
  countStats,
  deriveTitle,
  exportFileName,
} from './markdown-editor.service'
import { useMarkdownEditorStore } from './markdown-editor.store'
import { pickSampleDoc } from './sample-doc'
import type {
  CursorPosition,
  EditorUi,
  ExportKind,
  InlineMarkKind,
  InsertCommand,
  LineBlockKind,
  MermaidKind,
  SaveStatus,
  ViewMode,
} from './markdown-editor.types'
import type { EditorShortcutKey } from './use-source-editor'
import { useSourceEditor } from './use-source-editor'

const AUTOSAVE_DEBOUNCE_MS = 800

const SHORTCUT_COMMANDS: Record<EditorShortcutKey, InsertCommand> = {
  'Mod-b': 'bold',
  'Mod-i': 'italic',
  'Mod-Shift-x': 'strike',
  'Mod-e': 'code',
  'Mod-k': 'link',
  'Mod-Shift-k': 'image',
  'Mod-Shift-o': 'mathInline',
}

const INLINE_MARK_COMMANDS: readonly InsertCommand[] = [
  'bold',
  'italic',
  'strike',
  'code',
  'mathInline',
]

const LINE_BLOCK_COMMANDS: readonly LineBlockKind[] = [
  'heading1',
  'heading2',
  'heading3',
  'unordered',
  'ordered',
  'task',
  'quote',
]

const CODE_FENCE = '```\n\n```'
const DIVIDER = '---'
const MATH_BLOCK_FENCE = '$$\nE = mc^2\n$$'

/** 命令名与 InlineMarkKind 同名，只有行内公式例外（$ 是它的标记） */
function inlineMarkOf(command: InsertCommand): InlineMarkKind | null {
  if (!(INLINE_MARK_COMMANDS as readonly string[]).includes(command)) {
    return null
  }
  return command === 'mathInline' ? 'math' : (command as InlineMarkKind)
}

function lineBlockOf(command: InsertCommand): LineBlockKind | null {
  return (LINE_BLOCK_COMMANDS as readonly string[]).includes(command)
    ? (command as LineBlockKind)
    : null
}

function mermaidKindOf(command: InsertCommand): MermaidKind | null {
  return command.startsWith('mermaid:') ? (command.slice('mermaid:'.length) as MermaidKind) : null
}

/**
 * 找预览区里视口顶部对应的那个带 data-line 的块。
 *
 * data-line 只打在标题上（marked 的 token 没有位置信息，行号是在顶层 token 上累加 raw
 * 行数推出来的），所以同步精度上限是「标题级」；无标题文档回退到比例滚动。
 */
function nearestSourceLine(el: HTMLElement): number | null {
  const blocks = el.querySelectorAll<HTMLElement>('[data-line]')
  let line: number | null = null
  for (const block of Array.from(blocks)) {
    if (block.offsetTop <= el.scrollTop + 8) {
      const parsed = Number(block.dataset.line)
      if (Number.isFinite(parsed)) {
        line = parsed
      }
    } else {
      break
    }
  }
  return line
}

export default function MarkdownEditor() {
  const { t, i18n } = useTranslation('tools-text')
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const breakpoint = useBreakpoint()
  const { copy } = useCopy()

  const title = useMarkdownEditorStore((state) => state.title)
  const ui = useMarkdownEditorStore((state) => state.ui)
  const setTitle = useMarkdownEditorStore((state) => state.setTitle)
  const setUi = useMarkdownEditorStore((state) => state.setUi)

  const [source, setSource] = useState('')
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [fullscreen, setFullscreen] = useState(false)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const editorPanelRef = useRef<PanelImperativeHandle | null>(null)
  const previewPanelRef = useRef<PanelImperativeHandle | null>(null)
  /**
   * 同步滚动的一次性令牌：程序化改 scrollTop 会在对侧再触发一次 scroll 事件，
   * 来回就是死循环。用「谁正在被驱动」标记吞掉那一次回声，比计时器确定，也不用在
   * 事件回调里读 Date.now。
   */
  const scrollDrivenBy = useRef<'editor' | 'preview' | null>(null)
  const pendingSave = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const rendered = useMemo(
    () =>
      renderMarkdown(source, {
        labels: {
          math: t('markdown-editor.cardMath'),
          diagram: t('markdown-editor.cardDiagram'),
        },
      }),
    [source, t],
  )
  const stats = useMemo(() => countStats(source), [source])

  const isMobile = breakpoint === 'mobile'
  // 手机放不下分栏：split 在小屏退化为编辑态
  const effectiveMode: ViewMode = isMobile && ui.viewMode === 'split' ? 'edit' : ui.viewMode

  const flushSave = useCallback(() => {
    const pending = pendingSave.current
    if (pending === null) {
      return
    }
    pendingSave.current = null
    useMarkdownEditorStore.getState().setContent(pending)
    setSaveStatus('saved')
  }, [])

  const handleChange = useCallback(
    (text: string, position: CursorPosition) => {
      setSource(text)
      setCursor(position)
      pendingSave.current = text
      setSaveStatus('saving')
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
      }
      saveTimer.current = setTimeout(flushSave, AUTOSAVE_DEBOUNCE_MS)
    },
    [flushSave],
  )

  const editor = useSourceEditor({
    hostRef,
    // 非响应式读取：只在建视图那一次用到，正文之后单向由 CM 流向 store（见下方 seed 注释）
    initialDoc: useMarkdownEditorStore.getState().content,
    dark,
    lineWrap: ui.lineWrap,
    onChange: handleChange,
    onShortcut: (key) => handleInsert(SHORTCUT_COMMANDS[key]),
    onViewportScroll: (ratio) => {
      if (!ui.syncScroll) {
        return
      }
      if (scrollDrivenBy.current === 'editor') {
        scrollDrivenBy.current = null
        return
      }
      const el = previewRef.current
      if (!el) {
        return
      }
      scrollDrivenBy.current = 'preview'
      el.scrollTo({ top: ratio * (el.scrollHeight - el.clientHeight) })
    },
  })

  const { applyEdit, replaceDoc, remeasure, readDoc, readSelection, scrollToLine, scrollToRatio } =
    editor

  /**
   * 插入命令全部走 dispatch 事务而不是改受控 value：CodeMirror 的 history 把每次事务当一步，
   * 工具栏操作因此可以 Ctrl+Z 撤销——这是当初选 CodeMirror 而不是 textarea 的核心理由。
   */
  function handleInsert(command: InsertCommand) {
    const text = readDoc()
    const { from, to } = readSelection()

    const mark = inlineMarkOf(command)
    if (mark !== null) {
      applyEdit(buildInlineMarkEdit(text, from, to, mark, t(`markdown-editor.ph-${command}`)))
      return
    }

    const block = lineBlockOf(command)
    if (block !== null) {
      applyEdit(buildLineBlockEdit(text, from, to, block))
      return
    }

    if (command === 'link' || command === 'image') {
      applyEdit(
        buildLinkEdit(text, from, to, '', command === 'image', t(`markdown-editor.ph-${command}`)),
      )
      return
    }
    if (command === 'codeBlock') {
      applyEdit(buildBlockEdit(text, from, to, CODE_FENCE))
      return
    }
    if (command === 'divider') {
      applyEdit(buildBlockEdit(text, from, to, DIVIDER))
      return
    }
    if (command === 'table') {
      applyEdit(buildBlockEdit(text, from, to, buildTable(t('markdown-editor.tableColumn'), 3, 2)))
      return
    }
    if (command === 'mathBlock') {
      applyEdit(buildBlockEdit(text, from, to, MATH_BLOCK_FENCE))
      return
    }
    const kind = mermaidKindOf(command)
    if (kind !== null) {
      applyEdit(
        buildBlockEdit(
          text,
          from,
          to,
          ['```mermaid', t(`markdown-editor.tpl-${kind}`), '```'].join('\n'),
        ),
      )
    }
  }

  /**
   * 挂载时灌一次草稿：首访写示例正文，然后把 store 里的正文一次性推进 CodeMirror。
   *
   * 之后正文只单向流动（CM → React 镜像 → store），不再由 store 反向推回编辑器——
   * 自动保存有防抖窗口，任何 store→CM 的同步 effect 都可能把用户刚敲的字覆盖掉。
   * 导入文件同理，靠 replaceDoc 显式写入。
   */
  useEffect(() => {
    useMarkdownEditorStore
      .getState()
      .seedIfEmpty(
        pickSampleDoc(i18n.language),
        i18n.t('markdown-editor.sampleTitle', { ns: 'tools-text' }),
      )
    replaceDoc(useMarkdownEditorStore.getState().content)
    remeasure()
  }, [i18n, replaceDoc, remeasure])

  useEffect(() => {
    // 用的是 effectiveMode 而不是 ui.viewMode：小屏把 split 退化成编辑态时，
    // 面板折叠必须跟着退化后的模式走，否则两个面板并排挤在 375px 里
    if (effectiveMode === 'edit') {
      previewPanelRef.current?.collapse()
      editorPanelRef.current?.expand()
    } else if (effectiveMode === 'preview') {
      editorPanelRef.current?.collapse()
      previewPanelRef.current?.expand()
    } else {
      editorPanelRef.current?.expand()
      previewPanelRef.current?.expand()
    }
    remeasure()
  }, [effectiveMode, remeasure])

  useEffect(() => {
    if (!fullscreen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  // 卸载前把防抖窗口里的最后一笔写回，否则最后一次改动会丢
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
      }
      flushSave()
    },
    [flushSave],
  )

  const handlePreviewScroll = () => {
    if (!ui.syncScroll) {
      return
    }
    if (scrollDrivenBy.current === 'preview') {
      scrollDrivenBy.current = null
      return
    }
    const el = previewRef.current
    if (!el) {
      return
    }
    const line = nearestSourceLine(el)
    scrollDrivenBy.current = 'editor'
    if (line !== null) {
      scrollToLine(line)
      return
    }
    scrollToRatio(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight))
  }

  /** 拖 .md 进编辑区即替换草稿；不做导入按钮，界面只留一个名字框 */
  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      useMarkdownEditorStore.getState().loadDocument(file.name.replace(/\.[^.]+$/, ''), text)
      replaceDoc(text)
    } catch {
      toast.error(t('markdown-editor.importFailed'))
    }
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const files = await filesFromDataTransfer(event.dataTransfer)
    const markdown = files.find((file) => /\.(md|markdown|txt)$/i.test(file.name))
    if (markdown) {
      await handleImportFile(markdown)
    }
  }

  /** 导出取的是预览 DOM，所见即所得：mermaid 已渲染成 SVG、公式已是 katex 标记 */
  const buildExportHtml = async (): Promise<string> => {
    const bodyHtml = previewRef.current?.innerHTML ?? sanitizeMarkdownHtml(rendered.html)
    const katexCss = rendered.needsMath ? await loadKatexCss() : ''
    return buildStandaloneHtml({
      title: title || deriveTitle(source),
      bodyHtml,
      katexCss,
      baseUrl: document.baseURI,
    })
  }

  const handleExport = async (kind: ExportKind) => {
    const name = title || deriveTitle(source)
    try {
      if (kind === 'markdown') {
        downloadText(readDoc(), exportFileName(name, source, 'md'), 'text/markdown')
        return
      }
      if (kind === 'copyHtml') {
        await copy(sanitizeMarkdownHtml(rendered.html))
        return
      }
      const html = await buildExportHtml()
      if (kind === 'html') {
        downloadText(html, exportFileName(name, source, 'html'), 'text/html')
        return
      }
      await printDocument(html)
    } catch {
      toast.error(t('markdown-editor.exportFailed'))
    }
  }

  const toggleUi = (key: keyof EditorUi) => {
    const value = ui[key]
    if (typeof value === 'boolean') {
      setUi({ [key]: !value } as Partial<EditorUi>)
    }
  }

  const jumpToHeading = (heading: MarkdownHeading | null) => {
    if (heading === null) {
      return
    }
    scrollToLine(heading.line)
    const container = previewRef.current
    const target = container?.querySelector<HTMLElement>(`[data-line="${heading.line}"]`)
    if (container !== null && target !== null && target !== undefined) {
      container.scrollTo({ top: target.offsetTop })
    }
  }

  return (
    <div
      className={
        fullscreen
          ? 'bg-background fixed inset-0 z-50 flex h-svh flex-col'
          : // BaseLayout 是 min-h-svh + 文档级滚动（main 只有 flex-1），所以 h-full 在这里
            // 解析不出确定高度、工具栏会跟着页面滚走。减掉 sticky 顶栏的 h-14 自己撑满。
            'flex h-[calc(100svh-3.5rem)] min-h-0 flex-col'
      }
    >
      <EditorToolbar
        leading={<TitleInput title={title} onCommit={setTitle} />}
        ui={ui}
        viewMode={effectiveMode}
        fullscreen={fullscreen}
        headings={rendered.headings}
        onInsert={handleInsert}
        onToggleUi={toggleUi}
        onViewMode={(mode) => setUi({ viewMode: mode })}
        onToggleFullscreen={() => setFullscreen((on) => !on)}
        onExport={handleExport}
        onJumpToHeading={jumpToHeading}
      />

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          panelRef={editorPanelRef}
          defaultSize={45}
          minSize={20}
          collapsible
          collapsedSize={0}
        >
          <div
            ref={hostRef}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => void handleDrop(event)}
            className="bg-background h-full min-h-0 overflow-hidden"
            aria-label={t('markdown-editor.editorLabel')}
          />
        </ResizablePanel>

        <ResizableHandle withHandle hidden={effectiveMode !== 'split'} className="mx-1 w-1" />

        <ResizablePanel
          panelRef={previewPanelRef}
          defaultSize={55}
          minSize={20}
          collapsible
          collapsedSize={0}
        >
          <PreviewPane
            rendered={rendered}
            renderMermaid={ui.renderMermaid}
            renderMath={ui.renderMath}
            dark={dark}
            paneRef={previewRef}
            onScroll={handlePreviewScroll}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <StatusBar cursor={cursor} stats={stats} saveStatus={saveStatus} viewMode={effectiveMode} />
    </div>
  )
}
