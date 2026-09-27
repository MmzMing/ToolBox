import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CompareRow, LookupResult } from './dns-lookup.service'
import { compareSources } from './dns-lookup.service'

/** 多源并排：只比 value 集合，TTL 差异不算不一致（各源缓存时机必然不同） */
export function SourceCompare({ results }: { results: LookupResult[] }) {
  const { t } = useTranslation('tools-web', { keyPrefix: 'dns-lookup' })
  const rows = compareSources(results)

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('compareEmpty')}</p>
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">{t('columns.type')}</TableHead>
            {results.map((result) => (
              <TableHead key={result.sourceId}>{t(`sources.${result.sourceId}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: CompareRow) => (
            <TableRow
              key={row.type}
              className={cn(!row.consistent && row.checked && 'bg-destructive/10')}
            >
              <TableCell className="font-mono text-xs">{row.type}</TableCell>
              {row.cells.map((cell, index) => (
                <TableCell key={`${row.type}-${index}`} className="align-top">
                  {cell === undefined ? (
                    <span className="text-muted-foreground text-xs">{t('states.failed')}</span>
                  ) : cell === null ? (
                    <span className="text-muted-foreground text-xs">{t('states.empty')}</span>
                  ) : (
                    <span className="block font-mono text-xs break-all">
                      {cell.map((value) => (
                        <span key={value} className="block">
                          {value}
                        </span>
                      ))}
                    </span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-muted-foreground mt-2 text-xs">{t('compareNote')}</p>
    </div>
  )
}
