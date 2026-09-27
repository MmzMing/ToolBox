/**
 * 域名解析查询：浏览器直连公共 DoH（DNS over HTTPS）JSON 接口。
 * 与 ip-lookup 同属站内少数联网工具——查询的域名与记录类型会发送给所选 DoH 服务商。
 * 实测约束（见 docs/plans/2026-09-27-dns-lookup-design.md §3）：国内可直连且带 CORS 的只有
 * 阿里系；DNSPod 与 360 的 DoH 无 ACAO 头，浏览器不可用；Cloudflare/Google 在大陆不可达。
 */

export type RecordTypeKey = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SOA' | 'SRV' | 'CAA'

export type RecordTypeSpec = { key: RecordTypeKey; code: number }

/** ANY(255) 被 RFC 8482 禁止，故多类型只能逐个并发请求 */
export const RECORD_TYPES: readonly RecordTypeSpec[] = [
  { key: 'A', code: 1 },
  { key: 'AAAA', code: 28 },
  { key: 'CNAME', code: 5 },
  { key: 'MX', code: 15 },
  { key: 'TXT', code: 16 },
  { key: 'NS', code: 2 },
  { key: 'SOA', code: 6 },
  { key: 'SRV', code: 33 },
  { key: 'CAA', code: 257 },
]

export type DnsSource = { id: string; url: string; overseas: boolean }

/** 顺序即 UI 默认顺序：前两个国内可达，后两个境外可用（大陆网络通常超时） */
export const DNS_SOURCES: readonly DnsSource[] = [
  { id: 'alidns', url: 'https://dns.alidns.com/resolve', overseas: false },
  { id: 'alidns-backup', url: 'https://223.6.6.6/resolve', overseas: false },
  { id: 'cloudflare', url: 'https://cloudflare-dns.com/dns-query', overseas: true },
  { id: 'google', url: 'https://dns.google/resolve', overseas: true },
]

export type SoaFields = {
  mname: string
  rname: string
  serial: string
  refresh: number
  retry: number
  expire: number
  minimum: number
}

export type DnsRecord = {
  /** 已去尾点 */
  name: string
  ttl: number
  /** 规范化后的可复制值：TXT 去引号并拼接分片，目标主机名去尾点 */
  value: string
  priority?: number
  weight?: number
  port?: number
  flag?: number
  tag?: string
  soa?: SoaFields
}

export type TypeResult =
  | {
      kind: 'records'
      type: RecordTypeKey
      records: DnsRecord[]
      cnameVia?: string[]
      truncated: boolean
    }
  | { kind: 'empty'; type: RecordTypeKey }
  | { kind: 'nxdomain'; type: RecordTypeKey }
  | { kind: 'failed'; type: RecordTypeKey; reason: string }

export type LookupResult = { sourceId: string; domain: string; results: TypeResult[] }

export type NormalizedDomain = { ok: true; domain: string; unicodeDomain: string; isIdn: boolean }

export type DomainNormalization = NormalizedDomain | { ok: false; reason: 'empty' | 'invalid' }

const HOST_LABEL = /^[a-z0-9_-]+$/

/**
 * 接受裸域名、带协议/路径/端口的 URL、中文域名。
 * punycode 转换直接借 WHATWG URL 的 IDNA 实现，零依赖。
 */
export function normalizeDomain(raw: string): DomainNormalization {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { ok: false, reason: 'empty' }
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  let host: string
  try {
    host = new URL(withScheme).hostname
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  const domain = host.replace(/\.+$/, '').toLowerCase()
  const labels = domain.split('.')
  const valid =
    labels.length >= 2 &&
    labels.every((label) => HOST_LABEL.test(label)) &&
    !labels.every((label) => /^[0-9]+$/.test(label))
  if (!valid) {
    return { ok: false, reason: 'invalid' }
  }
  const unicodeDomain = trimmed.replace(/\.+$/, '').replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  return {
    ok: true,
    domain,
    unicodeDomain,
    isIdn: domain !== unicodeDomain.toLowerCase(),
  }
}

/** 去尾点；单点是 RFC 7505 的 null MX 断言，必须原样保留 */
export function stripTrailingDot(value: string): string {
  return value === '.' ? value : value.replace(/\.+$/, '')
}

/** TXT 的 data 是若干带引号的 character-string，长文本会被拆成多片，需按序拼接 */
export function parseTxtData(data: string): string {
  const chunks = data.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)
  if (chunks === null) {
    return data.trim()
  }
  return chunks.map((chunk) => chunk.slice(1, -1).replace(/\\(.)/g, '$1')).join('')
}

export function parseMxData(data: string): { priority?: number; value: string } {
  const [priority, exchange] = data.trim().split(/\s+/)
  if (exchange === undefined) {
    return { value: stripTrailingDot(data) }
  }
  return { priority: Number(priority), value: stripTrailingDot(exchange) }
}

export function parseSrvData(
  data: string,
): Omit<DnsRecord, 'name' | 'ttl' | 'value'> & { value: string } {
  const [priority, weight, port, target] = data.trim().split(/\s+/)
  return {
    priority: Number(priority),
    weight: Number(weight),
    port: Number(port),
    value: stripTrailingDot(target ?? ''),
  }
}

export function parseCaaData(
  data: string,
): Omit<DnsRecord, 'name' | 'ttl' | 'value'> & { value: string } {
  const matched = /^(\d+)\s+(\w+)\s+"([^"]*)"\s*$/.exec(data.trim())
  if (matched === null) {
    return { value: data.trim() }
  }
  return { flag: Number(matched[1]), tag: matched[2], value: matched[3] }
}

const SOA_FIELD_COUNT = 7

/** mname rname serial refresh retry expire minimum（秒） */
export function parseSoaData(data: string): SoaFields | undefined {
  const parts = data.trim().split(/\s+/)
  if (parts.length !== SOA_FIELD_COUNT) {
    return undefined
  }
  return {
    mname: stripTrailingDot(parts[0]),
    rname: stripTrailingDot(parts[1]),
    serial: parts[2],
    refresh: Number(parts[3]),
    retry: Number(parts[4]),
    expire: Number(parts[5]),
    minimum: Number(parts[6]),
  }
}

export function parseRecord(
  type: RecordTypeKey,
  raw: { name?: string; TTL?: number; data?: string },
): DnsRecord {
  const name = stripTrailingDot(raw.name ?? '')
  const ttl = typeof raw.TTL === 'number' ? raw.TTL : 0
  const data = raw.data ?? ''
  switch (type) {
    case 'TXT':
      return { name, ttl, value: parseTxtData(data) }
    case 'MX': {
      const mx = parseMxData(data)
      return { name, ttl, value: mx.value, priority: mx.priority }
    }
    case 'SRV':
      return { name, ttl, ...parseSrvData(data) }
    case 'CAA':
      return { name, ttl, ...parseCaaData(data) }
    case 'SOA':
      return { name, ttl, value: data, soa: parseSoaData(data) }
    case 'CNAME':
    case 'NS':
      return { name, ttl, value: stripTrailingDot(data) }
    default:
      return { name, ttl, value: data.trim() }
  }
}

/** DoH 响应：三家字段一致，但 Question 可能是对象也可能是数组，故不建模 */
type DohResponse = {
  Status?: number
  TC?: boolean
  Answer?: { name?: string; type?: number; TTL?: number; data?: string }[]
  Authority?: { name?: string; type?: number; TTL?: number; data?: string }[]
}

/** Status 3=NXDOMAIN，2=SERVFAIL，5=REFUSED；0 且无 Answer 即「该类型无记录」 */
export function toTypeResult(
  type: RecordTypeKey,
  status: number | undefined,
  body: DohResponse,
): TypeResult {
  if (status === 3) {
    return { kind: 'nxdomain', type }
  }
  if (status !== 0) {
    return { kind: 'failed', type, reason: `DNS status ${status ?? 'unknown'}` }
  }
  const answers = (body.Answer ?? []).filter((entry) => entry.type === typeCodeOf(type))
  if (answers.length === 0) {
    return { kind: 'empty', type }
  }
  const records = answers.map((entry) => parseRecord(type, entry))
  const via =
    type === 'A' || type === 'AAAA'
      ? (body.Answer ?? [])
          .filter((entry) => entry.type === 5)
          .map((entry) => stripTrailingDot(entry.data ?? ''))
          .filter((value) => value !== '')
      : undefined
  return {
    kind: 'records',
    type,
    records,
    ...(via && via.length > 0 ? { cnameVia: via } : {}),
    truncated: body.TC === true,
  }
}

export function typeCodeOf(type: RecordTypeKey): number {
  return RECORD_TYPES.find((spec) => spec.key === type)?.code ?? 0
}

export function dohUrl(source: DnsSource, domain: string, type: RecordTypeKey): string {
  const query = new URLSearchParams({ name: domain, type: String(typeCodeOf(type)) })
  return `${source.url}?${query.toString()}`
}

export async function lookupType(
  source: DnsSource,
  domain: string,
  type: RecordTypeKey,
): Promise<TypeResult> {
  try {
    const response = await fetch(dohUrl(source, domain, type), {
      headers: { accept: 'application/dns-json' },
      cache: 'no-store',
    })
    if (!response.ok) {
      return { kind: 'failed', type, reason: `HTTP ${response.status}` }
    }
    const body = (await response.json()) as DohResponse
    return toTypeResult(type, body.Status, body)
  } catch {
    return { kind: 'failed', type, reason: 'network error' }
  }
}

/** 9 类并发；ANY 被 RFC 8482 禁止，只能逐类型各发一个请求 */
export async function lookupDomain(source: DnsSource, domain: string): Promise<LookupResult> {
  const results = await Promise.all(
    RECORD_TYPES.map((spec) => lookupType(source, domain, spec.key)),
  )
  return { sourceId: source.id, domain, results }
}

/** MX 的主机名要单独查 A/AAAA 才能判定「指向不可达主机」 */
export async function resolveHostAddresses(
  source: DnsSource,
  hosts: readonly string[],
): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    hosts.map(async (host) => {
      const [a, aaaa] = await Promise.all([
        lookupType(source, host, 'A'),
        lookupType(source, host, 'AAAA'),
      ])
      return [host, a.kind === 'records' || aaaa.kind === 'records'] as const
    }),
  )
  return Object.fromEntries(entries)
}

export function recordsOf(result: LookupResult, type: RecordTypeKey): DnsRecord[] {
  const found = result.results.find((entry) => entry.type === type)
  return found?.kind === 'records' ? found.records : []
}

export function isDomainMissing(result: LookupResult): boolean {
  return result.results.some((entry) => entry.kind === 'nxdomain')
}

/** 全部类型都失败 = 源不可达，与「域名无记录」是两件事 */
export function isSourceUnreachable(result: LookupResult): boolean {
  return result.results.every((entry) => entry.kind === 'failed')
}

/** DNS 控制台的记法：把优先级/权重/标志并回记录值，复制出来即可直接填回控制台 */
export function recordLine(type: RecordTypeKey, record: DnsRecord): string {
  switch (type) {
    case 'MX':
      return `${record.priority ?? 0} ${record.value}`
    case 'SRV':
      return `${record.priority ?? 0} ${record.weight ?? 0} ${record.port ?? 0} ${record.value}`
    case 'CAA':
      return `${record.flag ?? 0} ${record.tag ?? ''} "${record.value}"`
    default:
      return record.value
  }
}

export type FindingLevel = 'error' | 'warn' | 'info'

export type Finding = { key: string; level: FindingLevel; evidence: string[] }

/** 主机记录列展示用：把 `www.example.com` 相对 `example.com` 缩写成 `www`，根域用 `@` */
export function relativeLabel(name: string, domain: string): string {
  if (name === domain || name === `${domain}.`) {
    return '@'
  }
  if (name.endsWith(`.${domain}`)) {
    return name.slice(0, -(domain.length + 1))
  }
  return name
}

/** TTL 秒 → 人类可读；原始值由 UI 放 tooltip，不做双向换算 */
export function formatTtl(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0s'
  }
  const units: readonly [number, string][] = [
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
    [1, 's'],
  ]
  for (const [size, suffix] of units) {
    if (seconds >= size) {
      const value = seconds / size
      return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`
    }
  }
  return `${seconds}s`
}

const SPF_DNS_LOOKUP = /(?:^|\s)(?:include|exists|ptr):/gi
const SPF_BARE_LOOKUP = /(?:^|\s)(?:a|mx)(?:\/\d+)?(?=\s|$)/gi

export type DiagnoseInput = {
  domain: string
  result: LookupResult
  /** MX 主机名 → 是否能解析到 A/AAAA；缺省表示未检查，跳过该规则 */
  mxAddresses?: Record<string, boolean>
}

/**
 * 体检规则集：只判定确定性事实（RFC 条文或记录缺失），不做托管商/CDN 识别这类启发式，
 * 以免误报。规则以数组追加，新增一条不影响既有编号。
 */
export function diagnose({ domain, result, mxAddresses }: DiagnoseInput): Finding[] {
  /** NXDOMAIN 时每条规则都只是它的推论，由摘要行统一说明即可 */
  if (isDomainMissing(result)) {
    return []
  }
  const findings: Finding[] = []
  const byType = (type: RecordTypeKey) => recordsOf(result, type)
  const evidenceOf = (type: RecordTypeKey) =>
    byType(type).map((record) => `${relativeLabel(record.name, domain)} ${type} ${record.value}`)

  const cnames = byType('CNAME')
  const cnameOwners = new Set(cnames.map((record) => record.name))
  /** RFC 1034 约束的是同一 owner name；查 A 时返回的链上记录属于目标主机，不算冲突 */
  const coexisting = (['A', 'MX', 'TXT'] as const).flatMap((type) =>
    byType(type).filter((record) => cnameOwners.has(record.name)),
  )
  if (cnames.length > 0 && coexisting.length > 0) {
    findings.push({
      key: 'cnameConflict',
      level: 'error',
      evidence: [
        ...evidenceOf('CNAME'),
        ...coexisting.map((record) => `${relativeLabel(record.name, domain)} ${record.value}`),
      ],
    })
  }

  const mxRecords = byType('MX').filter((record) => record.value !== '.')
  if (mxAddresses !== undefined && mxRecords.length > 0) {
    const broken = mxRecords.filter((record) => mxAddresses[record.value] === false)
    if (broken.length > 0) {
      findings.push({
        key: 'mxNoAddress',
        level: 'error',
        evidence: broken.map((record) => `MX ${record.priority ?? 0} ${record.value}`),
      })
    }
  }

  const spf = byType('TXT').filter((record) => /^v=spf1(\s|$)/i.test(record.value))
  if (spf.length > 1) {
    findings.push({
      key: 'spfMultiple',
      level: 'warn',
      evidence: spf.map((record) => record.value),
    })
  }
  if (spf.length === 1) {
    const value = spf[0].value
    const lookups =
      (value.match(SPF_DNS_LOOKUP)?.length ?? 0) + (value.match(SPF_BARE_LOOKUP)?.length ?? 0)
    if (lookups > 10) {
      findings.push({ key: 'spfTooManyLookups', level: 'warn', evidence: [value, String(lookups)] })
    }
  }

  const addresses = byType('A').length + byType('AAAA').length
  if (addresses === 0 && cnames.length === 0) {
    findings.push({ key: 'noAddress', level: 'warn', evidence: [] })
  }

  /** 主机名（www、_dmarc 之类）本来就没有 NS/SOA，只有全类型皆空才说明查无记录 */
  if (result.results.every((entry) => entry.kind !== 'records')) {
    findings.push({ key: 'noRecordsAtAll', level: 'warn', evidence: [] })
  }

  const caa = byType('CAA')
  if (caa.length === 0) {
    findings.push({ key: 'caaMissing', level: 'info', evidence: [] })
  } else {
    findings.push({
      key: 'caaPresent',
      level: 'info',
      evidence: caa.map((record) => `${record.flag ?? 0} ${record.tag ?? ''} ${record.value}`),
    })
  }

  return findings
}

export type CompareRow = {
  type: RecordTypeKey
  /** 与入参 results 同序；null 表示该源此类型无记录，undefined 表示未取到结论（失败） */
  cells: (string[] | null | undefined)[]
  consistent: boolean
  checked: boolean
}

/**
 * 多源对比只比 value 集合，忽略 TTL：各公共 DNS 缓存时机不同，比 TTL 必然全不一致。
 * 任一源该类型查询失败时标为 partial（checked=false），不谎报为「不一致」。
 */
export function compareSources(results: readonly LookupResult[]): CompareRow[] {
  return RECORD_TYPES.map((spec) => {
    const cells = results.map((result) => {
      const found = result.results.find((entry) => entry.type === spec.key)
      if (found === undefined || found.kind === 'failed') {
        return undefined
      }
      if (found.kind !== 'records') {
        return null
      }
      return found.records.map((record) => record.value).sort()
    })
    const checked = cells.every((cell) => cell !== undefined)
    const signatures = new Set(
      cells.map((cell) => (cell === undefined || cell === null ? '' : cell.join('|'))),
    )
    return {
      type: spec.key,
      cells,
      consistent: checked && signatures.size <= 1,
      checked,
    }
  }).filter((row) => row.cells.some((cell) => cell !== null && cell !== undefined))
}

/** 「复制全部」用的纯文本，顺序与页面一致 */
export function recordsToText(result: LookupResult): string {
  const lines: string[] = [`; ${result.domain}`]
  for (const spec of RECORD_TYPES) {
    const found = result.results.find((entry) => entry.type === spec.key)
    if (found?.kind !== 'records') {
      continue
    }
    for (const record of found.records) {
      lines.push(
        `${relativeLabel(record.name, result.domain)}\t${spec.key}\t${record.ttl}\t${recordLine(spec.key, record)}`,
      )
    }
  }
  return lines.join('\n')
}

export type ShareTarget = { domain: string; sourceId: string }

export type ShareParams = { domain: string; sourceId?: string }

export function shareUrl(current: string, target: ShareTarget): string {
  const url = new URL(current)
  url.searchParams.set('domain', target.domain)
  url.searchParams.set('source', target.sourceId)
  return url.toString()
}

/** 首屏从 URL 恢复查询条件；未知的 source 直接忽略 */
export function readShareParams(search: string): ShareParams {
  const params = new URLSearchParams(search)
  const sourceId = params.get('source')
  return {
    domain: params.get('domain') ?? '',
    ...(sourceId !== null && DNS_SOURCES.some((source) => source.id === sourceId)
      ? { sourceId }
      : {}),
  }
}
