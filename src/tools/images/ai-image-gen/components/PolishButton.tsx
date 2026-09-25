import { useTranslation } from 'react-i18next'

import { Loader2, Settings2, WandSparkles } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AI_PROVIDER_DEFINITIONS } from '@/modules/ai/providers'

import { useAiImageGenStore } from '../store'

type PolishButtonProps = {
  /** 润色请求进行中：转圈并锁住入口 */
  pending: boolean
  /** 外观跟随哪条工具条：对话框底栏是大号图标钮，画布节点是胶囊里的小钮 */
  bar?: boolean
  /** 放大弹窗页脚里纯图标看不出所以然，这里允许带上文字 */
  labeled?: boolean
  disabled?: boolean
  onPolish: () => void
}

/**
 * 润色入口。模型不在这里选——它跟着「AI 生图设置」里润色那一节走，
 * 这里只回显当前会用哪个模型，并把用户送到设置里去改。
 */
export function PolishButton({
  pending,
  bar = false,
  labeled = false,
  disabled = false,
  onPolish,
}: PolishButtonProps) {
  const { t } = useTranslation('tools-images')
  const [open, setOpen] = useState(false)
  const visionApi = useAiImageGenStore((state) => state.visionApi)
  const polishApi = useAiImageGenStore((state) => state.polishApi)
  const usesVision = useAiImageGenStore((state) => state.polishUsesVision)
  const setSettingsOpen = useAiImageGenStore((state) => state.setSettingsOpen)

  const api = usesVision ? visionApi : polishApi
  const ready = !!api.model && !!api.apiKey.trim()
  const label = t('ai-image-gen.polish.label')
  const glyph = bar ? 'size-4' : 'size-3'

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size={bar ? 'icon' : 'sm'}
      className={cn(
        bar
          ? 'text-muted-foreground size-8 shrink-0'
          : 'h-6 shrink-0 gap-1.5 rounded-full text-[10px] font-normal',
        !bar && !labeled && 'w-6 px-0',
      )}
      disabled={disabled || pending}
      aria-label={label}
      title={!bar && !labeled ? label : undefined}
    >
      {pending ? (
        <Loader2 className={cn(glyph, 'animate-spin')} />
      ) : (
        <WandSparkles className={glyph} />
      )}
      {labeled ? label : null}
    </Button>
  )

  // Popover 与 Tooltip 的 Trigger 都要 asChild，只能互相套在同一个按钮外面一层
  const wrapped = bar ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  ) : (
    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {wrapped}
      <PopoverContent className="w-72 space-y-3" align={bar ? 'start' : 'center'} side="top">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('ai-image-gen.polish.model')}</Label>
          <p className="truncate text-xs">
            {AI_PROVIDER_DEFINITIONS[api.provider].name} ·{' '}
            <span className="text-muted-foreground">
              {api.model || t('ai-image-gen.settings.unassigned')}
            </span>
          </p>
          <p className="text-muted-foreground text-[11px]">
            {t(usesVision ? 'ai-image-gen.polish.usesVision' : 'ai-image-gen.polish.usesOwn')}
          </p>
          <p className="text-muted-foreground text-[11px]">{t('ai-image-gen.polish.hint')}</p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => {
            setOpen(false)
            setSettingsOpen(true)
          }}
        >
          <Settings2 className="size-3.5" />
          {t('ai-image-gen.polish.openSettings')}
        </Button>

        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={!ready}
          onClick={() => {
            setOpen(false)
            onPolish()
          }}
        >
          {t('ai-image-gen.polish.start')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
