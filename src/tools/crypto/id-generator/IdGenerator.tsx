import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ParsePanel } from './components/ParsePanel'
import { UlidPanel } from './components/UlidPanel'
import { UuidPanel } from './components/UuidPanel'

const panels = [
  { id: 'uuid', Panel: UuidPanel },
  { id: 'ulid', Panel: UlidPanel },
  { id: 'parse', Panel: ParsePanel },
] as const

/** 标识符工作台：UUID / ULID 生成与 ID 解析三合一，Tab 切换 */
export default function IdGenerator() {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'id-generator' })

  return (
    <Tabs defaultValue="uuid" className="gap-4">
      <TabsList className="w-full sm:w-fit">
        {panels.map(({ id }) => (
          <TabsTrigger key={id} value={id}>
            {t(`tab-${id}`)}
          </TabsTrigger>
        ))}
      </TabsList>

      {panels.map(({ id, Panel }) => (
        // forceMount：切走时保留各自已生成的素材，回来不用重新生成
        <TabsContent key={id} value={id} forceMount className="data-[state=inactive]:hidden">
          <Panel />
        </TabsContent>
      ))}
    </Tabs>
  )
}
