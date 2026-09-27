import { AlertCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ParamField } from '@/components/param-field'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { bytesToHex } from '@/utils/bytes'
import { randomBytes } from '@/utils/random'
import { renderKeyFormats, type KeyFormats } from '../key-formats.service'
import {
  EC_CURVES,
  KEY_ALGORITHMS,
  RSA_KEY_SIZES,
  generateKeyPair,
  type CanonicalKey,
  type EcCurve,
  type KeyAlgorithm,
  type RsaKeySize,
} from '../keypair.service'
import { FormatMatrix } from './FormatMatrix'
import { BarAction, ParamBar, ParamSlot } from './param-bar'

/** kid 只是 JWKS 里的密钥标识，4 字节十六进制足够区分且不含任何密钥材料 */
function randomKid(): string {
  return bytesToHex(randomBytes(4))
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 一次生成请求的结果，带上当时的参数指纹，用来判断「还在不在跑」 */
type GenerationResult =
  | { token: string; status: 'ready'; key: CanonicalKey }
  | { token: string; status: 'error'; message: string }

/** 矩阵与生成它的密钥对象绑定：参数一换，旧矩阵立刻不再展示 */
type MatrixResult = { key: CanonicalKey; formats: KeyFormats | null; error: string | null }

/** 密钥对页签：选参数 → WebCrypto / noble 生成 → 全格式矩阵 */
export function KeyPairPanel() {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'key-generator' })

  const [algorithm, setAlgorithm] = useState<KeyAlgorithm>('rsa')
  const [bits, setBits] = useState<RsaKeySize>(2048)
  const [curve, setCurve] = useState<EcCurve>('P-256')
  const [comment, setComment] = useState('')
  // kid 与注释都不参与生成，改它们只重排格式，不重新生成密钥
  const [kid, setKid] = useState(randomKid)
  const [attempt, setAttempt] = useState(0)

  const [generation, setGeneration] = useState<GenerationResult | null>(null)
  const [matrix, setMatrix] = useState<MatrixResult | null>(null)

  const token = `${algorithm}:${bits}:${curve}:${attempt}`
  const fresh = generation?.token === token ? generation : null
  const pending = fresh === null
  const key = fresh?.status === 'ready' ? fresh.key : null
  const error =
    fresh?.status === 'error' ? fresh.message : matrix && matrix.key === key ? matrix.error : null
  const formats = matrix && matrix.key === key ? matrix.formats : null

  useEffect(() => {
    let cancelled = false
    generateKeyPair({ algorithm, bits, curve })
      .then((next) => {
        if (!cancelled) {
          setGeneration({ token, status: 'ready', key: next })
        }
      })
      .catch((generationError: unknown) => {
        if (!cancelled) {
          setGeneration({ token, status: 'error', message: messageOf(generationError) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [algorithm, bits, curve, token])

  useEffect(() => {
    if (!key) {
      return
    }
    let cancelled = false
    renderKeyFormats(key, { comment, kid })
      .then((next) => {
        if (!cancelled) {
          setMatrix({ key, formats: next, error: null })
        }
      })
      .catch((formatError: unknown) => {
        if (!cancelled) {
          setMatrix({ key, formats: null, error: messageOf(formatError) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [key, comment, kid])

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <ParamBar>
            <ParamSlot>
              <ParamField label={t('keypair.algorithm')}>
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={algorithm}
                  onValueChange={(next) => {
                    const picked = KEY_ALGORITHMS.find((item) => item === next)
                    if (picked) {
                      setAlgorithm(picked)
                    }
                  }}
                >
                  {KEY_ALGORITHMS.map((item) => (
                    <ToggleGroupItem key={item} value={item}>
                      {t(`keypair.${item}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </ParamField>
            </ParamSlot>

            {algorithm === 'rsa' && (
              <ParamSlot>
                <ParamField label={t('keypair.bits')}>
                  <ToggleGroup
                    type="single"
                    size="sm"
                    value={String(bits)}
                    onValueChange={(next) => {
                      const picked = RSA_KEY_SIZES.find((item) => String(item) === next)
                      if (picked) {
                        setBits(picked)
                      }
                    }}
                  >
                    {RSA_KEY_SIZES.map((item) => (
                      <ToggleGroupItem key={item} value={String(item)}>
                        {item}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </ParamField>
              </ParamSlot>
            )}

            {algorithm === 'ecdsa' && (
              <ParamSlot>
                <ParamField label={t('keypair.curve')}>
                  <ToggleGroup
                    type="single"
                    size="sm"
                    value={curve}
                    onValueChange={(next) => {
                      const picked = EC_CURVES.find((item) => item === next)
                      if (picked) {
                        setCurve(picked)
                      }
                    }}
                  >
                    {EC_CURVES.map((item) => (
                      <ToggleGroupItem key={item} value={item}>
                        {item}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </ParamField>
              </ParamSlot>
            )}

            <ParamSlot className="w-56">
              <ParamField label={t('keypair.comment')} htmlFor="keypair-comment">
                <Input
                  id="keypair-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  className="font-mono text-xs"
                />
              </ParamField>
            </ParamSlot>

            <ParamSlot className="w-36">
              <ParamField label={t('keypair.kid')} htmlFor="keypair-kid">
                <Input
                  id="keypair-kid"
                  value={kid}
                  onChange={(event) => setKid(event.target.value)}
                  className="font-mono text-xs"
                />
              </ParamField>
            </ParamSlot>

            <BarAction>
              <Button
                onClick={() => setAttempt((current) => current + 1)}
                disabled={pending}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <RefreshCw className="size-4" />
                {pending ? t('generating') : t('regenerate')}
              </Button>
            </BarAction>
          </ParamBar>

          <p className="text-muted-foreground text-xs">{t('keypair.hint')}</p>
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>{t('error-generate')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {pending && !formats && <Skeleton className="h-64 w-full min-w-0" />}
        <FormatMatrix formats={formats} />
      </div>
    </div>
  )
}
