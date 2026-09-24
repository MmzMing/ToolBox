/**
 * 设置面板：素材 / 风格 / 分镜 / 强度 / 部件 / 输出 六个标签页。
 *
 * 全部是受控壳子：读 project、写回补丁，真正的状态在 store，逻辑在引擎。
 */
import { useRef, useState, type ReactNode } from 'react'
import {
  Boxes,
  ChevronDown,
  Download,
  Dices,
  ListVideo,
  Music2,
  Palette,
  Plus,
  SlidersHorizontal,
  Timer,
  Type,
  Upload,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { FONTS } from '../engine/fonts'
import { MOOD_ORDER } from '../engine/moods'
import type { Quality } from '../engine/export'
import type { AudioInfo, GroupKey, Plan, Project } from '../engine/types'
import type { ExportJob } from '../music-to-video.service'
import { ExportPanel } from './ExportPanel'
import { LineList } from './LineList'
import { PartsPanel } from './PartsPanel'
import { StyleGrid } from './StyleGrid'

/** Radix Select 不接受空串选项值，用哨兵表示"不指定" */
const NO_VALUE = '__none__'

type PanelsProps = {
  project: Project
  plan: Plan
  /** 简易模式：只留必填项与一键随机用得上的入口，对应 JIZURA 的「かんたん」 */
  simple: boolean
  audio: AudioInfo | null
  analyzing: boolean
  currentLine: number
  codecNote: string
  canMp4: boolean
  job: ExportJob | null
  quality: Quality
  userFonts: { key: string; label: string }[]
  patch: (part: Partial<Project>) => void
  patchFx: (part: Partial<Project['fx']>) => void
  setQuality: (quality: Quality) => void
  onAudioFile: (file: File | null) => void
  onFontFile: (file: File) => void
  onAddLocalFont: (family: string) => void
  onExport: (kind: 'mp4' | 'png' | 'pnga') => void
  onCancelExport: () => void
  onSeek: (t: number) => void
  onSetLineTime: (line: number, seconds: number | null) => void
  onSetLayout: (line: number, layout: string | null) => void
  onRerollLine: (line: number) => void
  onToggleLock: (line: number, locked: boolean) => void
  onClearTimes: () => void
  onStartTap: () => void
  tapping: boolean
  onSetPart: (group: GroupKey, key: string, on: boolean) => void
  onBulkParts: (group: GroupKey, mode: 'on' | 'off' | 'flip') => void
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-[11px] leading-4">{hint}</p> : null}
    </div>
  )
}

function SliderRow({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  display,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  display?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <span className="text-muted-foreground font-mono text-[11px]">
          {display ?? value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  )
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="border-input h-7 w-full cursor-pointer rounded border bg-transparent p-0.5"
      />
    </label>
  )
}

/**
 * 次要设置折叠块。面板高度有限，音频 / 歌词 / 风格这些主操作必须一直看得见，
 * 节拍微调和本地字体这类低频项收进这里，摘要留在标题行上以便不展开也能确认现状。
 */
function Section({
  icon: Icon,
  title,
  summary,
  children,
}: {
  icon: LucideIcon
  title: string
  summary?: string
  children: ReactNode
}) {
  return (
    <Collapsible className="border-input rounded-md border">
      <CollapsibleTrigger className="hover:bg-accent/40 group flex w-full items-center gap-2 px-2 py-1.5 text-left">
        <Icon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
        {summary ? (
          <span className="text-muted-foreground shrink-0 font-mono text-[11px]">{summary}</span>
        ) : null}
        <ChevronDown className="text-muted-foreground size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 px-2 pb-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ControlPanels(props: PanelsProps) {
  const {
    project,
    plan,
    simple,
    audio,
    analyzing,
    currentLine,
    codecNote,
    canMp4,
    job,
    quality,
    userFonts,
    patch,
    patchFx,
    setQuality,
    onAudioFile,
    onFontFile,
    onAddLocalFont,
    onExport,
    onCancelExport,
    onSeek,
    onSetLineTime,
    onSetLayout,
    onRerollLine,
    onToggleLock,
    onClearTimes,
    onStartTap,
    tapping,
    onSetPart,
    onBulkParts,
  } = props
  const { t } = useTranslation('tools-video', { keyPrefix: 'music-to-video' })
  const audioInputRef = useRef<HTMLInputElement>(null)
  const fontInputRef = useRef<HTMLInputElement>(null)
  const [localFont, setLocalFont] = useState('')
  const fx = project.fx
  const timing = project.timing
  const colors = project.colors
  const sc = plan.style.schemes[0]

  const setColor = (key: keyof Project['colors'], hex: string) => {
    const next = { ...colors, [key]: hex }
    if (!colors.enabled && ['bg', 'fg', 'sub'].includes(key)) next.enabled = true
    if (!colors.accentOn && ['accent', 'ghostA', 'ghostB'].includes(key)) next.accentOn = true
    patch({ colors: next })
  }

  /** 折叠状态下也要能读出节拍现状 */
  const timingSummary = [
    `${timing.bpm || (audio ? audio.bpm : 0)} BPM`,
    timing.snap ? t('sections.snap') : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const TABS: { value: string; icon: LucideIcon; label: string }[] = [
    { value: 'source', icon: Music2, label: t('tabs.source') },
    { value: 'style', icon: Palette, label: t('tabs.style') },
    { value: 'lines', icon: ListVideo, label: t('tabs.lines') },
    ...(simple
      ? []
      : [
          { value: 'fx', icon: SlidersHorizontal, label: t('tabs.fx') },
          { value: 'parts', icon: Boxes, label: t('tabs.parts') },
        ]),
    { value: 'output', icon: Download, label: t('tabs.output') },
  ]

  return (
    <ScrollArea className="min-h-0 flex-1">
      <Tabs defaultValue="source" className="flex flex-col gap-3 p-2 sm:p-3">
        {/* 单行 6 格：图标 + 两字标签，窄屏也放得下，不再挤成两行 */}
        <TabsList className="grid h-9 w-full grid-cols-6 gap-0.5 p-1">
          {TABS.map(({ value, icon: Icon, label }) => (
            <TabsTrigger key={value} value={value} className="min-w-0 gap-1 px-1 text-[11px]">
              <Icon className="size-3.5" />
              <span className="truncate">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="source" className="flex flex-col gap-3">
          <Field label={t('fields.audio')} hint={analyzing ? t('state.analyzing') : undefined}>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => onAudioFile(e.target.files?.[0] ?? null)}
            />
            {audio ? (
              <div className="border-input flex items-center gap-2 rounded-md border px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs">{audio.name}</span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {audio.bpm} BPM
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  onClick={() => onAudioFile(null)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => audioInputRef.current?.click()}>
                <Upload className="size-4" />
                {t('actions.pickAudio')}
              </Button>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label={t('fields.title')}>
              <Input
                value={project.title}
                onChange={(e) => patch({ title: e.target.value })}
                className="h-8 text-sm"
                placeholder={t('placeholders.title')}
              />
            </Field>
            <Field label={t('fields.artist')}>
              <Input
                value={project.artist}
                onChange={(e) => patch({ artist: e.target.value })}
                className="h-8 text-sm"
                placeholder={t('placeholders.artist')}
              />
            </Field>
          </div>

          <Field label={t('fields.lyrics')} hint={t('hints.lyricsSyntax')}>
            {/* 高度封顶并可拖拽：歌词再长也只占面板的一小段，不会把下面的设置推出视野 */}
            <Textarea
              value={project.lyrics}
              onChange={(e) => patch({ lyrics: e.target.value })}
              rows={6}
              className="max-h-[30svh] min-h-[6rem] resize-y font-mono text-xs leading-5"
              placeholder={t('placeholders.lyrics')}
            />
          </Field>

          {simple ? null : (
            <Section icon={Timer} title={t('sections.timing')} summary={timingSummary}>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label={t('fields.bpm')}
                  hint={audio ? t('hints.bpmAuto', { bpm: audio.bpm }) : undefined}
                >
                  <Input
                    type="number"
                    value={timing.bpm || ''}
                    placeholder={audio ? String(audio.bpm) : t('mood.none')}
                    onChange={(e) =>
                      patch({
                        timing: { ...timing, bpm: Math.max(0, Number(e.target.value) || 0) },
                      })
                    }
                    className="h-8 font-mono text-xs"
                  />
                </Field>
                <Field label={t('fields.offset')}>
                  <Input
                    type="number"
                    step={0.05}
                    value={timing.offset}
                    onChange={(e) =>
                      patch({
                        timing: { ...timing, offset: Math.max(0, Number(e.target.value) || 0) },
                      })
                    }
                    className="h-8 font-mono text-xs"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 items-end gap-2">
                <SliderRow
                  label={t('fields.lineScale')}
                  value={timing.lineScale}
                  min={0.3}
                  max={4}
                  step={0.05}
                  onChange={(lineScale) => patch({ timing: { ...timing, lineScale } })}
                />
                <div className="flex items-center justify-between gap-2 pb-1">
                  <Label className="text-xs font-medium">{t('fields.snap')}</Label>
                  <Switch
                    checked={timing.snap}
                    onCheckedChange={(snap) => patch({ timing: { ...timing, snap } })}
                  />
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={tapping} onClick={onStartTap}>
                {t('actions.tapSync')}
              </Button>
            </Section>
          )}

          <Section
            icon={Type}
            title={t('sections.fonts')}
            summary={userFonts.length ? String(userFonts.length) : undefined}
          >
            <p className="text-muted-foreground text-[11px] leading-4">{t('hints.fonts')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fontInputRef.current?.click()}>
                <Upload className="size-4" />
                {t('actions.addFont')}
              </Button>
              <input
                ref={fontInputRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onFontFile(f)
                  e.target.value = ''
                }}
              />
              <div className="flex w-full items-center gap-2">
                <Input
                  value={localFont}
                  onChange={(e) => setLocalFont(e.target.value)}
                  placeholder={t('placeholders.localFont')}
                  className="h-8 flex-1 text-xs"
                  aria-label={t('placeholders.localFont')}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!localFont.trim()}
                  onClick={() => {
                    onAddLocalFont(localFont.trim())
                    setLocalFont('')
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
              {userFonts.map((f) => (
                <Badge key={f.key} variant="secondary" className="max-w-full truncate">
                  {f.label}
                </Badge>
              ))}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="style" className="flex flex-col gap-3">
          <StyleGrid
            plan={plan}
            value={project.style}
            onSelect={(style) => patch({ style, colors: { ...colors, enabled: false } })}
          />
          <div className="flex flex-col gap-2">
            {(['display', 'serif', 'body'] as const).map((role) => (
              <div key={role} className="flex items-center gap-2">
                <span className="text-muted-foreground w-16 shrink-0 text-[11px]">
                  {t(`fontRoles.${role}`)}
                </span>
                <Select
                  value={project.fonts[role] ?? NO_VALUE}
                  onValueChange={(v) => {
                    const fonts = { ...project.fonts }
                    if (v === NO_VALUE) delete fonts[role]
                    else fonts[role] = v
                    patch({ fonts })
                  }}
                >
                  <SelectTrigger size="sm" className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VALUE}>{t('fontRoles.styleDefault')}</SelectItem>
                    {Object.entries(FONTS).map(([key, f]) => (
                      <SelectItem key={key} value={key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{t('fields.baseColors')}</Label>
              <Switch
                checked={colors.enabled}
                onCheckedChange={(on) =>
                  patch({
                    colors: on
                      ? {
                          ...colors,
                          enabled: true,
                          bg: colors.bg || sc.bg,
                          fg: colors.fg || sc.fg,
                          sub: colors.sub || sc.sub,
                        }
                      : { ...colors, enabled: false },
                  })
                }
              />
            </div>
            {colors.enabled ? (
              <div className="grid grid-cols-3 gap-2">
                <ColorRow
                  label={t('colors.bg')}
                  value={colors.bg || sc.bg}
                  onChange={(hex) => setColor('bg', hex)}
                />
                <ColorRow
                  label={t('colors.fg')}
                  value={colors.fg || sc.fg}
                  onChange={(hex) => setColor('fg', hex)}
                />
                <ColorRow
                  label={t('colors.sub')}
                  value={colors.sub || sc.sub}
                  onChange={(hex) => setColor('sub', hex)}
                />
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{t('fields.accentColors')}</Label>
              <Switch
                checked={colors.accentOn}
                onCheckedChange={(on) =>
                  patch({
                    colors: on
                      ? {
                          ...colors,
                          accentOn: true,
                          accent: colors.accent || sc.accent,
                          ghostA: colors.ghostA || sc.ghostA,
                          ghostB: colors.ghostB || sc.ghostB,
                        }
                      : { ...colors, accentOn: false },
                  })
                }
              />
            </div>
            {colors.accentOn ? (
              <div className="grid grid-cols-3 gap-2">
                <ColorRow
                  label={t('colors.accent')}
                  value={colors.accent || sc.accent}
                  onChange={(hex) => setColor('accent', hex)}
                />
                <ColorRow
                  label={t('colors.ghostA')}
                  value={colors.ghostA || sc.ghostA}
                  onChange={(hex) => setColor('ghostA', hex)}
                />
                <ColorRow
                  label={t('colors.ghostB')}
                  value={colors.ghostB || sc.ghostB}
                  onChange={(hex) => setColor('ghostB', hex)}
                />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium">{t('fields.mood')}</Label>
            <Select
              value={project.mood ?? NO_VALUE}
              onValueChange={(v) => patch({ mood: v === NO_VALUE ? null : v })}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VALUE}>{t('mood.none')}</SelectItem>
                {MOOD_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`moods.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium">{t('fields.hud')}</Label>
            <Select
              value={fx.hud}
              onValueChange={(hud) => patchFx({ hud: hud as Project['fx']['hud'] })}
            >
              <SelectTrigger size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('hud.auto')}</SelectItem>
                <SelectItem value="on">{t('hud.on')}</SelectItem>
                <SelectItem value="off">{t('hud.off')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        <TabsContent value="lines" className="flex flex-col gap-3">
          <LineList
            plan={plan}
            lineTimes={timing.lineTimes}
            overrides={project.overrides}
            currentLine={currentLine}
            onSeek={onSeek}
            onSetLineTime={onSetLineTime}
            onSetLayout={onSetLayout}
            onReroll={onRerollLine}
            onToggleLock={onToggleLock}
            onClearTimes={onClearTimes}
          />
        </TabsContent>

        {simple ? null : (
          <TabsContent value="fx" className="flex flex-col gap-3">
            {(
              [
                ['motion', 1.5],
                ['glitch', 1.5],
                ['chroma', 1.5],
                ['decor', 1],
                ['density', 1],
                ['texture', 1],
                ['bgSwitch', 1],
              ] as const
            ).map(([key, max]) => (
              <SliderRow
                key={key}
                label={t(`fx.${key}`)}
                value={fx[key]}
                max={max}
                display={String(Math.round(fx[key] * 100))}
                onChange={(v) => patchFx({ [key]: v })}
              />
            ))}
            <div className="grid grid-cols-2 items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium">{t('fields.koma')}</Label>
                <Select
                  value={String(fx.koma)}
                  onValueChange={(v) => patchFx({ koma: Number(v), onTwos: Number(v) > 0 })}
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t('koma.every')}</SelectItem>
                    <SelectItem value="8">{t('koma.threes')}</SelectItem>
                    <SelectItem value="12">{t('koma.twos')}</SelectItem>
                    <SelectItem value="24">{t('koma.ones')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-2 pb-1">
                <Label className="text-xs font-medium">{t('fields.flash')}</Label>
                <Switch checked={fx.flash} onCheckedChange={(flash) => patchFx({ flash })} />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Field label={t('fields.seed')}>
                <Input
                  type="number"
                  value={project.seed}
                  onChange={(e) => patch({ seed: Math.trunc(Number(e.target.value) || 0) })}
                  className="h-8 font-mono text-xs"
                />
              </Field>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => patch({ seed: Math.floor(Math.random() * 1e9) })}
              >
                <Dices className="size-4" />
                {t('actions.reseed')}
              </Button>
            </div>
          </TabsContent>
        )}

        {simple ? null : (
          <TabsContent value="parts">
            <PartsPanel
              enabled={project.enabled}
              extra={project.extra}
              traditional={project.traditional}
              onFlags={patch}
              onSet={onSetPart}
              onBulk={onBulkParts}
            />
          </TabsContent>
        )}

        <TabsContent value="output" className="flex flex-col gap-3">
          <ExportPanel
            project={project}
            onPatch={patch}
            quality={quality}
            onQuality={setQuality}
            codecNote={codecNote}
            canMp4={canMp4}
            job={job}
            onExport={onExport}
            onCancel={onCancelExport}
          />
        </TabsContent>
      </Tabs>
    </ScrollArea>
  )
}
