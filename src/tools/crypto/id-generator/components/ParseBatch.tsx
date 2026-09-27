import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { BatchReport } from '../parse.service'

import { formatTimestamp } from '../parse.service'

/** 粘贴上千行时表格 DOM 会明显变重，截到前 200 条，统计仍按全量算 */
const MAX_ROWS = 200

/** 批量校验：逐行判定 + 有效 / 无效 / 重复计数 */
export function ParseBatch({ report }: { report: BatchReport }) {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'id-generator' })
  const rows = report.lines.slice(0, MAX_ROWS)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('parse.batch-title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{t('parse.summary-total', { total: report.total })}</Badge>
          <Badge variant="secondary">{t('parse.summary-valid', { valid: report.valid })}</Badge>
          <Badge variant={report.invalid > 0 ? 'destructive' : 'secondary'}>
            {t('parse.summary-invalid', { invalid: report.invalid })}
          </Badge>
          <Badge variant={report.duplicates > 0 ? 'destructive' : 'secondary'}>
            {t('parse.summary-duplicates', { duplicates: report.duplicates })}
          </Badge>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('parse.col-value')}</TableHead>
              <TableHead>{t('parse.col-kind')}</TableHead>
              <TableHead>{t('parse.col-version')}</TableHead>
              <TableHead>{t('parse.col-time')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((line, index) => (
              <TableRow key={`${line.raw}-${index}`}>
                <TableCell className="max-w-[24rem] truncate font-mono text-xs">
                  {line.raw}
                </TableCell>
                <TableCell>{t(`parse.kind-${line.kind}`)}</TableCell>
                <TableCell className="tabular-nums">
                  {line.version === null ? '—' : `v${line.version}`}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {line.timestamp === null ? '—' : formatTimestamp(line.timestamp)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {report.lines.length > rows.length && (
          <p className="text-muted-foreground text-xs">
            {t('parse.row-limit', { shown: rows.length })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
