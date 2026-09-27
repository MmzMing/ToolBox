import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { HmacPanel } from './components/HmacPanel'
import { KeyPairPanel } from './components/KeyPairPanel'
import { SymmetricPanel } from './components/SymmetricPanel'
import { TokenPanel } from './components/TokenPanel'

const panels = [
  { id: 'keypair', Panel: KeyPairPanel },
  { id: 'hmac', Panel: HmacPanel },
  { id: 'symmetric', Panel: SymmetricPanel },
  { id: 'token', Panel: TokenPanel },
] as const

/** 密钥工作台：密钥对 / HMAC 密钥 / 对称密钥 / 随机令牌 四合一，Tab 切换 */
export default function KeyGenerator() {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'key-generator' })

  return (
    <Tabs defaultValue="keypair" className="gap-4">
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
