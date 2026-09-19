import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getReasonPhrase,
  statusGroupKeys,
  statusesByGroup,
  type StatusGroupKey,
} from './http-status-codes.service'

export default function HttpStatusCodes() {
  const { t } = useTranslation('tools-cheatsheet')

  return (
    <Tabs defaultValue="informational" className="gap-4">
      <TabsList>
        {statusGroupKeys.map((group: StatusGroupKey) => (
          <TabsTrigger key={group} value={group}>
            {t(`http-status-codes.group-${group}`)}
          </TabsTrigger>
        ))}
      </TabsList>

      {statusGroupKeys.map((group: StatusGroupKey) => (
        <TabsContent key={group} value={group} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {statusesByGroup(group).map((entry) => {
            const reasonPhrase = getReasonPhrase(entry.code)
            return (
              <Card key={entry.code} size="sm" className="gap-2 py-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="font-mono text-lg font-semibold">{entry.code}</span>
                    {reasonPhrase !== null && (
                      <span className="text-muted-foreground font-mono text-xs">
                        {reasonPhrase}
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {t(`http-status-codes.status-${entry.nameKey}`)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  {t(`http-status-codes.desc-${entry.nameKey}`)}
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>
      ))}
    </Tabs>
  )
}
