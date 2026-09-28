import { Camera, Eye, EyeOff } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import {
  CERTIFICATE_COMPRESSION_LADDER,
  CERTIFICATE_MAX_BASE64_BYTES,
  DEFAULT_PHOTO_CONFIG,
} from '../../constants'
import { compressToLimit } from '../../image-utils'
import { photoBorderRadiusValue, ratioMultiplier } from '../../resume.service'
import { useResumeStore } from '../../store'
import type { PhotoConfig } from '../../types'
import { PhotoCropPanel } from './PhotoCropPanel'
import type { PhotoCropPanelHandle } from './PhotoCropPanel'

/** 新简历的占位头像；弹窗里当作"还没有头像"，不参与裁剪 */
const DEFAULT_AVATAR = '/avatar.png'
const SIZE_LIMIT_PX = 200
const MIN_SIZE_PX = 24
/** 面板里的头像按长边缩放到这个尺寸，纸面比例与圆角照搬，所见即所得 */
const PREVIEW_LONG_EDGE_PX = 112

/** 选图 → 压缩 → 返回 data URL；是否写回 store 交给调用方（弹窗里要到"完成"才换图） */
function usePhotoUpload() {
  const { t } = useTranslation('tools-resume')
  const fileInput = useRef<HTMLInputElement>(null)

  const pickFile = async (file: File): Promise<string | null> => {
    if (!file.type.startsWith('image/')) {
      toast.error(t('resume.photoConfig.typeLimit'))
      return null
    }

    try {
      return await compressToLimit(
        file,
        CERTIFICATE_COMPRESSION_LADDER,
        CERTIFICATE_MAX_BASE64_BYTES,
      )
    } catch {
      toast.error(t('resume.photoConfig.compressFailed'))
      return null
    }
  }

  return {
    fileInput,
    pickFile,
    openPicker: () => fileInput.current?.click(),
  }
}

type FileInputProps = {
  fileInput: React.RefObject<HTMLInputElement | null>
  onFile: (file: File) => void
}

function PhotoFileInput({ fileInput, onFile }: FileInputProps) {
  return (
    <input
      ref={fileInput}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) {
          void onFile(file)
        }
        event.target.value = ''
      }}
    />
  )
}

/**
 * 头像：大图本身即入口（点击进裁剪弹窗，可直接拖图进来换图），显隐开关压在缩略图底边，
 * 与纸面效果放在一起，不进弹窗。
 *
 * 面板上的拖拽没有弹窗可确认，属于"直接换图"，与弹窗里的草稿语义不同。
 */
export function PhotoSelector() {
  const { t } = useTranslation('tools-resume')
  const basic = useResumeStore((state) => state.activeResume?.basic)
  const updateBasicInfo = useResumeStore((state) => state.updateBasicInfo)
  const [showConfig, setShowConfig] = useState(false)
  const [dragging, setDragging] = useState(false)
  const { fileInput, pickFile } = usePhotoUpload()

  if (!basic) {
    return null
  }

  const config = basic.photoConfig ?? DEFAULT_PHOTO_CONFIG
  const hasPhoto = Boolean(basic.photo)
  const hidden = config.visible === false
  const label = t(hasPhoto ? 'resume.photoConfig.title' : 'resume.photoConfig.upload')
  const scale = PREVIEW_LONG_EDGE_PX / Math.max(config.width, config.height, MIN_SIZE_PX)
  const radius = photoBorderRadiusValue(config)

  const uploadFile = async (file: File) => {
    const dataUrl = await pickFile(file)
    if (dataUrl) {
      updateBasicInfo({ photo: dataUrl })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files[0]
          if (file) {
            void uploadFile(file)
          }
        }}
        className="relative shrink-0"
      >
        <button
          type="button"
          onClick={() => setShowConfig(true)}
          aria-label={label}
          title={label}
          className={cn(
            'group relative block overflow-hidden border-2 border-dashed border-transparent transition-colors',
            dragging
              ? 'border-primary bg-primary/10'
              : hasPhoto
                ? 'hover:border-border'
                : 'border-border bg-muted/40 hover:border-primary/60',
            hasPhoto && hidden && 'opacity-50',
          )}
          style={{
            width: Math.round(config.width * scale),
            height: Math.round(config.height * scale),
            borderRadius: radius,
          }}
        >
          {hasPhoto ? (
            <>
              <img src={basic.photo} alt="" className="size-full object-cover" />
              <span className="bg-background/60 absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="size-6" />
              </span>
            </>
          ) : (
            <Camera className="text-muted-foreground absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2" />
          )}
        </button>

        {hasPhoto && (
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className="bg-background absolute -bottom-1.5 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-sm"
            aria-label={hidden ? t('resume.layout.show') : t('resume.layout.hide')}
            title={t('resume.photoConfig.showInResume')}
            onClick={() => updateBasicInfo({ photoConfig: { ...config, visible: hidden } })}
          >
            {hidden ? <EyeOff /> : <Eye />}
          </Button>
        )}
      </div>

      <PhotoFileInput fileInput={fileInput} onFile={uploadFile} />

      <PhotoConfigDialog
        open={showConfig}
        onOpenChange={setShowConfig}
        photo={basic.photo}
        config={basic.photoConfig}
      />
    </div>
  )
}

type ConfigDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  photo?: string
  config?: PhotoConfig
}

/**
 * 头像设置弹窗：只保留裁剪面板与"完成"。
 *
 * 画布上的调整是弹窗内的草稿：点"完成"才把裁剪结果写回 store，取消则整单作废。
 * 跨域图片 URL 不经服务端代理（无后端），拿不到像素也就导不出裁剪结果，会提示并保留原图。
 */
function PhotoConfigDialog({
  open,
  onOpenChange,
  photo,
  config: initialConfig,
}: ConfigDialogProps) {
  const { t } = useTranslation('tools-resume')
  const updateBasicInfo = useResumeStore((state) => state.updateBasicInfo)
  const [config, setConfig] = useState<PhotoConfig>(initialConfig ?? DEFAULT_PHOTO_CONFIG)
  const [source, setSource] = useState('')
  const cropRef = useRef<PhotoCropPanelHandle>(null)
  const { fileInput, pickFile, openPicker } = usePhotoUpload()

  // 打开的一刻从外部数据同步一次草稿：用渲染期比对 prevOpen 完成，
  // 放进 effect 里 setState 会多推一轮渲染（React 官方的 adjusting-state 写法）
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setConfig(initialConfig ?? DEFAULT_PHOTO_CONFIG)
      setSource(photo && photo !== DEFAULT_AVATAR ? photo : '')
    }
  }

  /**
   * 改纸面设置：尺寸不再暴露给用户，比例变化时顺手把纸面宽高同步成同一比例，
   * 裁剪出来的形状与纸面占位永远一致。
   */
  const changeConfig = (patch: Partial<PhotoConfig>) => {
    const next = { ...config, ...patch }
    if (patch.aspectRatio && patch.aspectRatio !== 'custom') {
      next.height = Math.min(
        SIZE_LIMIT_PX,
        Math.max(MIN_SIZE_PX, Math.round(next.width * ratioMultiplier(patch.aspectRatio))),
      )
    }
    setConfig(next)
    updateBasicInfo({ photoConfig: next })
  }

  const uploadFile = async (file: File) => {
    const dataUrl = await pickFile(file)
    if (dataUrl) {
      setSource(dataUrl)
    }
  }

  /** 移除也是草稿：清掉画布上的图，"完成"时把 photo 写空，取消则原样留着 */
  const removePhoto = () => {
    setSource('')
  }

  /** 完成：本地图片导出裁剪结果，外部链接拿不到像素就按原样保留 */
  const finish = () => {
    const cropped = cropRef.current?.exportCroppedImage()
    updateBasicInfo({ photo: cropped ?? source })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-4rem)] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('resume.photoConfig.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('resume.photoConfig.dragHint')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <PhotoCropPanel
            ref={cropRef}
            src={source}
            config={config}
            onConfigChange={changeConfig}
            sourceUrl={source.startsWith('data:') ? '' : source}
            onPickFile={openPicker}
            onUrlSubmit={setSource}
            onRemove={removePhoto}
            onFile={(file) => void uploadFile(file)}
          />
        </div>

        <PhotoFileInput fileInput={fileInput} onFile={uploadFile} />

        <DialogFooter>
          <Button type="button" className="sm:ml-auto" onClick={finish}>
            {t('resume.photoConfig.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
