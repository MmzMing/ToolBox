import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  analyseJwtClaims,
  decodeJwt,
  getJwtAlgorithm,
  isJwtExpired,
  type JwtParts,
} from './jwt-parser.service'

export default function JwtParser() {
  const { t } = useTranslation('tools-web')

  const [token, setToken] = useState('')

  const result = useMemo<{ parts: JwtParts | null; error: string | null }>(() => {
    if (token.trim() === '') {
      return { parts: null, error: null }
    }
    try {
      return { parts: decodeJwt(token), error: null }
    } catch (err) {
      return { parts: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [token])
  const parts = result.parts

  const headerJson = useMemo(
    () => (parts === null ? '' : JSON.stringify(parts.header, null, 2)),
    [parts],
  )
  const payloadJson = useMemo(
    () => (parts === null ? '' : JSON.stringify(parts.payload, null, 2)),
    [parts],
  )
  const claims = useMemo(() => (parts === null ? [] : analyseJwtClaims(parts.payload)), [parts])
  const algorithm = parts === null ? null : getJwtAlgorithm(parts.header)
  const expiry = useMemo(() => (parts === null ? null : isJwtExpired(parts.payload)), [parts])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="jwt-token">{t('jwt-parser.tokenLabel')}</Label>
        <Textarea
          id="jwt-token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOi…"
          className="min-h-24 font-mono text-sm break-all"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {result.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {parts && (
        <>
          <div className="flex flex-col gap-2">
            <Label>{t('jwt-parser.headerLabel')}</Label>
            <TextareaCopyable value={headerJson} highlight language="json" rows={4} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('jwt-parser.payloadLabel')}</Label>
            <TextareaCopyable value={payloadJson} highlight language="json" rows={6} />
          </div>

          {claims.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>{t('jwt-parser.claimsLabel')}</Label>
              <Table>
                <TableBody>
                  {claims.map((claim) => (
                    <TableRow key={claim.key}>
                      <TableCell className="w-40 font-medium">
                        <SpanCopyable value={claim.key} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <SpanCopyable value={claim.value} className="max-w-full" />
                          {claim.kind === 'date' && (
                            <Badge variant="secondary">{t('jwt-parser.dateClaim')}</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>{t('jwt-parser.signatureLabel')}</Label>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="w-40 font-medium">
                    {t('jwt-parser.algorithmLabel')}
                  </TableCell>
                  <TableCell>
                    {algorithm === null ? (
                      <span className="text-muted-foreground text-sm">
                        {t('jwt-parser.algorithmUnknown')}
                      </span>
                    ) : (
                      <SpanCopyable value={algorithm} />
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{t('jwt-parser.expiryLabel')}</TableCell>
                  <TableCell>
                    {expiry === null ? (
                      <span className="text-muted-foreground text-sm">
                        {t('jwt-parser.expiryNoExp')}
                      </span>
                    ) : expiry ? (
                      <Badge variant="destructive">{t('jwt-parser.expiryExpired')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('jwt-parser.expiryValid')}</Badge>
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{t('jwt-parser.signaturePart')}</TableCell>
                  <TableCell>
                    <SpanCopyable value={parts.signature} className="max-w-full" />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
