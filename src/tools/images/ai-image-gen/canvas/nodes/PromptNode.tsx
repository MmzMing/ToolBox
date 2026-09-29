import { Position, type Node, type NodeProps } from '@xyflow/react'
import {
  AlertTriangle,
  Copy,
  Download,
  Loader2,
  Maximize2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { buildTextFileName } from '@/utils/file-name'

import {
  CANVAS_NODE_MAX_WIDTH,
  CANVAS_NODE_MIN_HEIGHT,
  CANVAS_NODE_MIN_WIDTH,
  CANVAS_PROMPT_MAX_HEIGHT,
  insertReferenceMention,
  type GenParams,
} from '../../ai-image-gen.service'
import { ParamBar } from '../../components/ParamBar'
import { NodeDialog } from '../../components/NodeDialog'
import { polishText } from '../../orchestrator'
import { useAiImageGenStore, type JobStatus } from '../../store'
import { ActionBar, ActionButton } from './action-bar'
import { LinkZone } from './link-zone'
import { ResizeControls } from './resize-controls'

/** 一张已连入的参考图：label 与 url 都由画布按当前顺序算好 */
export type PromptRefItem = {
  imageId: string
  label: string
  name: string
  url: string
}

export type PromptNodeData = {
  nodeId: string
  jobId: string
  text: string
  /** 有序参考图，顺序即发给 API 的图片顺序 */
  refs: PromptRefItem[]
  /** 文本里第 k 个 @图N 绑定的图片 id */
  mentions: string[]
  /** 已连入的上游提示词节点数，生成时它们的文本会拼在前面 */
  chainCount: number
  status: JobStatus | 'idle'
  errorCode?: string
  params: GenParams
  /** 这个 job 是识图任务：正文由模型写回，跑完之后与手写的节点毫无区别 */
  reading: boolean
  /** 多选时让位给选框上方的对齐条：工具条连悬停都不出 */
  barHidden: boolean
  /** 润色对话框的开关：开合状态由画布那份 store 字段决定，这里只给回写口 */
  onToggleDialog: () => void
  createdAt: number
  lang: string
  onRename: (nodeId: string, text: string, mentions: string[]) => void
  onGenerate: (nodeId: string) => void
  onCancel: (jobId: string) => void
  onRetry: (jobId: string) => void
  onDelete: (nodeId: string) => void
  /** 复制：在正下方落一个内容相同的新提示词节点 */
  onDuplicate: (nodeId: string) => void
  onParamsChange: (patch: Partial<GenParams>) => void
  /** 润色凭证不在这里填，对话框那颗模型芯片只负责把人送进设置弹窗 */
  onOpenSettings: () => void
  onResize: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void
}

export type PromptRfNode = Node<PromptNodeData, 'prompt'>

const RUNNING: (JobStatus | 'idle')[] = ['queued', 'running']

type MentionTrigger = { start: number; end: number; query: string }

/** 光标前是一段不带空格的 @ 查询才弹面板；@ 必须在行首或空白之后 */
function detectTrigger(text: string, caret: number): MentionTrigger | null {
  const upto = text.slice(0, caret)
  const at = upto.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(upto[at - 1])) return null
  const query = upto.slice(at + 1)
  return /\s/.test(query) ? null : { start: at, end: caret, query }
}

type MentionFieldProps = {
  value: string
  mentions: string[]
  refs: PromptRefItem[]
  lang: string
  placeholder: string
  ariaLabel?: string
  className?: string
  textareaClassName?: string
  autoFocus?: boolean
  /** 只有双击进入编辑态才可写；未编辑时 textarea 不挂 nodrag，拖拽落在节点上 */
  readOnly?: boolean
  onActivate?: () => void
  onEscape?: () => void
  onChange: (value: string, mentions: string[]) => void
  onCommit: () => void
  onFocusChange: (focused: boolean) => void
  onPanelChange: (open: boolean) => void
}

/** 带 @ 参考图面板的文本域：节点内联编辑与放大弹窗共用同一套行为 */
function MentionField({
  value,
  mentions,
  refs,
  lang,
  placeholder,
  ariaLabel,
  className,
  textareaClassName,
  autoFocus,
  readOnly = false,
  onActivate,
  onEscape,
  onChange,
  onCommit,
  onFocusChange,
  onPanelChange,
}: MentionFieldProps) {
  const { t } = useTranslation('tools-images')
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [trigger, setTriggerState] = useState<MentionTrigger | null>(null)
  const [active, setActive] = useState(0)
  const [preview, setPreview] = useState<PromptRefItem | null>(null)

  const items = useMemo(() => {
    const query = trigger?.query.trim().toLowerCase() ?? ''
    return refs.filter(
      (item) =>
        !query ||
        item.label.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query),
    )
  }, [refs, trigger?.query])

  const setTrigger = (next: MentionTrigger | null) => {
    setTriggerState(next)
    onPanelChange(next !== null)
    if (!next) setPreview(null)
  }

  // 插入提及要把手改的 value 和光标一起还原，只能等 DOM 更新完再摸 textarea
  useEffect(() => {
    if (pendingCaret.current === null) return
    const el = areaRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(pendingCaret.current, pendingCaret.current)
    }
    pendingCaret.current = null
  }, [value])

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value
    onChange(next, mentions)
    setTrigger(detectTrigger(next, event.target.selectionStart ?? next.length))
    setActive(0)
  }

  const insert = (imageId: string) => {
    if (!trigger) return
    const next = insertReferenceMention({
      text: value,
      mentions,
      refs: refs.map((item) => item.imageId),
      imageId,
      start: trigger.start,
      end: trigger.end,
      lang,
    })
    onChange(next.text, next.mentions)
    pendingCaret.current = next.caret
    setTrigger(null)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      if (trigger) {
        setTrigger(null)
      } else {
        onEscape?.()
      }
      return
    }
    if (!trigger || !items.length) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((index) => (index + step + items.length) % items.length)
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      insert(items[Math.min(active, items.length - 1)].imageId)
    }
  }

  return (
    <div className={cn('relative flex min-h-0 flex-1', className)}>
      <Textarea
        ref={areaRef}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        readOnly={readOnly}
        onDoubleClick={onActivate}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => onFocusChange(true)}
        onBlur={() => {
          onCommit()
          setTrigger(null)
          onFocusChange(false)
        }}
        className={cn(
          'w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent text-xs shadow-none focus-visible:ring-0 dark:bg-transparent',
          // 圆角卡片里的滚动条收成悬浮细条，方角不再压在边框与圆角上
          'inset-scrollbar',
          // 未编辑时不挂 nodrag：拖拽要能从文本区上直接起手挪节点（光标由 index.css 给抓取手）
          readOnly ? 'caret-transparent' : 'nodrag nowheel',
          textareaClassName,
        )}
      />

      {trigger ? (
        <div
          className="canvas-mention-panel bg-card absolute top-full left-0 z-20 mt-1 w-60 rounded-lg border p-1 shadow-lg"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="relative">
            {items.length ? (
              <ul className="max-h-44 overflow-y-auto">
                {items.map((item, index) => (
                  <li key={item.imageId}>
                    <button
                      type="button"
                      className={cn(
                        'hover:bg-muted flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px]',
                        index === Math.min(active, items.length - 1) && 'bg-muted',
                      )}
                      onPointerEnter={() => setPreview(item)}
                      onPointerLeave={() => setPreview(null)}
                      onClick={() => insert(item.imageId)}
                    >
                      <img
                        src={item.url}
                        alt={item.name}
                        className="size-7 shrink-0 rounded border object-cover"
                      />
                      <span className="text-primary shrink-0">@{item.label}</span>
                      <span className="text-muted-foreground min-w-0 flex-1 truncate">
                        {item.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground px-2 py-3 text-center text-[11px]">
                {refs.length
                  ? t('ai-image-gen.promptNode.mentionNone')
                  : t('ai-image-gen.promptNode.mentionEmpty')}
              </p>
            )}
            {/* 悬停项时在面板右侧浮出大图，省掉「连了哪张来着」的来回找 */}
            {preview ? (
              <div className="bg-card absolute top-0 left-full ml-1 rounded-lg border p-1 shadow-lg">
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="max-h-56 max-w-48 rounded object-contain"
                />
                <p className="text-muted-foreground px-0.5 pt-1 text-[10px]">@{preview.label}</p>
              </div>
            ) : null}
          </div>
          <p className="text-muted-foreground border-t px-2 pt-1 pb-0.5 text-[10px]">
            {t('ai-image-gen.promptNode.mentionHint')}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/** 提示词节点：正文只剩文本框，信息与动作全部收进上方浮出的胶囊工具条 */
export function PromptNode({ data, selected }: NodeProps<PromptRfNode>) {
  const { t } = useTranslation('tools-images')
  const running = RUNNING.includes(data.status)
  const reading = data.reading && running
  /** 润色对话框开着没：开关归那份 store 管，同一时刻只允许一个节点有它 */
  const dialogOpen = useAiImageGenStore((state) => state.dialogNodeId === data.nodeId)
  // 单击只选中（仍可就地拖拽），双击或 Enter / F2 才进入编辑
  const [editing, setEditing] = useState(false)
  const [polishing, setPolishing] = useState(false)

  const polish = (instruction: string) => {
    setPolishing(true)
    void polishText(data.text, instruction).then((result) => {
      setPolishing(false)
      if (!result.ok) {
        toast.error(t(`ai-image-gen.errors.${result.errorCode}`))
        return
      }
      data.onRename(data.nodeId, result.text, data.mentions)
    })
  }

  return (
    <div
      className={cn(
        'bg-card flex h-full flex-col rounded-xl border shadow-sm',
        // 选中态描一圈主色：ring 不占布局，避免加粗边框把节点撑大 1px
        selected && 'border-primary ring-primary ring-2',
      )}
      onKeyDown={(event) => {
        if (!editing && (event.key === 'Enter' || event.key === 'F2')) {
          event.preventDefault()
          setEditing(true)
        }
      }}
    >
      <LinkZone type="target" position={Position.Left} />
      {reading ? (
        <p className="text-muted-foreground flex flex-1 items-center gap-2 px-2.5 pt-2 text-[11px]">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          {t('ai-image-gen.promptNode.reading')}
        </p>
      ) : (
        // 换 key 重挂：识图回写与参考图重排都会从外部改文本，本地草稿得跟着重置
        <PromptEditor
          key={`${data.text}|${data.mentions.join('|')}`}
          data={data}
          revealed={selected}
          editing={editing}
          dialogOpen={dialogOpen}
          onEditStart={() => setEditing(true)}
          onEditEnd={() => setEditing(false)}
        />
      )}

      {data.errorCode ? (
        <p className="text-destructive px-2.5 pb-1.5 text-[10px]">
          {t(`ai-image-gen.errors.${data.errorCode}`)}
        </p>
      ) : null}

      {/* 工具条那颗按钮才开对话框：多选时说不清要润色哪一段，所以一并藏掉 */}
      {dialogOpen && !data.barHidden ? (
        <NodeDialog
          key={data.nodeId}
          target={{ kind: 'polish', text: data.text }}
          busy={polishing || running}
          onSubmit={polish}
          onClose={data.onToggleDialog}
          onOpenSettings={data.onOpenSettings}
        />
      ) : null}

      <LinkZone type="source" position={Position.Right} />

      <ResizeControls
        minWidth={CANVAS_NODE_MIN_WIDTH}
        maxWidth={CANVAS_NODE_MAX_WIDTH}
        minHeight={CANVAS_NODE_MIN_HEIGHT}
        maxHeight={CANVAS_PROMPT_MAX_HEIGHT}
        onResizeEnd={(size, position) => data.onResize(data.nodeId, size, position)}
      />
    </div>
  )
}

/** 文本框 + 胶囊工具条 + 放大弹窗；草稿只在本组件内，提交发生在失焦与关窗 */
function PromptEditor({
  data,
  revealed,
  editing,
  dialogOpen,
  onEditStart,
  onEditEnd,
}: {
  data: PromptNodeData
  revealed: boolean
  editing: boolean
  /** 润色对话框开着没：状态在 PromptNode 订阅，这里只用来点亮按钮 */
  dialogOpen: boolean
  onEditStart: () => void
  onEditEnd: () => void
}) {
  const { t } = useTranslation('tools-images')
  const [draft, setDraft] = useState(data.text)
  const [bindings, setBindings] = useState(data.mentions)
  const [focused, setFocused] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const running = RUNNING.includes(data.status)
  // 工具条只在选中（或正在编辑、开着对话框）时常驻：悬停不浮出，免得挡图
  const showBar = !data.barHidden && (revealed || focused || panelOpen || expanded || dialogOpen)

  const commit = () => {
    const next = draft.trim()
    if (next !== data.text || bindings.join('|') !== data.mentions.join('|')) {
      data.onRename(data.nodeId, next, bindings)
    }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([draft], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = buildTextFileName(draft, data.createdAt || Date.now())
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const field = {
    value: draft,
    mentions: bindings,
    refs: data.refs,
    lang: data.lang,
    placeholder: t('ai-image-gen.promptNode.placeholder'),
    onChange: (value: string, nextMentions: string[]) => {
      setDraft(value)
      setBindings(nextMentions)
    },
    onCommit: () => {
      commit()
      onEditEnd()
    },
    onPanelChange: setPanelOpen,
  }

  return (
    <>
      {/* 选中、编辑、面板或弹窗开着时常驻；悬停不浮出，免得挡图 */}
      <div
        className={cn(
          'transition-opacity',
          showBar ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <ActionBar>
          {/* 参考图数量不再报：连线与正文里的 @图N 说的是同一件事。
              这里只报上游链，没有链就连整块都不占位 */}
          {data.chainCount > 0 ? (
            <>
              <span className="text-muted-foreground flex shrink-0 items-center gap-1 pl-1 text-[10px]">
                <Sparkles className="text-primary size-3 shrink-0" />
                <span className="text-primary">
                  {t('ai-image-gen.promptNode.chain', { count: data.chainCount })}
                </span>
              </span>
              <Separator orientation="vertical" className="h-4 shrink-0" />
            </>
          ) : null}

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 max-w-36 shrink-0 gap-1 rounded-full px-2 text-[10px] font-normal"
              >
                <SlidersHorizontal className="size-3 shrink-0" />
                <span className="truncate">
                  {data.params.aspect === 'auto'
                    ? t('ai-image-gen.params.aspectAuto')
                    : data.params.aspect}{' '}
                  · ×{data.params.count}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="center" side="top">
              <ParamBar params={data.params} onParamsChange={data.onParamsChange} />
            </PopoverContent>
          </Popover>
          {/* 没正文就没得润，但对话框开着时按钮必须还能点，否则关不掉 */}
          <ActionButton
            label={t('ai-image-gen.polish.label')}
            icon={<WandSparkles className="size-3 shrink-0" />}
            iconOnly
            active={dialogOpen}
            disabled={!data.text && !dialogOpen}
            onClick={data.onToggleDialog}
          />
          <ActionButton
            label={t('ai-image-gen.promptNode.duplicate')}
            icon={<Copy className="size-3 shrink-0" />}
            iconOnly
            onClick={() => data.onDuplicate(data.nodeId)}
          />
          <ActionButton
            label={t('ai-image-gen.promptNode.expand')}
            icon={<Maximize2 className="size-3 shrink-0" />}
            iconOnly
            onClick={() => setExpanded(true)}
          />
          <ActionButton
            label={t('ai-image-gen.promptNode.download')}
            icon={<Download className="size-3 shrink-0" />}
            iconOnly
            disabled={!draft.trim()}
            onClick={download}
          />
          <ActionButton
            label={t('ai-image-gen.promptNode.delete')}
            icon={<Trash2 className="text-destructive size-3 shrink-0" />}
            iconOnly
            onClick={() => data.onDelete(data.nodeId)}
          />
          {data.status === 'failed' || data.status === 'cancelled' ? (
            <ActionButton
              label={t('ai-image-gen.card.retry')}
              icon={<AlertTriangle className="text-destructive size-3 shrink-0" />}
              onClick={() => data.onRetry(data.jobId)}
            />
          ) : running ? (
            <ActionButton
              label={
                data.status === 'queued'
                  ? t('ai-image-gen.card.queued')
                  : t(data.reading ? 'ai-image-gen.card.reading' : 'ai-image-gen.card.generating')
              }
              icon={<Loader2 className="size-3 shrink-0 animate-spin" />}
              onClick={() => data.onCancel(data.jobId)}
            />
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-6 shrink-0 gap-1 rounded-full px-2.5 text-[10px]"
              disabled={!data.text}
              onClick={() => data.onGenerate(data.nodeId)}
            >
              {t('ai-image-gen.promptNode.generate')}
            </Button>
          )}
        </ActionBar>
      </div>

      <MentionField
        {...field}
        readOnly={!editing}
        onActivate={onEditStart}
        onEscape={onEditEnd}
        textareaClassName="min-h-16 px-2.5 py-2"
        onFocusChange={setFocused}
      />

      <Dialog
        open={expanded}
        onOpenChange={(open) => {
          if (!open) commit()
          setExpanded(open)
        }}
      >
        <DialogContent className="flex h-[min(80vh,44rem)] w-[min(92vw,60rem)] max-w-none flex-col gap-3 sm:max-w-none">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t('ai-image-gen.promptNode.expandTitle')}</DialogTitle>
          </DialogHeader>
          <MentionField
            {...field}
            autoFocus
            ariaLabel={t('ai-image-gen.promptNode.expandTitle')}
            className="min-h-0 flex-1"
            textareaClassName="min-h-0 size-full resize-none px-3 py-2 text-sm"
            onFocusChange={() => undefined}
          />
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                commit()
                setExpanded(false)
              }}
            >
              {t('ai-image-gen.promptNode.done')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
