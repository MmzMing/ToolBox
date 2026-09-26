import { describe, expect, it } from 'vitest'

import {
  base64,
  buildCurl,
  createEmptyModel,
  createEncodedFieldRow,
  createFormFieldRow,
  createHeaderRow,
  createOption,
  createParamRow,
  parseAny,
  parseCurl,
  parseHttpRequest,
  sniffInputKind,
  structuralKey,
  toFetchPlan,
  validateModel,
  type HttpRequestModel,
} from '@/tools/development/curl-generator/curl-generator.service'

const keys = (issues: { key: string }[]) => issues.map((issue) => issue.key)

describe('parseCurl', () => {
  it('reads a bare GET', () => {
    const { model, issues } = parseCurl('curl https://x.com/a')
    expect(model.method).toBe('GET')
    expect(model.url).toBe('https://x.com/a')
    expect(issues).toEqual([])
  })

  it('reports an empty paste instead of returning a blank model silently', () => {
    const { issues } = parseCurl('   ')
    expect(keys(issues)).toEqual(['emptyInput'])
    expect(issues[0].level).toBe('error')
  })

  it('surfaces a shell syntax error with its position', () => {
    const { issues } = parseCurl(`curl -d 'unterminated`)
    expect(keys(issues)).toEqual(['shellSyntax'])
    expect(issues[0].detail).toContain('(1:9)')
  })

  it('keeps flags and values from a Chrome DevTools command', () => {
    const { model } = parseCurl(
      [
        `curl 'https://api.x/v1/items?page=2' \\`,
        `  -H 'accept: application/json' \\`,
        `  -H $'cookie: a=1; b=2' \\`,
        `  --data-raw '{"q":"a\\nb"}' \\`,
        `  --compressed`,
      ].join('\n'),
    )
    expect(model.method).toBe('POST')
    expect(model.url).toBe('https://api.x/v1/items')
    expect(model.query).toMatchObject([{ name: 'page', value: '2' }])
    expect(model.headers.map((header) => header.name)).toEqual(['accept', 'cookie'])
    expect(model.headers[1].value).toBe('a=1; b=2')
    expect(model.body).toEqual({ kind: 'json', text: '{"q":"a\\nb"}' })
    expect(model.options).toMatchObject([{ flag: '--compressed', recognized: true }])
  })

  it('splits the query string out of the URL and warns about bare plus signs', () => {
    const { model, issues } = parseCurl("curl 'https://x.com/s?q=a+b&tag=%E4%B8%AD'")
    expect(model.query).toMatchObject([
      { name: 'q', value: 'a b' },
      { name: 'tag', value: '中' },
    ])
    expect(keys(issues)).toContain('plusInQuery')
  })

  it('adds a missing scheme and says so', () => {
    const { model, issues } = parseCurl('curl x.com/a')
    expect(model.url).toBe('https://x.com/a')
    expect(keys(issues)).toContain('schemeAdded')
  })

  it('keeps the URL fragment apart from the query rows', () => {
    const { model } = parseCurl("curl 'https://x.com/a?b=1#section'")
    expect(model.url).toBe('https://x.com/a')
    expect(model.fragment).toBe('section')
  })

  it('expands short option clusters and attached values', () => {
    const { model } = parseCurl('curl -sSLk -XPOST -d a=1 https://x.com')
    expect(model.method).toBe('POST')
    if (model.body.kind !== 'urlencoded') throw new Error('expected urlencoded body')
    expect(model.body.fields.map((field) => [field.name, field.value, field.encode])).toEqual([
      ['a', '1', false],
    ])
    expect(model.options.map((option) => option.flag)).toEqual(['-s', '-S', '-L', '-k'])
  })

  it('resolves unambiguous long option prefixes', () => {
    const { model } = parseCurl('curl --request PUT --data-r x https://x.com')
    expect(model.method).toBe('PUT')
    expect(model.body).toEqual({ kind: 'raw', text: 'x', useDataRaw: true })
  })

  it('passes unknown options through verbatim and warns per option', () => {
    const { model, issues } = parseCurl(
      'curl https://x.com --trace-time -o out.json --unknown-flag',
    )
    expect(model.options.map((option) => option.flag)).toEqual([
      '--trace-time',
      '-o',
      '--unknown-flag',
    ])
    expect(model.options[1].value).toBe('out.json')
    expect(model.options.map((option) => option.recognized)).toEqual([false, true, false])
    expect(keys(issues).filter((key) => key === 'unrecognizedOption')).toHaveLength(2)
    expect(model.extras).toEqual([])
  })

  it('keeps the equals form as one token so it round-trips', () => {
    const { model } = parseCurl('curl --max-time=5 https://x.com')
    expect(model.options[0].flag).toBe('--max-time=5')
    expect(model.options[0].value).toBeUndefined()
    expect(buildCurl({ ...model, lineStyle: 'single' })).toBe(`curl 'https://x.com' --max-time=5`)
  })

  it('still reads the equals form of -H as a real header', () => {
    const { model } = parseCurl('curl --header=X:1 https://x.com')
    expect(model.headers).toMatchObject([{ name: 'X', value: '1' }])
    expect(model.options).toEqual([])
  })

  it('infers POST for a data flag and HEAD for -I', () => {
    expect(parseCurl('curl -d x=1 https://x.com').model.method).toBe('POST')
    expect(parseCurl('curl -I https://x.com').model.method).toBe('HEAD')
  })

  it('warns when an explicit GET still carries a body', () => {
    const { issues } = parseCurl("curl -X GET -d 'a=1' https://x.com")
    expect(keys(issues)).toContain('getBodyWithGet')
  })

  it('moves the body into the query for -G', () => {
    const { model, issues } = parseCurl("curl -G -d 'a=1&b=2' https://x.com")
    expect(model.body).toEqual({ kind: 'none' })
    expect(model.query).toMatchObject([
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
    ])
    expect(keys(issues)).toContain('getMovedBodyToQuery')
  })

  it('joins several -d values into one body', () => {
    const { model } = parseCurl("curl -d 'a=1' -d 'b=2' https://x.com")
    if (model.body.kind !== 'urlencoded') throw new Error('expected urlencoded body')
    expect(model.body.fields.map((field) => [field.name, field.value])).toEqual([
      ['a', '1'],
      ['b', '2'],
    ])
  })

  it('keeps the last body family when the type changes mid-command', () => {
    const { model, issues } = parseCurl(`curl -d 'a=1' -F 'b=2' https://x.com`)
    expect(model.body.kind).toBe('form')
    expect(keys(issues)).toContain('bodyTypeOverridden')
  })

  it('marks a multipart value that starts with @ as a file field', () => {
    const { model } = parseCurl(`curl -F 'file=@/tmp/a.png' -F 'note=hi' https://x.com`)
    if (model.body.kind !== 'form') throw new Error('expected form body')
    expect(model.body.fields).toMatchObject([
      { name: 'file', value: '/tmp/a.png', isFile: true },
      { name: 'note', value: 'hi', isFile: false },
    ])
  })

  it('turns --data-binary @file into a binary body', () => {
    const { model } = parseCurl(`curl --data-binary @./payload.bin https://x.com`)
    expect(model.body).toEqual({ kind: 'binary', path: './payload.bin' })
  })

  it('reads -u as basic auth and --digest as the digest flavour', () => {
    expect(parseCurl('curl -u trojan:secret https://x.com').model.auth).toEqual({
      kind: 'basic',
      user: 'trojan',
      password: 'secret',
      via: 'option',
    })
    expect(parseCurl('curl --digest -u a:b https://x.com').model.auth).toEqual({
      kind: 'digest',
      user: 'a',
      password: 'b',
    })
  })

  it('warns when -u has no password separator', () => {
    const { issues } = parseCurl('curl -u solo https://x.com')
    expect(keys(issues)).toContain('userWithoutPassword')
  })

  it('reads --oauth2-bearer as bearer auth', () => {
    expect(parseCurl('curl --oauth2-bearer tok https://x.com').model.auth).toEqual({
      kind: 'bearer',
      token: 'tok',
      via: 'option',
    })
  })

  it('keeps a header line without a colon and flags it', () => {
    const { model, issues } = parseCurl("curl -H 'X-Broken' https://x.com")
    expect(model.headers[0]).toMatchObject({ name: 'X-Broken', value: '' })
    expect(keys(issues)).toContain('headerWithoutColon')
  })

  it('only parses the first request of a --next chain', () => {
    const { model, issues } = parseCurl('curl https://a.com --next https://b.com')
    expect(model.url).toBe('https://a.com')
    expect(keys(issues)).toContain('onlyFirstRequest')
  })

  it('reads caret and backtick continuations from cmd and PowerShell', () => {
    const cmd = parseCurl('curl "https://x.com" ^\n  -H "a: b" ^\n  -d "p=q"').model
    expect(cmd.url).toBe('https://x.com')
    expect(cmd.headers).toMatchObject([{ name: 'a', value: 'b' }])
    expect(cmd.body).toMatchObject({ kind: 'urlencoded' })

    const ps = parseCurl("curl.exe 'https://x.com' `\n  -k").model
    expect(ps.url).toBe('https://x.com')
    expect(ps.options[0].flag).toBe('-k')
  })

  it('picks the curl command out of a chained shell line', () => {
    const { model } = parseCurl('echo start && curl -k https://x.com')
    expect(model.url).toBe('https://x.com')
    expect(model.options[0].flag).toBe('-k')
  })

  it('warns when the pasted command does not look like curl at all', () => {
    const { issues } = parseCurl('wget https://x.com')
    expect(keys(issues)).toContain('commandMayNotBeCurl')
  })
})

describe('buildCurl', () => {
  function model(overrides: Partial<HttpRequestModel>): HttpRequestModel {
    return { ...createEmptyModel('bash'), lineStyle: 'single', ...overrides }
  }

  it('emits the executable then the quoted url', () => {
    expect(buildCurl(model({ url: 'https://x.com/a' }))).toBe(`curl 'https://x.com/a'`)
  })

  it('returns nothing until a URL is set', () => {
    expect(buildCurl(model({ url: '' }))).toBe('')
    expect(buildCurl(model({ url: '   ' }))).toBe('')
  })

  it('ignores rows whose name is still blank', () => {
    const out = buildCurl(
      model({
        url: 'https://x.com',
        query: [createParamRow('a', '1'), createParamRow('', '')],
        headers: [createHeaderRow('Accept', 'application/json'), createHeaderRow('', '')],
      }),
    )
    expect(out).toBe(`curl 'https://x.com?a=1' -H 'Accept: application/json'`)
  })

  it('omits -X when curl would infer the same method', () => {
    expect(buildCurl(model({ url: 'https://x.com' }))).toBe(`curl 'https://x.com'`)
    const post = model({
      url: 'https://x.com',
      method: 'POST',
      body: { kind: 'raw', text: 'x', useDataRaw: true },
    })
    expect(buildCurl(post)).toBe(`curl 'https://x.com' --data-raw 'x'`)
    expect(buildCurl(model({ url: 'https://x.com', method: 'PUT' }))).toBe(
      `curl 'https://x.com' -X PUT`,
    )
  })

  it('uses -I for a bodyless HEAD request', () => {
    expect(buildCurl(model({ url: 'https://x.com', method: 'HEAD' }))).toBe(
      `curl 'https://x.com' -I`,
    )
  })

  it('rebuilds the query string and fragment from rows', () => {
    const out = buildCurl(
      model({
        url: 'https://x.com/s',
        query: [createParamRow('q', 'a b'), createParamRow('tag', '中')],
        fragment: 'top',
      }),
    )
    expect(out).toBe(`curl 'https://x.com/s?q=a%20b&tag=%E4%B8%AD#top'`)
  })

  it('quotes header values per dialect', () => {
    const headers = [createHeaderRow('X', "a'b")]
    expect(buildCurl(model({ url: 'u', headers }))).toBe(`curl 'u' -H 'X: a'\\''b'`)
    expect(buildCurl(model({ url: 'u', dialect: 'cmd', headers }))).toBe(`curl "u" -H "X: a'b"`)
    expect(buildCurl(model({ url: 'u', dialect: 'powershell', headers }))).toBe(
      `curl.exe 'u' -H 'X: a''b'`,
    )
  })

  it('joins plain urlencoded fields into one -d but keeps encoded ones separate', () => {
    const plain = model({
      url: 'u',
      method: 'POST',
      body: {
        kind: 'urlencoded',
        fields: [createEncodedFieldRow('a', '1', false), createEncodedFieldRow('b', '2', false)],
      },
    })
    expect(buildCurl(plain)).toBe(`curl 'u' -d 'a=1&b=2'`)
    const mixed = model({
      url: 'u',
      method: 'POST',
      body: {
        kind: 'urlencoded',
        fields: [createEncodedFieldRow('a', '1', false), createEncodedFieldRow('b', '2', true)],
      },
    })
    expect(buildCurl(mixed)).toBe(`curl 'u' -d 'a=1' --data-urlencode 'b=2'`)
  })

  it('writes -X GET when a body would otherwise make curl POST', () => {
    const out = buildCurl(
      model({ url: 'u', method: 'GET', body: { kind: 'raw', text: 'a=1', useDataRaw: false } }),
    )
    expect(out).toBe(`curl 'u' -X GET -d 'a=1'`)
  })

  it('restores the @ prefix for file fields', () => {
    const out = buildCurl(
      model({
        url: 'u',
        method: 'POST',
        body: {
          kind: 'form',
          fields: [createFormFieldRow('f', '/tmp/a.png', true), createFormFieldRow('n', 'hi')],
        },
      }),
    )
    expect(out).toBe(`curl 'u' -F 'f=@/tmp/a.png' -F 'n=hi'`)
  })

  it('puts auth before the body and honours the digest mechanism', () => {
    expect(buildCurl(model({ url: 'u', auth: { kind: 'digest', user: 'a', password: 'b' } }))).toBe(
      `curl 'u' -u 'a:b' --digest`,
    )
    expect(
      buildCurl(
        model({ url: 'u', auth: { kind: 'basic', user: 'a', password: 'b', via: 'header' } }),
      ),
    ).toBe(`curl 'u' -H 'Authorization: Basic YTpi'`)
    expect(
      buildCurl(model({ url: 'u', auth: { kind: 'apikey', name: 'k', value: '9', in: 'query' } })),
    ).toBe(`curl 'u?k=9'`)
  })

  it('does not mutate the model when auth lands in the query', () => {
    const base = model({ url: 'u', auth: { kind: 'apikey', name: 'k', value: '9', in: 'query' } })
    buildCurl(base)
    expect(base.query).toHaveLength(0)
  })

  it('emits options and extras in the order they were stored', () => {
    const out = buildCurl(
      model({
        url: 'u',
        options: [createOption('-k'), createOption('--max-time', '5')],
        extras: ['tail'],
      }),
    )
    expect(out).toBe(`curl 'u' -k --max-time '5' 'tail'`)
  })

  it('skips disabled rows and options', () => {
    const header = createHeaderRow('A', 'b')
    header.enabled = false
    const option = createOption('-k', undefined, true)
    option.enabled = false
    const out = buildCurl(model({ url: 'u', headers: [header], options: [option] }))
    expect(out).toBe(`curl 'u'`)
  })

  it('switches to multiline with the dialect continuation marker', () => {
    const base = model({ url: 'u', headers: [createHeaderRow('A', 'b')] })
    expect(buildCurl({ ...base, lineStyle: 'multiline' })).toBe(`curl 'u' \\\n  -H 'A: b'`)
    expect(buildCurl({ ...base, dialect: 'powershell', lineStyle: 'multiline' })).toBe(
      `curl.exe 'u' \`\n  -H 'A: b'`,
    )
  })

  it('base64-encodes exactly like the platform helper', () => {
    for (const value of ['', 'a:b', 'user:passw0rd', 'éü:🔑x']) {
      expect(base64(value)).toBe(btoa(unescape(encodeURIComponent(value))))
    }
  })
})

describe('round trip', () => {
  const commands: [string, string][] = [
    [
      'a Chrome GET with headers and cookies',
      `curl 'https://api.x/v1/items?page=2' \\\n  -H 'accept: application/json' \\\n  -b 'sid=7' \\\n  --compressed`,
    ],
    [
      'a POST with a JSON body',
      `curl 'https://api.x/v1/items' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{"a":1}'`,
    ],
    [
      'form fields with a file',
      `curl 'https://api.x/upload' \\\n  -F 'file=@/tmp/a.png' \\\n  -F 'note=hello world'`,
    ],
    [
      'basic auth plus options',
      `curl 'https://api.x/private' \\\n  -u 'user:pass' \\\n  --digest \\\n  -k \\\n  -m '30'`,
    ],
    ['urlencoded body', `curl 'https://api.x/login' \\\n  -d 'a=1&b=2'`],
    ['binary body', `curl 'https://api.x/blob' \\\n  --data-binary @./payload.bin`],
  ]

  it.each(commands)('parse → build → parse keeps the model stable for: %s', (_label, command) => {
    const first = parseCurl(command)
    const rebuilt = buildCurl(first.model)
    const second = parseCurl(rebuilt)
    expect(keys(second.issues).filter((key) => key === 'unrecognizedOption')).toEqual(
      keys(first.issues).filter((key) => key === 'unrecognizedOption'),
    )
    expect(structuralKey(second.model)).toBe(structuralKey(first.model))
  })

  it.each(commands)('build → parse → build keeps the exact text for: %s', (_label, command) => {
    const model = parseCurl(command).model
    const once = buildCurl(model)
    const twice = buildCurl(parseCurl(once).model)
    expect(twice).toBe(once)
  })

  it('rebuilds every dialect idempotently', () => {
    for (const dialect of ['bash', 'cmd', 'powershell'] as const) {
      const base = parseCurl(`curl 'https://x.com' -H 'a: b' -d 'p=q' -k`).model
      const model: HttpRequestModel = { ...base, dialect, lineStyle: 'multiline' }
      const once = buildCurl(model)
      expect(buildCurl({ ...parseCurl(once).model, dialect, lineStyle: 'multiline' })).toBe(once)
    }
  })
})

describe('validateModel', () => {
  it('requires a URL and reports an unusable one', () => {
    expect(keys(validateModel(createEmptyModel()))).toContain('urlRequired')
    const bad = { ...createEmptyModel(), url: 'https://' }
    expect(keys(validateModel(bad))).toContain('urlInvalid')
  })

  it('flags a JSON body without a matching content type', () => {
    const model = {
      ...createEmptyModel(),
      url: 'https://x.com',
      method: 'POST',
      body: { kind: 'json', text: '{"a":1}' } as const,
    }
    expect(keys(validateModel(model))).toContain('jsonWithoutContentType')
    const mismatched = {
      ...model,
      headers: [createHeaderRow('Content-Type', 'text/plain')],
    }
    expect(keys(validateModel(mismatched))).toContain('contentTypeMismatch')
    const matched = { ...model, headers: [createHeaderRow('Content-Type', 'application/json')] }
    expect(keys(validateModel(matched))).not.toContain('contentTypeMismatch')
  })

  it('warns about duplicate headers and browser-derived ones', () => {
    const model = {
      ...createEmptyModel(),
      url: 'https://x.com',
      headers: [
        createHeaderRow('Accept', 'a'),
        createHeaderRow('accept', 'b'),
        createHeaderRow('Host', 'x.com'),
      ],
    }
    const found = keys(validateModel(model))
    expect(found).toContain('duplicateHeader')
    expect(found).toContain('headerDerived')
  })

  it('warns that a body cannot survive the cmd dialect', () => {
    const model = {
      ...createEmptyModel(),
      dialect: 'cmd' as const,
      url: 'https://x.com',
      method: 'POST',
      body: { kind: 'raw', text: 'line1\nline2', useDataRaw: true } as const,
    }
    expect(keys(validateModel(model))).toContain('cmdControlChars')
  })

  it('stays quiet for a well-formed request', () => {
    const model = {
      ...createEmptyModel(),
      url: 'https://x.com/a',
      headers: [createHeaderRow('Accept', 'application/json')],
    }
    expect(validateModel(model)).toEqual([])
  })
})

describe('toFetchPlan', () => {
  it('drops headers the browser refuses to send and reports them', () => {
    const model = {
      ...createEmptyModel(),
      url: 'https://x.com',
      headers: [
        createHeaderRow('User-Agent', 'curl/8.0'),
        createHeaderRow('Cookie', 'a=1'),
        createHeaderRow('Accept', 'application/json'),
      ],
    }
    const plan = toFetchPlan(model)
    expect(Object.keys(plan.headers)).toEqual(['Accept'])
    expect(plan.skippedHeaders).toEqual(['User-Agent', 'Cookie'])
  })

  it('maps basic credentials from -u into the Authorization header', () => {
    const model = {
      ...createEmptyModel(),
      url: 'https://x.com',
      auth: { kind: 'basic', user: 'a', password: 'b', via: 'option' } as const,
    }
    expect(toFetchPlan(model).headers).toEqual({})
    const viaHeader = {
      ...model,
      auth: { kind: 'basic', user: 'a', password: 'b', via: 'header' } as const,
    }
    expect(toFetchPlan(viaHeader).headers.Authorization).toBe('Basic YTpi')
  })

  it('serialises urlencoded fields and adds the form content type', () => {
    const model = {
      ...createEmptyModel(),
      method: 'POST',
      url: 'https://x.com',
      body: {
        kind: 'urlencoded',
        fields: [createEncodedFieldRow('a', '1', false), createEncodedFieldRow('q', 'a b', true)],
      },
    } as HttpRequestModel
    const plan = toFetchPlan(model)
    expect(plan.body).toBe('a=1&q=a+b')
    expect(plan.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
  })

  it('says so when part of the request cannot be replayed in a browser', () => {
    const digest = {
      ...createEmptyModel(),
      url: 'https://x.com',
      auth: { kind: 'digest', user: 'a', password: 'b' } as const,
    }
    expect(toFetchPlan(digest).warnings).toContain('digestUnsupported')

    const upload = {
      ...createEmptyModel(),
      method: 'POST',
      url: 'https://x.com',
      body: { kind: 'form', fields: [createFormFieldRow('f', '/tmp/a.png', true)] },
    } as HttpRequestModel
    expect(toFetchPlan(upload).warnings).toContain('fileFieldSkipped')

    const binary = {
      ...createEmptyModel(),
      method: 'POST',
      url: 'https://x.com',
      body: { kind: 'binary', path: './payload.bin' },
    } as HttpRequestModel
    expect(toFetchPlan(binary).warnings).toContain('binaryBodySkipped')
  })

  it('never sends a body for GET and HEAD', () => {
    const withBody = {
      ...createEmptyModel(),
      url: 'https://x.com',
      body: { kind: 'raw', text: 'hello', useDataRaw: true },
    } as HttpRequestModel
    expect(toFetchPlan({ ...withBody, method: 'GET' }).body).toBeUndefined()
    expect(toFetchPlan({ ...withBody, method: 'HEAD' }).body).toBeUndefined()
  })
})

describe('parseHttpRequest', () => {
  it('detects the input kind', () => {
    expect(sniffInputKind('curl https://x.com')).toBe('curl')
    expect(sniffInputKind('POST /a HTTP/1.1\nHost: x.com')).toBe('httpMessage')
    expect(sniffInputKind('')).toBe('unknown')
    expect(sniffInputKind('hello world')).toBe('unknown')
  })

  it('lifts the Host header into the URL and keeps the body', () => {
    const { model, issues } = parseHttpRequest(
      'POST /api/users HTTP/1.1\nHost: api.tools.top\nContent-Type: application/json\n\n{"name":"Jo"}',
    )
    expect(model.method).toBe('POST')
    expect(model.url).toBe('https://api.tools.top/api/users')
    expect(model.headers.map((header) => header.name)).toEqual(['Content-Type'])
    expect(model.body).toEqual({ kind: 'json', text: '{"name":"Jo"}' })
    expect(issues).toEqual([])
  })

  it('parses query parameters out of the request target', () => {
    const { model } = parseHttpRequest('GET /s?q=1 HTTP/1.1\nHost: x.com')
    expect(model.query).toMatchObject([{ name: 'q', value: '1' }])
  })

  it('rejects a request line it cannot read', () => {
    const { issues } = parseHttpRequest('not a request\nHost: x.com')
    expect(keys(issues)).toEqual(['malformedRequestLine'])
  })

  it('routes through parseAny for both kinds', () => {
    expect(parseAny('curl https://x.com').model.url).toBe('https://x.com')
    expect(parseAny('GET /a HTTP/1.1\nHost: x.com').model.url).toBe('https://x.com/a')
  })
})
