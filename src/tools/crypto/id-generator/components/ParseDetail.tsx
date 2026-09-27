import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import type { ParsedId } from '../parse.service'

import { formatTimestamp } from '../parse.service'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-36 shrink-0 text-xs">{label}</span>
      <InputCopyable value={value} readOnly className="min-w-0 flex-1 font-mono text-xs" />
    </div>
  )
}

/** 单个 ID 的完整反解：类型、版本、变体、字段切分与三种字节视图 */
export function ParseDetail({ value }: { value: ParsedId }) {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'id-generator' })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {t('parse.detail-title')}
          <Badge variant="secondary">{t(`parse.kind-${value.kind}`)}</Badge>
          {value.kind === 'uuid' && (
            <Badge variant="outline">{t('parse.version-value', { version: value.version })}</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {value.kind === 'uuid' ? (
            <>
              <Row label={t('parse.canonical')} value={value.canonical} />
              <Row label={t('parse.variant-label')} value={t(`parse.variant-${value.variant}`)} />
              <Row label={t('parse.raw-hex')} value={value.hex} />
            </>
          ) : (
            <>
              <Row label={t('parse.canonical')} value={value.value} />
              <Row label={t('parse.raw-hex')} value={value.hex} />
            </>
          )}
          <Row
            label={t('parse.time')}
            value={
              value.timestamp === null ? t('parse.time-unknown') : formatTimestamp(value.timestamp)
            }
          />
          <Row
            label={value.kind === 'uuid' ? t('parse.as-ulid') : t('parse.as-uuid')}
            value={value.kind === 'uuid' ? value.ulidForm : value.uuidForm}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">{t('parse.fields-title')}</p>
          {value.kind === 'uuid' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Row label={`${t('parse.field-timeLow')} (32)`} value={value.fields.timeLow} />
              <Row label={`${t('parse.field-timeMid')} (16)`} value={value.fields.timeMid} />
              <Row
                label={`${t('parse.field-timeHiAndVersion')} (16)`}
                value={value.fields.timeHiAndVersion}
              />
              <Row label={`${t('parse.field-clockSeq')} (16)`} value={value.fields.clockSeq} />
              <Row label={`${t('parse.field-node')} (48)`} value={value.fields.node} />
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Row label={`${t('parse.field-ulidTime')} (48)`} value={value.value.slice(0, 10)} />
              <Row label={`${t('parse.field-ulidRandom')} (80)`} value={value.value.slice(10)} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">{t('parse.binary')}</p>
          <TextareaCopyable value={value.binary} rows={3} className="font-mono" />
          <Row label={t('parse.base64url')} value={value.base64url} />
        </div>
      </CardContent>
    </Card>
  )
}
