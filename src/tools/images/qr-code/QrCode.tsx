import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { DetectPanel } from './components/detect-panel'
import { GeneratePanel } from './components/generate-panel'

const tabs = ['generate', 'detect'] as const

type TabValue = (typeof tabs)[number]

/** 二维码转换：文本 → 二维码，二维码图片 → 文本，两个方向同页互切 */
export default function QrCode() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'qr-code' })
  const [tab, setTab] = useState<TabValue>('generate')

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)} className="gap-4">
      <TabsList className="w-full sm:w-fit">
        {tabs.map((value) => (
          <TabsTrigger key={value} value={value}>
            {t(`tab-${value}`)}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* forceMount：切走时保留各自输入，来回对比不用重新填写 */}
      <TabsContent value="generate" forceMount className="data-[state=inactive]:hidden">
        <GeneratePanel />
      </TabsContent>
      <TabsContent value="detect" forceMount className="data-[state=inactive]:hidden">
        <DetectPanel active={tab === 'detect'} />
      </TabsContent>
    </Tabs>
  )
}
