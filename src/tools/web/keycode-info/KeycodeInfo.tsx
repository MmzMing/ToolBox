import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { buildKeyInfo, commonKeys, type KeyInfo } from './keycode-info.service'

export default function KeycodeInfo() {
  const { t } = useTranslation('tools-web')

  const [isFocused, setIsFocused] = useState(false)
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    setKeyInfo(
      buildKeyInfo({
        key: event.key,
        code: event.code,
        keyCode: event.keyCode,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      }),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('keycode-info.captureTitle')}</Label>
        <div
          tabIndex={0}
          role="button"
          aria-label={t('keycode-info.captureTitle')}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={`focus-visible:ring-ring flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-4 text-center transition-colors outline-none focus-visible:ring-2 ${
            isFocused ? 'border-primary bg-muted/40' : ''
          }`}
        >
          {keyInfo === null ? (
            <p className="text-muted-foreground text-sm">{t('keycode-info.captureEmpty')}</p>
          ) : (
            <>
              <p className="font-mono text-2xl font-semibold">{keyInfo.key}</p>
              <p className="text-muted-foreground font-mono text-sm">
                {keyInfo.code} · keyCode {keyInfo.keyCode}
              </p>
            </>
          )}
        </div>
        <p className="text-muted-foreground text-sm">{t('keycode-info.captureHint')}</p>
      </div>

      {keyInfo !== null && (
        <div className="flex flex-col gap-2">
          <Label>{t('keycode-info.modifiersLabel')}</Label>
          {keyInfo.modifiers.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('keycode-info.noModifiers')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {keyInfo.modifiers.map((modifier) => (
                <Badge key={modifier} variant="secondary">
                  {t(`keycode-info.mod-${modifier}`)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('keycode-info.commonTableTitle')}</Label>
        <div className="max-h-96 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-background sticky top-0">
              <TableRow>
                <TableHead className="w-1/3">{t('keycode-info.keyColumn')}</TableHead>
                <TableHead className="w-1/3">{t('keycode-info.codeColumn')}</TableHead>
                <TableHead>{t('keycode-info.keyCodeColumn')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commonKeys.map((entry) => (
                <TableRow key={entry.code}>
                  <TableCell className="font-mono">
                    {entry.key === ' ' ? t('keycode-info.spaceKey') : entry.key}
                  </TableCell>
                  <TableCell className="font-mono">{entry.code}</TableCell>
                  <TableCell className="font-mono">{entry.keyCode}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
