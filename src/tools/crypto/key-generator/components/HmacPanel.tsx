import { RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ParamField } from '@/components/param-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  HMAC_SECRET_SIZES,
  computeHmac,
  generateHmacSecret,
  hmacAlgorithms,
  type EncodedSecret,
  type HmacAlgorithm,
  type HmacSecretSize,
} from '../hmac.service'
import { CopyRow, EncodingRows } from './FormatMatrix'
import { BarAction, ParamBar, ParamSlot } from './param-bar'

/** HMAC 页签：上半是密钥生成，下半保留原 HMAC 生成器的「消息 + 密钥 → 签名」能力 */
export function HmacPanel() {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'key-generator' })

  const [size, setSize] = useState<HmacSecretSize>(32)
  const [secret, setSecret] = useState<EncodedSecret>(() => generateHmacSecret(32))
  const [signingKey, setSigningKey] = useState(secret.hex)
  const [message, setMessage] = useState('')
  const [algorithm, setAlgorithm] = useState<HmacAlgorithm>('HMACSHA256')

  const regenerate = (bytes: HmacSecretSize) => {
    const next = generateHmacSecret(bytes)
    setSecret(next)
    setSigningKey(next.hex)
  }

  // 空密钥由服务层抛错，这里收敛成提示：渲染期抛错会整页白屏
  const signature = useMemo(() => {
    try {
      return { text: computeHmac(algorithm, message, signingKey), failed: false }
    } catch {
      return { text: '', failed: true }
    }
  }, [algorithm, message, signingKey])

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <ParamBar>
            <ParamSlot>
              <ParamField label={t('hmac.secret-size')}>
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={String(size)}
                  onValueChange={(next) => {
                    const picked = HMAC_SECRET_SIZES.find((item) => String(item) === next)
                    if (picked) {
                      setSize(picked)
                      regenerate(picked)
                    }
                  }}
                >
                  {HMAC_SECRET_SIZES.map((item) => (
                    <ToggleGroupItem key={item} value={String(item)}>
                      {item}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </ParamField>
            </ParamSlot>

            <BarAction>
              <Button
                onClick={() => regenerate(size)}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <RefreshCw className="size-4" />
                {t('regenerate')}
              </Button>
            </BarAction>
          </ParamBar>

          <p className="text-muted-foreground text-xs">{t('hmac.hint')}</p>

          {/* 上面是「生成密钥」，下面三项是「用它签名」，共用一张卡片时用分隔线断干净 */}
          <Separator />

          <ParamBar>
            <ParamSlot className="w-44">
              <ParamField label={t('hmac.algorithm')} htmlFor="hmac-algorithm">
                <Select
                  value={algorithm}
                  onValueChange={(next) => setAlgorithm(next as HmacAlgorithm)}
                >
                  <SelectTrigger id="hmac-algorithm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hmacAlgorithms.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ParamField>
            </ParamSlot>

            <ParamSlot className="min-w-56 grow basis-56">
              <ParamField label={t('hmac.signing-key')} htmlFor="hmac-signing-key">
                <Input
                  id="hmac-signing-key"
                  value={signingKey}
                  onChange={(event) => setSigningKey(event.target.value)}
                  className="font-mono text-xs"
                />
              </ParamField>
            </ParamSlot>
          </ParamBar>

          <ParamField label={t('hmac.message')} htmlFor="hmac-message">
            <Textarea
              id="hmac-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-20 font-mono text-sm"
            />
          </ParamField>
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium">{t('hmac.secret')}</h2>
          <EncodingRows secret={secret} />
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <CopyRow label={t('hmac.signature')} value={signature.text} />
          {signature.failed && (
            <Alert variant="destructive">
              <AlertDescription>{t('error-generate')}</AlertDescription>
            </Alert>
          )}
        </section>
      </div>
    </div>
  )
}
