import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildImageFileName } from '@/utils/file-name'

import type { ImageRecord } from '../idb'

type ImageLightboxProps = {
  record: ImageRecord | null
  onClose: () => void
}

export function ImageLightbox({ record, onClose }: ImageLightboxProps) {
  const { t } = useTranslation('tools-images')
  const src = useMemo(() => (record ? URL.createObjectURL(record.blob) : ''), [record])
  useEffect(() => {
    return () => {
      if (src) {
        URL.revokeObjectURL(src)
      }
    }
  }, [src])

  return (
    <Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate text-sm font-normal">
            {record?.meta.prompt ?? ''}
          </DialogTitle>
        </DialogHeader>
        {record && src && (
          <>
            <img
              src={src}
              alt={record.meta.prompt}
              className="max-h-[70vh] w-full object-contain"
            />
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                  const url = URL.createObjectURL(record.blob)
                  const anchor = document.createElement('a')
                  anchor.href = url
                  anchor.download = buildImageFileName(
                    record.meta.prompt,
                    record.meta.createdAt,
                    record.mimeType,
                  )
                  anchor.click()
                  URL.revokeObjectURL(url)
                }}
              >
                <Download className="size-4" />
                {t('ai-image-gen.lightbox.download')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
