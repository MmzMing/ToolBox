import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { UuidNamespace, UuidOptions, UuidVersion } from '../uuid.service'

import { ID_COUNT_RANGE } from '../id-format.service'
import { IdOutput, ToolbarField } from './IdOutput'
import {
  SORTABLE_UUID_VERSIONS,
  UUID_NAMESPACES,
  generateUuids,
  isDeterministic,
  resolveNamespace,
} from '../uuid.service'

/** 最常用的排前面 */
const PANEL_VERSIONS: readonly UuidVersion[] = ['v4', 'v7', 'v6', 'v1', 'v5', 'v3', 'nil']

const DEFAULT_COUNT = 5

function usesTimestamp(version: UuidVersion): boolean {
  return (SORTABLE_UUID_VERSIONS as readonly string[]).includes(version)
}

function usesNamespace(version: UuidVersion): boolean {
  return version === 'v3' || version === 'v5'
}

/** UUID 页签：七种版本 × 五种格式 × 四种拼接 */
export function UuidPanel() {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'id-generator' })

  const [version, setVersion] = useState<UuidVersion>('v4')
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [timestampText, setTimestampText] = useState('')
  const [namespace, setNamespace] = useState<UuidNamespace>('url')
  const [customNamespace, setCustomNamespace] = useState('')
  const [name, setName] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [ids, setIds] = useState<string[]>(() => generateUuids('v4', {}, DEFAULT_COUNT))

  const named = usesNamespace(version)
  const deterministic = isDeterministic(version)

  const handleGenerate = () => {
    const options: UuidOptions = {}

    if (usesTimestamp(version) && timestampText.trim() !== '') {
      const value = Number(timestampText)
      if (!Number.isInteger(value) || value < 0) {
        setErrorKey('error-timestamp')
        return
      }
      options.timestamp = value
    }

    if (named) {
      try {
        options.namespace = resolveNamespace(namespace, customNamespace)
      } catch {
        setErrorKey('error-namespace')
        return
      }
      // 名字逐字节参与哈希，所以不 trim，也允许首尾空格的名字本身
      if (name.length === 0) {
        setErrorKey('error-name')
        return
      }
      options.name = name
    }

    try {
      setIds(generateUuids(version, options, count))
      setErrorKey(null)
    } catch {
      setErrorKey('error-generate')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {errorKey !== null && (
        <Alert variant="destructive">
          <AlertDescription>{t(errorKey)}</AlertDescription>
        </Alert>
      )}

      <IdOutput
        values={ids}
        hint={
          deterministic
            ? `${t(`uuid.hint-${version}`)} · ${t('uuid.one-shot')}`
            : t(`uuid.hint-${version}`)
        }
        action={
          <Button onClick={handleGenerate} className="gap-2">
            <RefreshCw className="size-4" />
            {t('generate')}
          </Button>
        }
      >
        <ToolbarField label={t('uuid.version')} htmlFor="uuid-version" className="w-32">
          <Select value={version} onValueChange={(next) => setVersion(next as UuidVersion)}>
            <SelectTrigger id="uuid-version">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PANEL_VERSIONS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ToolbarField>

        <ToolbarField label={t('uuid.count')} htmlFor="uuid-count" className="w-32">
          <Input
            id="uuid-count"
            type="number"
            min={ID_COUNT_RANGE.min}
            max={ID_COUNT_RANGE.max}
            value={count}
            disabled={deterministic}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (value > 0) {
                setCount(Math.min(ID_COUNT_RANGE.max, Math.floor(value)))
              }
            }}
          />
        </ToolbarField>

        {usesTimestamp(version) && (
          <ToolbarField label={t('uuid.timestamp')} htmlFor="uuid-timestamp" className="w-56">
            <Input
              id="uuid-timestamp"
              type="text"
              inputMode="numeric"
              value={timestampText}
              onChange={(event) => setTimestampText(event.target.value)}
            />
          </ToolbarField>
        )}

        {named && (
          <>
            <ToolbarField label={t('uuid.namespace')} htmlFor="uuid-namespace" className="w-40">
              <Select
                value={namespace}
                onValueChange={(next) => setNamespace(next as UuidNamespace)}
              >
                <SelectTrigger id="uuid-namespace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UUID_NAMESPACES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(`uuid.namespace-${item}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ToolbarField>

            {namespace === 'custom' && (
              <ToolbarField
                label={t('uuid.customNamespace')}
                htmlFor="uuid-custom-namespace"
                className="w-72"
              >
                <Input
                  id="uuid-custom-namespace"
                  type="text"
                  placeholder="6ba7b810-9dad-11d1-80b4-00c04fd430c8"
                  value={customNamespace}
                  onChange={(event) => setCustomNamespace(event.target.value)}
                />
              </ToolbarField>
            )}

            <ToolbarField label={t('uuid.name')} htmlFor="uuid-name" className="w-60">
              <Input
                id="uuid-name"
                type="text"
                placeholder="www.example.com"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </ToolbarField>
          </>
        )}
      </IdOutput>
    </div>
  )
}
