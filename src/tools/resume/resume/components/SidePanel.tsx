import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Layout, Palette, Rows3, Type, Zap } from 'lucide-react'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import {
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_STEP,
  PAGE_PADDING_RANGE,
  PARAGRAPH_SPACING_RANGE,
  SECTION_SPACING_RANGE,
  THEME_COLORS,
  resumeFontOptions,
} from '../constants'
import { useResumeStore } from '../store'
import { AddSectionButton } from './AddSectionButton'
import { ColorPicker } from './ColorPicker'
import { FontSizeSelect } from './FontSizeSelect'
import { LayoutSetting } from './layout/LayoutSetting'
import { NumberField } from './NumberField'
import { SettingCard } from './SettingCard'

const THEME_COLOR_PRESETS = THEME_COLORS as readonly string[]

/**
 * 左栏：章节、主题色、排版、间距、显示模式。
 *
 * **仅移动端使用**——桌面端（`>=768px`）已改为右侧 dock 的浮层面板
 * （`components/dock-panels/*`）。加设置项时两处都要改。
 */
export function SidePanel() {
  const { t } = useTranslation('tools-resume')
  const resume = useResumeStore((state) => state.activeResume)
  const updateGlobalSettings = useResumeStore((state) => state.updateGlobalSettings)
  const setThemeColor = useResumeStore((state) => state.setThemeColor)

  const settings = resume?.globalSettings ?? {}
  const menuSections = resume?.menuSections ?? []
  const themeColor = settings.themeColor ?? THEME_COLORS[0]

  // 取色器每动一像素都会入一条撤销记录，节流到 100ms
  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (colorTimer.current) {
        clearTimeout(colorTimer.current)
      }
    }
  }, [])
  const setThemeColorDebounced = (color: string) => {
    if (colorTimer.current) {
      clearTimeout(colorTimer.current)
    }
    colorTimer.current = setTimeout(() => setThemeColor(color), 100)
  }

  if (!resume) {
    return null
  }

  return (
    <div className="bg-background flex flex-col gap-4 overflow-y-auto p-4">
      <SettingCard icon={Layout} title={t('resume.sidePanel.layout.title')}>
        <LayoutSetting menuSections={menuSections} activeSection={resume.activeSection} />

        <AddSectionButton className="mt-4" />
      </SettingCard>

      <SettingCard
        icon={Palette}
        title={t('resume.sidePanel.theme.title')}
        action={
          <ColorPicker
            value={themeColor}
            onChange={setThemeColorDebounced}
            className={cn(
              'h-7 w-auto gap-1.5 rounded-full border px-3 py-0 text-xs shadow-none',
              THEME_COLOR_PRESETS.includes(themeColor)
                ? 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground bg-transparent'
                : 'border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 hover:border-primary/60',
            )}
            style={{ backgroundColor: 'transparent' }}
          >
            <Palette className="size-3.5" />
            {t('resume.sidePanel.theme.custom')}
            {!THEME_COLOR_PRESETS.includes(themeColor) && (
              <span
                className="ml-0.5 size-2.5 rounded-full border"
                style={{ backgroundColor: themeColor }}
              />
            )}
          </ColorPicker>
        }
      >
        <div className="flex flex-wrap gap-2.5 pt-1">
          {THEME_COLORS.map((preset) => (
            <button
              key={preset}
              type="button"
              title={preset}
              aria-label={preset}
              onClick={() => setThemeColor(preset)}
              className={cn(
                'relative flex size-6 items-center justify-center overflow-hidden rounded-full transition-all',
                themeColor === preset
                  ? 'ring-primary ring-2'
                  : 'ring-border hover:ring-primary/50 ring-1 hover:scale-110',
              )}
            >
              <span className="absolute inset-0" style={{ backgroundColor: preset }} />
              {themeColor === preset && (
                <Check className="relative size-3.5" style={{ color: '#ffffff' }} />
              )}
            </button>
          ))}
        </div>
      </SettingCard>

      <SettingCard icon={Type} title={t('resume.sidePanel.typography.title')}>
        <div className="flex flex-col gap-6">
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
        </div>
      </SettingCard>

      <SettingCard icon={Rows3} title={t('resume.sidePanel.spacing.title')}>
        <div className="flex flex-col gap-6">
          <NumberField
            label={t('resume.sidePanel.spacing.pagePadding.title')}
            value={settings.pagePadding ?? 0}
            min={PAGE_PADDING_RANGE.min}
            max={PAGE_PADDING_RANGE.max}
            step={PAGE_PADDING_RANGE.step}
            onValueChange={(value) => updateGlobalSettings({ pagePadding: value })}
          />
          <NumberField
            label={t('resume.sidePanel.spacing.sectionSpacing.title')}
            value={settings.sectionSpacing ?? 0}
            min={SECTION_SPACING_RANGE.min}
            max={SECTION_SPACING_RANGE.max}
            step={SECTION_SPACING_RANGE.step}
            onValueChange={(value) => updateGlobalSettings({ sectionSpacing: value })}
          />
          <NumberField
            label={t('resume.sidePanel.spacing.paragraphSpacing.title')}
            value={settings.paragraphSpacing ?? 0}
            min={PARAGRAPH_SPACING_RANGE.min}
            max={PARAGRAPH_SPACING_RANGE.max}
            step={PARAGRAPH_SPACING_RANGE.step}
            onValueChange={(value) => updateGlobalSettings({ paragraphSpacing: value })}
          />
        </div>
      </SettingCard>

      <SettingCard icon={Zap} title={t('resume.sidePanel.mode.title')}>
        <div className="flex flex-col gap-4">
          {(['useIconMode', 'centerSubtitle', 'flexibleHeaderLayout'] as const).map((key) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-sm">{t(`resume.sidePanel.mode.${key}.title`)}</Label>
                <p className="text-muted-foreground text-xs">
                  {t(`resume.sidePanel.mode.${key}.hint`)}
                </p>
              </div>
              <Switch
                checked={Boolean(settings[key])}
                onCheckedChange={(checked) => updateGlobalSettings({ [key]: checked })}
              />
            </div>
          ))}
        </div>
      </SettingCard>
    </div>
  )
}
