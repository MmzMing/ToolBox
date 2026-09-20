import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'

import {
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_STEP,
  resumeFontOptions,
} from '../../constants'
import { useResumeStore } from '../../store'
import { FontSizeSelect } from '../FontSizeSelect'
import { PanelShell } from './PanelShell'

/** 排版浮层：字体、行高、正文 / 章节 / 小标题字号 */
export function TypographyPanel() {
  const { t } = useTranslation('tools-resume')
  const settings = useResumeStore((state) => state.activeResume?.globalSettings ?? {})
  const updateGlobalSettings = useResumeStore((state) => state.updateGlobalSettings)

  return (
    <PanelShell title={t('resume.sidePanel.typography.title')}>
      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">
          {t('resume.sidePanel.typography.font.title')}
        </Label>
        <Select
          value={settings.fontFamily ?? ''}
          onValueChange={(value) => updateGlobalSettings({ fontFamily: value })}
        >
          <SelectTrigger className="border-input bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {resumeFontOptions.map((font) => (
              <SelectItem key={font.id} value={font.family}>
                {t(`resume.sidePanel.typography.font.family.${font.id}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs leading-5">
          {t('resume.sidePanel.typography.font.note')}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">
          {t('resume.sidePanel.typography.lineHeight.title')}
        </Label>
        <div className="flex items-center gap-4">
          <Slider
            className="flex-1"
            value={[settings.lineHeight ?? 1.5]}
            min={LINE_HEIGHT_MIN}
            max={LINE_HEIGHT_MAX}
            step={LINE_HEIGHT_STEP}
            onValueChange={([value]) => updateGlobalSettings({ lineHeight: value })}
          />
          <span className="text-muted-foreground w-8 shrink-0 text-sm">
            {settings.lineHeight ?? 1.5}
          </span>
        </div>
      </div>

      {(
        [
          ['baseFontSize', 'baseFontSize'],
          ['headerSize', 'headerSize'],
          ['subheaderSize', 'subheaderSize'],
        ] as const
      ).map(([key, labelKey]) => (
        <div key={key} className="flex flex-col gap-2">
          <Label className="text-muted-foreground">
            {t(`resume.sidePanel.typography.${labelKey}.title`)}
          </Label>
          <FontSizeSelect
            value={settings[key]}
            onValueChange={(size) => updateGlobalSettings({ [key]: size })}
          />
        </div>
      ))}
    </PanelShell>
  )
}
