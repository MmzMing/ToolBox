import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { AlertTriangle, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'

import { MAX_CANVAS_REFS, type GenParams } from '../../ai-image-gen.service'
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
  onRename: (nodeId: string, text: string) => void
  onGenerate: (nodeId: string) => void
  onCancel: (jobId: string) => void
  onRetry: (jobId: string) => void
  onDelete: (nodeId: string) => void
  onParamsChange: (patch: Partial<GenParams>) => void
}

export type PromptRfNode = Node<PromptNodeData, 'prompt'>

const RUNNING: (JobStatus | 'idle')[] = ['queued', 'running']

/** 提示词节点即生成锚点：左岸收参考图，底部就地出图 */
export function PromptNode({ data }: NodeProps<PromptRfNode>) {
  const { t } = useTranslation('tools-images')
  const running = RUNNING.includes(data.status)

  const commit = (value: string) => {
    const next = value.trim()
    if (next !== data.text) {
      data.onRename(data.nodeId, next)
    }
  }

  return (
    <div className="bg-card flex h-full flex-col rounded-xl border shadow-sm">
      <Handle type="target" position={Position.Left} />
      <Textarea
        defaultValue={data.text}
        placeholder={t('ai-image-gen.promptNode.placeholder')}
        onBlur={(event) => commit(event.currentTarget.value)}
        className="nodrag nowheel min-h-16 w-full flex-1 resize-none border-0 bg-transparent px-2.5 pt-2 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      <div className="flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5">
        <span className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1 text-[10px]">
          <Sparkles className="text-primary size-3 shrink-0" />
          {data.chainCount > 0 ? (
            <span className="text-primary shrink-0">
              {t('ai-image-gen.promptNode.chain', { count: data.chainCount })}
            </span>
          ) : null}
          <span className="truncate">
            {t('ai-image-gen.promptNode.refs', { count: data.refCount, max: MAX_CANVAS_REFS })}
          </span>
        </span>

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
              : t('ai-image-gen.card.generating')}
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
    </div>
  )
}
