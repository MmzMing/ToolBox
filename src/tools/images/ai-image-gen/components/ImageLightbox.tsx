import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'

import { ImageLightbox as Lightbox } from '@/components/image-lightbox'
import { Button } from '@/components/ui/button'
import { buildImageFileName } from '@/utils/file-name'

import type { ImageRecord } from '../idb'
import { objectUrlOf } from '../object-url'

type ImageLightboxProps = {
  record: ImageRecord | null
  onClose: () => void
}

/** 画布与库存图片的灯箱入口：把库存记录翻译成共享灯箱需要的地址与下载动作 */
export function ImageLightbox({ record, onClose }: ImageLightboxProps) {
  const { t } = useTranslation('tools-images')
  const src = record ? objectUrlOf(record.id, record.blob) : ''

  const download = () => {
    if (!record) {
      return
    }
    const url = URL.createObjectURL(record.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = buildImageFileName(record.meta.prompt, record.meta.createdAt, record.mimeType)
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Lightbox
      open={!!record}
      onOpenChange={(open) => (open ? null : onClose())}
      src={src}
      alt={record?.meta.prompt ?? ''}
      caption={record?.meta.prompt}
      actions={
        record ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label={t('ai-image-gen.lightbox.download')}
            title={t('ai-image-gen.lightbox.download')}
            onClick={download}
          >
            <Download />
          </Button>
        ) : null
      }
    />
  )
}
