import anthropicIcon from '@lobehub/icons-static-svg/icons/anthropic.svg?url'
import deepseekIcon from '@lobehub/icons-static-svg/icons/deepseek-color.svg?url'
import doubaoIcon from '@lobehub/icons-static-svg/icons/doubao-color.svg?url'
import geminiIcon from '@lobehub/icons-static-svg/icons/gemini-color.svg?url'
import openaiIcon from '@lobehub/icons-static-svg/icons/openai.svg?url'
import qwenIcon from '@lobehub/icons-static-svg/icons/qwen-color.svg?url'

import { cn } from '@/lib/utils'

import type { AIProvider } from '@/modules/ai/providers'
import { AI_PROVIDER_DEFINITIONS } from '@/modules/ai/providers'

/**
 * 厂商品牌标识。
 *
 * lucide 没有品牌图标，只能引 @lobehub 的官方 SVG 集（只打包用到的 6 个文件）。
 * OpenAI 与 Anthropic 是 `fill="currentColor"` 的单色图，按 <img> 渲染时恒为黑色，
 * 暗色主题下靠 dark:invert 翻白。
 */
const MARKS: Partial<Record<AIProvider, { src: string; monochrome?: boolean }>> = {
  openai: { src: openaiIcon, monochrome: true },
  anthropic: { src: anthropicIcon, monochrome: true },
  gemini: { src: geminiIcon },
  deepseek: { src: deepseekIcon },
  qwen: { src: qwenIcon },
  doubao: { src: doubaoIcon },
}

export function ProviderMark({ provider }: { provider: AIProvider }) {
  const mark = MARKS[provider]
  return (
    <span
      aria-hidden
      className="border-border bg-background flex size-9 shrink-0 items-center justify-center rounded-lg border"
    >
      {mark ? (
        <img src={mark.src} alt="" className={cn('size-4', mark.monochrome && 'dark:invert')} />
      ) : (
        // 品牌图标集里没有的厂商（聚合服务）退回首字母，比硬塞一个不相干的 logo 更诚实
        <span className="text-muted-foreground text-xs font-medium">
          {AI_PROVIDER_DEFINITIONS[provider].name.trim().charAt(0)}
        </span>
      )}
    </span>
  )
}
