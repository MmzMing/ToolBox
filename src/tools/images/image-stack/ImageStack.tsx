import { useTranslation } from 'react-i18next'

import { PanelGroup } from '@/components/panel-fields'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Filmstrip } from './components/Filmstrip'
import { SplitPreview } from './components/SplitPreview'
import { StageCanvas } from './components/StageCanvas'
import { StageToolbar } from './components/StageToolbar'
import { StylePanel } from './components/StylePanel'
import { TemplateGallery } from './components/TemplateGallery'
import { UploadZone } from './components/UploadZone'
import { useImageStackStore, type Mode } from './store'

/**
 * 图片堆叠：拼接与拆分两个模式共用画布比例、导出设置与素材条。
 * 版式统一由 GridTemplate 描述，所以两边只是「图进格子」和「格子出图」的方向差。
 * 作用于画布本身的控件（比例/尺寸/锚点/导出）贴在画布上方的工具条，
 * 右侧栏只留需要浏览挑选的模板与样式，否则侧栏会长到要滚两屏。
 */
export default function ImageStack() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const mode = useImageStackStore((state) => state.mode)
  const setMode = useImageStackStore((state) => state.setMode)
  const hasItems = useImageStackStore((state) => state.items.length > 0)
  const selectedCell = useImageStackStore((state) => state.selectedCell)
  const isStitch = mode === 'stitch'

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
        <TabsList>
          <TabsTrigger value="stitch">{t('mode.stitch')}</TabsTrigger>
          <TabsTrigger value="split">{t('mode.split')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {hasItems ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <StageToolbar />
            {isStitch ? <StageCanvas /> : <SplitPreview />}
            <Filmstrip />
          </div>
          <PanelGroup className="min-w-0">
            <TemplateGallery />
            {isStitch ? <StylePanel /> : null}
          </PanelGroup>
        </div>
      ) : (
        <UploadZone />
      )}

      <div className="text-muted-foreground flex flex-col gap-1 text-xs">
        {hasItems ? (
          <p>
            {isStitch
              ? selectedCell === null
                ? t('stage.hintPick')
                : t('stage.hintFocus')
              : t('split.hint')}
          </p>
        ) : null}
        <p>{t('notes.local')}</p>
      </div>
    </div>
  )
}
