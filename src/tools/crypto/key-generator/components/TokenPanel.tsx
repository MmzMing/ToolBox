import { RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ParamField } from '@/components/param-field'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  TOKEN_COUNT_RANGE,
  TOKEN_LENGTH_RANGE,
  generateTokens,
  tokenEntropyBits,
  type TokenOptions,
} from '../token.service'
import { BarAction, ParamBar, ParamSlot } from './param-bar'

const TOKEN_CHARSETS = ['uppercase', 'lowercase', 'numbers', 'symbols'] as const

type TokenCharset = (typeof TOKEN_CHARSETS)[number]

type CharsetSelection = Record<TokenCharset, boolean>

const DEFAULT_CHARSETS: CharsetSelection = {
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: false,
}

const DEFAULT_LENGTH = 32
const DEFAULT_COUNT = 5

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function optionsOf(length: number, count: number, charsets: CharsetSelection): TokenOptions {
  return { length, count, ...charsets }
}

/** 随机令牌页签：字符集与长度实时算熵，生成后每条单独可复制 */
export function TokenPanel() {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'key-generator' })

  const [length, setLength] = useState(DEFAULT_LENGTH)
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [charsets, setCharsets] = useState<CharsetSelection>(DEFAULT_CHARSETS)
  const [batch, setBatch] = useState(() => ({
    id: 0,
    tokens: generateTokens(optionsOf(DEFAULT_LENGTH, DEFAULT_COUNT, DEFAULT_CHARSETS)),
  }))

  const options = useMemo(() => optionsOf(length, count, charsets), [length, count, charsets])
  const hasCharset = TOKEN_CHARSETS.some((name) => charsets[name])
  const entropy = tokenEntropyBits(options)

  const handleGenerate = () => {
    setBatch((current) => ({ id: current.id + 1, tokens: generateTokens(options) }))
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <ParamBar>
            <ParamSlot className="min-w-64 grow basis-64">
              <ParamField
                label={t('token.length')}
                hint={`${t('token.entropy')} ${entropy.toFixed(1)}`}
                htmlFor="token-length"
              >
                <div className="flex items-center gap-3">
                  <Slider
                    id="token-length"
                    min={TOKEN_LENGTH_RANGE.min}
                    max={TOKEN_LENGTH_RANGE.max}
                    step={1}
                    value={[length]}
                    onValueChange={(values) =>
                      setLength(clamp(values[0], TOKEN_LENGTH_RANGE.min, TOKEN_LENGTH_RANGE.max))
                    }
                    className="flex-1"
                  />
                  <span className="w-8 text-center text-sm tabular-nums">{length}</span>
                </div>
              </ParamField>
            </ParamSlot>

            <ParamSlot className="w-24">
              <ParamField label={t('token.count')} htmlFor="token-count">
                <Input
                  id="token-count"
                  type="number"
                  min={TOKEN_COUNT_RANGE.min}
                  max={TOKEN_COUNT_RANGE.max}
                  value={count}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (value > 0) {
                      setCount(clamp(value, TOKEN_COUNT_RANGE.min, TOKEN_COUNT_RANGE.max))
                    }
                  }}
                />
              </ParamField>
            </ParamSlot>

            {/* 四个字符集是并列开关，横排一行才看得出「选了哪几类」；竖排会把它们读成四个步骤 */}
            <ParamSlot>
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs">{t('token.characterSets')}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {TOKEN_CHARSETS.map((name) => (
                    <label
                      key={name}
                      htmlFor={`token-${name}`}
                      className="flex cursor-pointer items-center gap-2 text-xs"
                    >
                      <Switch
                        id={`token-${name}`}
                        checked={charsets[name]}
                        onCheckedChange={(checked) => setCharsets({ ...charsets, [name]: checked })}
                      />
                      {t(`token.${name}`)}
                    </label>
                  ))}
                </div>
              </div>
            </ParamSlot>

            <BarAction>
              <Button onClick={handleGenerate} disabled={!hasCharset} className="gap-2">
                <RefreshCw className="size-4" />
                {t('generate')}
              </Button>
            </BarAction>
          </ParamBar>
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-col gap-3">
        {!hasCharset && (
          <Alert variant="destructive">
            <AlertDescription>{t('token.errorCharset')}</AlertDescription>
          </Alert>
        )}
        {batch.tokens.map((token, index) => (
          <InputCopyable
            key={`${batch.id}-${index}`}
            value={token}
            readOnly
            aria-label={`token-${index + 1}`}
            className="min-w-0 font-mono text-xs"
          />
        ))}
      </div>
    </div>
  )
}
