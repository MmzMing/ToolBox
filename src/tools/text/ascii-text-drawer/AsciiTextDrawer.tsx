import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { availableFonts, drawAscii, type AsciiFont } from './ascii-text-drawer.service'

/** 把 service 抛出的英文技术错误映射为 i18n 键 */
function toErrorKey(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('Unsupported font')) {
    return 'ascii-text-drawer.errorFont'
  }
  if (message.includes('printable')) {
    return 'ascii-text-drawer.errorCharset'
  }
  return 'ascii-text-drawer.errorEmpty'
}

export default function AsciiTextDrawer() {
  const { t } = useTranslation('tools-text')

  const [text, setText] = useState('HI')
  const [font, setFont] = useState<AsciiFont>('Standard')
  const [result, setResult] = useState('')
  const [error, setError] = useState<string | null>(null)

  const trimmed = useMemo(() => text.trim(), [text])

  useEffect(() => {
    let cancelled = false
    drawAscii(trimmed, font)
      .then((art) => {
        if (!cancelled) {
          setResult(art)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult('')
          setError(t(toErrorKey(err)))
        }
      })
    return () => {
      cancelled = true
    }
  }, [trimmed, font, t])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="ascii-text-input">{t('ascii-text-drawer.textLabel')}</Label>
          <Input
            id="ascii-text-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Hello"
            className="font-mono"
          />
        </div>

        <div className="flex flex-col gap-2 sm:w-56">
          <Label>{t('ascii-text-drawer.fontLabel')}</Label>
          <Select value={font} onValueChange={(value) => setFont(value as AsciiFont)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableFonts.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('common:output')}</Label>
        <TextareaCopyable value={result} rows={8} className="font-mono text-xs" />
      </div>
    </div>
  )
}
