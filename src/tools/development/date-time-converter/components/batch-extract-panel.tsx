import { AlertCircle, Copy, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { IoCard } from '@/components/io-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCopy } from '@/composable/use-copy'

import {
  MAX_EXTRACTED_FIELDS,
  diffParts,
  extractTimeFields,
  serializeFields,
  sortFields,
  spanMs,
  type CopyFormat,
  type DetectedFormat,
  type InputFormat,
  type SortMode,
} from '../batch-extract.service'
import { Timeline } from './timeline'

const FORMAT_OPTIONS: readonly InputFormat[] = ['auto', 'json', 'yaml', 'xml', 'text']

/**
 * 批量时间戳提取：左侧贴 JSON / YAML / XML / 日志原文，右侧实时生成时间轴。
 *
 * 提取是纯函数，所以和「格式工作台」一样用 deferred 值驱动：粘贴几十万行时
 * 输入框仍然跟手，重活在停笔后的渲染里跑一次。
 */
export function BatchExtractPanel() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'date-time-converter.extract' })
  const { t: tCommon } = useTranslation('common')
  const { copy } = useCopy()

  const [input, setInput] = useState('')
  const [format, setFormat] = useState<InputFormat>('auto')
  const [sort, setSort] = useState<SortMode>('time')
  const [onlyNamed, setOnlyNamed] = useState(false)
  const [query, setQuery] = useState('')

  const deferredInput = useDeferredValue(input)

  const { result, error } = useMemo(() => {
    try {
      return { result: extractTimeFields(deferredInput, format), error: null as Error | null }
    } catch (err) {
      return { result: null, error: err instanceof Error ? err : new Error(String(err)) }
    }
  }, [deferredInput, format])

  const sorted = useMemo(() => sortFields(result?.fields ?? [], sort), [result, sort])
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return sorted.filter(
      (field) =>
        (!onlyNamed || field.named) &&
        (keyword === '' || field.path.toLowerCase().includes(keyword)),
    )
  }, [sorted, onlyNamed, query])

  const detected = result?.format ?? 'text'
  const isStructured = detected !== 'text'
  const isEmpty = deferredInput.trim() === ''

  const formatLabel = (value: DetectedFormat | InputFormat) =>
    value === 'auto' ? t('fmtAuto') : value === 'text' ? t('fmtText') : tCommon(`formats.${value}`)

  const durationOf = (ms: number) =>
    diffParts(ms)
      .map((part) => `${part.value}${t(part.unit)}`)
      .join(' ')

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{tCommon('error')}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="flex h-[26rem] flex-col gap-2 self-start xl:sticky xl:top-20 xl:h-[32rem]">
          <ToggleGroup
            type="single"
            size="sm"
            className="shrink-0"
            value={format}
            onValueChange={(next) => {
              if (next !== '') {
                setFormat(next as InputFormat)
              }
            }}
          >
            {FORMAT_OPTIONS.map((option) => (
              <ToggleGroupItem key={option} value={option}>
                {formatLabel(option)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="min-h-0 flex-1">
            <IoCard
              kind="input"
              floatingActions
              fillHeight
              tag={isEmpty ? undefined : formatLabel(detected)}
              value={input}
              placeholder={t('inputPlaceholder')}
              onValueChange={setInput}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {/* 常驻工具条：钉在 sticky 顶栏（h-14）下方，长列表滚动时排序 / 过滤 / 复制始终可达 */}
          <div className="bg-background/95 sticky top-14 z-10 -mb-3 flex flex-col gap-3 pb-3 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                <Stat label={t('count')} value={String(visible.length)} />
                <span aria-hidden="true">·</span>
                <Stat
                  label={t('span')}
                  value={
                    result && result.fields.length > 1
                      ? durationOf(spanMs(result.fields))
                      : t('none')
                  }
                />
                <span aria-hidden="true">·</span>
                <Stat label={t('detected')} value={isEmpty ? t('none') : formatLabel(detected)} />
              </div>
              <div className="flex items-center gap-1.5">
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={sort}
                  onValueChange={(next) => {
                    if (next !== '') {
                      setSort(next as SortMode)
                    }
                  }}
                >
                  <ToggleGroupItem value="time">{t('sortTime')}</ToggleGroupItem>
                  <ToggleGroupItem value="path">{t('sortPath')}</ToggleGroupItem>
                </ToggleGroup>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={visible.length === 0}
                    >
                      <Copy className="size-3.5" />
                      {t('copy')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(['json', 'tsv'] as const).map((kind: CopyFormat) => (
                      <DropdownMenuItem
                        key={kind}
                        onClick={() => void copy(serializeFields(visible, kind))}
                      >
                        {t(kind === 'json' ? 'copyJson' : 'copyTsv')}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="relative min-w-40 flex-1">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('filterPlaceholder')}
                  className="pl-8"
                  aria-label={t('filterPlaceholder')}
                />
              </div>
              <label className="flex shrink-0 items-center gap-2 text-xs">
                <Switch size="sm" checked={onlyNamed} onCheckedChange={setOnlyNamed} />
                {t('onlyNamed')}
              </label>
            </div>

            {result?.truncated && (
              <p className="text-muted-foreground text-xs">
                {t('truncated', { max: MAX_EXTRACTED_FIELDS })}
              </p>
            )}
          </div>

          {isEmpty ? (
            <p className="text-muted-foreground text-sm">{t('emptyInput')}</p>
          ) : visible.length > 0 ? (
            <Timeline
              fields={visible}
              orderedByTime={sort === 'time'}
              fromStructured={isStructured}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              {sorted.length === 0 ? t('emptyNone') : t('emptyFiltered')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <b className="text-foreground font-medium tabular-nums">{value}</b>
    </span>
  )
}
