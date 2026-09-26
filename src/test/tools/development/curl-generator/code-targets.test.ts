import { describe, expect, it } from 'vitest'

import {
  CODE_TARGETS,
  generateCode,
  prepareRequest,
} from '@/tools/development/curl-generator/code-targets'
import {
  createEmptyModel,
  createEncodedFieldRow,
  createFormFieldRow,
  createHeaderRow,
  createParamRow,
  type HttpRequestModel,
} from '@/tools/development/curl-generator/request-model'

function model(overrides: Partial<HttpRequestModel>): HttpRequestModel {
  return { ...createEmptyModel(), ...overrides }
}

const simple = model({
  method: 'POST',
  url: 'https://x.com/a',
  headers: [createHeaderRow('Accept', 'application/json')],
  body: { kind: 'json', text: '{"k":1}' },
})

describe('prepareRequest', () => {
  it('flattens basic auth into an Authorization header', () => {
    const prepared = prepareRequest(
      model({
        url: 'https://x.com',
        auth: { kind: 'basic', user: 'a', password: 'b', via: 'option' },
      }),
    )
    expect(prepared.headers).toEqual([{ name: 'Authorization', value: 'Basic YTpi' }])
  })

  it('puts an API key in the query string when asked', () => {
    const prepared = prepareRequest(
      model({
        url: 'https://x.com/s',
        query: [createParamRow('page', '2')],
        auth: { kind: 'apikey', name: 'key', value: '9', in: 'query' },
      }),
    )
    expect(prepared.url).toBe('https://x.com/s?page=2&key=9')
    expect(prepared.headers).toEqual([])
  })

  it('renders urlencoded and multipart bodies as flat text', () => {
    expect(
      prepareRequest(
        model({
          url: 'https://x.com',
          body: {
            kind: 'urlencoded',
            fields: [createEncodedFieldRow('a', '1', false), createEncodedFieldRow('b', '2', true)],
          },
        }),
      ).body,
    ).toBe('a=1&b=2')
    expect(
      prepareRequest(
        model({
          url: 'https://x.com',
          body: { kind: 'form', fields: [createFormFieldRow('f', '/tmp/a.png', true)] },
        }),
      ).body,
    ).toBe('f=@/tmp/a.png')
  })

  it('skips disabled rows', () => {
    const header = createHeaderRow('X', '1')
    header.enabled = false
    const prepared = prepareRequest(
      model({
        url: 'https://x.com',
        headers: [header, createHeaderRow('', '')],
        query: [createParamRow('', '')],
      }),
    )
    expect(prepared.headers).toEqual([])
    expect(prepared.url).toBe('https://x.com')
  })
})

describe('generateCode', () => {
  it('knows the five export targets', () => {
    expect(CODE_TARGETS.map((target) => target.id)).toEqual([
      'javascript',
      'python',
      'java',
      'php',
      'go',
    ])
    expect(generateCode('ruby' as never, simple)).toBe('')
  })

  it('stays silent until a URL is set', () => {
    for (const target of CODE_TARGETS) {
      expect(generateCode(target.id, model({ url: '' }))).toBe('')
    }
  })

  it('emits a fetch call with an escaped body', () => {
    const code = generateCode('javascript', simple)
    expect(code).toContain("const response = await fetch('https://x.com/a', {")
    expect(code).toContain("method: 'POST'")
    expect(code).toContain('"Accept": \'application/json\'')
    expect(code).toContain('body: \'{"k":1}\'')
    expect(code).toContain('await response.json()')
  })

  it('uses response.text() when the payload is not JSON', () => {
    const code = generateCode('javascript', {
      ...simple,
      body: { kind: 'raw', text: 'plain', useDataRaw: true },
    })
    expect(code).toContain('await response.text()')
  })

  it('emits requests.request for Python', () => {
    const code = generateCode('python', simple)
    expect(code).toContain('import requests')
    expect(code).toContain('response = requests.request("POST", "https://x.com/a"')
    expect(code).toContain('"Accept": "application/json"')
    expect(code).toContain('data="{\\"k\\":1}"')
  })

  it('emits an HttpClient call for Java and picks GET vs method()', () => {
    const post = generateCode('java', simple)
    expect(post).toContain('HttpRequest.newBuilder()')
    expect(post).toContain('.uri(URI.create("https://x.com/a"))')
    expect(post).toContain('.header("Accept", "application/json")')
    expect(post).toContain('.method("POST", HttpRequest.BodyPublishers.ofString("{\\"k\\":1}"))')
    expect(generateCode('java', model({ url: 'https://x.com' }))).toContain('.GET()')
  })

  it('emits curl_setopt_array for PHP', () => {
    const code = generateCode('php', simple)
    expect(code).toContain('CURLOPT_URL => "https://x.com/a"')
    expect(code).toContain('CURLOPT_CUSTOMREQUEST => "POST"')
    expect(code).toContain('"Accept: application/json"')
    expect(code).toContain('CURLOPT_POSTFIELDS => "{\\"k\\":1}"')
  })

  it('emits net/http for Go, with and without a payload', () => {
    const code = generateCode('go', simple)
    expect(code).toContain('payload := strings.NewReader(`{"k":1}`)')
    expect(code).toContain('req, err := http.NewRequest("POST", "https://x.com/a", payload)')
    expect(code).toContain('req.Header.Add("Accept", "application/json")')

    const get = generateCode('go', model({ url: 'https://x.com' }))
    expect(get).toContain('http.NewRequest("GET", "https://x.com", nil)')
    expect(get).not.toContain('"strings"')
  })

  it('falls back to an escaped string when a Go body contains a backtick', () => {
    const code = generateCode('go', {
      ...simple,
      body: { kind: 'raw', text: 'a`b', useDataRaw: true },
    })
    expect(code).toContain('strings.NewReader("a`b")')
  })

  it('escapes quotes in every target instead of emitting broken code', () => {
    const tricky = model({
      url: "https://x.com/q?text='hi'",
      headers: [createHeaderRow('X', 'say "hi"')],
      body: { kind: 'raw', text: 'it\'s "fine"', useDataRaw: true },
    })
    const js = generateCode('javascript', tricky)
    expect(js).toContain(`body: 'it\\'s "fine"'`)
    expect(js).toContain(`"X": 'say "hi"'`)
    expect(generateCode('python', tricky)).toContain('data="it\'s \\"fine\\""')
    expect(generateCode('go', tricky)).toContain('req.Header.Add("X", "say \\"hi\\"")')
  })
})
