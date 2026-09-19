import { LocateFixed, Loader2, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchPublicIp, ipInfoRows, lookupIp, type IpInfo } from './ip-lookup.service'

/** IP 查询：本机公网 IP + 任意 IP 归属地（需联网，查询走 ipify / ipwho.is 免费服务） */
export default function IpLookup() {
  const { t } = useTranslation('tools-network', { keyPrefix: 'ip-lookup' })

  const [publicIp, setPublicIp] = useState('')
  const [publicIpError, setPublicIpError] = useState('')
  const [publicIpLoading, setPublicIpLoading] = useState(true)

  const [query, setQuery] = useState('')
  const [result, setResult] = useState<IpInfo | null>(null)
  const [queryError, setQueryError] = useState('')
  const [queryLoading, setQueryLoading] = useState(false)

  // 手动重试：递增计数触发 effect 重新拉取
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchPublicIp()
      .then((ip) => {
        if (!cancelled) {
          setPublicIp(ip)
          setPublicIpLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPublicIpError(err instanceof Error ? err.message : String(err))
          setPublicIpLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const runLookup = async () => {
    setQueryLoading(true)
    setQueryError('')
    setResult(null)
    try {
      setResult(await lookupIp(query))
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : String(err))
    } finally {
      setQueryLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 本机公网 IP */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <LocateFixed className="size-3.5" />
            {t('publicIpLabel')}
          </Label>
          <Button
            variant="ghost"
            size="sm"
            disabled={publicIpLoading}
            onClick={() => {
              setPublicIpError('')
              setReloadKey((key) => key + 1)
            }}
          >
            {t('retry')}
          </Button>
        </div>
        {publicIpLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            {t('loading')}
          </div>
        ) : publicIpError ? (
          <Alert variant="destructive">
            <AlertDescription>{publicIpError}</AlertDescription>
          </Alert>
        ) : (
          <InputCopyable value={publicIp} readOnly className="font-mono" />
        )}
      </Card>

      {/* 任意 IP 查询 */}
      <Card className="flex flex-col gap-3 p-4">
        <Label>{t('lookupLabel')}</Label>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="8.8.8.8 / 2001:db8::1"
            className="font-mono"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && query.trim() !== '') {
                void runLookup()
              }
            }}
          />
          <Button
            onClick={() => void runLookup()}
            disabled={queryLoading || query.trim() === ''}
            className="gap-1.5"
          >
            {queryLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            {t('lookupBtn')}
          </Button>
        </div>
        {queryError && (
          <Alert variant="destructive">
            <AlertDescription>{queryError}</AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="flex flex-col gap-2">
            {ipInfoRows(result).map((row) => (
              <div key={row.label} className="grid grid-cols-[auto_1fr] items-center gap-3">
                <span className="text-muted-foreground w-20 shrink-0 text-xs">
                  {t(`fields.${row.label}`)}
                </span>
                <InputCopyable value={row.value} readOnly className="font-mono text-sm" />
              </div>
            ))}
            <p className="text-muted-foreground text-xs">{t('onlineNote')}</p>
          </div>
        )}
      </Card>
    </div>
  )
}
