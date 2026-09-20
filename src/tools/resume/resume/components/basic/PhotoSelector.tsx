import { Eye, EyeOff, Image as ImageIcon, Settings2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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

const DEFAULT_AVATAR = '/avatar.png'
const SIZE_LIMIT_PX = 200
const MIN_SIZE_PX = 24

/** 头像：选择器 + 尺寸/比例/圆角配置抽屉 */
export function PhotoSelector() {
  const { t } = useTranslation('tools-resume')
  const basic = useResumeStore((state) => state.activeResume?.basic)
  const updateBasicInfo = useResumeStore((state) => state.updateBasicInfo)
  const [showConfig, setShowConfig] = useState(false)

  if (!basic) {
    return null
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="size-4" />
          <span className="text-sm font-medium">{t('resume.basicPanel.avatar')}</span>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('resume.photoConfig.title')}
            onClick={() => setShowConfig(true)}
          >
            <Settings2 className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              basic.photoConfig?.visible === false
                ? t('resume.layout.show')
                : t('resume.layout.hide')
            }
            onClick={() =>
              updateBasicInfo({
                photoConfig: {
                  ...basic.photoConfig,
                  visible: basic.photoConfig?.visible === false,
                },
              })
            }
          >
            {basic.photoConfig?.visible === false ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="relative mt-2 overflow-hidden">
        {basic.photo && <img src={basic.photo} alt="" className="size-12 rounded object-cover" />}
      </div>

      <PhotoConfigDrawer
        open={showConfig}
        onOpenChange={setShowConfig}
        photo={basic.photo}
        config={basic.photoConfig}
      />
    </div>
  )
}

type DrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  photo?: string
  config?: PhotoConfig
}

/**
 * 头像配置抽屉。
 *
 * 旧版用 vaul 的非模态左抽屉，本项目没有 vaul，改用 shadcn `Sheet`；
 * 跨域图片 URL 也不再经服务端代理（无后端），因此这类图导出时可能被 canvas 判为污染。
 */
function PhotoConfigDrawer({ open, onOpenChange, photo, config: initialConfig }: DrawerProps) {
  const { t } = useTranslation('tools-resume')
  const updateBasicInfo = useResumeStore((state) => state.updateBasicInfo)
  const fileInput = useRef<HTMLInputElement>(null)
  const [config, setConfig] = useState<PhotoConfig>(initialConfig ?? DEFAULT_PHOTO_CONFIG)
  const [preview, setPreview] = useState<string>(photo || DEFAULT_AVATAR)
  const [draftUrl, setDraftUrl] = useState(photo === DEFAULT_AVATAR ? '' : (photo ?? ''))
  const [dragging, setDragging] = useState(false)

  // 打开的一刻从外部数据同步一次草稿：用渲染期比对 prevOpen 完成，
  // 放进 effect 里 setState 会多推一轮渲染（React 官方的 adjusting-state 写法）
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setConfig(initialConfig ?? DEFAULT_PHOTO_CONFIG)
      setPreview(photo === '' ? '' : photo || DEFAULT_AVATAR)
      setDraftUrl(photo === DEFAULT_AVATAR ? '' : photo || '')
    }
  }

  const commit = (next: PhotoConfig) => {
    setConfig(next)
    updateBasicInfo({ photoConfig: next })
  }

  /** 非自定义比例时，改一边另一边按比例走，并夹在 24–200px */
  const withRatio = (next: PhotoConfig, changed: 'width' | 'height'): PhotoConfig => {
    if (next.aspectRatio === 'custom') {
      return next
    }
    const factor =
      changed === 'width'
        ? ratioMultiplier(next.aspectRatio)
        : 1 / ratioMultiplier(next.aspectRatio)
    const other = Math.round(next[changed] * factor)
    return {
      ...next,
      [changed === 'width' ? 'height' : 'width']: Math.min(
        SIZE_LIMIT_PX,
        Math.max(MIN_SIZE_PX, other),
      ),
    }
  }

  const pickFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(t('resume.photoConfig.typeLimit'))
      return
    }

    try {
      const dataUrl = await compressToLimit(
        file,
        CERTIFICATE_COMPRESSION_LADDER,
        CERTIFICATE_MAX_BASE64_BYTES,
      )
      setPreview(dataUrl)
      setDraftUrl(dataUrl)
      updateBasicInfo({ photo: dataUrl })
    } catch {
      toast.error(t('resume.photoConfig.compressFailed'))
    }
  }

  const removePhoto = () => {
    setPreview('')
    setDraftUrl('')
    if (fileInput.current) {
      fileInput.current.value = ''
    }
    updateBasicInfo({ photo: '' })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-80 flex-col gap-0 p-0">
        <SheetHeader className="border-b">
          <SheetTitle>{t('resume.photoConfig.title')}</SheetTitle>
          <SheetDescription className="sr-only">
            {t('resume.photoConfig.dragHint')}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const file = event.dataTransfer.files[0]
              if (file) {
                void pickFile(file)
              }
            }}
            className={cn(
              'border-border relative mx-auto overflow-hidden border-2 transition-all',
              dragging ? 'border-primary border-solid' : 'border-dashed',
            )}
            style={{
              width: `${config.width}px`,
              height: `${config.height}px`,
              borderRadius: photoBorderRadiusValue(config),
              maxWidth: '100%',
            }}
          >
            {preview ? (
              <div className="group relative h-full">
                <img src={preview} alt="" className="size-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('resume.photoConfig.remove')}
                    className="bg-white/10 hover:bg-white/20"
                    onClick={removePhoto}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="size-full flex-col"
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="size-5" />
              </Button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void pickFile(file)
                }
              }}
            />
          </div>

          <p className="text-muted-foreground mt-3 text-xs">{t('resume.photoConfig.dragHint')}</p>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t('resume.photoConfig.urlTitle')}</h3>
              <Input
                value={draftUrl.startsWith('data:') ? '' : draftUrl}
                placeholder={t('resume.photoConfig.urlPlaceholder')}
                onChange={(event) => {
                  const url = event.target.value.trim()
                  setDraftUrl(url)
                  if (!url) {
                    removePhoto()
                    return
                  }
                  setPreview(url)
                  updateBasicInfo({ photo: url })
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t('resume.photoConfig.size')}</h3>
              <div className="grid grid-cols-2 gap-4">
                {(['width', 'height'] as const).map((key) => (
                  <div key={key} className="relative">
                    <Input
                      type="number"
                      min={MIN_SIZE_PX}
                      max={SIZE_LIMIT_PX}
                      value={config[key]}
                      aria-label={
                        key === 'width'
                          ? t('resume.photoConfig.width')
                          : t('resume.photoConfig.height')
                      }
                      className="pr-7"
                      onChange={(event) => {
                        const raw = Number(event.target.value)
                        if (!Number.isFinite(raw)) {
                          return
                        }
                        setConfig({ ...config, [key]: Math.min(SIZE_LIMIT_PX, Math.max(0, raw)) })
                      }}
                      onBlur={() => commit(withRatio(config, key))}
                    />
                    <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-sm">
                      {key === 'width' ? 'W' : 'H'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t('resume.photoConfig.aspectRatio')}</h3>
              <div className="flex flex-wrap gap-2">
                {(['1:1', '4:3', '3:4', '16:9', 'custom'] as const).map((ratio) => (
                  <Button
                    key={ratio}
                    type="button"
                    size="sm"
                    variant={config.aspectRatio === ratio ? 'default' : 'outline'}
                    onClick={() => {
                      if (ratio === 'custom') {
                        commit({ ...config, aspectRatio: ratio })
                        return
                      }
                      commit({
                        ...config,
                        aspectRatio: ratio,
                        height: Math.min(
                          SIZE_LIMIT_PX,
                          Math.round(config.width * ratioMultiplier(ratio)),
                        ),
                      })
                    }}
                  >
                    {ratio === 'custom' ? t('resume.photoConfig.ratios.custom') : ratio}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t('resume.photoConfig.borderRadius')}</h3>
              <div className="flex flex-wrap items-center gap-2">
                {(['none', 'medium', 'full', 'custom'] as const).map((radius) => (
                  <Button
                    key={radius}
                    type="button"
                    size="sm"
                    variant={config.borderRadius === radius ? 'default' : 'outline'}
                    onClick={() => commit({ ...config, borderRadius: radius })}
                  >
                    {t(`resume.photoConfig.borderRadiusOptions.${radius}`)}
                  </Button>
                ))}
                {config.borderRadius === 'custom' && (
                  <Input
                    type="number"
                    min={0}
                    max={Math.min(config.width, config.height) / 2}
                    value={config.customBorderRadius}
                    aria-label={t('resume.photoConfig.borderRadiusOptions.custom')}
                    className="w-20"
                    onChange={(event) =>
                      setConfig({ ...config, customBorderRadius: Number(event.target.value) || 0 })
                    }
                    onBlur={() => commit(config)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              updateBasicInfo({ photo: preview === DEFAULT_AVATAR ? '' : preview })
              onOpenChange(false)
            }}
          >
            {t('resume.photoConfig.done')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
