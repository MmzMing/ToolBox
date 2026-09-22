import { ExternalLink, Loader2, LocateFixed, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  fetchPublicIp,
  ipInfoRows,
  locationSummary,
  lookupIp,
  mapMarkerUrl,
  type IpInfo,
} from './ip-lookup.service'

const toMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * IP 查询：输入任意 IP 查归属地，或用「获取本机公网 IP」按钮回填并查询。
 * 需联网，数据来自 ipwho.is 与多个 IP 回显服务（逐个回退）。
 */
export default function IpLookup() {
  const { t } = useTranslation('tools-web', { keyPrefix: 'ip-lookup' })

  const [query, setQuery] = useState('')
  const [result, setResult] = useState<IpInfo | null>(null)
  const [error, setError] = useState('')
  const [queryLoading, setQueryLoading] = useState(false)
  const [publicIpLoading, setPublicIpLoading] = useState(false)

  const busy = queryLoading || publicIpLoading

  const runLookup = async (value: string) => {
    setQueryLoading(true)
    setError('')
    setResult(null)
    try {
      setResult(await lookupIp(value))
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setQueryLoading(false)
    }
  }

  const handleLookup = () => {
    if (query.trim() !== '') {
      void runLookup(query)
    }
  }

  const handleUseMyIp = () => {
    setPublicIpLoading(true)
    setError('')
    fetchPublicIp()
      .then((ip) => {
        setQuery(ip)
        return runLookup(ip)
      })
      .catch((err: unknown) => setError(toMessage(err)))
      .finally(() => setPublicIpLoading(false))
  }

  const mapUrl = result ? mapMarkerUrl(result) : null

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="8.8.8.8 / 2001:db8::1"
            className="font-mono sm:max-w-xs"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && query.trim() !== '') {
                handleLookup()
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleLookup}
              disabled={busy || query.trim() === ''}
              className="gap-1.5"
            >
              {queryLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {queryLoading ? t('loading') : t('lookupBtn')}
            </Button>
            <Button variant="outline" onClick={handleUseMyIp} disabled={busy} className="gap-1.5">
              {publicIpLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LocateFixed className="size-4" />
              )}
              {t('publicIpBtn')}
            </Button>
          </div>
        </div>
        {/* 数据流向必须在点之前就看到，所以放在输入区而不是结果区 */}
        <p className="text-muted-foreground text-xs">{t('networkNote')}</p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </Card>

      {result && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground text-xs">{t('fields.ip')}</span>
              <SpanCopyable value={result.ip} className="text-lg font-semibold" />
              <span className="text-muted-foreground text-sm">
                {result.countryCode && `${result.countryCode} `}
                {locationSummary(result)}
              </span>
            </div>
            {mapUrl && (
              <Button variant="link" size="sm" asChild className="text-muted-foreground h-auto p-0">
                <a href={mapUrl} target="_blank" rel="noreferrer" className="gap-1">
                  {t('mapLink')}
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            )}
          </div>

          {/* 细线网格：gap-px + bg-border 让分隔线只出现在格子之间，随断点 2/3/4 列 */}
          <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border md:grid-cols-3 xl:grid-cols-4">
            {ipInfoRows(result).map((row) => (
              <div key={row.label} className="bg-card min-w-0 p-3">
                <div className="text-muted-foreground truncate text-xs">
                  {t(`fields.${row.label}`)}
                </div>
                <div className="mt-1 text-sm font-medium break-words">{row.value}</div>
              </div>
            ))}
          </div>

          <p className="text-muted-foreground text-xs">{t('onlineNote')}</p>
        </Card>
      )}
    </div>
  )
}
