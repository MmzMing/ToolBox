import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DNS_SOURCES,
  RECORD_TYPES,
  compareSources,
  diagnose,
  dohUrl,
  formatTtl,
  isDomainMissing,
  isSourceUnreachable,
  lookupDomain,
  normalizeDomain,
  parseCaaData,
  parseMxData,
  parseRecord,
  parseSoaData,
  parseSrvData,
  parseTxtData,
  readShareParams,
  recordLine,
  recordsOf,
  recordsToText,
  relativeLabel,
  resolveHostAddresses,
  shareUrl,
  toTypeResult,
  type LookupResult,
} from '@/tools/web/dns-lookup/dns-lookup.service'

const alidns = DNS_SOURCES[0]

const recordsResult = (domain: string, entries: LookupResult['results']): LookupResult => ({
  sourceId: alidns.id,
  domain,
  results: entries,
})

describe('normalizeDomain', () => {
  it('accepts a bare domain and lowercases it', () => {
    expect(normalizeDomain('GitHub.COM')).toMatchObject({
      ok: true,
      domain: 'github.com',
      isIdn: false,
    })
  })

  it('extracts the hostname from a full url with port and path', () => {
    expect(normalizeDomain('https://www.example.com:8443/a/b?x=1#y')).toMatchObject({
      ok: true,
      domain: 'www.example.com',
    })
  })

  it('drops the trailing root dot', () => {
    expect(normalizeDomain('example.com.')).toMatchObject({ ok: true, domain: 'example.com' })
  })

  it('converts chinese domains to punycode and keeps both forms', () => {
    expect(normalizeDomain('中文.中国')).toMatchObject({
      ok: true,
      domain: 'xn--fiq228c.xn--fiqs8s',
      unicodeDomain: '中文.中国',
      isIdn: true,
    })
  })

  it('keeps underscore labels used by dmarc and srv names', () => {
    expect(normalizeDomain('_dmarc.github.com')).toMatchObject({
      ok: true,
      domain: '_dmarc.github.com',
    })
  })

  it('rejects empty input, single labels and ipv4 addresses', () => {
    expect(normalizeDomain('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(normalizeDomain('localhost')).toEqual({ ok: false, reason: 'invalid' })
    expect(normalizeDomain('1.2.3.4')).toEqual({ ok: false, reason: 'invalid' })
    expect(normalizeDomain('bad..name.com')).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('record data parsers', () => {
  it('joins split txt character-strings and unquotes them', () => {
    expect(parseTxtData('"v=spf1 include:_spf" "example.com ~all"')).toBe(
      'v=spf1 include:_spfexample.com ~all',
    )
    expect(parseTxtData('no quotes')).toBe('no quotes')
  })

  it('reads mx priority and the rfc 7505 null mx', () => {
    expect(parseMxData('10 mail.example.com.')).toEqual({ priority: 10, value: 'mail.example.com' })
    expect(parseMxData('0 .')).toEqual({ priority: 0, value: '.' })
  })

  it('reads srv priority weight and port', () => {
    expect(parseSrvData('100 12250 443 sip.example.com.')).toEqual({
      priority: 100,
      weight: 12250,
      port: 443,
      value: 'sip.example.com',
    })
  })

  it('reads caa flag tag and value', () => {
    expect(parseCaaData('0 issue "digicert.com"')).toEqual({
      flag: 0,
      tag: 'issue',
      value: 'digicert.com',
    })
    expect(parseCaaData('malformed')).toEqual({ value: 'malformed' })
  })

  it('splits the seven soa fields', () => {
    expect(
      parseSoaData('dns1.p08.nsone.net. hostmaster.nsone.net. 1656468023 43200 7200 1209600 3600'),
    ).toEqual({
      mname: 'dns1.p08.nsone.net',
      rname: 'hostmaster.nsone.net',
      serial: '1656468023',
      refresh: 43200,
      retry: 7200,
      expire: 1209600,
      minimum: 3600,
    })
  })

  it('returns undefined for a soa that does not carry seven fields', () => {
    expect(parseSoaData('ns1.example.com. short')).toBeUndefined()
  })

  it('parseRecord dispatches per type and strips trailing dots', () => {
    expect(
      parseRecord('MX', { name: 'example.com.', TTL: 300, data: '10 mail.example.com.' }),
    ).toEqual({
      name: 'example.com',
      ttl: 300,
      value: 'mail.example.com',
      priority: 10,
    })
    expect(parseRecord('A', { name: 'example.com.', TTL: 90, data: '104.20.23.154' })).toEqual({
      name: 'example.com',
      ttl: 90,
      value: '104.20.23.154',
    })
    expect(parseRecord('TXT', { name: 'x', TTL: undefined, data: '"a"' }).ttl).toBe(0)
  })
})

describe('toTypeResult', () => {
  it('maps a records answer', () => {
    const result = toTypeResult('A', 0, {
      Status: 0,
      Answer: [
        { name: 'example.com.', TTL: 163, type: 1, data: '104.20.23.154' },
        { name: 'example.com.', TTL: 163, type: 1, data: '172.66.147.243' },
      ],
    })
    expect(result).toMatchObject({
      kind: 'records',
      records: [{ value: '104.20.23.154' }, { value: '172.66.147.243' }],
    })
  })

  it('separates the cname chain from the address answers', () => {
    const result = toTypeResult('A', 0, {
      Answer: [
        { name: 'www.github.com.', TTL: 300, type: 5, data: 'github.com.' },
        { name: 'github.com.', TTL: 300, type: 1, data: '20.205.243.166' },
      ],
    })
    expect(result).toMatchObject({
      kind: 'records',
      cnameVia: ['github.com'],
      records: [{ value: '20.205.243.166' }],
    })
  })

  it('treats an answer of another type as no record for this type', () => {
    expect(
      toTypeResult('SRV', 0, { Answer: [{ name: 'github.com.', type: 6, data: 'soa' }] }),
    ).toEqual({
      kind: 'empty',
      type: 'SRV',
    })
  })

  it('distinguishes nxdomain from an empty type and from resolver failure', () => {
    expect(toTypeResult('A', 3, { Status: 3, Authority: [{ type: 6 }] })).toEqual({
      kind: 'nxdomain',
      type: 'A',
    })
    expect(toTypeResult('A', 0, { Status: 0, Authority: [{ name: 'com.', type: 6 }] })).toEqual({
      kind: 'empty',
      type: 'A',
    })
    expect(toTypeResult('A', 2, { Status: 2 })).toMatchObject({
      kind: 'failed',
      reason: 'DNS status 2',
    })
    expect(toTypeResult('A', undefined, {})).toMatchObject({
      kind: 'failed',
      reason: 'DNS status unknown',
    })
  })

  it('flags a truncated response', () => {
    const result = toTypeResult('TXT', 0, {
      TC: true,
      Answer: [{ name: 'x', type: 16, data: '"a"' }],
    })
    expect(result).toMatchObject({ kind: 'records', truncated: true })
  })
})

describe('dohUrl', () => {
  it('uses numeric type codes and the source endpoint', () => {
    expect(dohUrl(alidns, 'example.com', 'CAA')).toBe(
      'https://dns.alidns.com/resolve?name=example.com&type=257',
    )
  })

  it('covers the nine record types the tool queries', () => {
    expect(RECORD_TYPES.map((spec) => spec.code)).toEqual([1, 28, 5, 15, 16, 2, 6, 33, 257])
  })
})

describe('lookupDomain', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('issues one request per record type and keeps every state', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        return url.endsWith('type=1')
          ? {
              ok: true,
              json: async () => ({
                Status: 0,
                Answer: [{ name: 'example.com.', TTL: 60, type: 1, data: '1.2.3.4' }],
              }),
            }
          : { ok: true, json: async () => ({ Status: 0 }) }
      }),
    )
    const result = await lookupDomain(alidns, 'example.com')
    expect(urls).toHaveLength(RECORD_TYPES.length)
    expect(recordsOf(result, 'A')).toEqual([{ name: 'example.com', ttl: 60, value: '1.2.3.4' }])
    expect(result.results.filter((entry) => entry.kind === 'empty')).toHaveLength(
      RECORD_TYPES.length - 1,
    )
  })

  it('reports a failing transport as failed rather than as no record', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const result = await lookupDomain(alidns, 'example.com')
    expect(isSourceUnreachable(result)).toBe(true)
    expect(isDomainMissing(result)).toBe(false)
  })

  it('surfaces nxdomain across the whole result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Status: 3 }) }),
    )
    expect(isDomainMissing(await lookupDomain(alidns, 'nope.example'))).toBe(true)
  })

  it('marks http errors as failed per type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }))
    const result = await lookupDomain(alidns, 'example.com')
    expect(result.results[0]).toMatchObject({ kind: 'failed', reason: 'HTTP 502' })
  })
})

describe('resolveHostAddresses', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('answers true only when the host has an address record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const reachable = url.includes('mail.good.com') && url.endsWith('type=1')
        return {
          ok: true,
          json: async () =>
            reachable
              ? {
                  Status: 0,
                  Answer: [{ name: 'mail.good.com.', TTL: 60, type: 1, data: '9.9.9.9' }],
                }
              : { Status: 0 },
        }
      }),
    )
    expect(await resolveHostAddresses(alidns, ['mail.good.com', 'mail.bad.com'])).toEqual({
      'mail.good.com': true,
      'mail.bad.com': false,
    })
  })
})

describe('compareSources', () => {
  const row = (type: LookupResult['results'][number]) => type

  it('ignores ttl differences and only flags value mismatches', () => {
    const a = recordsResult('example.com', [
      row({
        kind: 'records',
        type: 'A',
        truncated: false,
        records: [{ name: 'example.com', ttl: 300, value: '1.1.1.1' }],
      }),
    ])
    const b = recordsResult('example.com', [
      row({
        kind: 'records',
        type: 'A',
        truncated: false,
        records: [{ name: 'example.com', ttl: 40, value: '1.1.1.1' }],
      }),
    ])
    expect(compareSources([a, b])[0]).toMatchObject({ type: 'A', consistent: true, checked: true })
  })

  it('flags a genuine difference between sources', () => {
    const a = recordsResult('example.com', [
      row({
        kind: 'records',
        type: 'A',
        truncated: false,
        records: [{ name: 'example.com', ttl: 1, value: '1.1.1.1' }],
      }),
    ])
    const b = recordsResult('example.com', [
      row({
        kind: 'records',
        type: 'A',
        truncated: false,
        records: [{ name: 'example.com', ttl: 1, value: '2.2.2.2' }],
      }),
    ])
    expect(compareSources([a, b])[0]).toMatchObject({ consistent: false, checked: true })
  })

  it('does not claim inconsistency when one source failed', () => {
    const a = recordsResult('example.com', [
      row({
        kind: 'records',
        type: 'A',
        truncated: false,
        records: [{ name: 'example.com', ttl: 1, value: '1.1.1.1' }],
      }),
    ])
    const b = recordsResult('example.com', [
      row({ kind: 'failed', type: 'A', reason: 'network error' }),
    ])
    expect(compareSources([a, b])[0]).toMatchObject({ consistent: false, checked: false })
  })

  it('hides types no source returned', () => {
    const a = recordsResult('example.com', [row({ kind: 'empty', type: 'MX' })])
    const b = recordsResult('example.com', [row({ kind: 'empty', type: 'MX' })])
    expect(compareSources([a, b])).toEqual([])
  })
})

describe('recordLine', () => {
  const base = { name: 'example.com', ttl: 60 }

  it('writes records the way a DNS console does', () => {
    expect(recordLine('MX', { ...base, value: 'mail.example.com', priority: 10 })).toBe(
      '10 mail.example.com',
    )
    expect(
      recordLine('SRV', {
        ...base,
        value: 'sip.example.com',
        priority: 100,
        weight: 12,
        port: 443,
      }),
    ).toBe('100 12 443 sip.example.com')
    expect(recordLine('CAA', { ...base, value: 'letsencrypt.org', flag: 0, tag: 'issue' })).toBe(
      '0 issue "letsencrypt.org"',
    )
    expect(recordLine('A', { ...base, value: '1.1.1.1' })).toBe('1.1.1.1')
  })
})

describe('relativeLabel', () => {
  it('shortens names to their label and marks the apex', () => {
    expect(relativeLabel('example.com', 'example.com')).toBe('@')
    expect(relativeLabel('www.example.com', 'example.com')).toBe('www')
    expect(relativeLabel('_dmarc.github.com', 'github.com')).toBe('_dmarc')
    expect(relativeLabel('other.org', 'example.com')).toBe('other.org')
  })
})

describe('formatTtl', () => {
  it('renders the largest whole unit', () => {
    expect(formatTtl(86400)).toBe('1d')
    expect(formatTtl(3600)).toBe('1h')
    expect(formatTtl(300)).toBe('5m')
    expect(formatTtl(90)).toBe('1.5m')
    expect(formatTtl(30)).toBe('30s')
    expect(formatTtl(0)).toBe('0s')
  })
})

describe('diagnose', () => {
  const findKey = (findings: ReturnType<typeof diagnose>, key: string) =>
    findings.find((f) => f.key === key)

  const records = (
    type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SOA' | 'CAA',
    values: string[],
    name = 'example.com',
  ) => ({
    kind: 'records' as const,
    type,
    truncated: false,
    records: values.map((value) => ({ name, ttl: 60, value })),
  })

  const delegation = [
    records('NS', ['ns1.example.com']),
    records('SOA', ['ns1.example.com hostmaster.example.com 1 2 3 4 5']),
  ]

  it('flags a cname coexisting with other data at the same name', () => {
    const result = recordsResult('example.com', [
      records('A', ['1.1.1.1']),
      records('CNAME', ['target.example.net']),
      ...delegation,
    ])
    const finding = findKey(diagnose({ domain: 'example.com', result }), 'cnameConflict')
    expect(finding?.level).toBe('error')
    expect(finding?.evidence.some((line) => line.includes('target.example.net'))).toBe(true)
  })

  it('does not treat the cname target answers as a conflict on the queried name', () => {
    const result = recordsResult('www.example.com', [
      records('CNAME', ['www.a.example.net'], 'www.example.com'),
      records('A', ['157.148.69.151'], 'www.a.example.net'),
    ])
    const findings = diagnose({ domain: 'www.example.com', result })
    expect(findKey(findings, 'cnameConflict')).toBeUndefined()
    expect(findKey(findings, 'noAddress')).toBeUndefined()
  })

  it('flags mx hosts that resolve to nothing', () => {
    const result = recordsResult('example.com', [
      records('A', ['1.1.1.1']),
      records('MX', ['mail.dead.com']),
      records('NS', ['ns1.example.com']),
      records('SOA', ['ns1.example.com hostmaster.example.com 1 2 3 4 5']),
    ])
    expect(
      findKey(
        diagnose({ domain: 'example.com', result, mxAddresses: { 'mail.dead.com': false } }),
        'mxNoAddress',
      )?.level,
    ).toBe('error')
  })

  it('skips the mx rule when the addresses were never checked', () => {
    const result = recordsResult('example.com', [
      records('A', ['1.1.1.1']),
      records('MX', ['mail.dead.com']),
      records('NS', ['ns1.example.com']),
      records('SOA', ['ns1.example.com hostmaster.example.com 1 2 3 4 5']),
    ])
    expect(findKey(diagnose({ domain: 'example.com', result }), 'mxNoAddress')).toBeUndefined()
  })

  it('ignores the rfc 7505 null mx assertion', () => {
    const result = recordsResult('example.com', [
      records('A', ['1.1.1.1']),
      records('MX', ['.']),
      records('NS', ['ns1.example.com']),
      records('SOA', ['ns1.example.com hostmaster.example.com 1 2 3 4 5']),
    ])
    expect(
      findKey(
        diagnose({ domain: 'example.com', result, mxAddresses: { '.': false } }),
        'mxNoAddress',
      ),
    ).toBeUndefined()
  })

  it('warns about two spf records and about exceeding the ten lookup limit', () => {
    const healthy = recordsResult('example.com', [
      records('A', ['1.1.1.1']),
      records('TXT', [
        'v=spf1 include:_spf1.example include:_spf2.example include:_spf3.example include:_spf4.example include:_spf5.example include:_spf6.example include:_spf7.example include:_spf8.example include:_spf9.example include:_spf10.example include:_spf11.example -all',
      ]),
      records('NS', ['ns1.example.com']),
      records('SOA', ['ns1.example.com hostmaster.example.com 1 2 3 4 5']),
    ])
    expect(
      findKey(diagnose({ domain: 'example.com', result: healthy }), 'spfTooManyLookups')?.level,
    ).toBe('warn')

    const duplicated = recordsResult('example.com', [
      records('A', ['1.1.1.1']),
      records('TXT', ['v=spf1 -all', 'v=spf1 a -all']),
      records('NS', ['ns1.example.com']),
      records('SOA', ['ns1.example.com hostmaster.example.com 1 2 3 4 5']),
    ])
    expect(
      findKey(diagnose({ domain: 'example.com', result: duplicated }), 'spfMultiple')?.level,
    ).toBe('warn')
  })

  it('warns about a name with no address and no alias', () => {
    const result = recordsResult('example.com', [records('TXT', ['hello'])])
    const findings = diagnose({ domain: 'example.com', result })
    expect(findKey(findings, 'noAddress')?.level).toBe('warn')
    expect(findKey(findings, 'noRecordsAtAll')).toBeUndefined()
  })

  it('reports a host that answers nothing at all', () => {
    const result = recordsResult('typo.example', [
      { kind: 'empty', type: 'A' },
      { kind: 'empty', type: 'NS' },
    ])
    expect(findKey(diagnose({ domain: 'typo.example', result }), 'noRecordsAtAll')?.level).toBe(
      'warn',
    )
  })

  it('stays silent on nxdomain, where every rule would be a mere consequence', () => {
    const result = recordsResult('nope.example', [
      { kind: 'nxdomain', type: 'A' },
      { kind: 'nxdomain', type: 'MX' },
    ])
    expect(diagnose({ domain: 'nope.example', result })).toEqual([])
  })

  it('summarises caa presence as info in both directions', () => {
    const withoutCaa = recordsResult('example.com', [
      records('A', ['1.1.1.1']),
      records('NS', ['ns1.example.com']),
      records('SOA', ['ns1.example.com hostmaster.example.com 1 2 3 4 5']),
    ])
    expect(
      findKey(diagnose({ domain: 'example.com', result: withoutCaa }), 'caaMissing')?.level,
    ).toBe('info')

    const withCaa = recordsResult('example.com', [
      ...withoutCaa.results,
      {
        kind: 'records' as const,
        type: 'CAA' as const,
        truncated: false,
        records: [{ name: 'example.com', ttl: 60, value: 'digicert.com', flag: 0, tag: 'issue' }],
      },
    ])
    const finding = findKey(diagnose({ domain: 'example.com', result: withCaa }), 'caaPresent')
    expect(finding?.level).toBe('info')
    expect(finding?.evidence).toEqual(['0 issue digicert.com'])
  })
})

describe('recordsToText', () => {
  it('emits one tab separated line per record in page order', () => {
    const result = recordsResult('example.com', [
      {
        kind: 'records',
        type: 'A',
        truncated: false,
        records: [{ name: 'example.com', ttl: 300, value: '1.1.1.1' }],
      },
      {
        kind: 'records',
        type: 'MX',
        truncated: false,
        records: [{ name: 'example.com', ttl: 300, value: 'mail.example.com', priority: 10 }],
      },
      { kind: 'empty', type: 'TXT' },
    ])
    expect(recordsToText(result)).toBe(
      '; example.com\n@\tA\t300\t1.1.1.1\n@\tMX\t300\t10 mail.example.com',
    )
  })
})

describe('share params', () => {
  it('writes the domain and source into the query string', () => {
    expect(
      shareUrl('http://localhost/dns-lookup', { domain: 'example.com', sourceId: 'alidns' }),
    ).toBe('http://localhost/dns-lookup?domain=example.com&source=alidns')
  })

  it('reads back only known sources', () => {
    expect(readShareParams('?domain=example.com&source=google')).toEqual({
      domain: 'example.com',
      sourceId: 'google',
    })
    expect(readShareParams('?domain=example.com&source=evil')).toEqual({ domain: 'example.com' })
    expect(readShareParams('')).toEqual({ domain: '' })
  })
})
