import { useTranslation } from 'react-i18next'

import { Loader2, WandSparkles } from 'lucide-react'
import { useState } from 'react'

import { useAIDialogStore } from '@/components/ai/dialog-store'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AI_PROVIDER_DEFINITIONS, AI_PROVIDERS, type AIProvider } from '@/modules/ai/providers'
import { useAIConfigStore } from '@/modules/ai/store'

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
 * 润色入口：模型取 AI 连接层的「文本模型」槽，与简历润色共用同一份配置，
 * 这里只负责选与触发，不自建凭证、不重复校验 baseUrl。
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
  const activeProvider = useAIConfigStore((state) => state.activeProvider)
  const picks = useAIConfigStore((state) => state.picks)
  const modelLists = useAIConfigStore((state) => state.modelLists)
  const enabled = useAIConfigStore((state) => state.enabled)
  const setPick = useAIConfigStore((state) => state.setPick)
  const setActiveProvider = useAIConfigStore((state) => state.setActiveProvider)
  const setConfigOpen = useAIDialogStore((state) => state.setConfigOpen)

  const model = picks[activeProvider].text
  const options = [...new Set([...(modelLists[activeProvider] ?? []), ...(model ? [model] : [])])]
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
          <Label className="text-xs">{t('ai-image-gen.settings.provider')}</Label>
          <Select
            value={activeProvider}
            onValueChange={(provider) => setActiveProvider(provider as AIProvider)}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {AI_PROVIDER_DEFINITIONS[provider].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t('ai-image-gen.polish.model')}</Label>
          <Select
            value={model || '__none__'}
            onValueChange={(value) =>
              setPick(activeProvider, 'text', value === '__none__' ? null : value)
            }
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder={t('ai-image-gen.settings.unassigned')} />
            </SelectTrigger>
            <SelectContent>
              {!model && (
                <SelectItem value="__none__">{t('ai-image-gen.settings.unassigned')}</SelectItem>
              )}
              {options.length ? (
                options.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__empty__" disabled>
                  {t('ai-image-gen.polish.noModels')}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-[11px]">{t('ai-image-gen.polish.hint')}</p>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            onClick={() => {
              setOpen(false)
              setConfigOpen(true)
            }}
          >
            {t('ai-image-gen.polish.openSettings')}
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={!enabled || !model}
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
