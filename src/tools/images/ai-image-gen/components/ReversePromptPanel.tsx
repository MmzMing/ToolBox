import { useTranslation } from 'react-i18next'
import { Copy, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useCopy } from '@/composable/use-copy'

import { useAiImageGenStore } from '../store'

type ReversePromptPanelProps = {
  onInsertPrompt: (text: string) => void
}

/** 反推结果面板：常驻输入框上方，展示最近一次反推的候选与错误 */
export function ReversePromptPanel({ onInsertPrompt }: ReversePromptPanelProps) {
  const { t } = useTranslation('tools-images')
  const { copy } = useCopy()
  const jobs = useAiImageGenStore((state) => state.jobs)
  const reverseJob = jobs.find((job) => job.kind === 'reverse')
  if (!reverseJob) {
    return null
  }
  const running = reverseJob.status === 'queued' || reverseJob.status === 'running'

  return (
    <div className="bg-card/80 max-h-44 shrink-0 space-y-2 overflow-y-auto rounded-xl border p-2 backdrop-blur">
      {running && (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          {t('ai-image-gen.card.generating')}
        </p>
      )}
      {reverseJob.errorCode && (
        <p className="text-destructive text-xs">
          {t(`ai-image-gen.errors.${reverseJob.errorCode}`)}
        </p>
      )}
      {reverseJob.candidates?.map((candidate) => (
        <div key={candidate} className="bg-muted/40 flex items-start gap-2 rounded-md border p-2">
          <p className="min-h-0 flex-1 text-xs break-words whitespace-pre-wrap">{candidate}</p>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onInsertPrompt(candidate)}
            >
              {t('ai-image-gen.reverse.insert')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t('ai-image-gen.reverse.copy')}
              onClick={() => void copy(candidate)}
            >
              <Copy className="size-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
