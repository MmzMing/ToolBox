import { ArrowUp, Loader2, ScanSearch, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AI_PROVIDER_DEFINITIONS } from '@/modules/ai/providers'

import type { ImageRecord } from '../idb'
import { useAiImageGenStore } from '../store'
import { SkillPicker } from './SkillPicker'

/** 对话框服务的对象：选中图片即识图，选中提示词节点即润色 */
export type NodeDialogTarget =
  { kind: 'vision'; record: ImageRecord } | { kind: 'polish'; text: string }

type NodeDialogProps = {
  target: NodeDialogTarget
  /** 识图任务在跑，或润色请求在途 */
  busy: boolean
  onSubmit: (instruction: string) => void
  /** 识图才给取消：润色是一次性请求，没有可续跑的 job */
  onCancel?: () => void
  /** 由工具条那颗按钮唤出，Esc 收回：没选中过的节点没有选中态可退 */
  onClose?: () => void
  onOpenSettings: () => void
}

/**
 * 挂在节点正下方的上下文对话框。它是节点的一部分而不是画布上的一层浮窗，
 * 所以拖动卡片时天然跟着走。输入在上、模型与发送在框底，接替原先那条常驻输入框。
 */
export function NodeDialog({
  target,
  busy,
  onSubmit,
  onCancel,
  onClose,
  onOpenSettings,
}: NodeDialogProps) {
  const { t } = useTranslation('tools-images')
  const [instruction, setInstruction] = useState('')
  const visionApi = useAiImageGenStore((state) => state.visionApi)
  const polishApi = useAiImageGenStore((state) => state.polishApi)
  const polishUsesVision = useAiImageGenStore((state) => state.polishUsesVision)
  const visionSkillId = useAiImageGenStore((state) => state.visionSkillId)
  const setVisionSkillId = useAiImageGenStore((state) => state.setVisionSkillId)

  const vision = target.kind === 'vision'
  // 润色两头都得有料：没有原文可改、或没写要求，都不该发出去
  const canSend = vision || (!!target.text.trim() && !!instruction.trim())
  const chatApi = vision ? visionApi : polishUsesVision ? visionApi : polishApi
  const modelLabel = chatApi.model || t('ai-image-gen.settings.unassigned')

  const send = () => {
    if (!canSend || busy) {
      return
    }
    onSubmit(instruction.trim())
    setInstruction('')
  }

  return (
    // 挂在节点正下方：比节点本身宽出一截才写得下长句；
    // nodrag 让打字不拖走卡片，nowheel 让滚轮不在框上误缩放画布
    <div className="nodrag nowheel absolute top-full left-1/2 z-30 mt-2 w-[max(100%,460px)] -translate-x-1/2">
      <div className="border-border bg-card/95 rounded-2xl border p-3 shadow-xl backdrop-blur-xl">
        <Textarea
          value={instruction}
          placeholder={t(
            vision
              ? 'ai-image-gen.dialog.visionPlaceholder'
              : 'ai-image-gen.dialog.polishPlaceholder',
          )}
          className="max-h-96 min-h-28 resize-none overflow-y-auto border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          autoFocus
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onClose?.()
              return
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
        />

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {vision ? (
            <SkillPicker skillId={visionSkillId} onSkillIdChange={setVisionSkillId} />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-8 max-w-40 gap-1.5 rounded-full px-3 text-xs font-normal"
            aria-label={t('ai-image-gen.toolbar.settings')}
            onClick={onOpenSettings}
          >
            <span className="truncate">
              {AI_PROVIDER_DEFINITIONS[chatApi.provider].name} · {modelLabel}
            </span>
          </Button>

          <div className="flex-1" />

          {busy && onCancel ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0 rounded-full"
              aria-label={t('ai-image-gen.card.cancel')}
              onClick={onCancel}
            >
              <X className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="size-9 shrink-0 rounded-full"
              disabled={!canSend || busy}
              aria-label={t(vision ? 'ai-image-gen.card.vision' : 'ai-image-gen.polish.label')}
              title={
                canSend
                  ? t('ai-image-gen.dialog.sendHint')
                  : t(vision ? 'ai-image-gen.card.vision' : 'ai-image-gen.dialog.needInstruction')
              }
              onClick={send}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : vision ? (
                <ScanSearch className="size-4" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
