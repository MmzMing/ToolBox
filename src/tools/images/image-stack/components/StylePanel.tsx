import { useTranslation } from 'react-i18next'

import { PanelSection, PanelSliderField } from '@/components/panel-fields'
import { MAX_GAP, MAX_PADDING, MAX_RADIUS } from '../image-stack.service'
import { useImageStackStore } from '../store'
import { BackgroundField } from './BackgroundField'

/** 拼接成品的样式：边距、间距、两处圆角与背景 */
export function StylePanel() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const style = useImageStackStore((state) => state.style)
  const setStyle = useImageStackStore((state) => state.setStyle)

  return (
    <PanelSection title={t('style.title')}>
      <PanelSliderField
        label={t('style.padding')}
        value={style.padding}
        onChange={(value) => setStyle({ padding: value })}
        min={0}
        max={MAX_PADDING}
        format={(value) => `${value} px`}
      />
      <PanelSliderField
        label={t('style.gap')}
        value={style.gap}
        onChange={(value) => setStyle({ gap: value })}
        min={0}
        max={MAX_GAP}
        format={(value) => `${value} px`}
      />
      <PanelSliderField
        label={t('style.cellRadius')}
        value={style.cellRadius}
        onChange={(value) => setStyle({ cellRadius: value })}
        min={0}
        max={MAX_RADIUS}
        format={(value) => `${value} px`}
      />
      <PanelSliderField
        label={t('style.canvasRadius')}
        value={style.canvasRadius}
        onChange={(value) => setStyle({ canvasRadius: value })}
        min={0}
        max={MAX_RADIUS}
        format={(value) => `${value} px · ${t('style.canvasRadiusHint')}`}
      />

      <BackgroundField
        value={style.background}
        onChange={(background) => setStyle({ background })}
      />
    </PanelSection>
  )
}
