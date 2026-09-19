import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { Base64Panel } from './components/base64-panel'
import { BinaryPanel } from './components/binary-panel'
import { JwtPanel } from './components/jwt-panel'
import { UnicodePanel } from './components/unicode-panel'
import { UrlPanel } from './components/url-panel'

const panels = [
  { id: 'base64', Panel: Base64Panel },
  { id: 'jwt', Panel: JwtPanel },
  { id: 'url', Panel: UrlPanel },
  { id: 'unicode', Panel: UnicodePanel },
  { id: 'binary', Panel: BinaryPanel },
] as const

/** 编解码工作台：Base64 / JWT / URL / Unicode / 二进制 五合一，Tab 切换 */
export default function EncoderDecoder() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'encoder-decoder' })

  return (
    <Tabs defaultValue="base64" className="gap-4">
      <TabsList className="w-full sm:w-fit">
        {panels.map(({ id }) => (
          <TabsTrigger key={id} value={id}>
            {t(`tab-${id}`)}
          </TabsTrigger>
        ))}
      </TabsList>

      {panels.map(({ id, Panel }) => (
        // forceMount：切走时保留各自输入，来回对比不用重新粘贴
        <TabsContent key={id} value={id} forceMount className="data-[state=inactive]:hidden">
          <Panel />
        </TabsContent>
      ))}
    </Tabs>
  )
}
