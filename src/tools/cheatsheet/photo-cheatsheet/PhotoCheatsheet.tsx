import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { photoCheatsheetImage } from './photo-cheatsheet.service'

export default function PhotoCheatsheet() {
  const { t } = useTranslation('tools-cheatsheet')
  const { src, altKey } = photoCheatsheetImage
  const alt = t(`photo-cheatsheet.${altKey}`)

  return (
    <div className="flex flex-col gap-3">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            title={t('photo-cheatsheet.zoomHint')}
            className="hover:bg-accent mx-auto w-full max-w-xl cursor-zoom-in overflow-hidden rounded-lg border transition-colors"
          >
            <img src={src} alt={alt} className="w-full object-contain" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-[92vw] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('photo-cheatsheet.title')}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-auto">
            <img src={src} alt={alt} className="mx-auto max-h-[72vh] w-auto object-contain" />
          </div>
        </DialogContent>
      </Dialog>

      <p className="text-muted-foreground text-sm">{t('photo-cheatsheet.zoomHint')}</p>
    </div>
  )
}
