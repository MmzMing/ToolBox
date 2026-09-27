import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { Finding, FindingLevel } from './dns-lookup.service'

const LEVEL_VARIANT: Record<FindingLevel, 'destructive' | 'secondary' | 'outline'> = {
  error: 'destructive',
  warn: 'secondary',
  info: 'outline',
}

/** 体检结论：只判定确定性事实，文案统一标注为参考 */
export function DiagnosisPanel({ findings }: { findings: Finding[] }) {
  const { t } = useTranslation('tools-web', { keyPrefix: 'dns-lookup' })

  if (findings.length === 0) {
    return null
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('diagnosisTitle')}</h2>
        <span className="text-muted-foreground text-xs">{t('diagnosisNote')}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {findings.map((finding) => (
          <li key={finding.key} className="border-border rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={LEVEL_VARIANT[finding.level]}>{t(`levels.${finding.level}`)}</Badge>
              <span className="text-sm font-medium">{t(`findings.${finding.key}.title`)}</span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {t(`findings.${finding.key}.detail`)}
            </p>
            {finding.evidence.length > 0 && (
              <ul className="bg-muted mt-2 flex flex-col gap-1 rounded-md p-2">
                {finding.evidence.map((line) => (
                  <li key={line} className="font-mono text-xs break-all">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
