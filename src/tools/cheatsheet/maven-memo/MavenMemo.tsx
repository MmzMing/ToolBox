import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { InstallGuide } from '@/components/install-guide'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { mavenInstallGuide, mavenMemoGroups } from './maven-memo.service'

export default function MavenMemo() {
  const { t } = useTranslation('tools-cheatsheet')

  return (
    <div className="flex flex-col gap-4">
      <InstallGuide
        ns="tools-cheatsheet"
        scope="maven-memo"
        title={t('maven-memo.group-install')}
        steps={mavenInstallGuide}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {mavenMemoGroups.map((group) => (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle className="text-base">{t(`maven-memo.group-${group.id}`)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {group.items.map((item) => (
                <div
                  key={item.descriptionKey}
                  className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
                >
                  <SpanCopyable value={item.command} className="max-w-full shrink-0 sm:max-w-80" />
                  <span className="text-muted-foreground text-sm">
                    {t(`maven-memo.${item.descriptionKey}`)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
