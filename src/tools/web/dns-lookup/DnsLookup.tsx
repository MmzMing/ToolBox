import { Link2, Loader2, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCopy } from '@/composable/use-copy'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { DiagnosisPanel } from './DiagnosisPanel'
import { AliasNote, RecordsTable, ResultSummary, SoaCard, StatusChips } from './RecordGroups'
import { SourceCompare } from './SourceCompare'
import {
  DNS_SOURCES,
  diagnose,
  isDomainMissing,
  lookupDomain,
  normalizeDomain,
  readShareParams,
  recordsOf,
  recordsToText,
  resolveHostAddresses,
  shareUrl,
  type DnsSource,
  type LookupResult,
  type NormalizedDomain,
  type TypeResult,
} from './dns-lookup.service'

const sourceById = (id: string): DnsSource =>
  DNS_SOURCES.find((source) => source.id === id) ?? DNS_SOURCES[0]

const isRecordGroup = (entry: TypeResult): entry is TypeResult & { kind: 'records' } =>
  entry.kind === 'records'

/** 解析源下拉；对比模式的第二个下拉排除主源 */
function SourceSelect({
  value,
  onChange,
  exclude,
}: {
  value: string
  onChange: (id: string) => void
  exclude?: string
}) {
  const { t } = useTranslation('tools-web', { keyPrefix: 'dns-lookup' })
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-fit shrink-0 gap-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DNS_SOURCES.filter((source) => source.id !== exclude).map((source) => (
          <SelectItem key={source.id} value={source.id}>
            {t(`sources.${source.id}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * 域名解析查询：单域名一次查全 9 类记录，附多源对比与解析体检。
 * 需联网，查询直连公共 DoH 服务，域名会发送给所选服务商。
 */
export default function DnsLookup() {
  const { t } = useTranslation('tools-web', { keyPrefix: 'dns-lookup' })
  const { copy } = useCopy()

  const [shared] = useState(() => readShareParams(window.location.search))
  const [query, setQuery] = useState(shared.domain)
  const [sourceId, setSourceId] = useState(shared.sourceId ?? DNS_SOURCES[0].id)
  const [compareId, setCompareId] = useState(DNS_SOURCES[1].id)
  const [compareOn, setCompareOn] = useState(false)

  const [results, setResults] = useState<LookupResult[] | null>(null)
  const [mxAddresses, setMxAddresses] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [inputError, setInputError] = useState('')
  const [unicodeDomain, setUnicodeDomain] = useState('')

  const activeSources = (): DnsSource[] =>
    compareOn ? [sourceById(sourceId), sourceById(compareId)] : [sourceById(sourceId)]

  const runLookup = useCallback(
    async (normalized: NormalizedDomain, sources: readonly DnsSource[]) => {
      setLoading(true)
      setInputError('')
      setMxAddresses({})
      try {
        const looked = await Promise.all(
          sources.map((source) => lookupDomain(source, normalized.domain)),
        )
        setUnicodeDomain(normalized.isIdn ? normalized.unicodeDomain : '')
        setResults(looked)
        const mxHosts = [
          ...new Set(
            recordsOf(looked[0], 'MX')
              .map((record) => record.value)
              .filter((value) => value !== '.'),
          ),
        ]
        if (mxHosts.length > 0) {
          setMxAddresses(await resolveHostAddresses(sources[0], mxHosts))
        }
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const handleLookup = () => {
    const normalized = normalizeDomain(query)
    if (!normalized.ok) {
      setInputError(t(`errors.${normalized.reason}`))
      setResults(null)
      return
    }
    void runLookup(normalized, activeSources())
  }

  useEffect(() => {
    const normalized = normalizeDomain(shared.domain)
    if (!normalized.ok) {
      return
    }
    const sources = [sourceById(shared.sourceId ?? DNS_SOURCES[0].id)]
    // 首屏从 URL 恢复查询：推到微任务，避免 effect 体内同步 setState 引发连串重渲染
    void Promise.resolve().then(() => runLookup(normalized, sources))
  }, [shared, runLookup])

  const primary = results?.[0]
  const findings = useMemo(
    () => (primary ? diagnose({ domain: primary.domain, result: primary, mxAddresses }) : []),
    [primary, mxAddresses],
  )
  const entries = primary?.results ?? []
  const recordGroups = entries.filter(isRecordGroup)
  const quietEntries = entries.filter((entry) => !isRecordGroup(entry))
  const recordTotal = recordGroups.reduce((sum, group) => sum + group.records.length, 0)
  const soaGroup = recordGroups.find((group) => group.type === 'SOA')

  const handleShare = () => {
    if (primary === undefined) {
      return
    }
    void copy(
      shareUrl(window.location.href, { domain: primary.domain, sourceId: primary.sourceId }),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('inputPlaceholder')}
            className="min-w-0 flex-1 font-mono sm:max-w-xs"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && query.trim() !== '') {
                handleLookup()
              }
            }}
          />
          <Button
            onClick={handleLookup}
            disabled={loading || query.trim() === ''}
            className="shrink-0 gap-1.5"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {loading ? t('loading') : t('lookupBtn')}
          </Button>
          <SourceSelect value={sourceId} onChange={setSourceId} />
          <Label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-normal">
            <Switch
              size="sm"
              checked={compareOn}
              onCheckedChange={(checked) => {
                setCompareOn(checked)
                if (checked && compareId === sourceId) {
                  setCompareId(
                    DNS_SOURCES.find((source) => source.id !== sourceId)?.id ?? DNS_SOURCES[0].id,
                  )
                }
              }}
            />
            {t('compareLabel')}
          </Label>
          {compareOn && (
            <SourceSelect value={compareId} onChange={setCompareId} exclude={sourceId} />
          )}
        </div>

        {/* 数据流向必须在点之前就看到，所以放在输入区而不是结果区 */}
        <p className="text-muted-foreground text-xs">{t('networkNote')}</p>
        {inputError && (
          <Alert variant="destructive">
            <AlertDescription>{inputError}</AlertDescription>
          </Alert>
        )}
      </Card>

      {primary && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground text-xs">{t('domainLabel')}</span>
              <span className="min-w-0 font-mono text-lg font-semibold break-all">
                {primary.domain}
              </span>
              <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{t(`sources.${primary.sourceId}`)}</Badge>
                <span>{t('recordCount', { total: recordTotal, types: recordGroups.length })}</span>
                {unicodeDomain && <span className="font-mono">{unicodeDomain}</span>}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
                <Link2 className="size-4" />
                {t('shareBtn')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copy(recordsToText(primary))}
                disabled={recordGroups.length === 0}
              >
                {t('copyAllBtn')}
              </Button>
            </div>
          </div>

          <ResultSummary result={primary} />
          <AliasNote groups={recordGroups} />

          {recordGroups.length > 0 && <Separator />}

          <RecordsTable domain={primary.domain} groups={recordGroups} />
          {soaGroup && <SoaCard group={soaGroup} />}

          {!isDomainMissing(primary) && <StatusChips entries={quietEntries} />}
          {compareOn && results && results.length > 1 && (
            <>
              <h2 className="text-sm font-semibold">{t('compareTitle')}</h2>
              <SourceCompare results={results} />
            </>
          )}
          <p className="text-muted-foreground text-xs">{t('onlineNote')}</p>
        </Card>
      )}

      {primary && <DiagnosisPanel findings={findings} />}
    </div>
  )
}
