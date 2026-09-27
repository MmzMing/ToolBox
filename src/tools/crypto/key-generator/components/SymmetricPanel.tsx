import { RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Switch } from '@/components/ui/switch'
import type { EncodedSecret } from '../hmac.service'
import {
  IV_KIND_LIST,
  SALT_DEFAULT_BYTES,
  SYMMETRIC_KEY_KIND_LIST,
  generateInitializationVector,
  generateSalt,
  generateSymmetricKey,
  secretSnippets,
  type IvKind,
  type SecretSnippets,
  type SymmetricKeyKind,
} from '../symmetric.service'
import { CopyRow, EncodingRows } from './FormatMatrix'
import { BarAction, ParamBar, ParamSlot } from './param-bar'

interface SymmetricParams {
  kind: SymmetricKeyKind
  withIv: boolean
  ivKind: IvKind
  withSalt: boolean
  saltBytes: number
}

interface SymmetricOutputs {
  key: EncodedSecret
  iv: EncodedSecret | null
  salt: EncodedSecret | null
}

const DEFAULT_PARAMS: SymmetricParams = {
  kind: 'aes-256',
  withIv: false,
  ivKind: 'aes-gcm',
  withSalt: false,
  saltBytes: SALT_DEFAULT_BYTES,
}

/** 服务层负责判定盐值长度，这里的 min/max 只是给数字框一个可视边界 */
const SALT_BYTES_MIN = 8
const SALT_BYTES_MAX = 128

const DEFAULT_SNIPPET_NAME = 'APP_SECRET'

/** hljs 语言标识：片段标签取 secretSnippets 的字段名，这里只补高亮 */
const SNIPPET_LANGUAGES: Record<keyof SecretSnippets, string> = {
  env: 'ini',
  javascript: 'javascript',
  java: 'java',
  go: 'go',
}

/** 一次生成事件产出全部素材：密钥、IV、盐值永远来自同一个动作 */
function generateOutputs(params: SymmetricParams): SymmetricOutputs {
  return {
    key: generateSymmetricKey(params.kind),
    iv: params.withIv ? generateInitializationVector(params.ivKind) : null,
    salt: params.withSalt ? generateSalt(params.saltBytes) : null,
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 对称密钥页签：密钥 + 可选 IV / 盐值，外加四段可直接粘贴的赋值代码 */
export function SymmetricPanel() {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'key-generator' })

  const [params, setParams] = useState<SymmetricParams>(DEFAULT_PARAMS)
  const [outputs, setOutputs] = useState<SymmetricOutputs>(() => generateOutputs(DEFAULT_PARAMS))
  const [name, setName] = useState(DEFAULT_SNIPPET_NAME)
  const [error, setError] = useState<string | null>(null)

  const snippets = useMemo(() => secretSnippets(name, outputs.key), [name, outputs.key])

  const patch = (changes: Partial<SymmetricParams>) => {
    const next = { ...params, ...changes }
    setParams(next)
    try {
      setOutputs(generateOutputs(next))
      setError(null)
    } catch (generationError) {
      // 盐值字节数越界由服务层判定，这里只把英文技术信息摊出来，不轮换已有素材
      setError(messageOf(generationError))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <ParamBar>
            <ParamSlot className="w-56">
              <ParamField label={t('symmetric.kind')} htmlFor="symmetric-kind">
                <Select
                  value={params.kind}
                  onValueChange={(next) => patch({ kind: next as SymmetricKeyKind })}
                >
                  <SelectTrigger id="symmetric-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYMMETRIC_KEY_KIND_LIST.map((item) => (
                      <SelectItem key={item} value={item}>
                        {t(`symmetric.${item}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ParamField>
            </ParamSlot>

            <ParamSlot className="w-44">
              <ParamField label={t('symmetric.name')} htmlFor="symmetric-name">
                <Input
                  id="symmetric-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="font-mono text-xs"
                />
              </ParamField>
            </ParamSlot>

            <ParamSlot>
              <ParamField label={t('symmetric.with-iv')} htmlFor="symmetric-with-iv" inline>
                <Switch
                  id="symmetric-with-iv"
                  checked={params.withIv}
                  onCheckedChange={(checked) => patch({ withIv: checked })}
                />
              </ParamField>
            </ParamSlot>

            {params.withIv && (
              <ParamSlot className="w-40">
                <ParamField label={t('symmetric.iv-kind')} htmlFor="symmetric-iv-kind">
                  <Select
                    value={params.ivKind}
                    onValueChange={(next) => patch({ ivKind: next as IvKind })}
                  >
                    <SelectTrigger id="symmetric-iv-kind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IV_KIND_LIST.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ParamField>
              </ParamSlot>
            )}

            <ParamSlot>
              <ParamField label={t('symmetric.salt')} htmlFor="symmetric-with-salt" inline>
                <Switch
                  id="symmetric-with-salt"
                  checked={params.withSalt}
                  onCheckedChange={(checked) => patch({ withSalt: checked })}
                />
              </ParamField>
            </ParamSlot>

            {params.withSalt && (
              <ParamSlot className="w-32">
                <ParamField label={t('symmetric.salt-bytes')} htmlFor="symmetric-salt-bytes">
                  <Input
                    id="symmetric-salt-bytes"
                    type="number"
                    min={SALT_BYTES_MIN}
                    max={SALT_BYTES_MAX}
                    value={params.saltBytes}
                    onChange={(event) => {
                      // 清空输入框时不落到 0：盐值长度由服务层判定，这里只挡掉半途的无效值
                      if (event.target.value !== '') {
                        patch({ saltBytes: Number(event.target.value) })
                      }
                    }}
                  />
                </ParamField>
              </ParamSlot>
            )}

            <BarAction>
              <Button onClick={() => patch({})} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="size-4" />
                {t('regenerate')}
              </Button>
            </BarAction>
          </ParamBar>
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-col gap-6">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t('error-generate')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium">{t('symmetric.key')}</h2>
          <EncodingRows secret={outputs.key} />
        </section>

        {outputs.iv && (
          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="text-muted-foreground text-xs font-medium">{t('symmetric.iv')}</h2>
            <EncodingRows secret={outputs.iv} />
          </section>
        )}

        {outputs.salt && (
          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="text-muted-foreground text-xs font-medium">{t('symmetric.salt')}</h2>
            <EncodingRows secret={outputs.salt} />
          </section>
        )}

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium">{t('symmetric.snippets')}</h2>
          <div className="flex min-w-0 flex-col gap-3">
            {(Object.keys(snippets) as (keyof SecretSnippets)[]).map((language) => (
              <CopyRow
                key={language}
                label={language}
                value={snippets[language]}
                language={SNIPPET_LANGUAGES[language]}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
