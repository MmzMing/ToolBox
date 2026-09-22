import { CalendarClock, RotateCcw, ArrowUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  dateToTs,
  formatLocalDateTime,
  toDatetimeLocalValue,
  tsToDate,
  type TimestampUnit,
} from './service'

function localInputValue(date: Date): string {
  return toDatetimeLocalValue(date)
}

function formatLocal(date: Date): string {
  return formatLocalDateTime(date)
}

/** 时间戳转换：顶部时间戳输入 + 单位，下方「日期时间 → 时间戳」「时间戳 → 日期时间」双卡片 */
export default function DateTimeConverter() {
  const { t } = useTranslation('tools-development')
  const { t: tCommon } = useTranslation('common')

  const [tsInput, setTsInput] = useState('')
  const [unit, setUnit] = useState<TimestampUnit>('s')
  const [dateValue, setDateValue] = useState('')
  const [tsFromDt, setTsFromDt] = useState('')

  const parsedTs = useMemo(() => {
    const trimmed = tsInput.trim()
    if (trimmed === '' || !/^\d+$/.test(trimmed)) {
      return null
    }
    /* 几百位数字会溢出成 Infinity，service 按契约抛错；渲染期抛错会整页白屏 */
    try {
      return tsToDate(Number(trimmed), unit)
    } catch {
      return null
    }
  }, [tsInput, unit])

  const parsedDate = useMemo(() => {
    if (dateValue.trim() === '') {
      return null
    }
    const date = new Date(dateValue)
    return Number.isNaN(date.getTime()) ? null : date
  }, [dateValue])

  const applyNow = () => {
    const now = new Date()
    setTsInput(String(unit === 's' ? Math.floor(now.getTime() / 1000) : now.getTime()))
    setDateValue(localInputValue(now))
    setTsFromDt(String(dateToTs(now, unit)))
  }

  const reset = () => {
    setTsInput('')
    setDateValue('')
    setTsFromDt('')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部：Unix 时间戳 + 单位 + 当前时间 + 转换 */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <Label>Unix {t('date-time-converter.tsLabel')}</Label>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5"
            onClick={reset}
          >
            <RotateCcw className="size-3.5" />
            {tCommon('reset')}
          </Button>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Input
            value={tsInput}
            onChange={(event) => setTsInput(event.target.value.replace(/[^\d]/g, ''))}
            placeholder="18256656315"
            className="font-mono md:flex-1"
            inputMode="numeric"
          />
          <div className="flex items-center gap-2">
            <Select value={unit} onValueChange={(value) => setUnit(value as TimestampUnit)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="s">{t('date-time-converter.unitS')}</SelectItem>
                <SelectItem value="ms">{t('date-time-converter.unitMs')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={applyNow}>
              {t('date-time-converter.nowBtn')}
            </Button>
            <Button
              onClick={() => {
                if (parsedTs) {
                  setDateValue(localInputValue(parsedTs))
                  setTsFromDt(String(dateToTs(parsedTs, unit)))
                }
              }}
              className="gap-1.5"
            >
              <ArrowUpDown className="size-4" />
              {t('date-time-converter.convertBtn')}
            </Button>
          </div>
        </div>
      </Card>

      {/* 双卡片：日期时间 → 时间戳 ｜ 时间戳 → 日期时间 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <Label>{t('date-time-converter.dtToTsLabel')}</Label>
            <Button
              variant="ghost"
              size="sm"
              disabled={!parsedDate}
              onClick={() => parsedDate && setTsFromDt(String(dateToTs(parsedDate, unit)))}
            >
              {t('date-time-converter.convertBtn')}
            </Button>
          </div>
          <Input
            type="datetime-local"
            value={dateValue}
            onChange={(event) => setDateValue(event.target.value)}
            className="font-mono"
          />
          <div className="bg-muted/40 rounded-md border px-3 py-2.5">
            {tsFromDt ? (
              <InputCopyable
                value={tsFromDt}
                readOnly
                className="border-0 bg-transparent font-mono"
              />
            ) : (
              <span className="text-muted-foreground text-sm">
                {t('date-time-converter.pickHint')}
              </span>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <Label>{t('date-time-converter.tsToDtLabel')}</Label>
            <span className="text-muted-foreground text-xs">
              {t('date-time-converter.localNote')}
            </span>
          </div>
          {parsedTs ? (
            <div className="bg-muted/40 rounded-md border px-3 py-2.5 font-mono text-sm">
              {formatLocal(parsedTs)}
            </div>
          ) : (
            <div className="text-muted-foreground bg-muted/40 rounded-md border px-3 py-2.5 text-sm">
              {t('date-time-converter.tsHint')}
            </div>
          )}
          <InputCopyable
            value={parsedTs ? parsedTs.toISOString() : ''}
            readOnly
            placeholder={tCommon('output')}
            className="font-mono"
          />
        </Card>
      </div>

      {/* 附加格式（相对时间 / UTC） */}
      {parsedTs && (
        <Card className="flex flex-col gap-2 p-4">
          <Label className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" />
            {t('date-time-converter.moreFormats')}
          </Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <InputCopyable
              value={parsedTs.toLocaleString()}
              readOnly
              aria-label={t('date-time-converter.localNote')}
            />
            <InputCopyable value={parsedTs.toUTCString()} readOnly aria-label="UTC" />
          </div>
        </Card>
      )}
    </div>
  )
}
