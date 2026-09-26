import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { InstallGuide } from '@/components/install-guide'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { nvmInstallGuide, nvmMemoGroups } from './nvm-memo.service'

export default function NvmMemo() {
  const { t } = useTranslation('tools-cheatsheet')

  return (
    <div className="flex flex-col gap-4">
      <InstallGuide
        ns="tools-cheatsheet"
        scope="nvm-memo"
        title={t('nvm-memo.group-install')}
        steps={nvmInstallGuide}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {nvmMemoGroups.map((group) => (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle className="text-base">{t(`nvm-memo.group-${group.id}`)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {group.items.map((item) => (
                <div
                  key={item.descriptionKey}
                  className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
                >
                  <SpanCopyable value={item.command} className="max-w-full shrink-0 sm:max-w-72" />
                  <span className="text-muted-foreground text-sm">
                    {t(`nvm-memo.${item.descriptionKey}`)}
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
