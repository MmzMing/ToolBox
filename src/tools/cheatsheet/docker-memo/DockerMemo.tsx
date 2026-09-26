import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { InstallGuide } from '@/components/install-guide'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  dockerLinuxGuide,
  dockerMemoGroups,
  dockerWindowsGuide,
  panelInstallGuide,
} from './docker-memo.service'

export default function DockerMemo() {
  const { t } = useTranslation('tools-cheatsheet')

  return (
    <div className="flex flex-col gap-4">
      <InstallGuide
        ns="tools-cheatsheet"
        scope="docker-memo"
        title={t('docker-memo.group-linux')}
        steps={dockerLinuxGuide}
      />
      <InstallGuide
        ns="tools-cheatsheet"
        scope="docker-memo"
        title={t('docker-memo.group-windows')}
        steps={dockerWindowsGuide}
      />
      <InstallGuide
        ns="tools-cheatsheet"
        scope="docker-memo"
        title={t('docker-memo.group-panel')}
        steps={panelInstallGuide}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {dockerMemoGroups.map((group) => (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle className="text-base">{t(`docker-memo.group-cmd-${group.id}`)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {group.items.map((item) => (
                <div
                  key={item.descriptionKey}
                  className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
                >
                  <SpanCopyable value={item.command} className="max-w-full shrink-0 sm:max-w-80" />
                  <span className="text-muted-foreground text-sm">
                    {t(`docker-memo.${item.descriptionKey}`)}
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
