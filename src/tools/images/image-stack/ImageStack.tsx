import { useTranslation } from 'react-i18next'

import { PanelGroup } from '@/components/panel-fields'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Filmstrip } from './components/Filmstrip'
import { LongConfigPanel } from './components/LongConfigPanel'
import { LongStage } from './components/LongStage'
import { SplitPreview } from './components/SplitPreview'
import { StageCanvas } from './components/StageCanvas'
import { StageToolbar } from './components/StageToolbar'
import { StylePanel } from './components/StylePanel'
import { TemplateGallery } from './components/TemplateGallery'
import { UploadZone } from './components/UploadZone'
import { MODES } from './image-stack.service'
import { useImageStackStore, type Mode } from './store'

/**
 * 图片堆叠：拼接与拆分两个模式共用画布比例、导出设置与素材条。
 * 版式统一由 GridTemplate 描述，所以两边只是「图进格子」和「格子出图」的方向差。
 * 长图档是纵向流，没有格子也没有比例，所以它自带一条几何管线，
 * 成品收进固定高度的缩放视口，素材条与参数一起走右侧工具栏。
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
  const isLong = mode === 'long'

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
        <TabsList>
          {MODES.map((item) => (
            <TabsTrigger key={item} value={item}>
              {t(`mode.${item}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {hasItems ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <StageToolbar />
            {isStitch ? <StageCanvas /> : isLong ? <LongStage /> : <SplitPreview />}
            {/* 长图档的素材条挪进右侧工具栏：成品那一块本身就占满视口高度，
                再压一条素材在下面，两边就都看不全了 */}
            {isLong ? null : <Filmstrip />}
          </div>
          {isLong ? (
            <div className="flex min-w-0 flex-col gap-4">
              <Filmstrip />
              <LongConfigPanel />
            </div>
          ) : (
            <PanelGroup className="min-w-0">
              <TemplateGallery />
              {isStitch ? <StylePanel /> : null}
            </PanelGroup>
          )}
        </div>
      ) : (
        <UploadZone />
      )}

      <div className="text-muted-foreground flex flex-col gap-1 text-xs">
        {hasItems ? (
          <p>
            {isLong
              ? t('long.hint')
              : isStitch
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
