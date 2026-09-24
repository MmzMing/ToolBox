/**
 * 导出面板：输出参数 + 编码器说明 + MP4 / PNG / 透明 PNG。
 *
 * 编码器说明必须异步探测（VideoEncoder.isConfigSupported），
 * 不然用户点了按钮才知道浏览器不支持。
 */
import { Download, Film, Images } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { AspectKey, Project } from '../engine/types'
import type { Quality } from '../engine/export'

const ASPECTS: readonly AspectKey[] = ['16:9', '9:16', '1:1', '4:5', '21:9', '4:3', '3:4']

type ExportPanelProps = {
  project: Project
  onPatch: (part: Partial<Project>) => void
  quality: Quality
  onQuality: (q: Quality) => void
  codecNote: string
  canMp4: boolean
  job: { progress: number; text: string } | null
  onExport: (kind: 'mp4' | 'png' | 'pnga') => void
  onCancel: () => void
}

export function ExportPanel({
  project,
  onPatch,
  quality,
  onQuality,
  codecNote,
  canMp4,
  job,
  onExport,
  onCancel,
}: ExportPanelProps) {
  const { t } = useTranslation('tools-video', { keyPrefix: 'music-to-video' })
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium">{t('fields.aspect')}</Label>
          <Select
            value={project.aspect}
            onValueChange={(aspect) => onPatch({ aspect: aspect as AspectKey })}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECTS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium">{t('fields.res')}</Label>
          <Select
            value={String(project.res)}
            onValueChange={(res) => onPatch({ res: Number(res) })}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[720, 1080, 1440, 2160].map((r) => (
                <SelectItem key={r} value={String(r)}>
                  {r >= 2160 ? `4K` : `${r}p`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium">{t('fields.fps')}</Label>
          <Select
            value={String(project.fps)}
            onValueChange={(fps) => onPatch({ fps: Number(fps) })}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[24, 30, 60].map((f) => (
                <SelectItem key={f} value={String(f)}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs font-medium">{t('fields.quality')}</Label>
        <Select value={quality} onValueChange={(q) => onQuality(q as Quality)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="max">{t('quality.max')}</SelectItem>
            <SelectItem value="high">{t('quality.high')}</SelectItem>
            <SelectItem value="standard">{t('quality.standard')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium">{t('fields.includeAudio')}</Label>
        <Switch
          checked={project.includeAudio}
          onCheckedChange={(includeAudio) => onPatch({ includeAudio })}
        />
      </div>

      <p className="text-muted-foreground text-[11px] leading-4">{codecNote}</p>

      {job ? (
        <div className="border-input flex flex-col gap-1.5 rounded-md border p-2">
          <Progress value={job.progress * 100} className="h-1.5" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-[11px]">{job.text}</span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onCancel}>
              {t('actions.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-1.5">
        <Button disabled={!!job} onClick={() => onExport('mp4')}>
          <Film className="size-4" />
          {t('actions.exportMp4')}
        </Button>
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" disabled={!!job} onClick={() => onExport('png')}>
            <Images className="size-4" />
            {t('actions.exportPng')}
          </Button>
          <Button variant="outline" disabled={!!job} onClick={() => onExport('pnga')}>
            <Download className="size-4" />
            {t('actions.exportAlpha')}
          </Button>
        </div>
      </div>
      {!canMp4 ? <p className="text-destructive text-[11px]">{t('errors.noWebCodecs')}</p> : null}
    </div>
  )
}
