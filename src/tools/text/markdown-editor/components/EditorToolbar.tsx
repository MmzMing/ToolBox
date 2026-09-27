import {
  Bold,
  ChevronDown,
  Code,
  Columns2,
  Copy,
  Download,
  Eye,
  FileDown,
  Heading1,
  Image,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  Maximize,
  Minus,
  Network,
  Pencil,
  PenLine,
  PieChart,
  Quote,
  Rows3,
  Sigma,
  Strikethrough,
  Table,
  Waypoints,
  WrapText,
} from 'lucide-react'
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { LucideIcon } from 'lucide-react'

import type {
  EditorUi,
  ExportKind,
  InsertCommand,
  MermaidKind,
  ViewMode,
} from '../markdown-editor.types'
import type { MarkdownHeading } from '@/utils/markdown'

const FLAT_COMMANDS: readonly { command: InsertCommand; icon: LucideIcon }[] = [
  { command: 'bold', icon: Bold },
  { command: 'italic', icon: Italic },
  { command: 'strike', icon: Strikethrough },
  { command: 'code', icon: Code },
  { command: 'link', icon: Link2 },
  { command: 'image', icon: Image },
]

const LINE_COMMANDS: readonly { command: InsertCommand; icon: LucideIcon }[] = [
  { command: 'unordered', icon: List },
  { command: 'ordered', icon: ListOrdered },
  { command: 'task', icon: ListChecks },
  { command: 'quote', icon: Quote },
]

const HEADING_COMMANDS: readonly { command: InsertCommand; depth: number }[] = [
  { command: 'heading1', depth: 1 },
  { command: 'heading2', depth: 2 },
  { command: 'heading3', depth: 3 },
]

const MERMAID_KINDS: readonly { kind: MermaidKind; icon: LucideIcon }[] = [
  { kind: 'flowchart', icon: Network },
  { kind: 'sequence', icon: Rows3 },
  { kind: 'class', icon: Waypoints },
  { kind: 'state', icon: PenLine },
  { kind: 'gantt', icon: Rows3 },
  { kind: 'pie', icon: PieChart },
  { kind: 'mindmap', icon: ListTree },
  { kind: 'timeline', icon: Minus },
  { kind: 'journey', icon: FileDown },
  { kind: 'gitGraph', icon: Network },
]

const VIEW_MODES: readonly { mode: ViewMode; icon: LucideIcon }[] = [
  { mode: 'edit', icon: Pencil },
  { mode: 'split', icon: Columns2 },
  { mode: 'preview', icon: Eye },
]

interface EditorToolbarProps {
  /** 工具栏最左侧插槽：文档切换器 */
  leading: ReactNode
  ui: EditorUi
  viewMode: ViewMode
  fullscreen: boolean
  headings: readonly MarkdownHeading[]
  onInsert: (command: InsertCommand) => void
  onToggleUi: (key: keyof EditorUi) => void
  onViewMode: (mode: ViewMode) => void
  onToggleFullscreen: () => void
  onExport: (kind: ExportKind) => void
  onJumpToHeading: (heading: MarkdownHeading) => void
}

/** 工具栏：文档切换 / 行内与块级格式 / 公式与图表 / 视图 / 导出 */
export function EditorToolbar({
  leading,
  ui,
  viewMode,
  fullscreen,
  headings,
  onInsert,
  onToggleUi,
  onViewMode,
  onToggleFullscreen,
  onExport,
  onJumpToHeading,
}: EditorToolbarProps) {
  const { t } = useTranslation('tools-text')
  const ModeIcon = VIEW_MODES.find((item) => item.mode === viewMode)?.icon ?? Columns2

  const iconButton = (
    key: string,
    Icon: LucideIcon,
    onClick: () => void,
    labelKey: string,
    pressed?: boolean,
  ) => {
    const label = t(`markdown-editor.${labelKey}`)
    return (
      <Button
        key={key}
        type="button"
        variant={pressed ? 'secondary' : 'ghost'}
        size="icon"
        className="size-8 shrink-0"
        aria-pressed={pressed}
        title={label}
        aria-label={label}
        onClick={onClick}
      >
        <Icon className="size-4" />
      </Button>
    )
  }

  return (
    <div className="bg-background border-border flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1">
      {leading}

      {/* 窄屏放不下分栏，编辑/预览用 tab 直切，不必钻进视图下拉菜单 */}
      <Tabs
        value={viewMode === 'preview' ? 'preview' : 'edit'}
        onValueChange={(value) => onViewMode(value === 'preview' ? 'preview' : 'edit')}
        className="shrink-0 md:hidden"
      >
        <TabsList>
          <TabsTrigger value="edit" className="px-2 text-xs">
            <Pencil />
            {t('markdown-editor.tab-edit')}
          </TabsTrigger>
          <TabsTrigger value="preview" className="px-2 text-xs">
            <Eye />
            {t('markdown-editor.tab-preview')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Separator orientation="vertical" className="mx-1 h-6 shrink-0" />

      {FLAT_COMMANDS.map(({ command, icon: Icon }) =>
        iconButton(command, Icon, () => onInsert(command), `cmd-${command}`),
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          title={t('markdown-editor.cmd-heading')}
          aria-label={t('markdown-editor.cmd-heading')}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md"
        >
          <Heading1 className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {HEADING_COMMANDS.map(({ command, depth }) => (
            <DropdownMenuItem key={command} onSelect={() => onInsert(command)}>
              {t('markdown-editor.cmd-headingN', { depth })}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {LINE_COMMANDS.map(({ command, icon: Icon }) =>
        iconButton(command, Icon, () => onInsert(command), `cmd-${command}`),
      )}

      <DropdownMenu>
        <DropdownMenuTrigger className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs">
          <Table className="size-4" />
          {t('markdown-editor.group-insert')}
          <ChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => onInsert('table')}>
              {t('markdown-editor.cmd-table')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onInsert('codeBlock')}>
              {t('markdown-editor.cmd-codeBlock')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onInsert('divider')}>
              {t('markdown-editor.cmd-divider')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onInsert('mathInline')}>
              <Sigma className="size-4" />
              {t('markdown-editor.cmd-mathInline')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onInsert('mathBlock')}>
              <Sigma className="size-4" />
              {t('markdown-editor.cmd-mathBlock')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs">
          <Network className="size-4" />
          {t('markdown-editor.group-diagram')}
          <ChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {MERMAID_KINDS.map(({ kind, icon: Icon }) => (
            <DropdownMenuItem key={kind} onSelect={() => onInsert(`mermaid:${kind}`)}>
              <Icon className="size-4" />
              {t(`markdown-editor.diagram-${kind}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-1 h-6 shrink-0" />

      <DropdownMenu>
        <DropdownMenuTrigger className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs">
          <ModeIcon className="size-4" />
          <ChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t('markdown-editor.group-view')}</DropdownMenuLabel>
          <DropdownMenuGroup>
            {VIEW_MODES.map(({ mode, icon: Icon }) => (
              <DropdownMenuItem key={mode} onSelect={() => onViewMode(mode)}>
                <Icon className="size-4" />
                {t(`markdown-editor.mode-${mode}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={ui.syncScroll}
            onCheckedChange={() => onToggleUi('syncScroll')}
          >
            {t('markdown-editor.syncScroll')}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={ui.lineWrap}
            onCheckedChange={() => onToggleUi('lineWrap')}
          >
            {t('markdown-editor.lineWrap')}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={ui.renderMermaid}
            onCheckedChange={() => onToggleUi('renderMermaid')}
          >
            {t('markdown-editor.renderMermaid')}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={ui.renderMath}
            onCheckedChange={() => onToggleUi('renderMath')}
          >
            {t('markdown-editor.renderMath')}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md"
          title={t('markdown-editor.outline')}
          aria-label={t('markdown-editor.outline')}
        >
          <ListTree className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
          {headings.length === 0 ? (
            <DropdownMenuItem disabled>{t('markdown-editor.outlineEmpty')}</DropdownMenuItem>
          ) : (
            headings.map((heading) => (
              <DropdownMenuItem
                key={`${heading.id}-${heading.line}`}
                onSelect={() => onJumpToHeading(heading)}
                style={{ paddingLeft: `${8 + (heading.depth - 1) * 12}px` }}
              >
                {heading.text || t('markdown-editor.untitled')}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {iconButton('wrap', WrapText, () => onToggleUi('lineWrap'), 'lineWrap', ui.lineWrap)}

      <Button
        type="button"
        variant={fullscreen ? 'secondary' : 'ghost'}
        size="icon"
        className="size-8 shrink-0"
        aria-pressed={fullscreen}
        title={t(fullscreen ? 'markdown-editor.exitFullscreen' : 'markdown-editor.fullscreen')}
        aria-label={t(fullscreen ? 'markdown-editor.exitFullscreen' : 'markdown-editor.fullscreen')}
        onClick={onToggleFullscreen}
      >
        <Maximize className="size-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6 shrink-0" />

      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-accent hover:text-accent-foreground inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs">
          <Download className="size-4" />
          {t('markdown-editor.group-export')}
          <ChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => onExport('markdown')}>
              {t('markdown-editor.export-markdown')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport('html')}>
              {t('markdown-editor.export-html')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport('pdf')}>
              {t('markdown-editor.export-pdf')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onExport('copyHtml')}>
              <Copy className="size-4" />
              {t('markdown-editor.copyHtml')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
