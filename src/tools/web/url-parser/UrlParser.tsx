import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { parseUrl, type ParsedUrl } from './url-parser.service'

const urlFields = [
  'href',
  'protocol',
  'host',
  'hostname',
  'port',
  'pathname',
  'search',
  'hash',
  'origin',
] as const

export default function UrlParser() {
  const { t } = useTranslation('tools-web')

  const [input, setInput] = useState('')

  const result = useMemo<{ parsed: ParsedUrl | null; error: string | null }>(() => {
    if (input === '') {
      return { parsed: null, error: null }
    }
    try {
      return { parsed: parseUrl(input), error: null }
    } catch (err) {
      return { parsed: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [input])
  const parsed = result.parsed

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('url-parser.urlLabel')}</Label>
        <InputCopyable
          value={input}
          onValueChange={setInput}
          placeholder="https://example.com:8443/path/to?page=1&q=中文#top"
          className="font-mono text-sm"
        />
      </div>

      {result.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {parsed && (
        <>
          <Table>
            <TableBody>
              {urlFields.map((field) => (
                <TableRow key={field}>
                  <TableCell className="w-40 font-medium">{field}</TableCell>
                  <TableCell>
                    <SpanCopyable value={parsed[field]} className="max-w-full" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-2">
            <Label>{t('url-parser.paramsLabel')}</Label>
            {parsed.searchParams.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('url-parser.noParams')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/3">{t('url-parser.paramName')}</TableHead>
                    <TableHead>{t('url-parser.paramValue')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.searchParams.map((param, index) => (
                    <TableRow key={`${param.name}-${index}`}>
                      <TableCell>
                        <SpanCopyable value={param.name} />
                      </TableCell>
                      <TableCell>
                        <SpanCopyable value={param.value} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
