import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  formatTtl,
  isDomainMissing,
  isSourceUnreachable,
  recordLine,
  relativeLabel,
  type DnsRecord,
  type LookupResult,
  type TypeResult,
} from './dns-lookup.service'

export type RecordGroup = TypeResult & { kind: 'records' }

/** 走 CNAME 链拿到的地址，owner 是目标主机名；对使用者而言它就是查询名本身 */
function hostLabel(record: DnsRecord, domain: string, group: RecordGroup): string {
  if (group.cnameVia?.includes(record.name)) {
    return '@'
  }
  return relativeLabel(record.name, domain)
}

/** 9 类记录合成一张表：类型列用 rowSpan 分组，避免每个类型重复一套表头 */
export function RecordsTable({ domain, groups }: { domain: string; groups: RecordGroup[] }) {
  const { t } = useTranslation('tools-web', { keyPrefix: 'dns-lookup' })
  const rows = groups
    .filter((group) => group.type !== 'SOA')
    .flatMap((group) =>
      group.records.map((record, index) => ({
        group,
        record,
        key: `${group.type}-${index}`,
        first: index === 0,
      })),
    )

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">{t('columns.type')}</TableHead>
            <TableHead className="w-28">{t('columns.label')}</TableHead>
            <TableHead className="w-14">{t('columns.ttl')}</TableHead>
            <TableHead className="min-w-0">{t('columns.value')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ group, record, key, first }) => (
            <TableRow key={key} className={cn(first && 'border-t-2')}>
              {first && (
                <TableCell rowSpan={group.records.length} className="align-middle">
                  <span
                    className="font-mono text-xs font-semibold"
                    title={t(`typeHint.${group.type}`)}
                  >
                    {group.type}
                  </span>
                  {group.records.length > 1 && (
                    <span className="text-muted-foreground ml-1 text-xs">
                      {group.records.length}
                    </span>
                  )}
                  {group.truncated && (
                    <div className="mt-1">
                      <Badge variant="destructive">{t('truncated')}</Badge>
                    </div>
                  )}
                </TableCell>
              )}
              <TableCell
                className="text-muted-foreground max-w-28 truncate font-mono text-xs"
                title={record.name}
              >
                {hostLabel(record, domain, group)}
              </TableCell>
              <TableCell
                className="text-muted-foreground whitespace-nowrap"
                title={`${record.ttl}s`}
              >
                {formatTtl(record.ttl)}
              </TableCell>
              <TableCell className="min-w-0">
                <SpanCopyable
                  value={recordLine(group.type, record)}
                  className={cn(
                    'hover:bg-muted max-w-full justify-start bg-transparent px-1',
                    // 记录值要能读全（SPF/TXT 长串截断就没法核对），只留 hover 复制的交互
                    '[&>span]:overflow-visible [&>span]:break-all [&>span]:whitespace-normal',
                  )}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** SOA 是单条七字段记录，塞进表格会让一行撑成七列，单独给一张小卡 */
export function SoaCard({ group }: { group: RecordGroup }) {
  const { t } = useTranslation('tools-web', { keyPrefix: 'dns-lookup' })
  const record = group.records[0]
  if (record === undefined) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-semibold">SOA</span>
        <span className="text-muted-foreground text-xs">{t('typeHint.SOA')}</span>
      </div>
      {record.soa === undefined ? (
        <SpanCopyable value={record.value} className="justify-start" />
      ) : (
        <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border md:grid-cols-4">
          {(
            [
              ['mname', record.soa.mname],
              ['rname', record.soa.rname],
              ['serial', record.soa.serial],
              ['refresh', `${formatTtl(record.soa.refresh)}`],
              ['retry', `${formatTtl(record.soa.retry)}`],
              ['expire', `${formatTtl(record.soa.expire)}`],
              ['minimum', `${formatTtl(record.soa.minimum)}`],
            ] as const
          ).map(([key, shown]) => (
            <div key={key} className="bg-card min-w-0 p-2">
              <div className="text-muted-foreground truncate text-xs">{t(`soa.${key}`)}</div>
              <div className="mt-1 font-mono text-xs break-all">{shown}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 无记录 / 不存在的类型压成一行摘要，失败的类型带原因 */
export function StatusChips({ entries }: { entries: TypeResult[] }) {
  const { t } = useTranslation('tools-web', { keyPrefix: 'dns-lookup' })
  if (entries.length === 0) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-muted-foreground text-xs">{t('otherTypes')}</span>
      {entries.map((entry) => (
        <span
          key={entry.type}
          className="border-border text-muted-foreground rounded-md border px-1.5 py-0.5 font-mono text-xs"
        >
          {entry.type}
          <span className="ml-1 font-sans">{t(`states.${entry.kind}`)}</span>
        </span>
      ))}
    </div>
  )
}

export function ResultSummary({ result }: { result: LookupResult }) {
  const { t } = useTranslation('tools-web', { keyPrefix: 'dns-lookup' })
  if (isSourceUnreachable(result)) {
    return <p className="text-destructive text-sm">{t('states.unreachable')}</p>
  }
  if (isDomainMissing(result)) {
    return <p className="text-sm">{t('states.nxdomainNotice', { domain: result.domain })}</p>
  }
  return null
}

/** 别名链在概览里说一次即可，不必每个类型重复 */
export function AliasNote({ groups }: { groups: RecordGroup[] }) {
  const { t } = useTranslation('tools-web', { keyPrefix: 'dns-lookup' })
  const chain = groups.find((group) => group.cnameVia !== undefined)?.cnameVia
  if (chain === undefined || chain.length === 0) {
    return null
  }
  return (
    <p className="text-muted-foreground text-xs">
      {t('cnameVia')} <span className="font-mono">{chain.join(' → ')}</span>
    </p>
  )
}
