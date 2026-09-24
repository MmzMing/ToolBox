import { Handle, NodeResizeControl, Position, type Node, type NodeProps } from '@xyflow/react'
import { AlertTriangle, Copy, Loader2, ScanSearch, Sparkles, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useCopy } from '@/composable/use-copy'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'

import {
  CANVAS_NODE_MAX_WIDTH,
  CANVAS_NODE_MIN_HEIGHT,
  CANVAS_NODE_MIN_WIDTH,
  CANVAS_PROMPT_MAX_HEIGHT,
  MAX_CANVAS_REFS,
  type GenParams,
} from '../../ai-image-gen.service'
import { ParamBar } from '../../components/ParamBar'
import type { JobStatus } from '../../store'

export type PromptNodeData = {
  nodeId: string
  jobId: string
  text: string
  refCount: number
  /** 已连入的上游提示词节点数，生成时它们的文本会拼在前面 */
  chainCount: number
  status: JobStatus | 'idle'
  errorCode?: string
  params: GenParams
  /** 识图取词节点：文本由模型写回，没有生图入口 */
  vision: boolean
  onRename: (nodeId: string, text: string) => void
  onGenerate: (nodeId: string) => void
  onCancel: (jobId: string) => void
  onRetry: (jobId: string) => void
  onDelete: (nodeId: string) => void
  onParamsChange: (patch: Partial<GenParams>) => void
  onResize: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void
}

export type PromptRfNode = Node<PromptNodeData, 'prompt'>

const RUNNING: (JobStatus | 'idle')[] = ['queued', 'running']

/** 提示词节点即生成锚点：左岸收参考图，底部就地出图；识图节点则只承载模型回写的文本 */
export function PromptNode({ data }: NodeProps<PromptRfNode>) {
  const { t } = useTranslation('tools-images')
  const { copy } = useCopy()
  const running = RUNNING.includes(data.status)
  const reading = data.vision && running

  const commit = (value: string) => {
    const next = value.trim()
    if (next !== data.text) {
      data.onRename(data.nodeId, next)
    }
  }

  return (
    <div className="bg-card flex h-full flex-col rounded-xl border shadow-sm">
      <Handle type="target" position={Position.Left} />
      {reading ? (
        <p className="text-muted-foreground flex flex-1 items-center gap-2 px-2.5 pt-2 text-[11px]">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          {t('ai-image-gen.promptNode.reading')}
        </p>
      ) : (
        // 非受控 + key：识图结果由外部写回 data.text，靠换 key 重挂才看得到，
        // 而逐键回写 data.text 会把每次输入都变成一次 IDB 写入。
        <Textarea
          key={data.text}
          defaultValue={data.text}
          placeholder={t('ai-image-gen.promptNode.placeholder')}
          onBlur={(event) => commit(event.currentTarget.value)}
          className="nodrag nowheel min-h-16 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2.5 pt-2 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      )}

      <div className="flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5">
        <span className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1 text-[10px]">
          {data.vision ? (
            <>
              <ScanSearch className="text-primary size-3 shrink-0" />
              <span className="shrink-0">{t('ai-image-gen.promptNode.vision')}</span>
            </>
          ) : (
            <>
              <Sparkles className="text-primary size-3 shrink-0" />
              {data.chainCount > 0 ? (
                <span className="text-primary shrink-0">
                  {t('ai-image-gen.promptNode.chain', { count: data.chainCount })}
                </span>
              ) : null}
              <span className="truncate">
                {t('ai-image-gen.promptNode.refs', { count: data.refCount, max: MAX_CANVAS_REFS })}
              </span>
            </>
          )}
        </span>

        {data.vision ? null : (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 max-w-32 shrink-0 rounded-full px-2 text-[10px]"
              >
                <span className="truncate">
                  {data.params.aspect === 'auto'
                    ? t('ai-image-gen.params.aspectAuto')
                    : data.params.aspect}{' '}
                  · ×{data.params.count}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end" side="top">
              <ParamBar mode="gen" params={data.params} onParamsChange={data.onParamsChange} />
            </PopoverContent>
          </Popover>
        )}

        {data.status === 'failed' || data.status === 'cancelled' ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-6 shrink-0 gap-1 px-2 text-[10px]"
            onClick={() => data.onRetry(data.jobId)}
          >
            <AlertTriangle className="text-destructive size-3" />
            {t('ai-image-gen.card.retry')}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="nodrag size-6 shrink-0"
          aria-label={t('ai-image-gen.promptNode.delete')}
          onClick={() => data.onDelete(data.nodeId)}
        >
          {/* 红色挂在图标上：ghost 的 hover:text-foreground 排在工具类后面，挂在按钮上会被顶掉 */}
          <Trash2 className="text-destructive size-3.5" />
        </Button>

        {running ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-6 shrink-0 gap-1 px-2 text-[10px]"
            onClick={() => data.onCancel(data.jobId)}
          >
            <Loader2 className="size-3 animate-spin" />
            {data.status === 'queued'
              ? t('ai-image-gen.card.queued')
              : t(data.vision ? 'ai-image-gen.card.reading' : 'ai-image-gen.card.generating')}
          </Button>
        ) : data.vision ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-6 shrink-0 gap-1 px-2 text-[10px]"
            disabled={!data.text}
            onClick={() => void copy(data.text)}
          >
            <Copy className="size-3" />
            {t('ai-image-gen.promptNode.copy')}
          </Button>
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
      </div>

      {data.errorCode ? (
        <p className="text-destructive px-2.5 pb-2 text-[10px]">
          {t(`ai-image-gen.errors.${data.errorCode}`)}
        </p>
      ) : null}

      <Handle type="source" position={Position.Right} />

      <NodeResizeControl
        position="bottom-right"
        color="transparent"
        className="canvas-resize-handle"
        minWidth={CANVAS_NODE_MIN_WIDTH}
        maxWidth={CANVAS_NODE_MAX_WIDTH}
        minHeight={CANVAS_NODE_MIN_HEIGHT}
        maxHeight={CANVAS_PROMPT_MAX_HEIGHT}
        onResizeEnd={(_event, { width, height, x, y }) =>
          data.onResize(data.nodeId, { width, height }, { x, y })
        }
      />
    </div>
  )
}
