import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSearchStore } from '@/stores/search.store'

import { PaletteBody } from './palette-body'

/**
 * 全局命令面板外壳：Ctrl/Cmd+K 唤起，开关状态放全局 store（顶栏搜索按钮也走它）。
 * 正文在 PaletteBody 里，随 DialogContent 一起挂载、并在退场动画结束后一起卸载，
 * 所以关闭时不必手动重置查询词——重置会让淡出那一帧从筛选结果跳回全量列表。
 */
export function CommandPalette() {
  const { t } = useTranslation('common')
  const open = useSearchStore((state) => state.open)
  const setOpen = useSearchStore((state) => state.setOpen)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen(!useSearchStore.getState().open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[68svh] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-3xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('searchPlaceholder')}</DialogTitle>
          <DialogDescription>{t('searchPlaceholder')}</DialogDescription>
        </DialogHeader>

        <PaletteBody />
      </DialogContent>
    </Dialog>
  )
}
