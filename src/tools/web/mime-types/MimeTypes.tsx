import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { SpanCopyable } from '@/components/copyable/span-copyable'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { commonMimeTypes, getExtensions, getMimeType } from './mime-types.service'

export default function MimeTypes() {
  const { t } = useTranslation('tools-web')

  const [extension, setExtension] = useState('')
  const [mime, setMime] = useState('')

  const resolvedMime = useMemo(() => getMimeType(extension), [extension])
  const resolvedExtensions = useMemo(() => (mime === '' ? [] : getExtensions(mime)), [mime])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="mime-ext-input">{t('mime-types.extensionToMime')}</Label>
          <InputCopyable
            id="mime-ext-input"
            value={extension}
            onValueChange={setExtension}
            placeholder="png"
            className="font-mono text-sm"
            autoComplete="off"
          />
          {extension !== '' &&
            (resolvedMime === null ? (
              <p className="text-muted-foreground text-sm">{t('mime-types.noResult')}</p>
            ) : (
              <SpanCopyable value={resolvedMime} className="max-w-full font-mono" />
            ))}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="mime-mime-input">{t('mime-types.mimeToExtensions')}</Label>
          <InputCopyable
            id="mime-mime-input"
            value={mime}
            onValueChange={setMime}
            placeholder="image/png"
            className="font-mono text-sm"
            autoComplete="off"
          />
          {mime !== '' &&
            (resolvedExtensions.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('mime-types.noResult')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {resolvedExtensions.map((item) => (
                  <SpanCopyable key={item} value={item} />
                ))}
              </div>
            ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('mime-types.commonTableTitle')}</Label>
        <div className="max-h-96 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-background sticky top-0">
              <TableRow>
                <TableHead className="w-1/3">{t('mime-types.extensionColumn')}</TableHead>
                <TableHead>{t('mime-types.mimeColumn')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commonMimeTypes.map((mapping) => (
                <TableRow key={mapping.extension}>
                  <TableCell>
                    <SpanCopyable value={mapping.extension} />
                  </TableCell>
                  <TableCell>
                    <SpanCopyable value={mapping.mime} className="max-w-full" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
