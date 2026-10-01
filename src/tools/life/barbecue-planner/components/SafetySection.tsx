import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CORE_TEMPS, INGREDIENT_BY_ID } from '../data/index'
import type { BarbecuePlan } from '../types'

/** 只列出本桌真的会烤到的肉种，避免一张与你的菜单无关的温度表。 */
function usedCoreTempIds(plan: BarbecuePlan): Set<string> {
  const ids = new Set<string>()
  for (const group of plan.shopping.groups) {
    for (const line of group.lines) {
      const coreTempId = INGREDIENT_BY_ID[line.ingredientId]?.coreTempId
      if (coreTempId) {
        ids.add(coreTempId)
      }
    }
  }
  return ids
}

export function SafetySection({ plan, lang }: { plan: BarbecuePlan; lang: 'zh' | 'en' }) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const used = usedCoreTempIds(plan)
  const rows = CORE_TEMPS.filter((entry) => used.has(entry.id))

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <Card className="overflow-hidden rounded-xl p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('safety.meat')}</TableHead>
                <TableHead>{t('safety.form')}</TableHead>
                <TableHead className="text-right">{t('safety.tempC')}</TableHead>
                <TableHead className="text-right">{t('safety.rest')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm">{entry.meat[lang]}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {entry.form[lang]}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {entry.tempC} ℃
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {entry.restMin > 0 ? `${entry.restMin} min` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {plan.safety.map((notice) => (
          <Card key={notice.id} className="flex flex-col gap-1.5 rounded-xl p-4">
            <h4 className="text-sm font-semibold">{notice.title[lang]}</h4>
            <p className="text-muted-foreground text-xs leading-relaxed">{notice.body[lang]}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
