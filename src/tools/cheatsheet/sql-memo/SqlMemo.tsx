import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { InstallGuide } from '@/components/install-guide'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  mysqlInstallGuide,
  postgresInstallGuide,
  sqlMemoGroups,
  type SqlMemoItem,
} from './sql-memo.service'

/** 一条语法：标题 + 可复制代码块 + 说明 +（可选）注意 / 方言差异 */
function MemoRow({ item }: { item: SqlMemoItem }) {
  const { t } = useTranslation('tools-cheatsheet')
  const ns = (key: string) => t(`sql-memo.${key}`)

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium">{ns(item.titleKey)}</span>
        <span className="text-muted-foreground text-xs">{ns(item.descKey)}</span>
      </div>
      <div className="relative min-w-0">
        <pre
          className={cn(
            'bg-muted/50 overflow-x-auto rounded-md border px-3 py-2 pr-10',
            'font-mono text-xs leading-relaxed',
          )}
        >
          {item.code}
        </pre>
        <SpanCopyable
          value={item.code}
          showText={false}
          className="bg-background/80 absolute top-1.5 right-1.5 px-1.5 py-0.5"
        />
      </div>
      {item.noteKey ? <p className="text-muted-foreground text-xs">⚠ {ns(item.noteKey)}</p> : null}
      {item.diffKey ? (
        <p className="text-muted-foreground text-xs">
          <span className="text-foreground/80">{ns('diffLabel')}</span>
          {ns(item.diffKey)}
        </p>
      ) : null}
    </div>
  )
}

export default function SqlMemo() {
  const { t } = useTranslation('tools-cheatsheet')

  return (
    <div className="flex flex-col gap-4">
      <InstallGuide
        ns="tools-cheatsheet"
        scope="sql-memo"
        title={t('sql-memo.group-mysql-install')}
        steps={mysqlInstallGuide}
      />
      <InstallGuide
        ns="tools-cheatsheet"
        scope="sql-memo"
        title={t('sql-memo.group-postgres-install')}
        steps={postgresInstallGuide}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sqlMemoGroups.map((group) => (
          <Card key={group.id} className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-baseline gap-2 text-base">
                <span className="flex-1">{t(`sql-memo.group-${group.id}`)}</span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {group.items.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {group.items.map((item) => (
                <MemoRow key={item.titleKey} item={item} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
