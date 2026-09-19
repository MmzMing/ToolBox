import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { regexMemoGroups } from './regex-memo.service'

export default function RegexMemo() {
  const { t } = useTranslation('tools-cheatsheet')

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {regexMemoGroups.map((group) => (
        <Card key={group.id}>
          <CardHeader>
            <CardTitle className="text-base">{t(`regex-memo.group-${group.id}`)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-2/5">{t('regex-memo.patternColumn')}</TableHead>
                  <TableHead>{t('regex-memo.descriptionColumn')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.map((item) => (
                  <TableRow key={item.descriptionKey}>
                    <TableCell>
                      <SpanCopyable value={item.pattern} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {t(`regex-memo.${item.descriptionKey}`)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
