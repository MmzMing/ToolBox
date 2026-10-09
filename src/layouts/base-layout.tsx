import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/layouts/app-shell/AppShell'
import { CommandPalette } from '@/modules/command-palette/command-palette'

/**
 * 全局布局入口：只提供 Tooltip 上下文、app-shell 与命令面板的装配，
 * 具体的 dock / 顶部胶囊 / 滚动区划分都在 AppShell 及其子组件里。
 */
export default function BaseLayout() {
  return (
    <TooltipProvider delayDuration={200}>
      <AppShell />
      <CommandPalette />
    </TooltipProvider>
  )
}
