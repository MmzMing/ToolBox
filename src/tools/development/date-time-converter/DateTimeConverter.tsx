import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { BatchExtractPanel } from './components/batch-extract-panel'
import { ConvertPanel } from './components/convert-panel'

/** 时间戳工作台：单值互转与「批量提取 + 时间轴」两页签 */
export default function DateTimeConverter() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'date-time-converter' })

  return (
    <Tabs defaultValue="convert" className="gap-4">
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="convert">{t('tabConvert')}</TabsTrigger>
        <TabsTrigger value="extract">{t('tabExtract')}</TabsTrigger>
      </TabsList>

      {/* forceMount：切走时保留各自的输入，来回对比不用重新粘贴 */}
      <TabsContent value="convert" forceMount className="data-[state=inactive]:hidden">
        <ConvertPanel />
      </TabsContent>
      <TabsContent value="extract" forceMount className="data-[state=inactive]:hidden">
        <BatchExtractPanel />
      </TabsContent>
    </Tabs>
  )
}
