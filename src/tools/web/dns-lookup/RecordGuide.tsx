import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'
import { RECORD_TYPES } from './dns-lookup.service'

/** 说明卡与查询的类型同源，新增记录类型时不会漏写卡片 */
const GUIDE_ITEMS: readonly string[] = [...RECORD_TYPES.map((spec) => spec.key), 'usage']

/** 记录类型科普：查询结果里的每个类型在这里都有对应的说明 */
export function RecordGuide() {
  const { t } = useTranslation('tools-web', { keyPrefix: 'dns-lookup.guide' })

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GUIDE_ITEMS.map((item) => (
          <div key={item} className="border-border rounded-lg border p-3">
            <div className="text-sm font-medium">{t(`${item}.name`)}</div>
            <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
              {t(`${item}.description`)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}
