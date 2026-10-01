import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useToolsStore } from '@/stores/tools.store'
import type { Tool } from '@/tools/define-tool'
import { cn } from '@/lib/utils'

interface FavoriteButtonProps {
  /** 只需要 path：整页式工具自带头部时传的是 index.ts 里的 DefinedTool */
  tool: Pick<Tool, 'path'>
  className?: string
  /** 嵌进可聚焦容器（如命令面板卡片）时置 -1，避免多出 Tab 停靠点 */
  tabIndex?: number
}

/** 收藏星标按钮；在 Link 内使用时会阻止冒泡与默认跳转 */
export function FavoriteButton({ tool, className, tabIndex }: FavoriteButtonProps) {
  const { t } = useTranslation('common')
  const isFavorite = useToolsStore((state) => state.favorites.includes(tool.path))
  const toggleFavorite = useToolsStore((state) => state.toggleFavorite)

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      tabIndex={tabIndex}
      className={cn('shrink-0', className)}
      aria-label={isFavorite ? t('favoriteRemove') : t('favoriteAdd')}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        toggleFavorite(tool.path)
      }}
    >
      <Star
        className={cn(
          'transition-colors',
          isFavorite ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground',
        )}
      />
    </Button>
  )
}
